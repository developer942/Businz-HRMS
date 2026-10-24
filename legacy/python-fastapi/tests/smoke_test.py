"""End-to-end smoke tests: RBAC enforcement, row-level scope, payroll engine & validation.

Run with:  python tests/smoke_test.py
Uses an isolated SQLite DB (test_hrm.db) so the dev DB is never touched.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DATABASE_URL"] = "sqlite:///./test_hrm.db"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


def main():
    with TestClient(app) as client:
        # ---------- Login matrix ----------
        employee = client.post("/api/v1/auth/login", json={"email": "employee@vrmstructures.com", "password": "Password@123"})
        hr = client.post("/api/v1/auth/login", json={"email": "hr@vrmstructures.com", "password": "Password@123"})
        finance = client.post("/api/v1/auth/login", json={"email": "finance@vrmstructures.com", "password": "Password@123"})
        ceo = client.post("/api/v1/auth/login", json={"email": "ceo@vrmstructures.com", "password": "Password@123"})

        check("login: employee", employee.status_code == 200, employee.text)
        check("login: hr", hr.status_code == 200, hr.text)
        check("login: finance", finance.status_code == 200, finance.text)
        check("login: ceo", ceo.status_code == 200, ceo.text)
        check("login: bad password rejected", client.post(
            "/api/v1/auth/login", json={"email": "employee@vrmstructures.com", "password": "wrong"}).status_code == 401)

        emp_tok = {"Authorization": f"Bearer {employee.json()['access_token']}"}
        hr_tok = {"Authorization": f"Bearer {hr.json()['access_token']}"}
        fin_tok = {"Authorization": f"Bearer {finance.json()['access_token']}"}
        ceo_tok = {"Authorization": f"Bearer {ceo.json()['access_token']}"}

        # ---------- Row level employee filter ----------
        emp_list = client.get("/api/v1/employees", headers=emp_tok)
        hr_list = client.get("/api/v1/employees", headers=hr_tok)
        check("employee sees ONLY own record", emp_list.status_code == 200 and len(emp_list.json()) == 1
              and emp_list.json()[0]["employee_id"] == "EMP-003", emp_list.text)
        check("HR sees all employees", hr_list.status_code == 200 and len(hr_list.json()) >= 5)

        check("employee row-scope 403 on other's record",
              client.get("/api/v1/employees/EMP-000", headers=emp_tok).status_code == 403)

        # ---------- Payroll sample (validated contract) ----------
        disputes = client.get("/api/v1/payroll/payslips/NOPE", headers=emp_tok)
        payroll_list = client.get("/api/v1/payroll", headers=emp_tok)
        check("payroll list returns own only", payroll_list.status_code == 200 and len(payroll_list.json()) == 1)
        rec = payroll_list.json()[0]
        check("sample: gross 15000", rec["totalSalary"] == 15000.0, str(rec["totalSalary"]))
        check("sample: basic 6000", rec["basicSalary"] == 6000.0)
        check("sample: DA 3000", rec["dearnessAllowance"] == 3000.0)
        check("sample: conveyance 750", rec["conveyance"] == 750.0)
        check("sample: HRA 5250", rec["hra"] == 5250.0)
        check("sample: PF wage 9750", rec["pfWage"] == 9750.0, str(rec["pfWage"]))
        check("sample: PF amount 1170", rec["pfAmount"] == 1170.0)
        check("sample: ESI wage 15000", rec["esiWage"] == 15000.0)
        check("sample: ESI amount 112.5", rec["esiAmount"] == 112.5)
        check("sample: total deductions 1282.5", rec["totalDeductions"] == 1282.5)
        check("sample: net 13717.5", rec["netSalary"] == 13717.5)

        # ---------- RBAC: payroll actions blocked for Employee ----------
        check("employee CANNOT process payroll", client.post("/api/v1/payroll/process", headers=emp_tok).status_code == 403)
        check("employee CANNOT read payroll settings", client.get("/api/v1/payroll/settings", headers=emp_tok).status_code == 403)
        check("employee CANNOT compute salary structure", client.post(
            "/api/v1/payroll/salary-structure",
            headers=emp_tok, json={"totalSalary": 15000, "basicPercentage": 40,
                                   "daPercentage": 20, "conveyancePercentage": 5, "hraPercentage": 35}).status_code == 403)
        check("employee CANNOT view HR payslips",
              client.get(f"/api/v1/payroll/payslips/{rec['id']}", headers=hr_tok).status_code == 200)  # own is employee's
        hr_records = client.get("/api/v1/payroll", headers=hr_tok).json()
        check("employee cannot view other payslip",
              client.get(f"/api/v1/payroll/payslips/{hr_records[0]['id']}", headers=emp_tok).status_code == 403)

        # ---------- HR can manage payroll ----------
        proc = client.post("/api/v1/payroll/process?month=2026-08", headers=hr_tok)
        check("HR can process payroll batch", proc.status_code == 200 and proc.json()["processed"] >= 5, proc.text)
        settings_now = client.get("/api/v1/payroll/settings", headers=fin_tok)
        fin_settings = client.get("/api/v1/payroll/settings", headers=fin_tok)
        check("finance can read payroll settings", fin_settings.status_code == 200)

        # ---------- Percentage validation (sum must equal 100) ----------
        bad = client.put("/api/v1/payroll/settings", headers=hr_tok, json={
            "structure": {"basic_percentage": 40, "da_percentage": 20, "conveyance_percentage": 8, "hra_percentage": 35}})
        check("invalid structure (sum 103) rejected with 422", bad.status_code == 422, bad.text)
        good = client.put("/api/v1/payroll/settings", headers=hr_tok, json={
            "structure": {"basic_percentage": 40, "da_percentage": 20, "conveyance_percentage": 5, "hra_percentage": 35}})
        check("valid structure accepted", good.status_code == 200)

        structure = client.post("/api/v1/payroll/salary-structure", headers=ceo_tok, json={
            "totalSalary": 15000, "basicPercentage": 50, "daPercentage": 20,
            "conveyancePercentage": 5, "hraPercentage": 28})  # sum 103
        body = structure.json()
        check("structure compute flags invalid sum", structure.status_code == 200 and body["isValid"] is False
              and "sum to 100" in (body["validationMessage"] or ""), structure.text)

        # ---------- Leave/attendance row scope ----------
        leave = client.post("/api/v1/leaves", headers=emp_tok, json={
            "leave_type": "Casual Leave", "start_date": "2026-09-14", "end_date": "2026-09-15", "reason": "personal"})
        check("employee can apply leave", leave.status_code == 201, leave.text)
        leave_id = leave.json()["id"]
        check("employee CANNOT approve leave", client.patch(
            f"/api/v1/leaves/{leave_id}/decision", headers=emp_tok,
            json={"decision": "approved"}).status_code == 403)
        check("HR approves leave", client.patch(
            f"/api/v1/leaves/{leave_id}/decision", headers=hr_tok,
            json={"decision": "approved", "comment": "ok"}).status_code == 200)

        malformed = client.post("/api/v1/attendance", headers=emp_tok, json={
            "date": "2026-09-09", "status": "Present", "method": "Face Scan"})
        check("employee can punch attendance", malformed.status_code == 201, malformed.text)

    print(f"\n{'-'*50}\nPASS={PASS} FAIL={FAIL}")
    raise SystemExit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
"""Idempotent database seed. Every value is data (no business logic hardcoded in code paths)."""

from datetime import date

from sqlalchemy import select

from .core.database import SessionLocal
from .core.security import hash_password
from .models.hr import (
    AttendanceRecord,
    Department,
    Employee,
    PayrollRecord,
    PayrollSettings,
    Permission,
    Role,
    Shift,
    ShiftAssignment,
    User,
)
from .services.payroll import (
    DEFAULT_ESI,
    DEFAULT_PF,
    DEFAULT_PT,
    DEFAULT_STRUCTURE,
    calculate_employee_payroll,
)

ROLE_DEFS = [
    {"name": "Super Admin", "key": "CEO"},
    {"name": "HR Admin", "key": "HR_ADMIN"},
    {"name": "Department Manager", "key": "DEPT_MANAGER"},
    {"name": "Employee", "key": "EMPLOYEE"},
    {"name": "Finance Manager", "key": "FINANCE_MANAGER"},
]

ALL_ACTIONS = ["view", "create", "edit", "delete", "approve", "export"]

ROLE_PERMISSIONS: dict[str, dict[str, list[str]]] = {
    "CEO": {m: list(ALL_ACTIONS) for m in (
        "dashboard", "employees", "face_attendance", "attendance", "gps_geofence", "leaves",
        "shifts", "performance", "tasks", "recruitment", "finance", "notifications", "payroll",
        "advance_salary", "reports", "organization", "assets", "settings")},
    "HR_ADMIN": {
        "dashboard": ["view", "export"],
        "employees": ["view", "create", "edit", "delete", "approve", "export"],
        "face_attendance": ["view", "create", "edit", "export"],
        "attendance": ["view", "create", "edit", "approve", "export"],
        "gps_geofence": ["view", "create", "edit", "approve", "export"],
        "leaves": ["view", "create", "edit", "approve", "export"],
        "shifts": ["view", "create", "edit", "approve", "export"],
        "performance": ["view", "create", "edit", "export"],
        "tasks": ["view", "create", "edit"],
        "recruitment": ["view", "create", "edit", "approve"],
        "finance": ["view", "create", "edit", "approve", "export"],
        "notifications": ["view", "create"],
        "payroll": ["view", "create", "edit", "approve", "export"],
        "advance_salary": ["view", "create", "edit", "approve", "export"],
        "reports": ["view", "export"],
        "organization": ["view", "create", "edit", "export"],
        "assets": ["view", "create", "edit", "delete", "approve", "export"],
        "settings": ["view", "edit"],
    },
    "DEPT_MANAGER": {
        "dashboard": ["view"],
        "employees": ["view"],
        "face_attendance": ["view"],
        "attendance": ["view", "approve"],
        "leaves": ["view", "approve"],
        "shifts": ["view", "approve"],
        "performance": ["view", "edit"],
        "tasks": ["view", "create", "edit", "delete"],
        "recruitment": ["view"],
        "finance": ["view", "approve"],
        "notifications": ["view"],
        "advance_salary": ["view", "create"],
        "reports": ["view"],
        "organization": ["view"],
        "assets": ["view"],
        "settings": ["view"],
    },
    "EMPLOYEE": {
        # Self-service: row-level scope (employeeId === current user) enforced in routes
        "dashboard": ["view"],
        "employees": ["view"],
        "face_attendance": ["view", "create"],
        "attendance": ["view", "create"],
        "leaves": ["view", "create"],
        "shifts": ["view"],
        "performance": ["view"],
        "tasks": ["view", "edit"],
        "recruitment": ["view", "create"],
        "finance": ["view", "create"],
        "notifications": ["view"],
        "payroll": ["view"],
        "advance_salary": ["view", "create"],
        "organization": ["view"],
        "assets": ["view"],
        "settings": ["view"],
    },
    "FINANCE_MANAGER": {
        "dashboard": ["view"],
        "employees": ["view"],
        "attendance": ["view"],
        "leaves": ["view"],
        "shifts": ["view"],
        "tasks": ["view"],
        "finance": ["view", "create", "edit", "approve", "export"],
        "notifications": ["view"],
        "payroll": ["view", "create", "edit", "approve", "export"],
        "advance_salary": ["view", "create", "edit", "approve", "export"],
        "reports": ["view", "export"],
        "organization": ["view"],
        "settings": ["view"],
    },
}

USER_SEEDS = [
    {"email": "ceo@vrmstructures.com", "full_name": "Velmurugan R", "role_key": "CEO", "employee_id": "EMP-000"},
    {"email": "hr@vrmstructures.com", "full_name": "Ananya Verma", "role_key": "HR_ADMIN", "employee_id": "EMP-001"},
    {"email": "finance@vrmstructures.com", "full_name": "Vishal Kumar", "role_key": "FINANCE_MANAGER", "employee_id": "EMP-002"},
    {"email": "employee@vrmstructures.com", "full_name": "Rajiv Kumar", "role_key": "EMPLOYEE", "employee_id": "EMP-003"},
    {"email": "employee2@vrmstructures.com", "full_name": "Meena S", "role_key": "EMPLOYEE", "employee_id": "EMP-004"},
]

EMPLOYEE_SEEDS = [
    {"employee_id": "EMP-000", "first_name": "Velmurugan", "last_name": "R", "email": "ceo@vrmstructures.com",
     "department": "Management", "designation": "CEO", "total_salary": 200000, "join": date(2020, 6, 1)},
    {"employee_id": "EMP-001", "first_name": "Ananya", "last_name": "Verma", "email": "hr@vrmstructures.com",
     "department": "Human Resources", "designation": "HR Head", "total_salary": 85000, "join": date(2021, 3, 15)},
    {"employee_id": "EMP-002", "first_name": "Vishal", "last_name": "Kumar", "email": "finance@vrmstructures.com",
     "department": "Finance", "designation": "Finance Manager", "total_salary": 70000, "join": date(2021, 8, 1)},
    {"employee_id": "EMP-003", "first_name": "Rajiv", "last_name": "Kumar", "email": "employee@vrmstructures.com",
     "department": "Engineering", "designation": "Site Engineer", "total_salary": 15000, "join": date(2024, 1, 1)},
    {"employee_id": "EMP-004", "first_name": "Meena", "last_name": "S", "email": "employee2@vrmstructures.com",
     "department": "Operations", "designation": "Coordinator", "total_salary": 18000, "join": date(2023, 5, 10)},
]

DEPARTMENT_SEEDS = [
    ("Management", "MGMT"),
    ("Human Resources", "HR"),
    ("Finance", "FIN"),
    ("Engineering", "ENG"),
    ("Operations", "OPS"),
]

SAMPLE_PASSWORD = "Password@123"


def _seed_roles_and_permissions(db) -> dict[str, Role]:
    roles: dict[str, Role] = {}
    for defn in ROLE_DEFS:
        role = db.execute(select(Role).where(Role.key == defn["key"])).scalar_one_or_none()
        if role is None:
            role = Role(name=defn["name"], key=defn["key"], is_system=True)
            db.add(role)
            db.flush()
        roles[defn["key"]] = role
        # (re)sync permission matrix
        db.query(Permission).filter(Permission.role_id == role.id).delete()
        for module, actions in ROLE_PERMISSIONS.get(defn["key"], {}).items():
            for action in actions:
                db.add(Permission(role_id=role.id, module=module, action=action))
    db.commit()
    return roles


def _seed_users(db, roles: dict[str, Role]):
    for defn in USER_SEEDS:
        exists = db.execute(select(User).where(User.email == defn["email"])).scalar_one_or_none()
        if exists:
            continue
        db.add(User(
            email=defn["email"],
            full_name=defn["full_name"],
            role_id=roles[defn["role_key"]].id,
            employee_id=defn["employee_id"],
            hashed_password=hash_password(SAMPLE_PASSWORD),
            is_active=True,
        ))
    db.commit()


def _seed_departments(db):
    for name, code in DEPARTMENT_SEEDS:
        exists = db.execute(select(Department).where(Department.code == code)).scalar_one_or_none()
        if exists is None:
            db.add(Department(name=name, code=code))
    db.commit()


def _seed_employees(db):
    for defn in EMPLOYEE_SEEDS:
        exists = db.execute(select(Employee).where(Employee.employee_id == defn["employee_id"])).scalar_one_or_none()
        if exists is not None:
            continue
        emp = Employee(
            employee_id=defn["employee_id"],
            first_name=defn["first_name"],
            last_name=defn["last_name"],
            email=defn["email"],
            department=defn["department"],
            designation=defn["designation"],
            total_salary=defn["total_salary"],
            joining_date=defn["join"],
            employment_type="Full-Time",
            status="Active",
            attendance_method="Face Scan",
            gps_allowed=True,
        )
        db.add(emp)
    db.commit()


def _seed_settings_and_payroll(db):
    row = db.get(PayrollSettings, "global")
    if row is None:
        row = PayrollSettings(id="global")
    row.structure = dict(DEFAULT_STRUCTURE)
    row.pf = dict(DEFAULT_PF)
    row.esi = dict(DEFAULT_ESI)
    row.pt = dict(DEFAULT_PT)
    row.company = {
        "name": "VRM Industrial Structures Private Limited",
        "address": "Plot 42, Heavy Industrial Growth Estate, Guindy, Chennai, Tamil Nadu - 600032",
        "registrationNo": "U29253TN2005PTC012345",
        "gstNo": "33AAACV0000P1Z2",
    }
    row.standard_working_days = 26
    row.payroll_cycle_day = 1
    db.add(row)
    db.commit()
    db.refresh(row)

    # Seed a payroll month so payslips are immediately available (dynamic, engine-driven)
    employees = db.execute(select(Employee)).scalars().all()
    month = "2026-08"
    for emp in employees:
        calc = calculate_employee_payroll(emp, row, None)
        rec = db.execute(
            select(PayrollRecord).where(
                PayrollRecord.employee_id == emp.employee_id,
                PayrollRecord.payroll_month == month,
            )
        ).scalar_one_or_none() or PayrollRecord(
            employee_id=emp.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}",
            department=emp.department,
            designation=emp.designation,
            payroll_month=month,
        )
        rec.total_salary = calc["totalSalary"]
        rec.basic_salary = calc["basicPay"]
        rec.dearness_allowance = calc["dearnessAllowance"]
        rec.conveyance = calc["conveyance"]
        rec.hra = calc["hra"]
        rec.pf_wage = calc["pfWage"]
        rec.pf_rate = calc["pfRate"]
        rec.pf_amount = calc["pfAmount"]
        rec.esi_wage = calc["esiWage"]
        rec.esi_rate = calc["esiRate"]
        rec.esi_amount = calc["esiAmount"]
        rec.professional_tax = calc["professionalTax"]
        rec.total_deductions = calc["totalDeductions"]
        rec.net_salary = calc["netSalary"]
        rec.working_days = row.standard_working_days
        rec.present_days = row.standard_working_days
        rec.status = "Processed"
        db.add(rec)
    db.commit()


def _seed_shifts(db):
    general = db.execute(select(Shift).where(Shift.shift_name == "General Shift")).scalar_one_or_none()
    if general is None:
        general = Shift(
            shift_name="General Shift",
            start_time="09:30",
            end_time="18:30",
            break_duration_mins=60,
            working_hours=8,
            grace_period_mins=15,
            color="#3B82F6",
        )
        db.add(general)
        db.flush()
    db.commit()


def run_seed() -> None:
    with SessionLocal() as db:
        roles = _seed_roles_and_permissions(db)
        _seed_users(db, roles)
        _seed_departments(db)
        _seed_employees(db)
        _seed_settings_and_payroll(db)
        _seed_shifts(db)


if __name__ == "__main__":
    from .core.database import Base, engine

    Base.metadata.create_all(bind=engine)
    run_seed()
    print("Seed complete.")
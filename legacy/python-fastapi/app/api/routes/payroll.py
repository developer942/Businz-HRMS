from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.rbac import require_permission
from ...core.scope import require_row_access, scoped_employee_id
from ...models.hr import Employee, PayrollRecord, PayrollSettings, User
from ...schemas.payroll import (
    PayrollCalculation,
    PayrollProcessResponse,
    PayrollRecordOut,
    PayrollSettingsOut,
    PayrollSettingsUpdate,
    PayslipOut,
    SalaryStructure,
    StructureValidationRequest,
)
from ...services.payroll import (
    PayrollValidationError,
    calculate_employee_payroll,
    compute_salary_structure,
    compute_payroll_calculation,
    build_payslip,
    normalize_settings,
    to_money_float,
    validate_structure,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])


# ----------------------------------------------------------------------
# Salary structure (calculation contract, exact field names)
# ----------------------------------------------------------------------
@router.post("/salary-structure", response_model=SalaryStructure)
def salary_structure(payload: StructureValidationRequest, db: Session = Depends(get_db), user: User = Depends(require_permission("payroll", "create"))):
    """Compute a SalaryStructure. Returns isValid=false (with message) if the
    percentages do not sum to 100 — payroll is never calculated on invalid input."""
    return compute_salary_structure(
        payload.totalSalary,
        payload.basicPercentage,
        payload.daPercentage,
        payload.conveyancePercentage,
        payload.hraPercentage,
    )


@router.post("/validate-structure")
def validate_structure_endpoint(payload: StructureValidationRequest, db: Session = Depends(get_db), user: User = Depends(require_permission("payroll", "edit"))):
    valid, total, message = validate_structure(
        payload.basicPercentage,
        payload.daPercentage,
        payload.conveyancePercentage,
        payload.hraPercentage,
    )
    if not valid:
        raise HTTPException(status_code=422, detail=message)
    return {"valid": True, "sum": total}


# ----------------------------------------------------------------------
# Single employee calculation
# ----------------------------------------------------------------------
@router.post("/calculate", response_model=PayrollCalculation)
def calculate_payroll_for_employee(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "create")),
):
    """Calculate a PayrollCalculation for the authenticated user's own employee
    record (certified, preview before processing)."""
    settings_row = db.get(PayrollSettings, "global")
    emp = db.execute(
        select(Employee).where(Employee.employee_id == user.employee_id)
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="No employee record linked to your account")
    try:
        calc = calculate_employee_payroll(emp, settings_row, None)
    except PayrollValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return PayrollCalculation(**calc)


# ----------------------------------------------------------------------
# Payroll records + payslips (row-scoped)
# ----------------------------------------------------------------------
def _row_to_out(rec: PayrollRecord) -> PayrollRecordOut:
    return PayrollRecordOut(
        id=rec.id,
        employee_id=rec.employee_id,
        employee_name=rec.employee_name,
        department=rec.department,
        designation=rec.designation,
        payroll_month=rec.payroll_month,
        totalSalary=rec.total_salary,
        basicSalary=rec.basic_salary,
        dearnessAllowance=rec.dearness_allowance,
        conveyance=rec.conveyance,
        hra=rec.hra,
        bonus=rec.bonus,
        rewardEarnings=rec.reward_earnings,
        pfWage=rec.pf_wage,
        pfRate=rec.pf_rate,
        pfAmount=rec.pf_amount,
        esiWage=rec.esi_wage,
        esiRate=rec.esi_rate,
        esiAmount=rec.esi_amount,
        professionalTax=rec.professional_tax,
        attendanceDeduction=rec.attendance_deduction,
        leaveDeduction=rec.leave_deduction,
        loanDeduction=rec.loan_deduction,
        totalDeductions=rec.total_deductions,
        netSalary=rec.net_salary,
        workingDays=rec.working_days,
        presentDays=rec.present_days,
        status=rec.status,
    )


@router.get("", response_model=list[PayrollRecordOut])
def list_payroll(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "view")),
):
    query = select(PayrollRecord).order_by(PayrollRecord.payroll_month.desc(), PayrollRecord.employee_id)
    scoped = scoped_employee_id(user)
    if scoped:
        query = query.where(PayrollRecord.employee_id == scoped)
    return [_row_to_out(r) for r in db.execute(query).scalars().all()]


@router.get("/payslips/{record_id}", response_model=PayslipOut)
def get_payslip(
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "view")),
):
    rec = db.get(PayrollRecord, record_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    require_row_access(user, rec.employee_id)

    settings_row = db.get(PayrollSettings, "global")
    normalized = normalize_settings(settings_row)
    return build_payslip(
        {**_row_to_out(rec).model_dump(), "status": rec.status},
        company=normalized.company or {},
    )


# ----------------------------------------------------------------------
# Payroll batch processing (privileged: Finance / HR / CEO)
# ----------------------------------------------------------------------
@router.post("/process", response_model=PayrollProcessResponse)
def process_payroll_batch(
    month: str = "2026-08",
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "approve")),
):
    settings_row = db.get(PayrollSettings, "global")
    if settings_row is None:
        raise HTTPException(status_code=409, detail="Payroll settings not configured")

    # Validate the configured structure once for the whole batch
    structure = settings_row.structure or {}
    valid, total, message = validate_structure(
        structure.get("basic_percentage", 0),
        structure.get("da_percentage", 0),
        structure.get("conveyance_percentage", 0),
        structure.get("hra_percentage", 0),
    )
    if not valid:
        raise HTTPException(status_code=422, detail=message)

    employees = db.execute(select(Employee).where(Employee.is_active.is_(True))).scalars().all()
    if not employees:
        raise HTTPException(status_code=404, detail="No active employees to process payroll for")

    processed = 0
    out_records: list[PayrollRecordOut] = []
    for emp in employees:
        try:
            calc = calculate_employee_payroll(emp, settings_row, None)
        except PayrollValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        existing = db.execute(
            select(PayrollRecord).where(
                PayrollRecord.employee_id == emp.employee_id,
                PayrollRecord.payroll_month == month,
            )
        ).scalar_one_or_none()

        record = existing or PayrollRecord(
            employee_id=emp.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}",
            department=emp.department,
            designation=emp.designation,
            payroll_month=month,
        )
        record.total_salary = calc["totalSalary"]
        record.basic_salary = calc["basicPay"]
        record.dearness_allowance = calc["dearnessAllowance"]
        record.conveyance = calc["conveyance"]
        record.hra = calc["hra"]
        record.bonus = calc.get("bonus", 0)
        record.reward_earnings = calc.get("rewardEarnings", 0)
        record.pf_wage = calc["pfWage"]
        record.pf_rate = calc["pfRate"]
        record.pf_amount = calc["pfAmount"]
        record.esi_wage = calc["esiWage"]
        record.esi_rate = calc["esiRate"]
        record.esi_amount = calc["esiAmount"]
        record.professional_tax = calc["professionalTax"]
        record.attendance_deduction = calc["attendanceDeduction"]
        record.leave_deduction = calc["leaveDeduction"]
        record.loan_deduction = calc["loanDeduction"]
        record.total_deductions = calc["totalDeductions"]
        record.net_salary = calc["netSalary"]
        record.working_days = settings_row.standard_working_days or 26
        record.present_days = settings_row.standard_working_days or 26
        record.status = "Processed"

        db.add(record)
        processed += 1

    db.commit()
    out_records = [
        _row_to_out(r)
        for r in db.execute(
            select(PayrollRecord).where(PayrollRecord.payroll_month == month).order_by(PayrollRecord.employee_id)
        ).scalars().all()
    ]
    return PayrollProcessResponse(month=month, processed=processed, records=out_records)


# ----------------------------------------------------------------------
# Payroll settings (dynamic, privileged)
# ----------------------------------------------------------------------
def _settings_out(normalized: PayrollSettings) -> PayrollSettingsOut:
    from ...schemas.payroll import EsiConfig, PfConfig, PtConfig, StructureConfig

    return PayrollSettingsOut(
        structure=StructureConfig(**normalized.structure),
        pf=PfConfig(**normalized.pf),
        esi=EsiConfig(**normalized.esi),
        pt=PtConfig(**normalized.pt),
        standard_working_days=normalized.standard_working_days,
        payroll_cycle_day=normalized.payroll_cycle_day,
    )


@router.get("/settings", response_model=PayrollSettingsOut)
def get_payroll_settings(db: Session = Depends(get_db), user: User = Depends(require_permission("payroll", "edit"))):
    settings_row = db.get(PayrollSettings, "global")
    return _settings_out(normalize_settings(settings_row))


@router.put("/settings", response_model=PayrollSettingsOut)
def update_payroll_settings(
    payload: PayrollSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "edit")),
):
    settings_row = db.get(PayrollSettings, "global")
    if settings_row is None:
        settings_row = PayrollSettings(id="global")
    normalized = normalize_settings(settings_row)

    if payload.structure is not None:
        struct = payload.structure.model_dump()
        valid, total, message = validate_structure(
            struct["basic_percentage"],
            struct["da_percentage"],
            struct["conveyance_percentage"],
            struct["hra_percentage"],
        )
        if not valid:
            raise HTTPException(status_code=422, detail=message)
        normalized.structure = struct
    if payload.pf is not None:
        normalized.pf = payload.pf.model_dump()
    if payload.esi is not None:
        normalized.esi = payload.esi.model_dump()
    if payload.pt is not None:
        normalized.pt = payload.pt.model_dump()
    if payload.standard_working_days is not None:
        normalized.standard_working_days = payload.standard_working_days
    if payload.payroll_cycle_day is not None:
        normalized.payroll_cycle_day = payload.payroll_cycle_day

    db.add(normalized)
    db.commit()
    db.refresh(normalized)

    # Validate the persisted structure again before returning
    struct = normalized.structure or {}
    valid, total, message = validate_structure(
        struct.get("basic_percentage", 0),
        struct.get("da_percentage", 0),
        struct.get("conveyance_percentage", 0),
        struct.get("hra_percentage", 0),
    )
    if not valid:
        raise HTTPException(status_code=422, detail=message)
    return _settings_out(normalized)
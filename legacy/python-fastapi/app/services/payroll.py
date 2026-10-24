from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from ..models.hr import Employee, PayrollSettings, SalaryStructureOverride

# ------------------------------------------------------------------
# Defaults (only used when nothing is configured yet — runtime overrides
# everything from the DB `payroll_settings` row / per-employee overrides).
# ------------------------------------------------------------------
DEFAULT_STRUCTURE: dict[str, float] = {
    "basic_percentage": 40.0,
    "da_percentage": 20.0,
    "conveyance_percentage": 5.0,
    "hra_percentage": 35.0,
}
DEFAULT_PF: dict[str, Any] = {
    "enabled": True,
    "rate": 12.0,
    "wage_base": "PF_WAGE",
    "wage_components": ["BASIC", "DA", "CONVEYANCE"],
    "wage_ceiling": 15000.0,
}
DEFAULT_ESI: dict[str, Any] = {
    "enabled": True,
    "rate": 0.75,
    "wage_base": "GROSS",
    "wage_ceiling": 21000.0,
}
DEFAULT_PT: dict[str, Any] = {"enabled": False, "amount": 200.0}
WAGE_COMPONENT_KEYS = ("BASIC", "DA", "CONVEYANCE", "HRA")


class PayrollValidationError(ValueError):
    """Raised when the salary structure percentages do not sum to 100."""


def _money(value: float) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def to_money_float(value: float) -> float:
    return float(_money(value))


def normalize_settings(settings: PayrollSettings | None) -> PayrollSettings:
    """Guarantee a settings row with all keys present (fully dynamic defaults)."""
    if settings is None:
        from ..models.hr import PayrollSettings as PS

        settings = PS(id="global")
    structure = dict(DEFAULT_STRUCTURE)
    structure.update(settings.structure or {})
    settings.structure = structure

    pf = dict(DEFAULT_PF)
    pf.update(settings.pf or {})
    settings.pf = pf

    esi = dict(DEFAULT_ESI)
    esi.update(settings.esi or {})
    settings.esi = esi

    pt = dict(DEFAULT_PT)
    pt.update(settings.pt or {})
    settings.pt = pt
    return settings


def validate_structure(basic: float, da: float, conveyance: float, hra: float) -> tuple[bool, float, str | None]:
    total = sum([basic, da, conveyance, hra])
    if abs(total - 100.0) > 1e-6:
        return False, total, (
            f"Salary structure percentages must sum to 100%. "
            f"Current sum is {total:.2f}% (Basic {basic}, DA {da}, Conveyance {conveyance}, HRA {hra}). "
            f"Adjust the Payroll Settings before running payroll."
        )
    if any(v < 0 for v in (basic, da, conveyance, hra)):
        return False, total, "Salary structure percentages cannot be negative."
    return True, total, None


def resolve_structure_config(
    global_settings: dict[str, Any],
    override: SalaryStructureOverride | None,
) -> dict[str, Any]:
    structure = dict(DEFAULT_STRUCTURE)
    structure.update(global_settings.get("structure") or {})
    if override and override.percentages:
        structure.update(override.percentages)
    return structure


def resolve_statutory_config(
    global_settings: dict[str, Any],
    override: SalaryStructureOverride | None,
) -> dict[str, Any]:
    pf = dict(DEFAULT_PF)
    pf.update(global_settings.get("pf") or {})
    esi = dict(DEFAULT_ESI)
    esi.update(global_settings.get("esi") or {})
    pt = dict(DEFAULT_PT)
    pt.update(global_settings.get("pt") or {})
    if override:
        pf.update(override.pf or {})
        esi.update(override.esi or {})
    return {"pf": pf, "esi": esi, "pt": pt}


def compute_salary_structure(
    total_salary: float,
    basic_percentage: float,
    da_percentage: float,
    conveyance_percentage: float,
    hra_percentage: float,
) -> dict[str, Any]:
    """Build a SalaryStructure from percentage config. Validates sum == 100.

    Percentages are percentages OF the total (monthly gross) salary.
    """
    ok, total, message = validate_structure(
        basic_percentage, da_percentage, conveyance_percentage, hra_percentage
    )
    result: dict[str, Any] = {
        "basicPercentage": basic_percentage,
        "daPercentage": da_percentage,
        "conveyancePercentage": conveyance_percentage,
        "hraPercentage": hra_percentage,
        "percentagesSum": total,
        "isValid": ok,
        "validationMessage": message,
    }
    if not ok:
        result["totalSalary"] = to_money_float(total_salary)
        result["basicPay"] = 0.0
        result["dearnessAllowance"] = 0.0
        result["conveyance"] = 0.0
        result["hra"] = 0.0
        return result

    total = Decimal(str(total_salary or 0))
    result["totalSalary"] = float(total)
    result["basicPay"] = float(_money(total * Decimal(basic_percentage) / 100))
    result["dearnessAllowance"] = float(_money(total * Decimal(da_percentage) / 100))
    result["conveyance"] = float(_money(total * Decimal(conveyance_percentage) / 100))
    result["hra"] = float(_money(total * Decimal(hra_percentage) / 100))
    return result


def _statutory_wage(
    component_values: dict[str, Decimal],
    wage_base: str,
    wage_components: list[str],
    ceiling: float,
    total_salary: Decimal,
) -> Decimal:
    if wage_base == "BASIC":
        wage = component_values["BASIC"]
    elif wage_base == "ESI_WAGE":
        wage = component_values["BASIC"] + component_values["DA"]
    elif wage_base == "GROSS":
        wage = total_salary
    else:  # "PF_WAGE" -> sum of configured wage components
        wage = sum(
            component_values[c] for c in (wage_components or []) if c in component_values
        )
    if ceiling and ceiling > 0:
        wage = min(wage, Decimal(str(ceiling)))
    return wage


def compute_payroll_calculation(
    total_salary: float,
    structure: dict[str, Any],
    pf_config: dict[str, Any],
    esi_config: dict[str, Any],
    pt_config: dict[str, Any],
    *,
    bonus: float = 0.0,
    reward_earnings: float = 0.0,
    attendance_deduction: float = 0.0,
    leave_deduction: float = 0.0,
    loan_deduction: float = 0.0,
) -> dict[str, Any]:
    """Compute the full PayrollCalculation from an already-validated structure."""
    basic = _money(structure["basicPay"])
    da = _money(structure["dearnessAllowance"])
    conveyance = _money(structure["conveyance"])
    hra = _money(structure["hra"])
    gross = _money(total_salary) + _money(bonus) + _money(reward_earnings)

    component_values = {"BASIC": basic, "DA": da, "CONVEYANCE": conveyance, "HRA": hra}

    # ---- Statutory deductions (all configurable, no hardcoding) ----
    pf_amount = Decimal("0")
    esi_amount = Decimal("0")
    pf_wage = Decimal("0")
    esi_wage = Decimal("0")

    if pf_config.get("enabled", True):
        pf_wage = _statutory_wage(
            component_values,
            pf_config.get("wage_base", "PF_WAGE"),
            pf_config.get("wage_components", []),
            pf_config.get("wage_ceiling", 0),
            gross,
        )
        pf_amount = _money(pf_wage * Decimal(str(pf_config.get("rate", 0))) / 100)

    if esi_config.get("enabled", True):
        esi_wage = _statutory_wage(
            component_values,
            esi_config.get("wage_base", "GROSS"),
            ["BASIC", "DA"],
            esi_config.get("wage_ceiling", 0),
            gross,
        )
        esi_amount = _money(esi_wage * Decimal(str(esi_config.get("rate", 0))) / 100)

    pt_amount = _money(pt_config.get("amount", 0)) if pt_config.get("enabled", False) else Decimal("0")

    total_deductions = (
        pf_amount
        + esi_amount
        + pt_amount
        + _money(attendance_deduction)
        + _money(leave_deduction)
        + _money(loan_deduction)
    )
    net = gross - total_deductions
    if net < 0:
        net = Decimal("0")

    return {
        "totalSalary": float(gross),
        "basicPay": float(basic),
        "dearnessAllowance": float(da),
        "conveyance": float(conveyance),
        "hra": float(hra),
        "pfWage": float(pf_wage),
        "pfRate": float(pf_config.get("rate", 0)),
        "pfAmount": float(pf_amount),
        "esiWage": float(esi_wage),
        "esiRate": float(esi_config.get("rate", 0)),
        "esiAmount": float(esi_amount),
        "professionalTax": float(pt_amount),
        "attendanceDeduction": to_money_float(attendance_deduction),
        "leaveDeduction": to_money_float(leave_deduction),
        "loanDeduction": to_money_float(loan_deduction),
        "totalDeductions": float(total_deductions),
        "netSalary": float(net),
    }


def calculate_employee_payroll(
    employee: Employee,
    settings: PayrollSettings | None,
    override: SalaryStructureOverride | None,
    *,
    bonus: float = 0.0,
    reward_earnings: float = 0.0,
    attendance_deduction: float = 0.0,
    leave_deduction: float = 0.0,
    loan_deduction: float = 0.0,
) -> dict[str, Any]:
    """Single source of truth for payroll. Validates 100% sum before computing."""
    normalized = normalize_settings(settings)
    structure_cfg = resolve_structure_config({"structure": normalized.structure}, override)
    statutory = resolve_statutory_config(
        {"pf": normalized.pf, "esi": normalized.esi, "pt": normalized.pt}, override
    )
    total_salary = override.total_salary if (override and override.total_salary) else employee.total_salary

    structure = compute_salary_structure(
        total_salary,
        structure_cfg["basic_percentage"],
        structure_cfg["da_percentage"],
        structure_cfg["conveyance_percentage"],
        structure_cfg["hra_percentage"],
    )
    if not structure["isValid"]:
        raise PayrollValidationError(structure["validationMessage"] or "Invalid salary structure.")

    calc = compute_payroll_calculation(
        total_salary,
        structure,
        statutory["pf"],
        statutory["esi"],
        statutory["pt"],
        bonus=bonus,
        reward_earnings=reward_earnings,
        attendance_deduction=attendance_deduction,
        leave_deduction=leave_deduction,
        loan_deduction=loan_deduction,
    )
    return {**structure, **calc}


def build_payslip(
    record: dict[str, Any],
    company: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Deterministic payslip document from a PayrollRecord dict."""
    company = company or {}

    earnings = [
        {"label": "Basic Salary", "amount": record.get("basicSalary", 0)},
        {"label": "Dearness Allowance (DA)", "amount": record.get("dearnessAllowance", 0)},
        {"label": "Conveyance Allowance", "amount": record.get("conveyance", 0)},
        {"label": "House Rent Allowance (HRA)", "amount": record.get("hra", 0)},
        {"label": "Performance Bonus", "amount": record.get("bonus", 0)},
        {"label": "Recognition / Reward Earnings", "amount": record.get("rewardEarnings", 0)},
    ]
    deductions = [
        {
            "label": f"PF Employee Contribution ({record.get('pfRate', 0)}%)",
            "amount": record.get("pfAmount", 0),
        },
        {"label": f"ESI Contribution ({record.get('esiRate', 0)}%)", "amount": record.get("esiAmount", 0)},
        {"label": "Professional Tax (PT)", "amount": record.get("professionalTax", 0)},
        {"label": "Attendance Deduction", "amount": record.get("attendanceDeduction", 0)},
        {"label": "Unpaid Leave Deduction", "amount": record.get("leaveDeduction", 0)},
        {"label": "Loan / Advance Recovery", "amount": record.get("loanDeduction", 0)},
    ]
    totals = {
        "grossEarnings": sum(float(e["amount"]) for e in earnings),
        "totalDeductions": record.get("totalDeductions", 0),
        "netPayable": record.get("netSalary", 0),
    }
    return {"company": company, "record": record, "earnings": earnings, "deductions": deductions, "totals": totals}
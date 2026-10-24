from pydantic import BaseModel, Field


# ------------------------------------------------------------------
# Salary Structure & Payroll Calculation Contract
# (field names match the required payload interfaces exactly)
# ------------------------------------------------------------------
class SalaryStructure(BaseModel):
    totalSalary: float
    basicPercentage: float
    basicPay: float
    daPercentage: float
    dearnessAllowance: float
    conveyancePercentage: float
    conveyance: float
    hraPercentage: float
    hra: float
    percentagesSum: float = 100.0
    isValid: bool = True
    validationMessage: str | None = None


class PayrollCalculation(BaseModel):
    totalSalary: float
    basicPay: float
    dearnessAllowance: float
    conveyance: float
    hra: float
    pfWage: float
    pfRate: float
    pfAmount: float
    esiWage: float
    esiRate: float
    esiAmount: float
    professionalTax: float = 0.0
    attendanceDeduction: float = 0.0
    leaveDeduction: float = 0.0
    loanDeduction: float = 0.0
    totalDeductions: float
    netSalary: float


class StructureValidationRequest(BaseModel):
    totalSalary: float = Field(gt=0)
    basicPercentage: float
    daPercentage: float
    conveyancePercentage: float
    hraPercentage: float


class StructureConfig(BaseModel):
    """Dynamic salary-structure percentages (must sum to 100)."""

    basic_percentage: float = 40.0
    da_percentage: float = 20.0
    conveyance_percentage: float = 5.0
    hra_percentage: float = 35.0


class PfConfig(BaseModel):
    """Dynamic PF statutory config.

    wage_base: "BASIC" (only basic pay) | "PF_WAGE" (sum of wage_components).
    """

    enabled: bool = True
    rate: float = 12.0
    wage_base: str = "PF_WAGE"
    wage_components: list[str] = Field(default_factory=lambda: ["BASIC", "DA", "CONVEYANCE"])
    wage_ceiling: float = 15000.0


class EsiConfig(BaseModel):
    """Dynamic ESI statutory config. wage_base: "GROSS" | "ESI_WAGE"."""

    enabled: bool = True
    rate: float = 0.75
    wage_base: str = "GROSS"
    wage_ceiling: float = 21000.0


class PtConfig(BaseModel):
    enabled: bool = False
    amount: float = 200.0


class PayrollSettingsUpdate(BaseModel):
    structure: StructureConfig | None = None
    pf: PfConfig | None = None
    esi: EsiConfig | None = None
    pt: PtConfig | None = None
    standard_working_days: int | None = None
    payroll_cycle_day: int | None = None


class PayrollSettingsOut(BaseModel):
    structure: StructureConfig
    pf: PfConfig
    esi: EsiConfig
    pt: PtConfig
    standard_working_days: int
    payroll_cycle_day: int


class PayrollCalculateRequest(BaseModel):
    employee_id: str | None = None
    month: str = "2026-08"
    bonus: float = 0.0
    reward_earnings: float = 0.0
    attendance_deduction: float = 0.0
    leave_deduction: float = 0.0
    loan_deduction: float = 0.0


class PayrollRecordOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    department: str | None = None
    designation: str | None = None
    payroll_month: str
    totalSalary: float
    basicSalary: float
    dearnessAllowance: float
    conveyance: float
    hra: float
    bonus: float
    rewardEarnings: float
    pfWage: float
    pfRate: float
    pfAmount: float
    esiWage: float
    esiRate: float
    esiAmount: float
    professionalTax: float
    attendanceDeduction: float
    leaveDeduction: float
    loanDeduction: float
    totalDeductions: float
    netSalary: float
    workingDays: int
    presentDays: int
    status: str


class PayslipOut(BaseModel):
    company: dict
    record: PayrollRecordOut
    earnings: list[dict]
    deductions: list[dict]
    totals: dict


class PayrollProcessResponse(BaseModel):
    month: str
    processed: int
    records: list[PayrollRecordOut]
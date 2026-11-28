// VRM Enterprise HRMS — Production Payroll Domain Types & Interfaces

export interface SalaryStructureInput {
  monthlySalary: number;
  basicPercentage: number;
  daPercentage: number;
  conveyancePercentage: number;
  hraPercentage: number;
  withPf?: boolean;
}

export interface ComputedSalaryStructure {
  monthlySalary: number;
  basicSalary: number;
  da: number;
  conveyance: number;
  hra: number;
  fixedGross: number;
  percentagesSum: number;
  isValid: boolean;
}

export interface PfWageComponents {
  basic: boolean;
  da: boolean;
  conveyance: boolean;
  hra: boolean;
  attendance_bonus: boolean;
  overtime: boolean;
  other_earnings: boolean;
  [key: string]: boolean;
}

export interface EsicWageComponents {
  basic: boolean;
  da: boolean;
  conveyance: boolean;
  hra: boolean;
  attendance_bonus: boolean;
  overtime: boolean;
  other_earnings: boolean;
  [key: string]: boolean;
}

export interface PayrollSettingsModel {
  id: string;
  orgKey: string;
  pfEnabled: boolean;
  pfRate: number; // default 12.0
  pfWageCeiling: number; // default 15000.0
  pfWageComponents: PfWageComponents;
  esicEnabled: boolean;
  esicRate: number; // default 0.75
  esicSalaryThreshold: number; // default 21000.0
  esicWageComponents: EsicWageComponents;
  professionalTaxEnabled: boolean;
  professionalTaxAmount: number; // default 200.0
  lopEnabled: boolean;
  attendanceBonusEnabled: boolean;
  overtimeEnabled: boolean;
  standardWorkingDays: number; // default 26
  payrollCycleDay: number; // default 1
}

export type SalaryComponentType = 'EARNING' | 'DEDUCTION';
export type CalculationMethod = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'FORMULA' | 'ATTENDANCE_OT';
export type ComponentEligibilityType = 'ALL' | 'SALARY_CONDITION' | 'SELECTED_EMPLOYEES';
export type ComponentEligibilityBase = 'CTC' | 'GROSS' | 'BASIC';
export type ComponentEligibilityOperator = '>' | '>=' | '<' | '<=' | '=' | 'BETWEEN';

export interface SalaryComponentConfig {
  id: string;
  name: string;
  code: string;
  type: SalaryComponentType;
  calculationMethod: CalculationMethod;
  defaultValue: number;
  percentageBase?: 'BASIC' | 'GROSS' | 'CTC';
  formula?: string;
  isStatutory: boolean;
  active: boolean;
  isConfidential: boolean;
  description: string;

  // Dynamic Eligibility Rules
  eligibilityType?: ComponentEligibilityType; // 'ALL' | 'SALARY_CONDITION' | 'SELECTED_EMPLOYEES'
  eligibilityBase?: ComponentEligibilityBase; // 'CTC' | 'GROSS' | 'BASIC'
  eligibilityOperator?: ComponentEligibilityOperator; // '>', '>=', '<', '<=', '=', 'BETWEEN'
  eligibilityLimit?: number; // Salary threshold or minimum range limit
  eligibilityLimitMax?: number; // Maximum limit for BETWEEN operator
  eligibleEmployeeIds?: string[]; // Selected employee IDs/codes when eligibilityType === 'SELECTED_EMPLOYEES'
  version?: number;
  effectiveFrom?: string;
}

export interface EmployeeSalaryEligibilityContext {
  id?: string;
  employeeId?: string;
  role?: string;
  department?: string;
  designation?: string;
  companyId?: string;
  branchId?: string;
  monthlyCtc?: number;
  basicSalary?: number;
  grossSalary?: number;
  regularGrossExcludingOt?: number;
  withPf?: boolean;
  esicCovered?: boolean;
  excludeOtFromEsicEligibility?: boolean;
  joiningDate?: string;
  payrollMonth?: number;
  payrollYear?: number;
  isContributionPeriodContinuation?: boolean;
}

export interface PayrollSettingsConfig {
  components: SalaryComponentConfig[];
  pfPolicy?: {
    active: boolean;
    calculationType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FORMULA';
    percentage: number;
    fixedAmount?: number;
    calculationBase: 'BASIC' | 'GROSS' | 'CUSTOM';
    formula: string;
    effectiveDate?: string;
    version?: number;
  };
  esicPolicy?: {
    active: boolean;
    percentage: number;
    grossSalaryLimit: number;
    formula: string;
    effectiveDate?: string;
    version?: number;
  };
  standardWorkingDaysPerMonth?: number;
  payrollCycleDay?: number;
  enableProfessionalTax?: boolean;
  standardPtAmount?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AttendanceInputData {
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  halfDays: number;
  lopDays: number;
  overtimeHours: number;
  calendarDays?: number;
  eligibleDays?: number;
  scheduledWorkingDays?: number;
  paidWeekOffDays?: number;
  paidHolidayDays?: number;
  overlappingHolidayDays?: number;
  paidDays?: number;
  pendingAttendanceDays?: number;
  joiningDate?: string | null;
  exitDate?: string | null;
  weeklyOff?: string | string[] | null;
  weeklySchedules?: any[];
  holidays?: any[];
  attendanceRecords?: any[];
  leaveRequests?: any[];
  sandwichPolicies?: any[];
}

export interface CalendarDayPayrollBreakdown {
  calendarDays: 28 | 29 | 30 | 31;
  eligibleDays: number;
  unemployedDays: number;
  scheduledWorkingDays: number;
  workingDays: number;
  presentDays: number;
  actualPunchedDays: number;
  pendingAttendanceDays: number;
  paidWeekOffDays: number;
  paidHolidayDays: number;
  overlappingHolidayDays: number;
  paidLeaveDays: number;
  lopDays: number;
  sandwichLopDays: number;
  paidDays: number;
  totalPaidDays: number;
  activeStartDate: string;
  activeEndDate: string;
  prorationFactor: number;
  isFullMonthEligible: boolean;
}

export type OtWageBaseMode = 'FIXED_HOURLY' | 'BASIC' | 'GROSS' | 'CTC';
export type OtSalaryDivisorMode = 'FIXED_26' | 'FIXED_30' | 'CALENDAR_DAYS' | 'WORKING_DAYS' | 'STATUTORY_DIVISOR' | 'CUSTOM' | 'FIXED_DAYS' | 'ACTUAL_WORKING_DAYS' | 'COMPANY_DIVISOR';
export type OtCalculationMultiplier = '1x Salary' | '1.5x Salary' | '2x Salary' | 'Fixed Amount Per Hour';

export interface PayslipOvertimeVisibilityConfig {
  showOtHoursOnPayslip: boolean;
  showOtAmountOnPayslip: boolean;
  showOtCalculationDetailsOnPayslip: boolean;
  showOtRateOnPayslip?: boolean;
  showEmployerContributionOnPayslip?: boolean;
}

export interface AdditionalEarningsInput {
  attendanceBonus?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  overtimeAmount?: number;
  overtimeWageBase?: OtWageBaseMode;
  overtimeMultiplier?: OtCalculationMultiplier | number;
  standardShiftHours?: number;
  bonus?: number;
  incentive?: number;
  commission?: number;
  otherEarnings?: number;
}

export interface AdditionalDeductionsInput {
  advanceRecovery?: number;
  loanRecovery?: number;
  otherDeductions?: number;
}

export interface PayrollCalculationInput {
  employeeId: string;
  monthlySalary: number;
  basicPercentage: number;
  daPercentage: number;
  conveyancePercentage: number;
  hraPercentage: number;
  payrollMonth: number;
  payrollYear: number;
  settings: PayrollSettingsModel;
  attendance: AttendanceInputData;
  earnings?: AdditionalEarningsInput;
  deductions?: AdditionalDeductionsInput;
  withPf?: boolean;
  configuredComponents?: SalaryComponentConfig[];
  employeeContext?: EmployeeSalaryEligibilityContext;
  salaryDivisorMode?: OtSalaryDivisorMode;
  customSalaryDivisor?: number;
  payslipOvertimeVisibility?: PayslipOvertimeVisibilityConfig;
  // Calendar Day Payroll Context
  joiningDate?: string;
  exitDate?: string;
  weeklyOff?: string | string[];
  weeklySchedules?: any[];
  holidays?: any[];
  attendanceRecords?: any[];
  leaveRequests?: any[];
  sandwichPolicies?: any[];
  weekOffEligibilityPolicy?: {
    requireAdjacentPresenceForWeekOff?: boolean;
    requireAdjacentPresenceForHoliday?: boolean;
  };
  autoConvertPendingToLop?: boolean;
}

export interface CalculationBreakdownItem {
  name: string;
  category: 'EARNING' | 'DEDUCTION';
  amount: number;
  description?: string;
}

export interface FullPayrollCalculationResult {
  employeeId: string;
  status?: 'DRAFT' | 'PROCESSED' | 'APPROVED' | 'PAID';
  payrollMonth: number;
  payrollYear: number;
  withPf?: boolean;

  // Fixed Salary Components
  monthlySalary: number;
  basicSalary: number;
  da: number;
  conveyance: number;
  hra: number;
  fixedGross: number;

  // Additional Earnings
  attendanceBonus: number;
  overtimeHours: number;
  overtimeRate: number;
  overtimeAmount: number;
  bonus: number;
  incentive: number;
  commission: number;
  otherEarnings: number;
  grossSalary: number; // Total Gross Earnings

  // Statutory Deductions & Employer Contributions
  pfBase: number;
  pfRate: number;
  pfAmount: number;
  employerPfRate?: number;
  employerPfAmount?: number;

  esicBase: number;
  esicRate: number;
  esicAmount: number;
  employerEsicRate?: number;
  employerEsicAmount?: number;
  esicCovered?: boolean;
  otVariableAmount?: number;

  professionalTax: number;

  // Calendar Day Attendance & Payable Days Breakdown
  calendarDays?: number;
  calendarDaysInMonth?: number;
  eligibleDays?: number;
  workingDays: number;
  scheduledWorkingDays?: number;
  salaryDivisorUsed?: number;
  salaryDivisorMode?: string;
  presentDays: number;
  paidWeekOffDays?: number;
  paidHolidayDays?: number;
  overlappingHolidayDays?: number;
  paidLeaveDays?: number;
  lopDays: number;
  paidDays?: number;
  totalPaidDays?: number;
  pendingAttendanceDays?: number;
  dailySalary: number;
  lopAmount: number;

  // Loan & Recovery
  advanceRecovery: number;
  loanRecovery: number;
  otherDeductions: number;

  totalDeductions: number;
  netSalary: number;

  earningsBreakdown: CalculationBreakdownItem[];
  deductionsBreakdown: CalculationBreakdownItem[];
}

export type PayrollRunStatus = 'DRAFT' | 'PROCESSING' | 'PROCESSED' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface PayrollRunModel {
  id: string;
  payrollMonth: number;
  payrollYear: number;
  status: PayrollRunStatus;
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  processedBy?: string;
  approvedBy?: string;
  processedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayslipResponseData {
  company: {
    company_id?: string;
    companyName: string;
    legalName: string;
    logoUrl?: string;
    address: string;
    registeredAddress?: string;
    branchAddress?: string;
    email?: string;
    phone?: string;
    website?: string;
    pan: string;
    gst: string;
    cin?: string;
    registrationNumber?: string;
    ownerName?: string;
    authorizedSignatoryName?: string;
    authorizedSignatoryDesignation?: string;
    signatureImageUrl?: string;
    stampImageUrl?: string;
  };
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    designation: string;
    joiningDate?: string;
    monthlyCtc?: number;
    panNumber?: string;
    uanNumber?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
  payroll: {
    month: number;
    year: number;
    monthName: string;
    calendarDays?: number;
    eligibleDays?: number;
    workingDays: number;
    presentDays: number;
    paidWeekOffDays?: number;
    paidHolidayDays?: number;
    paidLeaveDays?: number;
    lopDays: number;
    paidDays?: number;
    totalPaidDays?: number;
    status: string;
  };
  earnings: {
    basicSalary: number;
    da: number;
    conveyance: number;
    hra: number;
    attendanceBonus: number;
    overtimeAmount: number;
    bonus: number;
    incentive: number;
    commission: number;
    otherEarnings: number;
    grossSalary: number;
  };
  deductions: {
    pf: number;
    pfRate: number;
    esic: number;
    esicRate: number;
    professionalTax: number;
    lopAmount: number;
    lateAttendanceDeduction?: number;
    advanceRecovery: number;
    loanRecovery: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  earningsBreakdown?: CalculationBreakdownItem[];
  deductionsBreakdown?: CalculationBreakdownItem[];
  netSalary: number;
}

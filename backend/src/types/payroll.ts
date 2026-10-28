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
export type CalculationMethod = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'FORMULA';
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
  monthlyCtc?: number;
  basicSalary?: number;
  grossSalary?: number;
  withPf?: boolean;
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
}

export interface AdditionalEarningsInput {
  attendanceBonus?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  overtimeAmount?: number;
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

  // Statutory Deductions
  pfBase: number;
  pfRate: number;
  pfAmount: number;

  esicBase: number;
  esicRate: number;
  esicAmount: number;

  professionalTax: number;

  // Attendance & LOP
  workingDays: number;
  presentDays: number;
  lopDays: number;
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
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
  payroll: {
    month: number;
    year: number;
    monthName: string;
    workingDays: number;
    presentDays: number;
    lopDays: number;
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
    advanceRecovery: number;
    loanRecovery: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  netSalary: number;
}

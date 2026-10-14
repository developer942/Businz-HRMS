// VRM Enterprise HRM - Settings & Policy Engine Architecture Types

export type NewSettingsSection = 
  | 'my_profile'
  | 'company_details'
  | 'attendance_time'
  | 'leave_management'
  | 'payroll_settings'
  | 'rewards_recognition'
  | 'advance_loan_policy'
  | 'integrations';

// ==========================================
// 1. COMPANY DETAILS
// ==========================================
export interface CompanyInfo {
  id?: string;
  company_id?: string;
  companyCode?: string; // Short code e.g. BUSINZ, HDFC, SBI, KVB
  logoUrl?: string;
  companyName: string;
  legalCompanyName: string;
  companyType: string; // e.g. Private Limited, Public Limited, Partnership, LLP
  industry: string;
  registrationNumber: string; // ROC
  gstNumber: string;
  panNumber: string;
  cinNumber: string;
  website: string;
  officialEmail: string;
  officialPhone: string;
  registeredAddress?: string;
  branchAddress?: string;
  ownerName?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryDesignation?: string;
  signatureImageUrl?: string;
  stampImageUrl?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CompanyAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

export interface CompanyBranch {
  id: string;
  branchName: string;
  branchCode: string;
  isHeadOffice: boolean;
  address: CompanyAddress;
  contactNumber: string;
  email: string;
  branchHr: string;
  workingDays: string[]; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  workingHours?: {
    startTime: string; // '09:30'
    endTime: string;   // '18:30'
  };
  createdAt: string;
  updatedAt: string;
}

export interface OrgTeam {
  id: string;
  name: string;
  departmentId: string;
  leadEmployeeId?: string;
  leadEmployeeName?: string;
}

export interface OrganizationStructure {
  departments: string[];
  designations: string[];
  employmentTypes: string[];
  workLocations: string[];
  reportingManagers: { id: string; name: string; department: string }[];
  teams: OrgTeam[];
}

// ==========================================
// 2. ATTENDANCE & TIME
// ==========================================
export type LateRuleType = 
  | 'FIXED_AMOUNT'
  | 'PERCENTAGE_DAILY'
  | 'COUNT_BASED'
  | 'HALF_DAY_CONVERSION'
  | 'CUSTOM_FORMULA';

export interface CountBasedLateTier {
  id: string;
  minCount: number;
  maxCount: number | null; // null means unbounded (e.g. 6+)
  deductionPerOccurrence: number;
}

export type DeductionVisibility = 'DETAILED' | 'GENERIC';

export interface AttendancePolicy {
  id: string;
  policyName: string;
  description: string;
  applicableEmployees: 'ALL' | string[]; // 'ALL' or array of employee IDs
  applicableDepartments: 'ALL' | string[];
  applicableBranches: 'ALL' | string[];
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'Active' | 'Inactive' | 'Archived';
  version: number;

  // Working Time Settings
  shiftName: string;
  startTime: string; // '09:30'
  endTime: string;   // '18:30'
  graceTimeMinutes: number; // e.g. 10 minutes
  minWorkingHours: number;  // e.g. 8
  halfDayHours: number;     // e.g. 4
  fullDayHours: number;     // e.g. 8.5
  weeklyOff: string[];      // ['Sunday']
  holidayCalendar: string;

  // Late Coming Rules
  lateRuleType: LateRuleType;
  fixedAmount?: number; // ₹100
  percentageOfDailySalary?: number; // 5%
  countTiers?: CountBasedLateTier[];
  halfDayLateHoursThreshold?: number; // e.g. 3 hours late -> Half Day
  customFormula?: string; // e.g. "(LATE_COUNT * 100)"

  // Deduction Privacy
  deductionVisibility: DeductionVisibility;
  genericCategoryLabel: string; // Default: 'OTHERS'

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AttendanceCorrectionRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  missingType: 'Check In' | 'Check Out' | 'Full Attendance';
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
  supportingDocUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  hrComment?: string;
  adjustedCheckIn?: string;
  adjustedCheckOut?: string;
}

// ==========================================
// 3. LEAVE MANAGEMENT
// ==========================================
export type LeaveApprovalFlow = 
  | 'EMPLOYEE_HR_CEO'
  | 'EMPLOYEE_MANAGER_HR'
  | 'EMPLOYEE_HR';

export type LeaveDeductionRuleType = 
  | 'FIXED_AMOUNT'
  | 'DAILY_SALARY'
  | 'PERCENTAGE'
  | 'CUSTOM_FORMULA';

export interface LeaveTypeConfig {
  id: string;
  name: string;
  isPaid: boolean;
  quotaPerYear: number;
  description: string;
  color?: string;
}

export interface MasterLeavePolicy {
  id: string;
  policyName: string;
  description: string;
  applicableEmployees: 'ALL' | string[];
  applicableDepartments: 'ALL' | string[];
  applicableBranches: 'ALL' | string[];
  applicableEmploymentType?: 'ALL' | 'Confirmed' | 'Provisional' | 'Contract' | 'Intern';
  applicableDesignations?: 'ALL' | string[];
  applicableGender?: 'ALL' | 'Male' | 'Female';
  effectiveDate: string;
  status: 'Active' | 'Inactive' | 'Archived';
  version: number;

  // Available leave types
  leaveTypes: LeaveTypeConfig[];

  // Carry Forward Configuration
  allowCarryForward?: boolean;
  maxCarryForwardDays?: number; // Max days allowed to roll over
  carryForwardExpiryMonths?: number; // 0 = never expires, 3 = 90 days, 12 = 1 year

  // Leave Encashment Configuration
  allowEncashment?: boolean;
  maxEncashableDays?: number; // Max days eligible for cash encashment
  minBalanceForEncashment?: number; // Min balance employee must retain before encashment
  encashmentCalculationBase?: 'BASIC' | 'GROSS'; // Calculation basis: Basic (/26) or Gross (/30)

  // Custom Leave Rule Builder
  monthlyFreeUnpaidLeaves: number; // e.g. 1 free unpaid leave per month
  deductionRuleType: LeaveDeductionRuleType;
  fixedDeductionAmount?: number;
  dailySalaryMultiplier?: number; // 1 = 1 day salary
  percentageOfDailySalary?: number;
  customFormula?: string; // e.g. "(DAILY_SALARY * UNPAID_DAYS)"

  // Approval Flow
  approvalFlow: LeaveApprovalFlow;

  // Privacy Setting
  deductionVisibility: DeductionVisibility;
  genericCategoryLabel: string; // Default: 'OTHERS'

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

// ==========================================
// 4. PAYROLL SETTINGS
// ==========================================
export type SalaryComponentType = 'EARNING' | 'DEDUCTION';
export type CalculationMethod = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'FORMULA';

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
  isConfidential: boolean; // if true, uses generic visibility for employee
  description: string;
}

export interface PFPolicyConfig {
  active: boolean;
  calculationType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FORMULA';
  percentage: number; // 12%
  fixedAmount?: number;
  calculationBase: 'BASIC' | 'GROSS' | 'CUSTOM';
  formula: string; // 'BASIC * 12 / 100'
  effectiveDate: string;
  version: number;
}

export interface ESICPolicyConfig {
  active: boolean;
  percentage: number; // 0.75%
  grossSalaryLimit: number; // 21000
  formula: string; // 'GROSS * 0.75 / 100'
  effectiveDate: string;
  version: number;
}

export interface IncrementSlab {
  id: string;
  name: string;
  ratingMin: number;
  ratingMax: number;
  incrementPercentage: number;
  applicableCadre: string;
  effectiveCycle: string;
  status: 'Active' | 'Inactive';
}

export interface IncrementPolicyConfig {
  active: boolean;
  cycle: string;
  standardBaseIncrement: number;
  effectiveMonth: string;
  allowManagerRecommendation: boolean;
  slabs: IncrementSlab[];
}

export interface PayrollSettingsConfig {
  components: SalaryComponentConfig[];
  pfPolicy: PFPolicyConfig;
  esicPolicy: ESICPolicyConfig;
  incrementPolicy?: IncrementPolicyConfig;
  standardWorkingDaysPerMonth: number; // e.g. 26 or 22
  payrollCycleDay: number; // e.g. 1st of each month
  enableProfessionalTax: boolean;
  standardPtAmount: number; // e.g. 200
  updatedAt: string;
  updatedBy: string;
}

// ==========================================
// 5. REWARDS & RECOGNITION
// ==========================================
export type RewardType = 
  | 'Employee of the Month'
  | 'Performance Bonus'
  | 'Spot Award'
  | 'Referral Reward'
  | 'Sales Incentive'
  | 'Attendance Reward'
  | 'Anniversary Reward'
  | 'Custom Reward';

export type RewardValueType = 
  | 'FIXED_AMOUNT'
  | 'PERCENTAGE'
  | 'GIFT_NON_MONETARY'
  | 'CERTIFICATE'
  | 'POINTS';

export interface RewardPolicy {
  id: string;
  rewardName: string;
  rewardType: RewardType;
  description: string;
  applicableEmployees: 'ALL' | string[];
  applicableDepartments: 'ALL' | string[];
  eligibilityRule: string;
  valueType: RewardValueType;
  amountValue: number; // Monetary amount or points or percentage
  giftDescription?: string;
  addToPayroll: boolean; // if true, automatically added to Payroll Earnings -> Payslip
  status: 'Active' | 'Inactive' | 'Archived';
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface EmployeeRewardRecord {
  id: string;
  rewardPolicyId: string;
  rewardName: string;
  rewardType: RewardType;
  employeeId: string;
  employeeName: string;
  department: string;
  valueType: RewardValueType;
  amount: number;
  giftDescription?: string;
  grantedDate: string;
  grantedBy: string;
  addToPayroll: boolean;
  payrollStatus: 'Pending' | 'ProcessedInPayroll';
  payrollReferenceId?: string;
  notes?: string;
}

// ==========================================
// 6. ADVANCE SALARY / LOAN POLICY
// ==========================================
export type LoanPolicyType = 
  | 'Advance Salary'
  | 'Employee Loan'
  | 'Emergency Loan'
  | 'Custom Loan Type';

export type LoanLimitType = 
  | 'FIXED_AMOUNT'
  | 'PERCENTAGE_SALARY'
  | 'SALARY_MULTIPLIER';

export type ApprovalWorkflowMode = 
  | 'HR_OR_CEO'
  | 'HR_ONLY'
  | 'CEO_ONLY'
  | 'HR_THEN_CEO';

export type LowSalaryRepaymentRule = 
  | 'DEDUCT_AVAILABLE_CARRY_FORWARD'
  | 'CARRY_FORWARD_NEXT_MONTH'
  | 'ALLOW_NEGATIVE_SALARY'
  | 'REQUIRE_HR_REVIEW';

export type PayslipVisibilityRule = 
  | 'DETAILED'
  | 'GENERIC';

export type RequestLimitPeriod = 
  | 'ONCE_A_MONTH'
  | 'ONCE_IN_3_MONTHS'
  | 'ONCE_IN_6_MONTHS'
  | 'ONCE_A_YEAR'
  | 'NO_LIMIT';

export type AdvanceRepaymentType = 
  | 'FULL'
  | 'MONTHLY_EMI'
  | 'BOTH';

export type DeductionStartOption = 
  | 'CURRENT_MONTH'
  | 'NEXT_MONTH';

export type AdvanceApprovalAuthority = 
  | 'HR'
  | 'CEO'
  | 'HR_OR_CEO'
  | 'HR_THEN_CEO';

export interface LoanPolicy {
  id: string;
  // 1. Policy Name
  policyName: string;
  policyType: LoanPolicyType;
  description: string;

  // 2. Applicable Employees
  applicableEmployees: 'ALL' | string[]; // 'ALL' or specific employee IDs
  applicableDepartments: 'ALL' | string[];
  applicableBranches: 'ALL' | string[];
  effectiveFrom: string;
  effectiveTo?: string;

  // 13. Policy Status
  status: 'Active' | 'Inactive';

  // 3. Minimum Working Period
  minimumEmploymentMonths: number; // e.g. 3 months

  // 4. Maximum Advance Amount
  maxLoanAmount: number; // e.g. ₹20,000
  minLoanAmount: number;

  // 5. Maximum Salary %
  maxSalaryPercent?: number; // e.g. 50%
  maxLoanLimitType: LoanLimitType;
  maxLoanLimitValue: number;

  // 6. Request Limit
  requestLimit?: RequestLimitPeriod; // e.g. 'ONCE_IN_3_MONTHS'

  // 7. Previous Advance Pending
  allowPreviousPending?: boolean; // false = 'Not Allow', true = 'Allow'
  maxActiveLoans: number; // Configurable active loans bound

  // 8. Repayment Type
  repaymentType?: AdvanceRepaymentType; // 'FULL' | 'MONTHLY_EMI' | 'BOTH'

  // 9. Maximum Repayment Months
  maxRepaymentMonths: number; // e.g. 3, 6 months
  minRepaymentMonths: number;

  // 10. Deduction Start
  deductionStart?: DeductionStartOption; // 'CURRENT_MONTH' | 'NEXT_MONTH'
  deductionStartRule: 'NEXT_PAYROLL_CYCLE' | 'SPECIFIED_MONTH';

  // 11. Approval By
  approvalBy?: AdvanceApprovalAuthority; // 'HR' | 'CEO' | 'HR_OR_CEO' | 'HR_THEN_CEO'
  approvalWorkflow: ApprovalWorkflowMode;

  // 12. Reason Required
  reasonRequired?: boolean; // true = 'Yes', false = 'No'

  // Governance & Ledger
  lowSalaryRule: LowSalaryRepaymentRule;
  payslipVisibility: PayslipVisibilityRule;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

// ==========================================
// AUDIT & POLICY VERSIONING
// ==========================================
export interface PolicyAuditLog {
  id: string;
  policyCategory: string; // e.g. 'Attendance', 'Leave Management', 'Payroll', 'Rewards'
  policyId: string;
  policyName: string;
  action: 'CREATE' | 'EDIT' | 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE' | 'DELETE';
  performedBy: string;
  performedByRole: string;
  timestamp: string;
  changeSummary: string;
  oldValues?: unknown;
  newValues?: unknown;
}

export interface PolicyVersionSnapshot {
  policyId: string;
  category: 'Attendance' | 'Leave' | 'Payroll_PF' | 'Payroll_ESIC' | 'Reward' | 'Loan';
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo?: string;
  snapshot: unknown;
}

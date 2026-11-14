// VRM Enterprise HRMS - Attendance, Shifts, Overtime & Policy Data Models
// Aligned with Section 29 Enterprise Schema

export type MissedPunchRequestType =
  | 'Missed Check-In'
  | 'Missed Check-Out'
  | 'Wrong Check-In'
  | 'Wrong Check-Out'
  | 'Missing Attendance'
  | 'Other Attendance Issue'
  // Backward-compatible aliases
  | 'Check In'
  | 'Check Out'
  | 'Full Attendance'
  | 'Correction';

export interface MissedPunchRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  shiftName?: string;
  requestType: MissedPunchRequestType;
  existingCheckIn?: string | null;
  existingCheckOut?: string | null;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
  description?: string;
  attachmentUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  hrRemarks?: string;
  adjustedCheckIn?: string;
  adjustedCheckOut?: string;
}

export type OvertimeMultiplierType =
  | 'Fixed Amount Per Hour'
  | 'Half Day'
  | 'Full Day'
  | 'Regularize'
  | '1x Salary'
  | '1.5x Salary'
  | '2x Salary';

export type OtWageBaseMode = 'FIXED_HOURLY' | 'BASIC' | 'GROSS' | 'CTC';

export type OtSalaryDivisorMode =
  | 'COMPANY_DIVISOR'
  | 'CALENDAR_DAYS'
  | 'FIXED_26'
  | 'FIXED_30'
  | 'WORKING_DAYS'
  | 'STATUTORY_DIVISOR'
  | 'CUSTOM_DAYS';

export interface PayslipOvertimeVisibilityConfig {
  showOtHoursOnPayslip: boolean;
  showOtAmountOnPayslip: boolean;
  showOtCalculationDetailsOnPayslip: boolean;
  showOtRateOnPayslip?: boolean;
  showEmployerContributionOnPayslip?: boolean;
}

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  shiftName?: string;
  shiftEnd: string;
  actualCheckOut: string;
  potentialOtHours: number;
  requestedOtHours: number;
  approvedOtHours: number;
  reason: string;
  workDescription?: string;
  attachmentUrl?: string;
  status: 'Pending Approval' | 'Pending' | 'Approved' | 'Partially Approved' | 'Rejected' | 'Manually Added' | 'Paid';
  source?: 'Employee Request' | 'Manual OT' | 'Manual Request' | 'Attendance Auto-Identified';
  multiplier: OvertimeMultiplierType;
  hourlyRate: number;
  calculatedAmount: number;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewRemarks?: string;

  // Backward-compatible & convenience aliases
  otHours?: number;
  otAmount?: number;
  rateType?: OtRateType | OvertimeMultiplierType | string;
  remarks?: string;
  shiftEndTime?: string;
  requestedHours?: number;
  approvedHours?: number;
  appliedMultiplier?: OvertimeMultiplierType | string;
  appliedRatePerHour?: number;
  scheduledEndTime?: string;
  actualEndTime?: string;

  // Enterprise Overtime Calculation, Eligibility & Payroll Lock Metadata
  attendanceRecordId?: string;
  wageBaseUsed?: OtWageBaseMode;
  divisorUsed?: number;
  dailyPaidHoursUsed?: number;
  calendarDaysInMonth?: number;
  eligibilitySource?: 'Department Policy' | 'Individual Exception' | 'Statutory Entitlement' | 'Manual Override' | 'DEPARTMENT_POLICY' | 'EMPLOYEE_EXCEPTION' | 'STATUTORY_ENTITLEMENT' | 'Default' | 'Blocked';
  payrollBatchId?: string;
  payrollStatus?: 'Unprocessed' | 'Processed' | 'Included' | 'Paid' | 'Locked';
  isLocked?: boolean;
  isBackdatedArrear?: boolean;
  arrearSourceMonth?: string;
  payrollMonth?: string;
  targetPayrollMonth?: string;
  targetPayrollYear?: number;
}

export interface ShiftModel {
  id: string;
  shiftName: string;
  shiftCode: string;
  startTime: string; // '09:00' or '09:00 AM'
  endTime: string;   // '18:00' or '06:00 PM'
  requiredWorkingHours: number; // 9.0
  breakDurationMinutes: number; // 60
  gracePeriodMinutes: number;   // 10
  lateThresholdMinutes: number; // 15
  earlyCheckoutThresholdMinutes: number; // 10
  otStartsAfter: string; // 'After required working hours completed'
  maximumDailyOtHours: number; // 4
  color?: string;
  assignedEmployeeCount?: number;
}

export type OtCalculationMethod = 'Shift Based' | 'Working Hours Based' | 'Manual';
export type OtRateType =
  | 'Fixed Amount Per Hour'
  | 'Basic Salary Based'
  | 'Daily Salary Based'
  | 'Hourly Salary Based'
  | 'Percentage Based';

export interface OvertimePolicy {
  id: string;
  policyName: string;
  companyId?: string;
  branchId?: string;
  enabled: boolean;
  calculationMethod: OtCalculationMethod;
  minimumOtDurationMinutes: number; // e.g. 30 mins
  maximumDailyOtHours: number;      // e.g. 4 hours
  maximumWeeklyOtHours?: number;    // e.g. 12 hours
  maximumMonthlyOtHours: number;    // e.g. 60 hours
  approvalRequired: boolean;
  approver: 'HR' | 'CEO' | 'HR_AND_CEO' | 'MANAGER_HR_CEO';
  rateMethod: OtRateType;
  fixedRatePerHour: number;         // e.g. 100
  regularMultiplier: number;        // e.g. 2.0
  weekendMultiplier: number;        // e.g. 2.0
  holidayMultiplier: number;        // e.g. 2.0
  statutoryMultiplier?: number;     // e.g. 2.0
  wageBase?: OtWageBaseMode;
  divisorMode?: OtSalaryDivisorMode;
  customDivisorDays?: number;
  defaultDailyPaidHours?: number;
  defaultMultiplier?: OvertimeMultiplierType;
  rateType?: OtRateType | OvertimeMultiplierType | string;
  effectiveFrom?: string;
  effectiveTo?: string;
  version?: number;
  payslipVisibility?: PayslipOvertimeVisibilityConfig;
}

export interface DepartmentOtPolicy {
  id: string;
  companyId?: string;
  branchId?: string;
  department: string;
  otAllowed: boolean;
  policyId?: string;
  maxOtHoursDaily: number;
  maxOtHoursWeekly?: number;
  maxOtHoursMonthly?: number;
  minOtDurationMinutes: number;
  approvalRequired: boolean;
  calculationMethod?: 'Actual Extra Hours' | 'Shift End Based' | 'Approved OT Only' | 'Manual OT Only';
  standardShiftHours?: number;        // e.g. 9 hrs
  otHourlyRate?: number;              // optional custom fixed rate
  wageBase?: OtWageBaseMode;          // 'FIXED_HOURLY' | 'BASIC' | 'GROSS' | 'CTC'
  divisorMode?: OtSalaryDivisorMode;
  customDivisorDays?: number;
  defaultMultiplier?: OvertimeMultiplierType;
  effectiveFrom?: string;             // Effective-dated policy support (YYYY-MM-DD)
  effectiveTo?: string;
  version?: number;
}

export type IndividualOtException =
  | 'Follow Department Policy'
  | 'Follow Department'
  | 'Default to Department'
  | 'Allow OT'
  | 'Block OT';

export interface EmployeeOtPolicy {
  id: string;
  companyId?: string;
  branchId?: string;
  employeeId: string;
  employeeName: string;
  department: string;
  otAllowed: boolean;
  maxOtDaily: number;
  maxOtMonthly: number;
  minOtDurationMinutes?: number;
  policyId?: string;
  approvalRequired: boolean;
  individualException: IndividualOtException;
  individualOtException?: IndividualOtException;
  departmentDefaultOt?: boolean;
  allowIndividualException?: boolean; // Backward compatibility
  statutoryEntitlement?: boolean;     // Statutory OT entitlement override
  customHourlyRate?: number;
  customDailyMaxOt?: number;
  customMonthlyMaxOt?: number;
  customWageBase?: OtWageBaseMode;
  customMultiplier?: OvertimeMultiplierType;
  effectiveFrom?: string;
  effectiveTo?: string;
  reason?: string;
  notes?: string;
  authorizedBy?: string;
}

export interface AttendancePolicyConfig {
  id: string;
  // Half-Day Policy
  halfDayEnabled: boolean;
  minWorkingHoursHalfDay: number; // e.g. 4.5
  halfDayPercentageBased: boolean;
  halfDayPercentageThreshold: number; // e.g. 50
  halfDayDeductionType: 'No Deduction' | 'Fixed Deduction' | 'Half Day Salary Deduction' | 'Percentage Deduction';
  halfDayDeductionValue: number; // e.g. 50 (for 50% or fixed ₹450)

  // Absent Deduction Policy
  absentDeductionType: 'Full Day Salary' | 'Fixed Amount' | 'Percentage' | 'No Deduction';
  absentDeductionValue: number; // e.g. 100 (for 100% full day salary)

  // Late Arrival Policy
  gracePeriodMinutes: number; // e.g. 10
  lateAction: 'Mark Late' | 'Salary Deduction' | 'Warning Only';
  lateDeductionType: 'Per Minute' | 'Fixed Amount' | 'Percentage' | 'No Deduction';
  lateDeductionValue: number; // e.g. 5 (₹5 per min or 5%)

  // Early Checkout Policy
  earlyCheckoutMinutes: number; // e.g. 10
  earlyCheckoutAction: 'Mark Early Checkout' | 'Deduct Salary' | 'Warning Only';
  earlyCheckoutDeductionType: 'Per Minute' | 'Fixed Amount' | 'Percentage' | 'No Deduction';
  earlyCheckoutDeductionValue: number;
}

export interface SalaryImpactSummary {
  dailySalary: number;
  standardWorkingHours: number;
  hourlyRate: number;
  regularWorkHours: number;
  otHours: number;
  otAmount: number;
  halfDayDeduction: number;
  lateDeduction: number;
  absentDeduction: number;
  earlyCheckoutDeduction: number;
  netAdjustment: number;
}

export interface MonthlyAttendanceSummary {
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  weeklyOffDays: number;
  holidayDays: number;
  lateDays: number;
  earlyCheckoutDays: number;
  missingAttendanceDays: number;
  approvedOtHours: number;
  pendingOtHours: number;
  rejectedOtHours: number;
  totalOtAmount: number;
  totalDeductionAmount: number;
  netImpact: number;
}

export interface AttendanceGlobalSettings {
  attendanceEnabled: boolean;
  checkInEnabled: boolean;
  checkOutEnabled: boolean;
  gracePeriodMinutes: number;
  minWorkingHoursFullDay: number;
  halfDayThresholdHours: number;
  maxCorrectionDays: number;
  allowFutureDates: boolean;
  approvalFlow: 'HR_ONLY' | 'CEO_ONLY' | 'HR_AND_CEO';
  otCalculationMethod: 'Actual Extra Hours' | 'Shift End Based' | 'Approved OT Only' | 'Manual OT Only';
  otRateType: 'Fixed Amount Per Hour' | 'Percentage of Basic' | 'Percentage of Hourly Rate';
  fixedOtRatePerHour: number;
}

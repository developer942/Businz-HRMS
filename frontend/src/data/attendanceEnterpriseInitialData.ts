import {
  MissedPunchRequest,
  OvertimeRequest,
  DepartmentOtPolicy,
  EmployeeOtPolicy,
  AttendanceGlobalSettings,
  OvertimePolicy,
  AttendancePolicyConfig
} from '../types/attendanceEnterprise';

export const INITIAL_OVERTIME_POLICY: OvertimePolicy = {
  id: 'OTP-001',
  policyName: 'Standard Corporate Overtime Policy',
  enabled: true,
  calculationMethod: 'Shift Based',
  minimumOtDurationMinutes: 30,
  maximumDailyOtHours: 4.0,
  maximumWeeklyOtHours: 12.0,
  maximumMonthlyOtHours: 60.0,
  approvalRequired: true,
  approver: 'HR_AND_CEO',
  rateMethod: 'Daily Salary Based', // Hourly Rate = Eligible Monthly Wages / Applicable Divisor / Daily Paid Hours
  fixedRatePerHour: 0,
  regularMultiplier: 2.0,
  weekendMultiplier: 2.0,
  holidayMultiplier: 2.0,
  statutoryMultiplier: 2.0,
  wageBase: 'GROSS',
  divisorMode: 'CALENDAR_DAYS',
  defaultDailyPaidHours: 9,
  defaultMultiplier: '2x Salary',
  effectiveFrom: '2026-01-01',
  version: 1,
  payslipVisibility: {
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtCalculationDetailsOnPayslip: true,
    showOtRateOnPayslip: true,
    showEmployerContributionOnPayslip: false
  }
};

export const INITIAL_ATTENDANCE_POLICY_CONFIG: AttendancePolicyConfig = {
  id: 'APC-001',
  halfDayEnabled: true,
  minWorkingHoursHalfDay: 4.5,
  halfDayPercentageBased: false,
  halfDayPercentageThreshold: 50,
  halfDayDeductionType: 'Half Day Salary Deduction',
  halfDayDeductionValue: 50,

  absentDeductionType: 'Full Day Salary',
  absentDeductionValue: 100,

  gracePeriodMinutes: 10,
  lateAction: 'Mark Late',
  lateDeductionType: 'Fixed Amount',
  lateDeductionValue: 100,

  earlyCheckoutMinutes: 10,
  earlyCheckoutAction: 'Mark Early Checkout',
  earlyCheckoutDeductionType: 'Fixed Amount',
  earlyCheckoutDeductionValue: 100
};

export const INITIAL_MISSED_PUNCH_REQUESTS: MissedPunchRequest[] = [];

export const INITIAL_OVERTIME_REQUESTS: OvertimeRequest[] = [];

export const INITIAL_DEPARTMENT_OT_POLICIES: DepartmentOtPolicy[] = [
  {
    id: 'DOT-FLOOR',
    department: 'FLOOR',
    otAllowed: true,
    policyId: 'OTP-001',
    maxOtHoursDaily: 4.0,
    maxOtHoursWeekly: 12.0,
    maxOtHoursMonthly: 60,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-DISPATCH-LOADING',
    department: 'Dispatch Loading',
    otAllowed: true,
    policyId: 'OTP-001',
    maxOtHoursDaily: 4.0,
    maxOtHoursWeekly: 12.0,
    maxOtHoursMonthly: 60,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-ACCOUNTS',
    department: 'ACCOUNTS',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-HR',
    department: 'HR',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-DESIGN',
    department: 'DESIGN',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-DEVELOPER',
    department: 'DEVELOPER',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-DIGITAL-MARKETING',
    department: 'Digital Marketing',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-DISPATCH',
    department: 'Dispatch',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-MARKETING',
    department: 'Marketing',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  },
  {
    id: 'DOT-OPERATION',
    department: 'Operation',
    otAllowed: false,
    policyId: 'OTP-001',
    maxOtHoursDaily: 0,
    maxOtHoursMonthly: 0,
    minOtDurationMinutes: 30,
    approvalRequired: true,
    calculationMethod: 'Shift End Based',
    standardShiftHours: 9,
    effectiveFrom: '2026-01-01',
    version: 1
  }
];

export const INITIAL_EMPLOYEE_OT_POLICIES: EmployeeOtPolicy[] = [];

export const INITIAL_ATTENDANCE_GLOBAL_SETTINGS: AttendanceGlobalSettings = {
  attendanceEnabled: true,
  checkInEnabled: true,
  checkOutEnabled: true,
  gracePeriodMinutes: 10,
  minWorkingHoursFullDay: 9.0,
  halfDayThresholdHours: 4.5,
  maxCorrectionDays: 30,
  allowFutureDates: false,
  approvalFlow: 'HR_AND_CEO',
  otCalculationMethod: 'Shift End Based',
  otRateType: 'Fixed Amount Per Hour',
  fixedOtRatePerHour: 100
};

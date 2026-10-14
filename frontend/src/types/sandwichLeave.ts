// VRM Enterprise HRM - Sandwich Leave Policy Engine Types

export type SandwichCondition = 
  | 'BOTH_SIDES_MANDATORY'      // Recommended Default: Leave required on both sides
  | 'LEAVE_BEFORE_AND_AFTER'    // Leave exists both before and after off/holiday
  | 'LEAVE_ONLY_BEFORE'         // Leave immediately preceding off/holiday
  | 'LEAVE_ONLY_AFTER';         // Leave immediately following off/holiday

export type SandwichPayType = 
  | 'SAME_AS_APPLIED_LEAVE'     // Follows the pay treatment of the applied leave type
  | 'PAID_LEAVE'                // Sandwich days treated as Paid Leave
  | 'UNPAID_LEAVE'              // Sandwich days treated as Unpaid Leave (LOP -> Payroll)
  | 'CUSTOM_RULE';              // Custom deduction formula

export type SandwichPolicyStatus = 'Draft' | 'Active' | 'Inactive' | 'Archived';

export interface SandwichLeavePolicy {
  id: string;
  policyName: string;
  description: string;
  
  // Scope of Policy
  applicableLeaveTypes: string[];        // e.g. ['Casual Leave', 'Sick Leave', 'Unpaid Leave']
  applicableEmployees: 'ALL' | string[];  // 'ALL' or array of employeeIds
  applicableDepartments: 'ALL' | string[];// 'ALL' or array of department names
  applicableDesignations: 'ALL' | string[];// 'ALL' or array of designation titles
  applicableBranches: 'ALL' | string[];    // 'ALL' or array of branch names
  
  // Effective Range & Versioning
  effectiveFrom: string;                 // ISO Date 'YYYY-MM-DD'
  effectiveTo?: string;                  // Optional end date 'YYYY-MM-DD'
  status: SandwichPolicyStatus;
  version: number;
  
  // Core Sandwich Rules
  sandwichRuleEnabled: boolean;          // [ON / OFF]
  countWeeklyOffAsLeave: boolean;        // [ON / OFF]
  countPublicHolidayAsLeave: boolean;    // [ON / OFF]
  sandwichCondition: SandwichCondition;  // e.g. 'BOTH_SIDES_MANDATORY'
  
  // Pay Treatment
  payType: SandwichPayType;
  customPayRuleFormula?: string;
  
  // Audit metadata
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SandwichCalculationDayDetail {
  date: string;
  dayOfWeek: string;
  dayType: 'WORKING_DAY' | 'WEEKLY_OFF' | 'PUBLIC_HOLIDAY' | 'APPLIED_LEAVE' | 'SANDWICH_LEAVE';
  isSandwich: boolean;
  isPaid: boolean;
  reason: string;
  holidayName?: string;
}

export interface SandwichCalculationResult {
  appliedLeaveDays: number;
  weeklyOffDays: number;
  publicHolidayDays: number;
  sandwichDays: number;
  totalDays: number;
  paidDays: number;
  unpaidDays: number;
  isSandwichApplied: boolean;
  appliedPolicyId?: string;
  appliedPolicyName?: string;
  policyVersion?: number;
  payTypeApplied?: SandwichPayType;
  breakdown: SandwichCalculationDayDetail[];
  noticeMessage?: string;
  unpaidSandwichDeductionAmount?: number;
}

export interface HROverrideDetails {
  isOverridden: boolean;
  overriddenBy: string;
  overriddenAt: string;
  originalSandwichDays: number;
  originalTotalDays: number;
  adjustedDaysCount: number;
  excludedDates: string[];
  includedDates: string[];
  adjustedPayType?: SandwichPayType;
  internalReason: string; // Internal HR note, hidden from employee
}

export interface SandwichAuditLog {
  id: string;
  timestamp: string;
  user: string;
  userRole: string;
  action: 
    | 'POLICY_CREATED'
    | 'POLICY_UPDATED'
    | 'POLICY_ACTIVATED'
    | 'POLICY_DEACTIVATED'
    | 'POLICY_ARCHIVED'
    | 'SANDWICH_RULE_APPLIED'
    | 'HR_OVERRIDE'
    | 'LEAVE_APPROVED'
    | 'LEAVE_REJECTED'
    | 'LEAVE_CANCELLED'
    | 'LEAVE_DELETED'
    | 'PAYROLL_DEDUCTION_CREATED';
  policyId?: string;
  policyName?: string;
  leaveRequestId?: string;
  employeeId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

// Backend payload shape for a sandwich-leave calculation result.
export type SandwichLeaveCalculation = SandwichCalculationResult;

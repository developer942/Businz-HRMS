// Initial Seed Policies for Sandwich Leave Management Engine
import { SandwichLeavePolicy, SandwichAuditLog } from '../types/sandwichLeave';

export const DEFAULT_CORPORATE_SANDWICH_POLICY: SandwichLeavePolicy = {
  id: 'SLP-DEFAULT',
  policyName: 'Corporate Sandwich Leave Policy',
  description: 'Enforces sandwich rule on leaves bounded by weekly offs or holidays.',
  applicableLeaveTypes: [
    'Casual Leave',
    'Casual Leave (CL)',
    'Sick Leave',
    'Sick Leave (SL)',
    'Earned Leave',
    'Earned Leave (EL)',
    'Privilege Leave',
    'Compensatory Off',
    'Compensatory Off (Comp-Off)',
    'Loss of Pay (LOP)',
    'Unpaid Leave'
  ],
  applicableEmployees: 'ALL',
  applicableDepartments: 'ALL',
  applicableDesignations: 'ALL',
  applicableBranches: 'ALL',
  effectiveFrom: '2026-01-01',
  status: 'Active',
  sandwichRuleEnabled: true,
  countWeeklyOffAsLeave: true,
  countPublicHolidayAsLeave: true,
  sandwichCondition: 'BOTH_SIDES_MANDATORY',
  payType: 'SAME_AS_APPLIED_LEAVE',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'System Default',
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'System Default'
};

export const initialSandwichPolicies: SandwichLeavePolicy[] = [DEFAULT_CORPORATE_SANDWICH_POLICY];

export const initialSandwichAuditLogs: SandwichAuditLog[] = [];


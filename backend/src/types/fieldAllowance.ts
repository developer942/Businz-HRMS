export const FIELD_ALLOWANCE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'CORRECTION_REQUESTED',
  'REJECTED',
  'APPROVED',
  'AMOUNT_DISTRIBUTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

export type FieldAllowanceStatus = typeof FIELD_ALLOWANCE_STATUSES[number];
export type FieldAllowanceDecision = 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED';
export type FieldAllowanceCategory = 'TRAVEL' | 'FOOD' | 'ROOM' | 'BUS' | 'FUEL' | 'OTHER';

export interface FieldAllowanceRequest {
  id: string;
  company_id: string;
  trip_code: string;
  employee_id: string;
  employee_name: string;
  department_id?: string | null;
  department_name: string;
  purpose: string;
  customer_site_name?: string | null;
  destination: string;
  start_date: string;
  end_date: string;
  travel_mode?: string | null;
  description?: string | null;
  advance_required: boolean;
  requested_amount: number;
  approved_amount: number;
  allocated_amount: number;
  total_spent: number;
  balance: number;
  status: FieldAllowanceStatus;
  created_at: string;
  updated_at: string;
}

export interface FieldAllowanceApproval {
  id: string;
  request_id: string;
  approved_by: string;
  approver_name: string;
  decision: FieldAllowanceDecision;
  approved_amount: number;
  remarks?: string | null;
  decided_at: string;
}

export interface FieldAllowanceDistribution {
  id: string;
  request_id: string;
  distributed_by: string;
  distributor_name: string;
  distributed_amount: number;
  distribution_date: string;
  payment_method: string;
  reference_number?: string | null;
  payment_proof_path?: string | null;
  remarks?: string | null;
  created_at: string;
}

export interface FieldAllowanceDailyReport {
  id: string;
  request_id: string;
  employee_id: string;
  expense_date: string;
  category: FieldAllowanceCategory;
  amount: number;
  description: string;
  attachment_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldAllowanceDetail extends FieldAllowanceRequest {
  approvals: FieldAllowanceApproval[];
  distributions: FieldAllowanceDistribution[];
  daily_reports: FieldAllowanceDailyReport[];
}

export interface FieldAllowanceSummary {
  total_requests: number;
  pending_approval: number;
  approved_requests: number;
  total_distributed_amount: number;
  active_trips: number;
  total_spent_amount: number;
}

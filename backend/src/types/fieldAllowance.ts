export const FIELD_ALLOWANCE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PENDING_ADVANCE_APPROVAL',
  'APPROVED',
  'PENDING_DISTRIBUTION',
  'AMOUNT_DISTRIBUTED',
  'ACTIVE_VISIT',
  'IN_PROGRESS',
  'CLAIM_SUBMITTED',
  'PENDING_SETTLEMENT_VERIFICATION',
  'PENDING_REIMBURSEMENT',
  'PENDING_RETURN',
  'COMPLETED',
  'SETTLED',
  'CORRECTION_REQUESTED',
  'REJECTED',
] as const;

export type FieldAllowanceStatus = typeof FIELD_ALLOWANCE_STATUSES[number];
export type FieldAllowanceDecision = 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED';
export const FIELD_ALLOWANCE_CATEGORIES = [
  'TRAVEL',
  'BUS',
  'TRAIN',
  'TAXI_AUTO',
  'FUEL',
  'FOOD',
  'ROOM',
  'PARKING',
  'TOLL',
  'OTHER',
] as const;
export type FieldAllowanceCategory = typeof FIELD_ALLOWANCE_CATEGORIES[number];
export type FieldAllowanceBalanceReturnStatus = 'NONE' | 'SUBMITTED_TO_ACCOUNTS' | 'RECEIVED_BY_ACCOUNTS';

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
  returned_amount: number;
  balance: number;
  balance_return_status: FieldAllowanceBalanceReturnStatus;
  balance_returned_at?: string | null;
  balance_return_mode?: string | null;
  balance_return_reference?: string | null;
  balance_return_proof_path?: string | null;
  balance_return_remarks?: string | null;
  balance_received_by?: string | null;
  balance_received_by_name?: string | null;
  balance_received_at?: string | null;
  decision_remarks?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  daily_reports?: FieldAllowanceDailyReport[];
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
  total_returned_amount: number;
}

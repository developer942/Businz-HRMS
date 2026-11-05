export type FundingType = 'advance' | 'personal';

export type FieldVisitStatus =
  | 'Draft'
  | 'Pending Advance Approval'
  | 'Advance Approved'
  | 'Advance Rejected'
  | 'Advance Correction Requested'
  | 'Advance Disbursed'
  | 'Active'
  | 'Settlement Submitted'
  | 'Settlement Correction Requested'
  | 'Pending Balance Collection'
  | 'Partially Collected'
  | 'Pending Reimbursement'
  | 'Partially Reimbursed'
  | 'Completed'
  | 'Cancelled';

export type ExpenseCategory =
  | 'Travel'
  | 'Bus'
  | 'Bus Travel'
  | 'Train'
  | 'Taxi / Auto'
  | 'Fuel'
  | 'Food'
  | 'Accommodation / Room'
  | 'Room'
  | 'Accommodation'
  | 'Local Transport'
  | 'Parking'
  | 'Toll'
  | 'Parking / Toll'
  | 'Customer Visit'
  | 'Other'
  | 'Other Approved Expenses';

export type ExpenseApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Correction Requested';

export interface FieldVisitAdvance {
  id: string;
  request_number: string;
  company_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  purpose: string;
  client_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  funding_type: FundingType;
  requested_amount: number;
  approved_amount: number | null;
  disbursed_amount: number;
  travel_mode?: string | null;
  justification?: string | null;
  estimated_breakdown?: Array<{ item: string; amount: number }>;
  supporting_documents?: Array<{ name: string; url: string }>;
  remarks?: string | null;
  status: FieldVisitStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined / computed metrics for list view
  expenses_total?: number;
  eligible_expenses_total?: number;
  provisional_balance?: number; // A - D
  final_balance?: number; // A - E
  return_due?: number;
  reimbursement_due?: number;
  actual_returned?: number;
  actual_reimbursed?: number;
  settlement_status?: string;
  expenses_count?: number;
}

export interface FieldVisitAdvanceApproval {
  id: string;
  advance_id: string;
  approver_id?: string | null;
  approver_name?: string | null;
  decision: 'Approved' | 'Rejected' | 'Correction Requested';
  approved_amount: number | null;
  reason?: string | null;
  created_at: string;
}

export interface FieldVisitAdvanceDisbursement {
  id: string;
  advance_id: string;
  amount: number;
  payment_method: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';
  payment_reference?: string | null;
  proof_reference?: string | null;
  accounts_user_id?: string | null;
  accounts_user_name?: string | null;
  remarks?: string | null;
  disbursed_at: string;
  status: 'Disbursed';
}

export interface FieldVisitExpense {
  id: string;
  advance_id: string;
  employee_id: string;
  expense_date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  payment_method?: string | null;
  remarks?: string | null;
  receipt_url?: string | null;
  receipt_file_name?: string | null;
  approval_status: ExpenseApprovalStatus;
  rejection_reason?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldVisitSettlement {
  id: string;
  advance_id: string;
  total_disbursed: number; // A: Confirmed advance
  total_recorded_expense: number; // D: Recorded expenses
  total_eligible_expense: number; // E: Approved eligible expenses
  provisional_balance: number; // B = A - D (negative if excess)
  net_settlement: number; // F = A - E
  return_due: number; // max(0, F)
  reimbursement_due: number; // max(0, -F)
  actual_returned: number;
  actual_reimbursed: number;
  employee_remarks?: string | null;
  approver_id?: string | null;
  approver_name?: string | null;
  approval_reason?: string | null;
  approval_status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Correction Requested';
  settlement_status:
    | 'Draft'
    | 'Pending Approval'
    | 'Correction Requested'
    | 'Approved'
    | 'Pending Balance Collection'
    | 'Partially Settled'
    | 'Pending Reimbursement'
    | 'Completed';
  submitted_at?: string | null;
  approved_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldVisitBalanceReturn {
  id: string;
  settlement_id: string;
  advance_id: string;
  employee_reported_amount: number;
  actual_received_amount: number | null;
  payment_method: 'Cash Handover' | 'Bank Transfer' | 'UPI' | 'Cheque';
  payment_reference?: string | null;
  proof_reference?: string | null;
  handover_date: string;
  receipt_date?: string | null;
  employee_remarks?: string | null;
  accounts_remarks?: string | null;
  confirmed_by?: string | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  status: 'Awaiting Confirmation' | 'Confirmed' | 'Partial Receipt' | 'Mismatch Reported';
}

export interface FieldVisitReimbursement {
  id: string;
  settlement_id: string;
  advance_id: string;
  amount: number;
  payment_method: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';
  payment_reference?: string | null;
  proof_reference?: string | null;
  reimbursed_by?: string | null;
  reimbursed_by_name?: string | null;
  reimbursed_at: string;
  remarks?: string | null;
  status: 'Completed';
}

export interface FieldVisitAuditLog {
  id: string;
  entity_type: 'ADVANCE' | 'DISBURSEMENT' | 'EXPENSE' | 'SETTLEMENT' | 'RETURN' | 'REIMBURSEMENT';
  entity_id: string;
  action: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  event_payload?: Record<string, any>;
  created_at: string;
}

export interface FieldVisitDetail {
  visit: FieldVisitAdvance;
  approvals: FieldVisitAdvanceApproval[];
  disbursements: FieldVisitAdvanceDisbursement[];
  expenses: FieldVisitExpense[];
  settlement: FieldVisitSettlement | null;
  balanceReturns: FieldVisitBalanceReturn[];
  reimbursements: FieldVisitReimbursement[];
  auditLogs: FieldVisitAuditLog[];
}

export interface FieldVisitFinancialSummary {
  totalAdvancesDisbursed: number;
  totalExpensesRecorded: number;
  totalEligibleApproved: number;
  totalPendingReturns: number; // Positive balance due to company
  totalPendingReimbursements: number; // Negative balance due to employees
  activeVisitsCount: number;
  pendingApprovalsCount: number;
  completedCount: number;
}

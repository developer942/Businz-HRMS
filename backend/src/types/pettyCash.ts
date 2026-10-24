/**
 * BUSINZ HRMS - Complete Petty Cash Management Types
 * Implements strict types for Custodian Assignment, Cash Requests,
 * CEO Approvals, Accounts Disbursements, Receipt Confirmations,
 * Daily Expenses, Immutable Financial Ledger, and Audit Trails.
 */

export type PettyCashAccountStatus = 'ACTIVE' | 'RECONCILING' | 'TRANSFERRED' | 'INACTIVE';
export type ReconciliationStatus = 'NONE' | 'PENDING' | 'RECONCILED' | 'DISCREPANCY';

export interface PettyCashAccount {
  id: string;
  company_id: string;
  custodian_id: string;
  custodian_employee_id: string;
  custodian_name: string;
  assigned_by_id: string;
  assigned_by_name: string;
  assignment_date: string;
  status: PettyCashAccountStatus;
  current_balance: number;
  low_balance_threshold: number;
  reconciliation_status: ReconciliationStatus;
  reconciliation_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PettyCashCategory {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PettyCashRequestStatus = 
  | 'PENDING_CEO_APPROVAL'
  | 'APPROVED_BY_CEO'
  | 'REJECTED_BY_CEO'
  | 'DISBURSED_PENDING_RECEIPT'
  | 'COMPLETED'
  | 'DISPUTED_RECEIPT'
  | 'CANCELLED';

export interface PettyCashRequest {
  id: string;
  request_number: string;
  company_id: string;
  account_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  requested_amount: number;
  approved_amount?: number | null;
  request_date: string;
  purpose: string;
  status: PettyCashRequestStatus;
  ceo_id?: string | null;
  ceo_name?: string | null;
  ceo_action_at?: string | null;
  ceo_remarks?: string | null;
  supporting_document_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMode = 'Cash' | 'Bank Transfer' | 'UPI';

export interface PettyCashDisbursement {
  id: string;
  disbursement_number: string;
  company_id: string;
  request_id: string;
  account_id: string;
  disbursed_by_id: string;
  disbursed_by_name: string;
  disbursed_amount: number;
  payment_mode: PaymentMode;
  payment_date: string;
  payment_reference: string;
  remarks?: string | null;
  payment_proof_url?: string | null;
  status: 'DISBURSED' | 'CONFIRMED' | 'DISPUTED';
  created_at: string;
}

export interface PettyCashReceipt {
  id: string;
  receipt_number: string;
  company_id: string;
  request_id: string;
  disbursement_id: string;
  account_id: string;
  custodian_id: string;
  status: 'CONFIRMED' | 'DISPUTED';
  amount_received?: number | null;
  discrepancy_reason?: string | null;
  idempotency_key?: string | null;
  confirmed_at: string;
}

export type PettyCashExpenseStatus = 'RECORDED' | 'FLAGGED' | 'REVERSED';

export interface PettyCashExpense {
  id: string;
  expense_number: string;
  company_id: string;
  account_id: string;
  custodian_id: string;
  custodian_name: string;
  category_id: string;
  category_name: string;
  amount: number;
  expense_date: string;
  reason: string;
  payment_mode: 'Cash' | 'UPI' | 'Card' | 'Other';
  bill_attachment_url?: string | null;
  status: PettyCashExpenseStatus;
  flag_reason?: string | null;
  flagged_by_id?: string | null;
  flagged_by_name?: string | null;
  flagged_at?: string | null;
  is_reversed: boolean;
  reversed_at?: string | null;
  reversed_by_id?: string | null;
  reversed_by_name?: string | null;
  reversal_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export type LedgerTransactionType = 'CREDIT' | 'DEBIT' | 'REVERSAL' | 'ADJUSTMENT';
export type LedgerReferenceType = 
  | 'RECEIPT_CONFIRMATION'
  | 'EXPENSE_RECORD'
  | 'EXPENSE_REVERSAL'
  | 'RECONCILIATION_ADJUSTMENT';

export interface PettyCashLedgerEntry {
  id: string;
  company_id: string;
  account_id: string;
  transaction_type: LedgerTransactionType;
  reference_type: LedgerReferenceType;
  reference_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string;
  idempotency_key?: string | null;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
}

export interface PettyCashAttachment {
  id: string;
  company_id: string;
  entity_type: 'REQUEST' | 'DISBURSEMENT' | 'EXPENSE';
  entity_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_id: string;
  created_at: string;
}

export interface PettyCashAuditLog {
  id: string;
  company_id: string;
  account_id?: string | null;
  action: string;
  performed_by_id: string;
  performed_by_name: string;
  performed_by_role: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
}

// Aggregated Dashboard KPI Interfaces
export interface CeoDashboardMetrics {
  activeCustodian: PettyCashAccount | null;
  pendingRequestsCount: number;
  approvedRequestsCount: number;
  totalCashAllocated: number;
  totalExpenses: number;
  remainingBalance: number;
  isLowBalance: boolean;
  pendingRequests: PettyCashRequest[];
  recentExpenses: PettyCashExpense[];
  recentLedger: PettyCashLedgerEntry[];
}

export interface AccountsDashboardMetrics {
  activeCustodian: PettyCashAccount | null;
  ceoApprovedRequests: PettyCashRequest[];
  pendingDisbursementsCount: number;
  totalCashDisbursed: number;
  pendingReceiptConfirmationsCount: number;
  completedDisbursementsCount: number;
  recentDisbursements: PettyCashDisbursement[];
  dailyExpenseRecords: PettyCashExpense[];
  currentBalance: number;
}

export interface CustodianDashboardMetrics {
  account: PettyCashAccount | null;
  availableCash: number;
  totalCashReceived: number;
  totalSpent: number;
  pendingRequestsCount: number;
  pendingReceiptConfirmations: PettyCashDisbursement[];
  myRequests: PettyCashRequest[];
  myExpenses: PettyCashExpense[];
  recentLedger: PettyCashLedgerEntry[];
}

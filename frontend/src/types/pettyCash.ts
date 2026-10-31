// VRM Enterprise HRMS - Petty Cash Module TypeScript Definitions

export type PettyCashAccountStatus = 'ACTIVE' | 'INACTIVE' | 'RECONCILING' | 'CLOSED';

export interface PettyCashAccount {
  id: string;
  company_id: string;
  account_code: string;
  custodian_id: string;
  custodian_name: string;
  custodian_employee_id: string;
  assigned_by_ceo_id: string;
  assigned_by_ceo_name: string;
  assignment_date: string;
  status: PettyCashAccountStatus;
  current_balance: number;
  total_cash_received: number;
  total_spent: number;
  low_balance_threshold: number;
  currency: string;
  notes?: string;
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
  company_id: string;
  account_id: string;
  request_number: string;
  custodian_id?: string;
  custodian_name?: string;
  custodian_employee_id?: string;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  requested_amount: number;
  approved_amount?: number;
  purpose: string;
  request_date: string;
  supporting_document_url?: string;
  status: PettyCashRequestStatus;
  ceo_id?: string;
  ceo_name?: string;
  ceo_action_at?: string;
  ceo_remarks?: string;
  created_at: string;
  updated_at: string;
}

export type PettyCashDisbursementStatus = 'PENDING_RECEIPT' | 'DISBURSED' | 'CONFIRMED' | 'DISPUTED';
export type PaymentMode = 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Card' | 'Other';

export interface PettyCashDisbursement {
  id: string;
  company_id: string;
  account_id: string;
  request_id: string;
  disbursement_number: string;
  disbursed_by_id: string;
  disbursed_by_name: string;
  disbursed_by_role: string;
  disbursed_amount: number;
  payment_mode: PaymentMode;
  payment_date: string;
  payment_reference: string;
  remarks?: string;
  payment_proof_url?: string;
  status: PettyCashDisbursementStatus;
  disbursed_at: string;
  created_at: string;
}

export type PettyCashReceiptStatus = 'CONFIRMED' | 'DISPUTED';

export interface PettyCashReceipt {
  id: string;
  company_id: string;
  account_id: string;
  disbursement_id: string;
  receipt_number: string;
  custodian_id: string;
  custodian_name: string;
  amount_received: number;
  receipt_date: string;
  status: PettyCashReceiptStatus;
  discrepancy_reason?: string;
  idempotency_key: string;
  created_at: string;
}

export interface PettyCashCategory {
  id: string;
  company_id: string;
  category_name: string;
  name?: string;
  description?: string;
  is_active: boolean;
  is_system_default: boolean;
  created_at: string;
}

export interface PettyCashExpense {
  id: string;
  company_id: string;
  account_id: string;
  expense_number: string;
  custodian_id: string;
  custodian_name: string;
  category_id: string;
  category_name: string;
  amount: number;
  expense_date: string;
  reason: string;
  payment_mode: 'Cash' | 'UPI' | 'Card' | 'Other';
  bill_attachment_url?: string;
  is_reversed: boolean;
  reversal_reason?: string;
  reversed_by_id?: string;
  reversed_at?: string;
  flagged_for_review: boolean;
  review_notes?: string;
  idempotency_key?: string;
  created_at: string;
}

export type LedgerTransactionType =
  | 'CASH_DISBURSEMENT_CREDIT'
  | 'DAILY_EXPENSE_DEBIT'
  | 'EXPENSE_REVERSAL_CREDIT'
  | 'MANUAL_ADJUSTMENT'
  | 'RECONCILIATION_TRANSFER';

export interface PettyCashLedgerEntry {
  id: string;
  company_id: string;
  account_id: string;
  entry_number: string;
  transaction_type: LedgerTransactionType;
  reference_type: 'RECEIPT' | 'EXPENSE' | 'REVERSAL' | 'ADJUSTMENT' | 'TRANSFER';
  reference_id: string;
  credit_amount: number;
  debit_amount: number;
  running_balance: number;
  description: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
}

export interface PettyCashAuditLog {
  id: string;
  company_id: string;
  account_id?: string;
  action: string;
  performed_by_id: string;
  performed_by_name: string;
  performed_by_role: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface PettyCashDashboardSummary {
  activeAccount: PettyCashAccount | null;
  availableBalance: number;
  totalCashReceived: number;
  totalExpenses: number;
  pendingRequestsCount: number;
  pendingDisbursementsCount: number;
  pendingReceiptsCount: number;
  recentTransactions: PettyCashLedgerEntry[];
  recentExpenses: PettyCashExpense[];
  lowBalanceWarning: boolean;
}

// Request and Action DTOs
export interface AssignCustodianPayload {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  lowBalanceThreshold?: number;
  notes?: string;
}

export interface ReconcileCustodianPayload {
  newEmployeeId: string;
  newEmployeeName: string;
  newEmployeeCode: string;
  physicalCashCount: number;
  reconciliationNotes: string;
  witnessCeoOrAccountsId?: string;
}

export interface CreatePettyCashRequestPayload {
  requestedAmount: number;
  purpose: string;
  requestDate?: string;
  supportingDocumentUrl?: string;
}

export interface CeoApprovalPayload {
  action: 'APPROVE' | 'REJECT';
  approvedAmount?: number;
  remarks?: string;
}

export interface DisburseCashPayload {
  disbursedAmount: number;
  paymentMode: PaymentMode;
  paymentDate: string;
  paymentReference: string;
  remarks?: string;
  paymentProofUrl?: string;
}

export interface ConfirmReceiptPayload {
  disbursementId: string;
  action: 'CONFIRM' | 'DISPUTE';
  amountReceived?: number;
  discrepancyReason?: string;
  idempotencyKey?: string;
}

export interface AddExpensePayload {
  categoryId?: string;
  categoryName: string;
  amount: number;
  expenseDate: string;
  reason: string;
  paymentMode?: 'Cash' | 'UPI' | 'Card' | 'Other';
  billAttachmentUrl?: string;
  idempotencyKey?: string;
}

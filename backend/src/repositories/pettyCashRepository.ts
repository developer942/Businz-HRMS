import { Decimal } from 'decimal.js';
import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import {
  PettyCashAccount,
  PettyCashCategory,
  PettyCashRequest,
  PettyCashDisbursement,
  PettyCashReceipt,
  PettyCashExpense,
  PettyCashLedgerEntry,
  PettyCashAttachment,
  PettyCashAuditLog,
} from '../types/pettyCash.js';

// Default categories
const DEFAULT_CATEGORIES: PettyCashCategory[] = [
  { id: 'cat-001', company_id: 'company-a', name: 'Tea & Coffee', description: 'Office daily tea, coffee, refreshments, snacks', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-002', company_id: 'company-a', name: 'Stationery', description: 'Pens, notepads, printing paper, toner', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-003', company_id: 'company-a', name: 'Courier', description: 'Postal and parcel dispatch charges', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-004', company_id: 'company-a', name: 'Local Transport', description: 'Auto rickshaw, taxi, local transit', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-005', company_id: 'company-a', name: 'Petrol / Fuel', description: 'Fuel allowances for office errands & field visits', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-006', company_id: 'company-a', name: 'Office Maintenance', description: 'Plumbing, electrical repairs, hardware fixes', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-007', company_id: 'company-a', name: 'Cleaning Materials', description: 'Disinfectants, soaps, mops, sanitizers', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cat-008', company_id: 'company-a', name: 'Other', description: 'Miscellaneous petty office operational expenditures', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export class PettyCashRepository {
  // In-memory synchronized store for offline and test environments
  private accounts: Map<string, PettyCashAccount> = new Map();
  private categories: Map<string, PettyCashCategory> = new Map();
  private requests: Map<string, PettyCashRequest> = new Map();
  private disbursements: Map<string, PettyCashDisbursement> = new Map();
  private receipts: Map<string, PettyCashReceipt> = new Map();
  private expenses: Map<string, PettyCashExpense> = new Map();
  private ledger: PettyCashLedgerEntry[] = [];
  private attachments: Map<string, PettyCashAttachment> = new Map();
  private auditLogs: PettyCashAuditLog[] = [];

  // Mutex lock for atomic balance calculations and concurrency
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    // Seed default categories
    DEFAULT_CATEGORIES.forEach(c => this.categories.set(c.id, { ...c }));
  }

  private async acquireLock<T>(work: () => Promise<T>): Promise<T> {
    let release: () => void;
    const waitPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentLock = this.lockPromise;
    this.lockPromise = this.lockPromise.then(() => waitPromise);
    await currentLock;
    try {
      return await work();
    } finally {
      release!();
    }
  }

  // ============================================================
  // 1. CUSTODIAN ACCOUNT MANAGEMENT
  // ============================================================

  async getActiveAccount(companyId: string): Promise<PettyCashAccount | null> {
    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('petty_cash_accounts')
          .select('*')
          .eq('company_id', companyId || 'company-a')
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (!error && data) {
          const acc: PettyCashAccount = {
            id: data.id,
            company_id: data.company_id,
            custodian_id: data.custodian_id,
            custodian_employee_id: data.custodian_employee_id,
            custodian_name: data.custodian_name,
            assigned_by_id: data.assigned_by_id,
            assigned_by_name: data.assigned_by_name,
            assignment_date: data.assignment_date,
            status: data.status,
            current_balance: Number(data.current_balance),
            low_balance_threshold: Number(data.low_balance_threshold),
            reconciliation_status: data.reconciliation_status || 'NONE',
            reconciliation_notes: data.reconciliation_notes,
            created_at: data.created_at,
            updated_at: data.updated_at,
          };
          this.accounts.set(acc.id, acc);
          return acc;
        }
      } catch (err) {
        console.warn('[PettyCashRepository] getActiveAccount fallback to memory:', err);
      }
    }

    for (const acc of this.accounts.values()) {
      if (acc.company_id === (companyId || 'company-a') && acc.status === 'ACTIVE') {
        return acc;
      }
    }
    return null;
  }

  async getAccountById(accountId: string): Promise<PettyCashAccount | null> {
    const acc = this.accounts.get(accountId);
    if (acc) return acc;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('petty_cash_accounts')
          .select('*')
          .eq('id', accountId)
          .maybeSingle();
        if (!error && data) {
          const mapped: PettyCashAccount = {
            id: data.id,
            company_id: data.company_id,
            custodian_id: data.custodian_id,
            custodian_employee_id: data.custodian_employee_id,
            custodian_name: data.custodian_name,
            assigned_by_id: data.assigned_by_id,
            assigned_by_name: data.assigned_by_name,
            assignment_date: data.assignment_date,
            status: data.status,
            current_balance: Number(data.current_balance),
            low_balance_threshold: Number(data.low_balance_threshold),
            reconciliation_status: data.reconciliation_status || 'NONE',
            reconciliation_notes: data.reconciliation_notes,
            created_at: data.created_at,
            updated_at: data.updated_at,
          };
          this.accounts.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err) {
        console.warn('[PettyCashRepository] getAccountById error:', err);
      }
    }
    return null;
  }

  async assignCustodian(params: {
    companyId: string;
    custodianId: string;
    custodianEmployeeId: string;
    custodianName: string;
    assignedById: string;
    assignedByName: string;
    assignmentDate?: string;
    lowBalanceThreshold?: number;
  }): Promise<PettyCashAccount> {
    return this.acquireLock(async () => {
      const {
        companyId,
        custodianId,
        custodianEmployeeId,
        custodianName,
        assignedById,
        assignedByName,
        assignmentDate = new Date().toISOString().split('T')[0],
        lowBalanceThreshold = 1000,
      } = params;

      // Check if an active account already exists
      const existing = await this.getActiveAccount(companyId);
      if (existing) {
        throw new Error(
          `Company already has an active Petty Cash Custodian (${existing.custodian_name} - ${existing.custodian_employee_id}). Please use the safe Custodian Reassignment workflow.`
        );
      }

      const id = crypto.randomUUID();
      const account: PettyCashAccount = {
        id,
        company_id: companyId || 'company-a',
        custodian_id: custodianId,
        custodian_employee_id: custodianEmployeeId,
        custodian_name: custodianName,
        assigned_by_id: assignedById,
        assigned_by_name: assignedByName,
        assignment_date: assignmentDate,
        status: 'ACTIVE',
        current_balance: 0.0,
        low_balance_threshold: lowBalanceThreshold,
        reconciliation_status: 'NONE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isRealSupabaseConfigured()) {
        try {
          const supabase = getSupabaseAdmin();
          await supabase.from('petty_cash_accounts').insert({
            id: account.id,
            company_id: account.company_id,
            custodian_id: account.custodian_id,
            custodian_employee_id: account.custodian_employee_id,
            custodian_name: account.custodian_name,
            assigned_by_id: account.assigned_by_id,
            assigned_by_name: account.assigned_by_name,
            assignment_date: account.assignment_date,
            status: account.status,
            current_balance: 0.0,
            low_balance_threshold: account.low_balance_threshold,
          });
        } catch (err) {
          console.warn('[PettyCashRepository] DB insert account fallback:', err);
        }
      }

      this.accounts.set(account.id, account);
      return account;
    });
  }

  async reassignCustodian(params: {
    previousAccountId: string;
    newEmployeeId: string;
    newEmployeeName: string;
    newEmployeeCode: string;
    assignedById: string;
    assignedByName: string;
    reconciliationNotes: string;
    physicalCashCounted: number;
    transferRemainingBalance: boolean;
  }): Promise<{ previousAccount: PettyCashAccount; newAccount: PettyCashAccount }> {
    return this.acquireLock(async () => {
      const prevAccount = await this.getAccountById(params.previousAccountId);
      if (!prevAccount) {
        throw new Error('Previous petty cash account not found');
      }

      const currentLedgerBalance = new Decimal(prevAccount.current_balance);
      const physicalCash = new Decimal(params.physicalCashCounted);

      // Verify physical cash reconciliation
      const diff = physicalCash.minus(currentLedgerBalance);
      const isReconciled = diff.isZero();

      // Deactivate previous account
      prevAccount.status = 'TRANSFERRED';
      prevAccount.reconciliation_status = isReconciled ? 'RECONCILED' : 'DISCREPANCY';
      prevAccount.reconciliation_notes = `Reconciliation: Expected ₹${currentLedgerBalance.toFixed(2)}, Counted ₹${physicalCash.toFixed(2)}. ${params.reconciliationNotes}. Reassigned by ${params.assignedByName}.`;
      prevAccount.updated_at = new Date().toISOString();

      const newId = crypto.randomUUID();
      const initialBalance = params.transferRemainingBalance ? physicalCash.toNumber() : 0;

      const newAccount: PettyCashAccount = {
        id: newId,
        company_id: prevAccount.company_id,
        custodian_id: params.newEmployeeId,
        custodian_employee_id: params.newEmployeeCode,
        custodian_name: params.newEmployeeName,
        assigned_by_id: params.assignedById,
        assigned_by_name: params.assignedByName,
        assignment_date: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
        current_balance: initialBalance,
        low_balance_threshold: prevAccount.low_balance_threshold,
        reconciliation_status: 'NONE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (params.transferRemainingBalance && initialBalance > 0) {
        // Record balance transfer ledger entries
        const prevEntry: PettyCashLedgerEntry = {
          id: crypto.randomUUID(),
          company_id: prevAccount.company_id,
          account_id: prevAccount.id,
          transaction_type: 'ADJUSTMENT',
          reference_type: 'RECONCILIATION_ADJUSTMENT',
          reference_id: prevAccount.id,
          amount: initialBalance,
          balance_before: currentLedgerBalance.toNumber(),
          balance_after: 0.0,
          description: `Balance transferred to new custodian ${params.newEmployeeName} (${params.newEmployeeCode})`,
          created_by_id: params.assignedById,
          created_by_name: params.assignedByName,
          created_at: new Date().toISOString(),
        };
        prevAccount.current_balance = 0.0;
        this.ledger.unshift(prevEntry);

        const newEntry: PettyCashLedgerEntry = {
          id: crypto.randomUUID(),
          company_id: newAccount.company_id,
          account_id: newAccount.id,
          transaction_type: 'CREDIT',
          reference_type: 'RECONCILIATION_ADJUSTMENT',
          reference_id: newAccount.id,
          amount: initialBalance,
          balance_before: 0.0,
          balance_after: initialBalance,
          description: `Transferred balance received from previous custodian ${prevAccount.custodian_name} (${prevAccount.custodian_employee_id})`,
          created_by_id: params.assignedById,
          created_by_name: params.assignedByName,
          created_at: new Date().toISOString(),
        };
        this.ledger.unshift(newEntry);
      }

      this.accounts.set(prevAccount.id, prevAccount);
      this.accounts.set(newAccount.id, newAccount);

      return { previousAccount: prevAccount, newAccount };
    });
  }

  // ============================================================
  // 2. PETTY CASH REQUESTS (Custodian & CEO)
  // ============================================================

  async createRequest(params: {
    companyId: string;
    accountId: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    requestedAmount: number;
    purpose: string;
    requestDate?: string;
    supportingDocumentUrl?: string;
  }): Promise<PettyCashRequest> {
    const id = crypto.randomUUID();
    const count = this.requests.size + 1;
    const requestNumber = `PCR-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

    const request: PettyCashRequest = {
      id,
      request_number: requestNumber,
      company_id: params.companyId || 'company-a',
      account_id: params.accountId,
      employee_id: params.employeeId,
      employee_name: params.employeeName,
      employee_code: params.employeeCode,
      requested_amount: new Decimal(params.requestedAmount).toDecimalPlaces(2).toNumber(),
      request_date: params.requestDate || new Date().toISOString().split('T')[0],
      purpose: params.purpose,
      status: 'PENDING_CEO_APPROVAL',
      supporting_document_url: params.supportingDocumentUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.requests.set(id, request);
    return request;
  }

  async getRequests(companyId: string, filters?: { status?: string; employeeId?: string }): Promise<PettyCashRequest[]> {
    const result: PettyCashRequest[] = [];
    for (const req of this.requests.values()) {
      if (req.company_id === (companyId || 'company-a')) {
        if (filters?.status && req.status !== filters.status) continue;
        if (filters?.employeeId && req.employee_id !== filters.employeeId) continue;
        result.push(req);
      }
    }
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getRequestById(id: string): Promise<PettyCashRequest | null> {
    return this.requests.get(id) || null;
  }

  async approveRequest(params: {
    requestId: string;
    approvedAmount: number;
    ceoId: string;
    ceoName: string;
    remarks?: string;
  }): Promise<PettyCashRequest> {
    const req = await this.getRequestById(params.requestId);
    if (!req) throw new Error('Petty cash request not found');

    if (req.status !== 'PENDING_CEO_APPROVAL') {
      throw new Error(`Cannot approve request in ${req.status} state`);
    }

    req.status = 'APPROVED_BY_CEO';
    req.approved_amount = new Decimal(params.approvedAmount).toDecimalPlaces(2).toNumber();
    req.ceo_id = params.ceoId;
    req.ceo_name = params.ceoName;
    req.ceo_remarks = params.remarks || '';
    req.ceo_action_at = new Date().toISOString();
    req.updated_at = new Date().toISOString();

    this.requests.set(req.id, req);
    return req;
  }

  async rejectRequest(params: {
    requestId: string;
    ceoId: string;
    ceoName: string;
    remarks: string;
  }): Promise<PettyCashRequest> {
    const req = await this.getRequestById(params.requestId);
    if (!req) throw new Error('Petty cash request not found');

    if (req.status !== 'PENDING_CEO_APPROVAL') {
      throw new Error(`Cannot reject request in ${req.status} state`);
    }

    req.status = 'REJECTED_BY_CEO';
    req.ceo_id = params.ceoId;
    req.ceo_name = params.ceoName;
    req.ceo_remarks = params.remarks;
    req.ceo_action_at = new Date().toISOString();
    req.updated_at = new Date().toISOString();

    this.requests.set(req.id, req);
    return req;
  }

  // ============================================================
  // 3. ACCOUNTS DISBURSEMENTS
  // ============================================================

  async createDisbursement(params: {
    requestId: string;
    disbursedById: string;
    disbursedByName: string;
    disbursedAmount: number;
    paymentMode: 'Cash' | 'Bank Transfer' | 'UPI';
    paymentDate: string;
    paymentReference: string;
    remarks?: string;
    paymentProofUrl?: string;
  }): Promise<PettyCashDisbursement> {
    return this.acquireLock(async () => {
      const request = await this.getRequestById(params.requestId);
      if (!request) throw new Error('Petty cash request not found');

      if (request.status !== 'APPROVED_BY_CEO') {
        throw new Error('Only CEO-approved requests can be disbursed');
      }

      const approved = new Decimal(request.approved_amount || request.requested_amount);
      const disbursed = new Decimal(params.disbursedAmount);

      // Rule: Full approved amount must be disbursed; no silent partial disbursement
      if (!disbursed.equals(approved)) {
        throw new Error(
          `Disbursement amount (₹${disbursed.toFixed(2)}) must exactly match the full CEO-approved amount (₹${approved.toFixed(2)})`
        );
      }

      // Check for duplicate disbursement on same request
      for (const d of this.disbursements.values()) {
        if (d.request_id === request.id) {
          throw new Error('This request has already been disbursed');
        }
      }

      const id = crypto.randomUUID();
      const count = this.disbursements.size + 1;
      const disbursementNumber = `PCD-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      const disbursement: PettyCashDisbursement = {
        id,
        disbursement_number: disbursementNumber,
        company_id: request.company_id,
        request_id: request.id,
        account_id: request.account_id,
        disbursed_by_id: params.disbursedById,
        disbursed_by_name: params.disbursedByName,
        disbursed_amount: disbursed.toNumber(),
        payment_mode: params.paymentMode,
        payment_date: params.paymentDate,
        payment_reference: params.paymentReference,
        remarks: params.remarks,
        payment_proof_url: params.paymentProofUrl,
        status: 'DISBURSED',
        created_at: new Date().toISOString(),
      };

      // Update request status
      request.status = 'DISBURSED_PENDING_RECEIPT';
      request.updated_at = new Date().toISOString();

      this.disbursements.set(id, disbursement);
      this.requests.set(request.id, request);

      return disbursement;
    });
  }

  async getDisbursements(companyId: string, filters?: { status?: string }): Promise<PettyCashDisbursement[]> {
    const list: PettyCashDisbursement[] = [];
    for (const d of this.disbursements.values()) {
      if (d.company_id === (companyId || 'company-a')) {
        if (filters?.status && d.status !== filters.status) continue;
        list.push(d);
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getDisbursementById(id: string): Promise<PettyCashDisbursement | null> {
    return this.disbursements.get(id) || null;
  }

  // ============================================================
  // 4. EMPLOYEE RECEIPT CONFIRMATION (Atomic Credit)
  // ============================================================

  async confirmReceipt(params: {
    disbursementId: string;
    custodianId: string;
    custodianCode?: string;
    custodianName: string;
    action: 'CONFIRM' | 'DISPUTE';
    amountReceived?: number;
    discrepancyReason?: string;
    idempotencyKey: string;
  }): Promise<{ receipt: PettyCashReceipt; newBalance: number }> {
    return this.acquireLock(async () => {
      // Check idempotency
      for (const r of this.receipts.values()) {
        if (r.idempotency_key === params.idempotencyKey) {
          const acc = await this.getAccountById(r.account_id);
          return { receipt: r, newBalance: acc ? acc.current_balance : 0 };
        }
      }

      const disbursement = await this.getDisbursementById(params.disbursementId);
      if (!disbursement) throw new Error('Disbursement record not found');

      const request = await this.getRequestById(disbursement.request_id);
      if (!request) throw new Error('Associated request not found');

      if (request.status === 'COMPLETED') {
        throw new Error('Receipt has already been confirmed for this disbursement');
      }

      const account = await this.getAccountById(disbursement.account_id);
      if (!account) throw new Error('Petty cash account not found');

      // Verify the confirming employee is the assigned custodian
      const isCustodianConfirm =
        account.custodian_id === params.custodianId ||
        account.custodian_employee_id === params.custodianId ||
        (params.custodianCode && account.custodian_employee_id.toLowerCase() === params.custodianCode.toLowerCase());
      if (!isCustodianConfirm) {
        throw new Error('Unauthorized: Only the assigned Petty Cash Custodian can confirm or dispute cash receipt');
      }

      const receiptId = crypto.randomUUID();
      const count = this.receipts.size + 1;
      const receiptNumber = `PCRCP-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      if (params.action === 'DISPUTE') {
        // Discrepancy reported: Do not credit balance
        disbursement.status = 'DISPUTED';
        request.status = 'DISPUTED_RECEIPT';
        request.updated_at = new Date().toISOString();

        const receipt: PettyCashReceipt = {
          id: receiptId,
          receipt_number: receiptNumber,
          company_id: account.company_id,
          request_id: request.id,
          disbursement_id: disbursement.id,
          account_id: account.id,
          custodian_id: params.custodianId,
          status: 'DISPUTED',
          amount_received: params.amountReceived,
          discrepancy_reason: params.discrepancyReason,
          idempotency_key: params.idempotencyKey,
          confirmed_at: new Date().toISOString(),
        };

        this.receipts.set(receiptId, receipt);
        this.disbursements.set(disbursement.id, disbursement);
        this.requests.set(request.id, request);

        return { receipt, newBalance: account.current_balance };
      }

      // CONFIRMED: Decimal safe atomic ledger credit
      const disbursedAmount = new Decimal(disbursement.disbursed_amount);
      const balanceBefore = new Decimal(account.current_balance);
      const balanceAfter = balanceBefore.plus(disbursedAmount);

      account.current_balance = balanceAfter.toNumber();
      account.updated_at = new Date().toISOString();

      disbursement.status = 'CONFIRMED';
      request.status = 'COMPLETED';
      request.updated_at = new Date().toISOString();

      const receipt: PettyCashReceipt = {
        id: receiptId,
        receipt_number: receiptNumber,
        company_id: account.company_id,
        request_id: request.id,
        disbursement_id: disbursement.id,
        account_id: account.id,
        custodian_id: params.custodianId,
        status: 'CONFIRMED',
        amount_received: disbursedAmount.toNumber(),
        idempotency_key: params.idempotencyKey,
        confirmed_at: new Date().toISOString(),
      };

      // Create immutable credit ledger entry
      const ledgerEntry: PettyCashLedgerEntry = {
        id: crypto.randomUUID(),
        company_id: account.company_id,
        account_id: account.id,
        transaction_type: 'CREDIT',
        reference_type: 'RECEIPT_CONFIRMATION',
        reference_id: receiptId,
        amount: disbursedAmount.toNumber(),
        balance_before: balanceBefore.toNumber(),
        balance_after: balanceAfter.toNumber(),
        description: `Confirmed cash receipt from Accounts (${disbursement.payment_mode} - Ref: ${disbursement.payment_reference})`,
        idempotency_key: `LEDGER-CR-${params.idempotencyKey}`,
        created_by_id: params.custodianId,
        created_by_name: params.custodianName,
        created_at: new Date().toISOString(),
      };

      this.receipts.set(receiptId, receipt);
      this.disbursements.set(disbursement.id, disbursement);
      this.requests.set(request.id, request);
      this.accounts.set(account.id, account);
      this.ledger.unshift(ledgerEntry);

      return { receipt, newBalance: account.current_balance };
    });
  }

  // ============================================================
  // 5. DAILY EXPENSES (Atomic Debit & No Negative Balance)
  // ============================================================

  async recordExpense(params: {
    companyId: string;
    accountId: string;
    custodianId: string;
    custodianEmployeeCode?: string;
    custodianName: string;
    categoryId: string;
    categoryName: string;
    amount: number;
    expenseDate: string;
    reason: string;
    paymentMode?: 'Cash' | 'UPI' | 'Card' | 'Other';
    billAttachmentUrl?: string;
    idempotencyKey?: string;
  }): Promise<{ expense: PettyCashExpense; newBalance: number }> {
    return this.acquireLock(async () => {
      // Idempotency check
      if (params.idempotencyKey) {
        for (const e of this.expenses.values()) {
          if (e.id === params.idempotencyKey) {
            const acc = await this.getAccountById(e.account_id);
            return { expense: e, newBalance: acc ? acc.current_balance : 0 };
          }
        }
      }

      const account = await this.getAccountById(params.accountId);
      if (!account) throw new Error('Petty cash account not found');

      if (account.status !== 'ACTIVE') {
        throw new Error(`Cannot record expense: Account is ${account.status}`);
      }

      const isCustodianExpense =
        account.custodian_id === params.custodianId ||
        account.custodian_employee_id === params.custodianId ||
        (params.custodianEmployeeCode && account.custodian_employee_id.toLowerCase() === params.custodianEmployeeCode.toLowerCase());
      if (!isCustodianExpense) {
        throw new Error('Unauthorized: Only the assigned Petty Cash Custodian can record expenses');
      }

      const expenseAmount = new Decimal(params.amount).toDecimalPlaces(2);
      if (expenseAmount.lte(0)) {
        throw new Error('Expense amount must be strictly greater than zero');
      }

      const currentBalance = new Decimal(account.current_balance);
      if (currentBalance.lt(expenseAmount)) {
        throw new Error(
          `Insufficient petty cash balance! Available: ₹${currentBalance.toFixed(2)}, Requested: ₹${expenseAmount.toFixed(2)}. Expense rejected.`
        );
      }

      const balanceAfter = currentBalance.minus(expenseAmount);
      account.current_balance = balanceAfter.toNumber();
      account.updated_at = new Date().toISOString();

      const expenseId = params.idempotencyKey || crypto.randomUUID();
      const count = this.expenses.size + 1;
      const expenseNumber = `PCX-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      const expense: PettyCashExpense = {
        id: expenseId,
        expense_number: expenseNumber,
        company_id: account.company_id,
        account_id: account.id,
        custodian_id: params.custodianId,
        custodian_name: params.custodianName,
        category_id: params.categoryId,
        category_name: params.categoryName,
        amount: expenseAmount.toNumber(),
        expense_date: params.expenseDate,
        reason: params.reason,
        payment_mode: params.paymentMode || 'Cash',
        bill_attachment_url: params.billAttachmentUrl,
        status: 'RECORDED',
        is_reversed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Create immutable debit ledger entry
      const ledgerEntry: PettyCashLedgerEntry = {
        id: crypto.randomUUID(),
        company_id: account.company_id,
        account_id: account.id,
        transaction_type: 'DEBIT',
        reference_type: 'EXPENSE_RECORD',
        reference_id: expenseId,
        amount: expenseAmount.toNumber(),
        balance_before: currentBalance.toNumber(),
        balance_after: balanceAfter.toNumber(),
        description: `Daily expense: ${params.categoryName} - ${params.reason}`,
        idempotency_key: `LEDGER-DR-${expenseId}`,
        created_by_id: params.custodianId,
        created_by_name: params.custodianName,
        created_at: new Date().toISOString(),
      };

      this.expenses.set(expenseId, expense);
      this.accounts.set(account.id, account);
      this.ledger.unshift(ledgerEntry);

      return { expense, newBalance: account.current_balance };
    });
  }

  async getExpenses(companyId: string, filters?: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<PettyCashExpense[]> {
    const list: PettyCashExpense[] = [];
    for (const exp of this.expenses.values()) {
      if (exp.company_id === (companyId || 'company-a')) {
        if (filters?.accountId && exp.account_id !== filters.accountId) continue;
        if (filters?.categoryId && exp.category_id !== filters.categoryId) continue;
        if (filters?.status && exp.status !== filters.status) continue;
        if (filters?.startDate && exp.expense_date < filters.startDate) continue;
        if (filters?.endDate && exp.expense_date > filters.endDate) continue;
        list.push(exp);
      }
    }
    return list.sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
  }

  async getExpenseById(id: string): Promise<PettyCashExpense | null> {
    return this.expenses.get(id) || null;
  }

  async reverseExpense(params: {
    expenseId: string;
    reversedById: string;
    reversedByName: string;
    reversalReason: string;
  }): Promise<{ expense: PettyCashExpense; newBalance: number }> {
    return this.acquireLock(async () => {
      const expense = await this.getExpenseById(params.expenseId);
      if (!expense) throw new Error('Expense record not found');

      if (expense.is_reversed) {
        throw new Error('Expense has already been reversed');
      }

      const account = await this.getAccountById(expense.account_id);
      if (!account) throw new Error('Associated petty cash account not found');

      const reversalAmount = new Decimal(expense.amount);
      const balanceBefore = new Decimal(account.current_balance);
      const balanceAfter = balanceBefore.plus(reversalAmount);

      account.current_balance = balanceAfter.toNumber();
      account.updated_at = new Date().toISOString();

      expense.is_reversed = true;
      expense.status = 'REVERSED';
      expense.reversed_at = new Date().toISOString();
      expense.reversed_by_id = params.reversedById;
      expense.reversed_by_name = params.reversedByName;
      expense.reversal_reason = params.reversalReason;
      expense.updated_at = new Date().toISOString();

      // Create immutable reversal ledger entry
      const ledgerEntry: PettyCashLedgerEntry = {
        id: crypto.randomUUID(),
        company_id: account.company_id,
        account_id: account.id,
        transaction_type: 'REVERSAL',
        reference_type: 'EXPENSE_REVERSAL',
        reference_id: expense.id,
        amount: reversalAmount.toNumber(),
        balance_before: balanceBefore.toNumber(),
        balance_after: balanceAfter.toNumber(),
        description: `Reversal of expense ${expense.expense_number} (${expense.category_name}): ${params.reversalReason}`,
        created_by_id: params.reversedById,
        created_by_name: params.reversedByName,
        created_at: new Date().toISOString(),
      };

      this.expenses.set(expense.id, expense);
      this.accounts.set(account.id, account);
      this.ledger.unshift(ledgerEntry);

      return { expense, newBalance: account.current_balance };
    });
  }

  async flagExpense(params: {
    expenseId: string;
    flaggedById: string;
    flaggedByName: string;
    flagReason: string;
  }): Promise<PettyCashExpense> {
    const expense = await this.getExpenseById(params.expenseId);
    if (!expense) throw new Error('Expense record not found');

    expense.status = 'FLAGGED';
    expense.flag_reason = params.flagReason;
    expense.flagged_by_id = params.flaggedById;
    expense.flagged_by_name = params.flaggedByName;
    expense.flagged_at = new Date().toISOString();
    expense.updated_at = new Date().toISOString();

    this.expenses.set(expense.id, expense);
    return expense;
  }

  // ============================================================
  // 6. LEDGER TRANSACTIONS & AUDIT TRAIL
  // ============================================================

  async getLedger(companyId: string, accountId?: string, limit = 100): Promise<PettyCashLedgerEntry[]> {
    let list = this.ledger.filter(l => l.company_id === (companyId || 'company-a'));
    if (accountId) {
      list = list.filter(l => l.account_id === accountId);
    }
    return list.slice(0, limit);
  }

  async createAuditLog(params: {
    companyId: string;
    accountId?: string;
    action: string;
    performedById: string;
    performedByName: string;
    performedByRole: string;
    entityType: string;
    entityId: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<PettyCashAuditLog> {
    const log: PettyCashAuditLog = {
      id: crypto.randomUUID(),
      company_id: params.companyId || 'company-a',
      account_id: params.accountId,
      action: params.action,
      performed_by_id: params.performedById,
      performed_by_name: params.performedByName,
      performed_by_role: params.performedByRole,
      entity_type: params.entityType,
      entity_id: params.entityId,
      details: params.details,
      ip_address: params.ipAddress,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    return log;
  }

  async getAuditLogs(companyId: string, limit = 50): Promise<PettyCashAuditLog[]> {
    return this.auditLogs.filter(l => l.company_id === (companyId || 'company-a')).slice(0, limit);
  }

  // ============================================================
  // 7. CATEGORIES
  // ============================================================

  async getCategories(companyId: string): Promise<PettyCashCategory[]> {
    const list: PettyCashCategory[] = [];
    for (const c of this.categories.values()) {
      if (c.company_id === (companyId || 'company-a') && c.is_active) {
        list.push(c);
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCategory(companyId: string, name: string, description?: string): Promise<PettyCashCategory> {
    const id = crypto.randomUUID();
    const cat: PettyCashCategory = {
      id,
      company_id: companyId || 'company-a',
      name: name.trim(),
      description: description || '',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.categories.set(id, cat);
    return cat;
  }

  async updateCategory(id: string, name: string, description?: string, isActive?: boolean): Promise<PettyCashCategory> {
    const cat = this.categories.get(id);
    if (!cat) throw new Error('Category not found');
    cat.name = name.trim();
    if (description !== undefined) cat.description = description;
    if (isActive !== undefined) cat.is_active = isActive;
    cat.updated_at = new Date().toISOString();
    this.categories.set(id, cat);
    return cat;
  }

  // ============================================================
  // 8. ATTACHMENTS
  // ============================================================

  async saveAttachment(params: {
    companyId: string;
    entityType: 'REQUEST' | 'DISBURSEMENT' | 'EXPENSE';
    entityId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    uploadedById: string;
  }): Promise<PettyCashAttachment> {
    const id = crypto.randomUUID();
    const att: PettyCashAttachment = {
      id,
      company_id: params.companyId || 'company-a',
      entity_type: params.entityType,
      entity_id: params.entityId,
      file_name: params.fileName,
      file_path: params.filePath,
      file_size: params.fileSize,
      mime_type: params.mimeType,
      uploaded_by_id: params.uploadedById,
      created_at: new Date().toISOString(),
    };
    this.attachments.set(id, att);
    return att;
  }

  async getAttachmentById(id: string): Promise<PettyCashAttachment | null> {
    return this.attachments.get(id) || null;
  }
}

export const pettyCashRepository = new PettyCashRepository();

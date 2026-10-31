import { pettyCashRepository } from '../repositories/pettyCashRepository.js';
import {
  PettyCashAccount,
  PettyCashRequest,
  PettyCashDisbursement,
  PettyCashReceipt,
  PettyCashExpense,
  PettyCashLedgerEntry,
  PettyCashCategory,
  CeoDashboardMetrics,
  AccountsDashboardMetrics,
  CustodianDashboardMetrics,
} from '../types/pettyCash.js';

export class PettyCashService {
  // ============================================================
  // 1. CUSTODIAN ASSIGNMENT & REASSIGNMENT (CEO ONLY)
  // ============================================================

  async assignCustodian(params: {
    companyId: string;
    custodianId: string;
    custodianEmployeeId: string;
    custodianName: string;
    assignedById: string;
    assignedByName: string;
    assignedByRole: string;
    lowBalanceThreshold?: number;
    assignmentDate?: string;
  }): Promise<PettyCashAccount> {
    const account = await pettyCashRepository.assignCustodian({
      companyId: params.companyId,
      custodianId: params.custodianId,
      custodianEmployeeId: params.custodianEmployeeId,
      custodianName: params.custodianName,
      assignedById: params.assignedById,
      assignedByName: params.assignedByName,
      assignmentDate: params.assignmentDate,
      lowBalanceThreshold: params.lowBalanceThreshold,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: account.id,
      action: 'CUSTODIAN_ASSIGNED',
      performedById: params.assignedById,
      performedByName: params.assignedByName,
      performedByRole: params.assignedByRole,
      entityType: 'ACCOUNT',
      entityId: account.id,
      details: {
        custodianId: params.custodianId,
        custodianName: params.custodianName,
        custodianCode: params.custodianEmployeeId,
      },
    });

    return account;
  }

  async reassignCustodian(params: {
    companyId: string;
    previousAccountId: string;
    newEmployeeId: string;
    newEmployeeName: string;
    newEmployeeCode: string;
    assignedById: string;
    assignedByName: string;
    assignedByRole: string;
    reconciliationNotes: string;
    physicalCashCounted: number;
    transferRemainingBalance: boolean;
  }): Promise<{ previousAccount: PettyCashAccount; newAccount: PettyCashAccount }> {
    const result = await pettyCashRepository.reassignCustodian({
      previousAccountId: params.previousAccountId,
      newEmployeeId: params.newEmployeeId,
      newEmployeeName: params.newEmployeeName,
      newEmployeeCode: params.newEmployeeCode,
      assignedById: params.assignedById,
      assignedByName: params.assignedByName,
      reconciliationNotes: params.reconciliationNotes,
      physicalCashCounted: params.physicalCashCounted,
      transferRemainingBalance: params.transferRemainingBalance,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: result.newAccount.id,
      action: 'CUSTODIAN_REASSIGNED',
      performedById: params.assignedById,
      performedByName: params.assignedByName,
      performedByRole: params.assignedByRole,
      entityType: 'ACCOUNT',
      entityId: result.newAccount.id,
      details: {
        previousAccountId: params.previousAccountId,
        newCustodianId: params.newEmployeeId,
        newCustodianName: params.newEmployeeName,
        physicalCashCounted: params.physicalCashCounted,
        transferredBalance: params.transferRemainingBalance,
        notes: params.reconciliationNotes,
      },
    });

    return result;
  }

  async getActiveCustodian(companyId: string): Promise<PettyCashAccount | null> {
    return pettyCashRepository.getActiveAccount(companyId);
  }

  // ============================================================
  // 2. PETTY CASH REQUESTS
  // ============================================================

  async requestPettyCash(params: {
    companyId: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    requestedAmount: number;
    purpose: string;
    requestDate?: string;
    supportingDocumentUrl?: string;
  }): Promise<PettyCashRequest> {
    const activeAccount = await pettyCashRepository.getActiveAccount(params.companyId);
    if (!activeAccount) {
      throw new Error('No active Petty Cash account exists. The CEO must assign a custodian first.');
    }

    const isCustodian =
      activeAccount.custodian_id === params.employeeId ||
      activeAccount.custodian_employee_id === params.employeeId ||
      activeAccount.custodian_employee_id === params.employeeCode ||
      (params.employeeCode && activeAccount.custodian_employee_id.toLowerCase() === params.employeeCode.toLowerCase());

    if (!isCustodian) {
      throw new Error('Unauthorized: Only the currently assigned Petty Cash Custodian can request petty cash.');
    }

    const request = await pettyCashRepository.createRequest({
      companyId: params.companyId,
      accountId: activeAccount.id,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      employeeCode: params.employeeCode,
      requestedAmount: params.requestedAmount,
      purpose: params.purpose,
      requestDate: params.requestDate,
      supportingDocumentUrl: params.supportingDocumentUrl,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: activeAccount.id,
      action: 'PETTY_CASH_REQUESTED',
      performedById: params.employeeId,
      performedByName: params.employeeName,
      performedByRole: 'Custodian',
      entityType: 'REQUEST',
      entityId: request.id,
      details: {
        requestNumber: request.request_number,
        amount: request.requested_amount,
        purpose: request.purpose,
      },
    });

    return request;
  }

  async getRequests(companyId: string, filters?: { status?: string; employeeId?: string }): Promise<PettyCashRequest[]> {
    return pettyCashRepository.getRequests(companyId, filters);
  }

  async approveRequest(params: {
    companyId: string;
    requestId: string;
    approvedAmount: number;
    ceoId: string;
    ceoName: string;
    ceoRole: string;
    remarks?: string;
  }): Promise<PettyCashRequest> {
    const request = await pettyCashRepository.approveRequest({
      requestId: params.requestId,
      approvedAmount: params.approvedAmount,
      ceoId: params.ceoId,
      ceoName: params.ceoName,
      remarks: params.remarks,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: request.account_id,
      action: 'REQUEST_APPROVED_BY_CEO',
      performedById: params.ceoId,
      performedByName: params.ceoName,
      performedByRole: params.ceoRole,
      entityType: 'REQUEST',
      entityId: request.id,
      details: {
        requestNumber: request.request_number,
        requestedAmount: request.requested_amount,
        approvedAmount: request.approved_amount,
        remarks: params.remarks,
      },
    });

    return request;
  }

  async rejectRequest(params: {
    companyId: string;
    requestId: string;
    ceoId: string;
    ceoName: string;
    ceoRole: string;
    remarks: string;
  }): Promise<PettyCashRequest> {
    const request = await pettyCashRepository.rejectRequest({
      requestId: params.requestId,
      ceoId: params.ceoId,
      ceoName: params.ceoName,
      remarks: params.remarks,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: request.account_id,
      action: 'REQUEST_REJECTED_BY_CEO',
      performedById: params.ceoId,
      performedByName: params.ceoName,
      performedByRole: params.ceoRole,
      entityType: 'REQUEST',
      entityId: request.id,
      details: {
        requestNumber: request.request_number,
        remarks: params.remarks,
      },
    });

    return request;
  }

  // ============================================================
  // 3. CASH DISBURSEMENT (ACCOUNTS)
  // ============================================================

  async disburseCash(params: {
    companyId: string;
    requestId: string;
    disbursedById: string;
    disbursedByName: string;
    disbursedByRole: string;
    disbursedAmount: number;
    paymentMode: 'Cash' | 'Bank Transfer' | 'UPI';
    paymentDate: string;
    paymentReference: string;
    remarks?: string;
    paymentProofUrl?: string;
  }): Promise<PettyCashDisbursement> {
    const disbursement = await pettyCashRepository.createDisbursement({
      requestId: params.requestId,
      disbursedById: params.disbursedById,
      disbursedByName: params.disbursedByName,
      disbursedAmount: params.disbursedAmount,
      paymentMode: params.paymentMode,
      paymentDate: params.paymentDate,
      paymentReference: params.paymentReference,
      remarks: params.remarks,
      paymentProofUrl: params.paymentProofUrl,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: disbursement.account_id,
      action: 'CASH_DISBURSED_BY_ACCOUNTS',
      performedById: params.disbursedById,
      performedByName: params.disbursedByName,
      performedByRole: params.disbursedByRole,
      entityType: 'DISBURSEMENT',
      entityId: disbursement.id,
      details: {
        disbursementNumber: disbursement.disbursement_number,
        amount: disbursement.disbursed_amount,
        paymentMode: disbursement.payment_mode,
        reference: disbursement.payment_reference,
      },
    });

    return disbursement;
  }

  async getDisbursements(companyId: string, filters?: { status?: string }): Promise<PettyCashDisbursement[]> {
    return pettyCashRepository.getDisbursements(companyId, filters);
  }

  // ============================================================
  // 4. RECEIPT CONFIRMATION (CUSTODIAN)
  // ============================================================

  async confirmCashReceipt(params: {
    companyId: string;
    disbursementId: string;
    custodianId: string;
    custodianEmployeeCode?: string;
    custodianName: string;
    action: 'CONFIRM' | 'DISPUTE';
    amountReceived?: number;
    discrepancyReason?: string;
    idempotencyKey: string;
  }): Promise<{ receipt: PettyCashReceipt; newBalance: number }> {
    const result = await pettyCashRepository.confirmReceipt({
      disbursementId: params.disbursementId,
      custodianId: params.custodianId,
      custodianCode: params.custodianEmployeeCode,
      custodianName: params.custodianName,
      action: params.action,
      amountReceived: params.amountReceived,
      discrepancyReason: params.discrepancyReason,
      idempotencyKey: params.idempotencyKey,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: result.receipt.account_id,
      action: params.action === 'CONFIRM' ? 'CASH_RECEIPT_CONFIRMED' : 'CASH_RECEIPT_DISPUTED',
      performedById: params.custodianId,
      performedByName: params.custodianName,
      performedByRole: 'Custodian',
      entityType: 'RECEIPT',
      entityId: result.receipt.id,
      details: {
        action: params.action,
        amountReceived: result.receipt.amount_received,
        newBalance: result.newBalance,
        discrepancyReason: params.discrepancyReason,
      },
    });

    return result;
  }

  // ============================================================
  // 5. DAILY EXPENSES (CUSTODIAN)
  // ============================================================

  async recordDailyExpense(params: {
    companyId: string;
    custodianId: string;
    custodianEmployeeCode?: string;
    custodianName: string;
    categoryId?: string;
    categoryName: string;
    amount: number;
    expenseDate: string;
    reason: string;
    paymentMode?: 'Cash' | 'UPI' | 'Card' | 'Other';
    billAttachmentUrl?: string;
    idempotencyKey?: string;
  }): Promise<{ expense: PettyCashExpense; newBalance: number; isLowBalance: boolean }> {
    const activeAccount = await pettyCashRepository.getActiveAccount(params.companyId);
    if (!activeAccount) {
      throw new Error('No active Petty Cash account found');
    }

    const isCustodian =
      activeAccount.custodian_id === params.custodianId ||
      activeAccount.custodian_employee_id === params.custodianId ||
      (params.custodianEmployeeCode && activeAccount.custodian_employee_id.toLowerCase() === params.custodianEmployeeCode.toLowerCase());

    if (!isCustodian) {
      throw new Error('Unauthorized: Only the currently assigned Petty Cash Custodian can record daily expenses');
    }

    let finalCategoryId = params.categoryId;
    let finalCategoryName = (params.categoryName || '').trim();

    if (!finalCategoryId || finalCategoryId === 'custom' || finalCategoryId.startsWith('cat-')) {
      const existingCategories = await pettyCashRepository.getCategories(params.companyId);
      const matched = existingCategories.find(
        (c) => (c.name || (c as any).category_name || '').toLowerCase() === finalCategoryName.toLowerCase()
      );
      if (matched) {
        finalCategoryId = matched.id;
        finalCategoryName = matched.name || (matched as any).category_name || finalCategoryName;
      } else {
        const newCat = await pettyCashRepository.createCategory(params.companyId, finalCategoryName);
        finalCategoryId = newCat.id;
      }
    }

    const { expense, newBalance } = await pettyCashRepository.recordExpense({
      companyId: params.companyId,
      accountId: activeAccount.id,
      custodianId: params.custodianId,
      custodianEmployeeCode: params.custodianEmployeeCode,
      custodianName: params.custodianName,
      categoryId: finalCategoryId,
      categoryName: finalCategoryName,
      amount: params.amount,
      expenseDate: params.expenseDate,
      reason: params.reason,
      paymentMode: params.paymentMode,
      billAttachmentUrl: params.billAttachmentUrl,
      idempotencyKey: params.idempotencyKey,
    });

    const isLowBalance = newBalance <= activeAccount.low_balance_threshold;

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: activeAccount.id,
      action: 'EXPENSE_RECORDED',
      performedById: params.custodianId,
      performedByName: params.custodianName,
      performedByRole: 'Custodian',
      entityType: 'EXPENSE',
      entityId: expense.id,
      details: {
        expenseNumber: expense.expense_number,
        category: expense.category_name,
        amount: expense.amount,
        newBalance,
        isLowBalance,
      },
    });

    return { expense, newBalance, isLowBalance };
  }

  async getExpenses(companyId: string, filters?: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<PettyCashExpense[]> {
    return pettyCashRepository.getExpenses(companyId, filters);
  }

  async reverseExpense(params: {
    companyId: string;
    expenseId: string;
    reversedById: string;
    reversedByName: string;
    reversedByRole: string;
    reversalReason: string;
  }): Promise<{ expense: PettyCashExpense; newBalance: number }> {
    const result = await pettyCashRepository.reverseExpense({
      expenseId: params.expenseId,
      reversedById: params.reversedById,
      reversedByName: params.reversedByName,
      reversalReason: params.reversalReason,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: result.expense.account_id,
      action: 'EXPENSE_REVERSED',
      performedById: params.reversedById,
      performedByName: params.reversedByName,
      performedByRole: params.reversedByRole,
      entityType: 'EXPENSE',
      entityId: result.expense.id,
      details: {
        expenseNumber: result.expense.expense_number,
        amountRestored: result.expense.amount,
        newBalance: result.newBalance,
        reason: params.reversalReason,
      },
    });

    return result;
  }

  async flagExpense(params: {
    companyId: string;
    expenseId: string;
    flaggedById: string;
    flaggedByName: string;
    flaggedByRole: string;
    flagReason: string;
  }): Promise<PettyCashExpense> {
    const expense = await pettyCashRepository.flagExpense({
      expenseId: params.expenseId,
      flaggedById: params.flaggedById,
      flaggedByName: params.flaggedByName,
      flagReason: params.flagReason,
    });

    await pettyCashRepository.createAuditLog({
      companyId: params.companyId,
      accountId: expense.account_id,
      action: 'EXPENSE_FLAGGED',
      performedById: params.flaggedById,
      performedByName: params.flaggedByName,
      performedByRole: params.flaggedByRole,
      entityType: 'EXPENSE',
      entityId: expense.id,
      details: {
        expenseNumber: expense.expense_number,
        reason: params.flagReason,
      },
    });

    return expense;
  }

  // ============================================================
  // 6. DASHBOARDS & METRICS
  // ============================================================

  async getCeoDashboardMetrics(companyId: string): Promise<CeoDashboardMetrics> {
    const activeCustodian = await pettyCashRepository.getActiveAccount(companyId);
    const allRequests = await pettyCashRepository.getRequests(companyId);
    const pendingRequests = allRequests.filter(r => r.status === 'PENDING_CEO_APPROVAL');
    const approvedRequests = allRequests.filter(r => r.status === 'APPROVED_BY_CEO' || r.status === 'COMPLETED');
    const recentExpenses = await pettyCashRepository.getExpenses(companyId);
    const recentLedger = await pettyCashRepository.getLedger(companyId, undefined, 20);

    const totalCashAllocated = approvedRequests.reduce((sum, r) => sum + (r.approved_amount || r.requested_amount), 0);
    const totalExpenses = recentExpenses.filter(e => !e.is_reversed).reduce((sum, e) => sum + e.amount, 0);
    const remainingBalance = activeCustodian ? activeCustodian.current_balance : 0;
    const isLowBalance = activeCustodian ? remainingBalance <= activeCustodian.low_balance_threshold : false;

    return {
      activeCustodian,
      pendingRequestsCount: pendingRequests.length,
      approvedRequestsCount: approvedRequests.length,
      totalCashAllocated,
      totalExpenses,
      remainingBalance,
      isLowBalance,
      pendingRequests,
      recentExpenses: recentExpenses.slice(0, 15),
      recentLedger,
    };
  }

  async getAccountsDashboardMetrics(companyId: string): Promise<AccountsDashboardMetrics> {
    const activeCustodian = await pettyCashRepository.getActiveAccount(companyId);
    const allRequests = await pettyCashRepository.getRequests(companyId);
    const ceoApprovedRequests = allRequests.filter(r => r.status === 'APPROVED_BY_CEO');
    const allDisbursements = await pettyCashRepository.getDisbursements(companyId);
    const pendingReceipt = allDisbursements.filter(d => d.status === 'DISBURSED');
    const completed = allDisbursements.filter(d => d.status === 'CONFIRMED');
    const dailyExpenses = await pettyCashRepository.getExpenses(companyId);

    const totalCashDisbursed = allDisbursements.reduce((sum, d) => sum + d.disbursed_amount, 0);

    return {
      activeCustodian,
      ceoApprovedRequests,
      pendingDisbursementsCount: ceoApprovedRequests.length,
      totalCashDisbursed,
      pendingReceiptConfirmationsCount: pendingReceipt.length,
      completedDisbursementsCount: completed.length,
      recentDisbursements: allDisbursements.slice(0, 15),
      dailyExpenseRecords: dailyExpenses.slice(0, 15),
      currentBalance: activeCustodian ? activeCustodian.current_balance : 0,
    };
  }

  async getCustodianDashboardMetrics(companyId: string, custodianId: string): Promise<CustodianDashboardMetrics> {
    const activeAccount = await pettyCashRepository.getActiveAccount(companyId);
    const myRequests = await pettyCashRepository.getRequests(companyId, { employeeId: custodianId });
    const allDisbursements = await pettyCashRepository.getDisbursements(companyId);
    const pendingReceiptConfirmations = allDisbursements.filter(
      d => d.status === 'DISBURSED' && (activeAccount ? d.account_id === activeAccount.id : true)
    );
    const myExpenses = await pettyCashRepository.getExpenses(companyId, { accountId: activeAccount?.id });
    const recentLedger = await pettyCashRepository.getLedger(companyId, activeAccount?.id, 15);

    const totalCashReceived = allDisbursements
      .filter(d => d.status === 'CONFIRMED' && (activeAccount ? d.account_id === activeAccount.id : true))
      .reduce((sum, d) => sum + d.disbursed_amount, 0);

    const totalSpent = myExpenses
      .filter(e => !e.is_reversed)
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      account: activeAccount,
      availableCash: activeAccount ? activeAccount.current_balance : 0,
      totalCashReceived,
      totalSpent,
      pendingRequestsCount: myRequests.filter(r => r.status === 'PENDING_CEO_APPROVAL').length,
      pendingReceiptConfirmations,
      myRequests,
      myExpenses,
      recentLedger,
    };
  }

  // ============================================================
  // 7. CATEGORIES & AUDIT
  // ============================================================

  async getCategories(companyId: string): Promise<PettyCashCategory[]> {
    return pettyCashRepository.getCategories(companyId);
  }

  async createCategory(companyId: string, name: string, description?: string): Promise<PettyCashCategory> {
    return pettyCashRepository.createCategory(companyId, name, description);
  }

  async updateCategory(id: string, name: string, description?: string, isActive?: boolean): Promise<PettyCashCategory> {
    return pettyCashRepository.updateCategory(id, name, description, isActive);
  }

  async getLedger(companyId: string, accountId?: string, limit?: number): Promise<PettyCashLedgerEntry[]> {
    return pettyCashRepository.getLedger(companyId, accountId, limit);
  }

  async getAuditLogs(companyId: string, limit?: number) {
    return pettyCashRepository.getAuditLogs(companyId, limit);
  }
}

export const pettyCashService = new PettyCashService();

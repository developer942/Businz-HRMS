import { pettyCashRepository } from '../repositories/pettyCashRepository.js';
export class PettyCashService {
    // ============================================================
    // 1. CUSTODIAN ASSIGNMENT & REASSIGNMENT (CEO ONLY)
    // ============================================================
    async assignCustodian(params) {
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
    async reassignCustodian(params) {
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
    async getActiveCustodian(companyId) {
        return pettyCashRepository.getActiveAccount(companyId);
    }
    // ============================================================
    // 2. PETTY CASH REQUESTS
    // ============================================================
    async requestPettyCash(params) {
        const activeAccount = await pettyCashRepository.getActiveAccount(params.companyId);
        if (!activeAccount) {
            throw new Error('No active Petty Cash account exists. The CEO must assign a custodian first.');
        }
        const isCustodian = activeAccount.custodian_id === params.employeeId ||
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
    async getRequests(companyId, filters) {
        return pettyCashRepository.getRequests(companyId, filters);
    }
    async approveRequest(params) {
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
    async rejectRequest(params) {
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
    async disburseCash(params) {
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
    async getDisbursements(companyId, filters) {
        return pettyCashRepository.getDisbursements(companyId, filters);
    }
    // ============================================================
    // 4. RECEIPT CONFIRMATION (CUSTODIAN)
    // ============================================================
    async confirmCashReceipt(params) {
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
    async recordDailyExpense(params) {
        const activeAccount = await pettyCashRepository.getActiveAccount(params.companyId);
        if (!activeAccount) {
            throw new Error('No active Petty Cash account found');
        }
        const isCustodian = activeAccount.custodian_id === params.custodianId ||
            activeAccount.custodian_employee_id === params.custodianId ||
            (params.custodianEmployeeCode && activeAccount.custodian_employee_id.toLowerCase() === params.custodianEmployeeCode.toLowerCase());
        if (!isCustodian) {
            throw new Error('Unauthorized: Only the currently assigned Petty Cash Custodian can record daily expenses');
        }
        const { expense, newBalance } = await pettyCashRepository.recordExpense({
            companyId: params.companyId,
            accountId: activeAccount.id,
            custodianId: params.custodianId,
            custodianEmployeeCode: params.custodianEmployeeCode,
            custodianName: params.custodianName,
            categoryId: params.categoryId,
            categoryName: params.categoryName,
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
    async getExpenses(companyId, filters) {
        return pettyCashRepository.getExpenses(companyId, filters);
    }
    async reverseExpense(params) {
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
    async flagExpense(params) {
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
    async getCeoDashboardMetrics(companyId) {
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
    async getAccountsDashboardMetrics(companyId) {
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
    async getCustodianDashboardMetrics(companyId, custodianId) {
        const activeAccount = await pettyCashRepository.getActiveAccount(companyId);
        const myRequests = await pettyCashRepository.getRequests(companyId, { employeeId: custodianId });
        const allDisbursements = await pettyCashRepository.getDisbursements(companyId);
        const pendingReceiptConfirmations = allDisbursements.filter(d => d.status === 'DISBURSED' && (activeAccount ? d.account_id === activeAccount.id : true));
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
    async getCategories(companyId) {
        return pettyCashRepository.getCategories(companyId);
    }
    async createCategory(companyId, name, description) {
        return pettyCashRepository.createCategory(companyId, name, description);
    }
    async updateCategory(id, name, description, isActive) {
        return pettyCashRepository.updateCategory(id, name, description, isActive);
    }
    async getLedger(companyId, accountId, limit) {
        return pettyCashRepository.getLedger(companyId, accountId, limit);
    }
    async getAuditLogs(companyId, limit) {
        return pettyCashRepository.getAuditLogs(companyId, limit);
    }
}
export const pettyCashService = new PettyCashService();
//# sourceMappingURL=pettyCashService.js.map
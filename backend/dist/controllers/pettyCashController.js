import { pettyCashService } from '../services/pettyCashService.js';
import { assignCustodianSchema, reassignCustodianSchema, requestPettyCashSchema, ceoApprovalSchema, accountsDisbursementSchema, custodianReceiptConfirmationSchema, addDailyExpenseSchema, reverseExpenseSchema, flagExpenseSchema, categorySchema, } from '../validators/pettyCashValidators.js';
export class PettyCashController {
    // 1. Assign Custodian (CEO Only)
    async assignCustodian(req, res, next) {
        try {
            const parsed = assignCustodianSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const account = await pettyCashService.assignCustodian({
                companyId,
                custodianId: parsed.employeeId,
                custodianEmployeeId: parsed.employeeCode,
                custodianName: parsed.employeeName,
                assignedById: user.id,
                assignedByName: user.name || user.email,
                assignedByRole: user.role,
                lowBalanceThreshold: parsed.lowBalanceThreshold,
                assignmentDate: parsed.assignmentDate,
            });
            res.status(201).json({
                success: true,
                data: account,
                message: `Successfully assigned ${parsed.employeeName} as Petty Cash Custodian`,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 2. Reassign Custodian (CEO Only with Reconciliation)
    async reassignCustodian(req, res, next) {
        try {
            const parsed = reassignCustodianSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const result = await pettyCashService.reassignCustodian({
                companyId,
                previousAccountId: parsed.previousAccountId,
                newEmployeeId: parsed.newEmployeeId,
                newEmployeeName: parsed.newEmployeeName,
                newEmployeeCode: parsed.newEmployeeCode,
                assignedById: user.id,
                assignedByName: user.name || user.email,
                assignedByRole: user.role,
                reconciliationNotes: parsed.reconciliationNotes,
                physicalCashCounted: parsed.physicalCashCounted,
                transferRemainingBalance: parsed.transferRemainingBalance,
            });
            res.status(200).json({
                success: true,
                data: result,
                message: `Custodian safely reassigned to ${parsed.newEmployeeName} with reconciliation audit trail`,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 3. Get Active Custodian Account
    async getActiveCustodian(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const account = await pettyCashService.getActiveCustodian(companyId);
            res.status(200).json({
                success: true,
                data: account,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 4. Request Petty Cash (Assigned Custodian Only)
    async requestPettyCash(req, res, next) {
        try {
            const parsed = requestPettyCashSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const request = await pettyCashService.requestPettyCash({
                companyId,
                employeeId: user.id,
                employeeName: user.name || user.email,
                employeeCode: user.employeeId || 'STAFF',
                requestedAmount: parsed.requestedAmount,
                purpose: parsed.purpose,
                requestDate: parsed.requestDate,
                supportingDocumentUrl: parsed.supportingDocumentUrl,
            });
            res.status(201).json({
                success: true,
                data: request,
                message: 'Petty cash fund request submitted to CEO for approval',
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 5. Get Requests List
    async getRequests(req, res, next) {
        try {
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const { status, employeeId } = req.query;
            // Scoping: If user is simple Employee, scope to own requests
            const isPrivileged = ['CEO', 'Super Admin', 'Admin', 'Finance Manager', 'Finance'].includes(user.role);
            const effectiveEmpId = isPrivileged ? employeeId : user.id;
            const requests = await pettyCashService.getRequests(companyId, {
                status,
                employeeId: effectiveEmpId,
            });
            res.status(200).json({
                success: true,
                data: requests,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 6. CEO Approve Request
    async approveRequest(req, res, next) {
        try {
            const id = String(req.params.id);
            const parsed = ceoApprovalSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            if (parsed.action === 'REJECT') {
                const rejected = await pettyCashService.rejectRequest({
                    companyId,
                    requestId: id,
                    ceoId: user.id,
                    ceoName: user.name || user.email,
                    ceoRole: user.role,
                    remarks: parsed.remarks || 'Rejected by CEO',
                });
                res.status(200).json({
                    success: true,
                    data: rejected,
                    message: 'Petty cash request rejected by CEO',
                });
                return;
            }
            const approved = await pettyCashService.approveRequest({
                companyId,
                requestId: id,
                approvedAmount: parsed.approvedAmount,
                ceoId: user.id,
                ceoName: user.name || user.email,
                ceoRole: user.role,
                remarks: parsed.remarks,
            });
            res.status(200).json({
                success: true,
                data: approved,
                message: `Petty cash request approved for ₹${approved.approved_amount}. Sent to Accounts for cash disbursement.`,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 7. Accounts Record Disbursement
    async disburseCash(req, res, next) {
        try {
            const parsed = accountsDisbursementSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const disbursement = await pettyCashService.disburseCash({
                companyId,
                requestId: parsed.requestId,
                disbursedById: user.id,
                disbursedByName: user.name || user.email,
                disbursedByRole: user.role,
                disbursedAmount: parsed.disbursedAmount,
                paymentMode: parsed.paymentMode,
                paymentDate: parsed.paymentDate,
                paymentReference: parsed.paymentReference,
                remarks: parsed.remarks,
                paymentProofUrl: parsed.paymentProofUrl,
            });
            res.status(201).json({
                success: true,
                data: disbursement,
                message: 'Cash disbursement confirmed by Accounts. Awaiting employee receipt confirmation.',
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 8. Get Disbursements List
    async getDisbursements(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { status } = req.query;
            const disbursements = await pettyCashService.getDisbursements(companyId, { status });
            res.status(200).json({
                success: true,
                data: disbursements,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 9. Custodian Receipt Confirmation
    async confirmCashReceipt(req, res, next) {
        try {
            const parsed = custodianReceiptConfirmationSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const result = await pettyCashService.confirmCashReceipt({
                companyId,
                disbursementId: parsed.disbursementId,
                custodianId: user.id,
                custodianEmployeeCode: user.employeeId,
                custodianName: user.name || user.email,
                action: parsed.action,
                amountReceived: parsed.amountReceived,
                discrepancyReason: parsed.discrepancyReason,
                idempotencyKey: parsed.idempotencyKey,
            });
            res.status(200).json({
                success: true,
                data: result,
                message: parsed.action === 'CONFIRM'
                    ? `Cash receipt confirmed! Available petty cash balance is now ₹${result.newBalance.toFixed(2)}.`
                    : 'Discrepancy reported to Accounts and CEO for investigation.',
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 10. Custodian Record Daily Expense
    async recordDailyExpense(req, res, next) {
        try {
            const parsed = addDailyExpenseSchema.parse(req.body);
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const result = await pettyCashService.recordDailyExpense({
                companyId,
                custodianId: user.id,
                custodianEmployeeCode: user.employeeId,
                custodianName: user.name || user.email,
                categoryId: parsed.categoryId,
                categoryName: parsed.categoryName,
                amount: parsed.amount,
                expenseDate: parsed.expenseDate,
                reason: parsed.reason,
                paymentMode: parsed.paymentMode,
                billAttachmentUrl: parsed.billAttachmentUrl,
                idempotencyKey: parsed.idempotencyKey,
            });
            res.status(201).json({
                success: true,
                data: result,
                message: `Expense recorded successfully! Remaining balance: ₹${result.newBalance.toFixed(2)}${result.isLowBalance ? ' (Warning: Balance has fallen below threshold)' : ''}`,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 11. Get Expenses List
    async getExpenses(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { categoryId, startDate, endDate, status } = req.query;
            const expenses = await pettyCashService.getExpenses(companyId, {
                categoryId,
                startDate,
                endDate,
                status,
            });
            res.status(200).json({
                success: true,
                data: expenses,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 12. Reverse Expense (Authorized Correction)
    async reverseExpense(req, res, next) {
        try {
            const id = String(req.params.id);
            const parsed = reverseExpenseSchema.parse({ expenseId: id, ...req.body });
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const result = await pettyCashService.reverseExpense({
                companyId,
                expenseId: id,
                reversedById: user.id,
                reversedByName: user.name || user.email,
                reversedByRole: user.role,
                reversalReason: parsed.reversalReason,
            });
            res.status(200).json({
                success: true,
                data: result,
                message: `Expense reversed successfully. Amount ₹${result.expense.amount.toFixed(2)} credited back to balance. New balance: ₹${result.newBalance.toFixed(2)}`,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 13. Flag Expense (Reviewer)
    async flagExpense(req, res, next) {
        try {
            const id = String(req.params.id);
            const parsed = flagExpenseSchema.parse({ expenseId: id, ...req.body });
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const expense = await pettyCashService.flagExpense({
                companyId,
                expenseId: id,
                flaggedById: user.id,
                flaggedByName: user.name || user.email,
                flaggedByRole: user.role,
                flagReason: parsed.flagReason,
            });
            res.status(200).json({
                success: true,
                data: expense,
                message: 'Expense record flagged for custodian clarification',
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 14. Get Financial Ledger
    async getLedger(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { accountId, limit } = req.query;
            const ledger = await pettyCashService.getLedger(companyId, accountId, limit ? Number(limit) : 100);
            res.status(200).json({
                success: true,
                data: ledger,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 15. Categories Management
    async getCategories(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const categories = await pettyCashService.getCategories(companyId);
            res.status(200).json({
                success: true,
                data: categories,
            });
        }
        catch (err) {
            next(err);
        }
    }
    async createCategory(req, res, next) {
        try {
            const parsed = categorySchema.parse(req.body);
            const companyId = req.user?.company_id || 'company-a';
            const category = await pettyCashService.createCategory(companyId, parsed.name, parsed.description);
            res.status(201).json({
                success: true,
                data: category,
                message: `Category "${category.name}" created successfully`,
            });
        }
        catch (err) {
            next(err);
        }
    }
    async updateCategory(req, res, next) {
        try {
            const id = String(req.params.id);
            const parsed = categorySchema.parse(req.body);
            const category = await pettyCashService.updateCategory(id, parsed.name, parsed.description, parsed.isActive);
            res.status(200).json({
                success: true,
                data: category,
                message: 'Category updated successfully',
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 16. Dashboards
    async getCeoDashboard(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const metrics = await pettyCashService.getCeoDashboardMetrics(companyId);
            res.status(200).json({
                success: true,
                data: metrics,
            });
        }
        catch (err) {
            next(err);
        }
    }
    async getAccountsDashboard(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const metrics = await pettyCashService.getAccountsDashboardMetrics(companyId);
            res.status(200).json({
                success: true,
                data: metrics,
            });
        }
        catch (err) {
            next(err);
        }
    }
    async getCustodianDashboard(req, res, next) {
        try {
            const user = req.user;
            const companyId = user.company_id || 'company-a';
            const metrics = await pettyCashService.getCustodianDashboardMetrics(companyId, user.id);
            res.status(200).json({
                success: true,
                data: metrics,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 17. Audit Logs
    async getAuditLogs(req, res, next) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const logs = await pettyCashService.getAuditLogs(companyId);
            res.status(200).json({
                success: true,
                data: logs,
            });
        }
        catch (err) {
            next(err);
        }
    }
    // 18. File Attachments Upload
    async uploadAttachment(req, res, next) {
        try {
            const { fileData, fileName, fileSize, mimeType, entityType = 'REQUEST' } = req.body;
            const fileUrl = fileData || '';
            const name = fileName || 'attachment';
            const size = Number(fileSize) || 0;
            res.status(200).json({
                success: true,
                data: {
                    fileUrl,
                    originalFileName: name,
                    fileSize: size,
                },
                message: 'Attachment uploaded successfully',
            });
        }
        catch (err) {
            next(err);
        }
    }
}
export const pettyCashController = new PettyCashController();
//# sourceMappingURL=pettyCashController.js.map
import { Router } from 'express';
import { pettyCashController } from '../controllers/pettyCashController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { pettyCashService } from '../services/pettyCashService.js';
export const pettyCashRouter = Router();
// Enforce authentication on all petty cash routes
pettyCashRouter.use(authenticateToken);
const PETTY_CASH_OVERSIGHT_ROLES = new Set([
    'CEO',
    'Super Admin',
    'Finance Manager',
    'Finance',
    'Accountant',
    'Admin',
]);
export const canAccessPettyCash = (user, account) => {
    if (PETTY_CASH_OVERSIGHT_ROLES.has(user.role))
        return true;
    const callerIds = new Set([user.id, user.employeeId]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean));
    return Boolean(account) && [
        account?.custodian_id,
        account?.custodian_employee_id,
    ]
        .map((value) => String(value || '').trim().toLowerCase())
        .some((value) => callerIds.has(value));
};
const requirePettyCashParticipant = async (req, res, next) => {
    try {
        const user = req.user;
        if (PETTY_CASH_OVERSIGHT_ROLES.has(user.role)) {
            next();
            return;
        }
        const account = await pettyCashService.getActiveCustodian(user.company_id || 'company-a');
        if (!canAccessPettyCash(user, account)) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'PETTY_CASH_ACCESS_DENIED',
                    message: 'Petty cash is available only to the active custodian and authorized finance oversight roles.',
                },
            });
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
};
// ============================================================
// 1. Custodian Assignment (CEO ONLY)
// ============================================================
pettyCashRouter.post('/custodian/assign', requireRoles(['CEO', 'Super Admin']), (req, res, next) => pettyCashController.assignCustodian(req, res, next));
pettyCashRouter.post('/custodian/reassign', requireRoles(['CEO', 'Super Admin']), (req, res, next) => pettyCashController.reassignCustodian(req, res, next));
pettyCashRouter.post('/custodian/reconcile', requireRoles(['CEO', 'Super Admin']), (req, res, next) => pettyCashController.reassignCustodian(req, res, next));
pettyCashRouter.get('/custodian/active', requirePettyCashParticipant, (req, res, next) => pettyCashController.getActiveCustodian(req, res, next));
pettyCashRouter.get('/custodian/history', requireRoles(['CEO', 'Super Admin', 'Finance Manager', 'Finance', 'Accountant', 'Admin']), (req, res, next) => pettyCashController.getAccountHistory(req, res, next));
// ============================================================
// 2. Fund Requests (Custodian submits, CEO approves/rejects)
// ============================================================
pettyCashRouter.post('/requests', (req, res, next) => pettyCashController.requestPettyCash(req, res, next));
pettyCashRouter.get('/requests', requirePettyCashParticipant, (req, res, next) => pettyCashController.getRequests(req, res, next));
pettyCashRouter.post('/requests/:id/approve', requireRoles(['CEO', 'Super Admin']), (req, res, next) => pettyCashController.approveRequest(req, res, next));
// ============================================================
// 3. Accounts Cash Disbursement
// ============================================================
pettyCashRouter.post('/disbursements', requireRoles(['Finance Manager', 'Finance', 'Accountant', 'Admin', 'Super Admin', 'CEO']), (req, res, next) => pettyCashController.disburseCash(req, res, next));
pettyCashRouter.post('/requests/:id/disburse', requireRoles(['Finance Manager', 'Finance', 'Accountant', 'Admin', 'Super Admin', 'CEO']), (req, res, next) => {
    req.body.requestId = req.body.requestId || req.params.id;
    return pettyCashController.disburseCash(req, res, next);
});
pettyCashRouter.get('/disbursements', requirePettyCashParticipant, (req, res, next) => pettyCashController.getDisbursements(req, res, next));
// ============================================================
// 4. Employee Cash Receipt Confirmation
// ============================================================
pettyCashRouter.post('/receipts/confirm', (req, res, next) => pettyCashController.confirmCashReceipt(req, res, next));
// ============================================================
// 5. Daily Expenses Management
// ============================================================
pettyCashRouter.post('/expenses', (req, res, next) => pettyCashController.recordDailyExpense(req, res, next));
pettyCashRouter.get('/expenses', requirePettyCashParticipant, (req, res, next) => pettyCashController.getExpenses(req, res, next));
pettyCashRouter.post('/expenses/:id/reverse', requireRoles(['CEO', 'Super Admin', 'Finance Manager', 'Admin']), (req, res, next) => pettyCashController.reverseExpense(req, res, next));
pettyCashRouter.post('/expenses/:id/resubmit', (req, res, next) => pettyCashController.resubmitExpense(req, res, next));
pettyCashRouter.post('/expenses/:id/flag', requireRoles(['CEO', 'Super Admin', 'Finance Manager', 'Admin']), (req, res, next) => pettyCashController.flagExpense(req, res, next));
// ============================================================
// 6. Immutable Financial Ledger & Audit Trail
// ============================================================
pettyCashRouter.get('/ledger', requirePettyCashParticipant, (req, res, next) => pettyCashController.getLedger(req, res, next));
pettyCashRouter.get('/audit-logs', requireRoles(['CEO', 'Super Admin', 'Finance Manager', 'Admin']), (req, res, next) => pettyCashController.getAuditLogs(req, res, next));
// ============================================================
// 7. Categories Management
// ============================================================
pettyCashRouter.get('/categories', requirePettyCashParticipant, (req, res, next) => pettyCashController.getCategories(req, res, next));
pettyCashRouter.post('/categories', requireRoles(['Super Admin', 'Admin', 'CEO']), (req, res, next) => pettyCashController.createCategory(req, res, next));
pettyCashRouter.put('/categories/:id', requireRoles(['Super Admin', 'Admin', 'CEO']), (req, res, next) => pettyCashController.updateCategory(req, res, next));
// ============================================================
// 8. Dashboards & KPI Summaries
// ============================================================
pettyCashRouter.get('/dashboards/ceo', requireRoles(['CEO', 'Super Admin']), (req, res, next) => pettyCashController.getCeoDashboard(req, res, next));
pettyCashRouter.get('/dashboards/accounts', requireRoles(['Finance Manager', 'Finance', 'Accountant', 'Admin', 'Super Admin', 'CEO']), (req, res, next) => pettyCashController.getAccountsDashboard(req, res, next));
pettyCashRouter.get('/dashboards/custodian', requirePettyCashParticipant, (req, res, next) => pettyCashController.getCustodianDashboard(req, res, next));
// ============================================================
// 9. File Attachments Upload
// ============================================================
pettyCashRouter.post('/attachments/upload', (req, res, next) => pettyCashController.uploadAttachment(req, res, next));
//# sourceMappingURL=pettyCashRoutes.js.map
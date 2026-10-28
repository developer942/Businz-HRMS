import { expenseRepository } from '../repositories/expenseRepository.js';
import { createExpenseSchema } from '../validators/expenseValidators.js';
export const listExpenses = async (req, res, next) => {
    try {
        const role = String(req.user?.role || '');
        const isAccounts = Boolean(role === 'Finance Manager' || role === 'Finance' || role === 'Accountant' ||
            (req.user?.department && (req.user.department.toLowerCase().includes('accounts') || req.user.department.toLowerCase().includes('finance'))));
        const isEmployee = role === 'Employee' && !isAccounts;
        const ownEmployeeId = (isEmployee || isAccounts) ? req.user?.employeeId : undefined;
        if (isEmployee && !ownEmployeeId) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee profile is required.', details: [{ field: 'employeeId', message: 'Employee profile is required.' }] } });
            return;
        }
        const expenses = await expenseRepository.list(req.user?.company_id || req.user?.companyId || 'company-a', ownEmployeeId, isAccounts);
        res.json({ success: true, data: expenses });
    }
    catch (error) {
        next(error);
    }
};
export const createExpense = async (req, res, next) => {
    try {
        const input = createExpenseSchema.parse(req.body);
        const role = String(req.user?.role || '');
        const isEmployee = role === 'Employee';
        const isHr = role === 'HR' || role === 'HR Admin' || role === 'HR Manager';
        const isAccounts = role === 'Finance Manager' || role === 'Finance' || role === 'Accountant';
        if (!isEmployee && !isHr && !isAccounts) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only employees, HR and Accounts staff can submit expense claims.', details: [] } });
            return;
        }
        const employeeId = (isEmployee || isAccounts) ? (req.user?.employeeId || req.user?.id) : input.employeeId;
        if (!employeeId) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee claimant is required.', details: [{ field: 'employeeId', message: 'Employee claimant is required.' }] } });
            return;
        }
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        if (input.date > today) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Future expense dates are not allowed.', details: [{ field: 'date', message: 'Future expense dates are not allowed.' }] } });
            return;
        }
        const expense = await expenseRepository.create(req.user?.company_id || req.user?.companyId || 'company-a', { ...input, employeeId });
        res.status(201).json({ success: true, data: expense });
    }
    catch (error) {
        next(error);
    }
};
export const approveExpenseClaim = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        if (!id) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Expense ID is required.', details: [] } });
            return;
        }
        const approvedById = req.user?.id || req.user?.employeeId;
        const expense = await expenseRepository.approve(id, approvedById);
        res.json({ success: true, data: expense, message: 'Expense claim approved by CEO.' });
    }
    catch (error) {
        res.status(400).json({ success: false, error: { code: 'APPROVAL_FAILED', message: error.message || 'Approval failed.', details: [] } });
    }
};
export const rejectExpenseClaim = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { rejectionReason } = req.body;
        if (!id) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Expense ID is required.', details: [] } });
            return;
        }
        if (!rejectionReason || !rejectionReason.trim()) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required.', details: [{ field: 'rejectionReason', message: 'Rejection reason is required.' }] } });
            return;
        }
        const approvedById = req.user?.id || req.user?.employeeId;
        const expense = await expenseRepository.reject(id, rejectionReason.trim(), approvedById);
        res.json({ success: true, data: expense, message: 'Expense claim rejected by CEO.' });
    }
    catch (error) {
        res.status(400).json({ success: false, error: { code: 'REJECTION_FAILED', message: error.message || 'Rejection failed.', details: [] } });
    }
};
export const disburseExpenseClaim = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { amountPaid, paymentMode, transactionRef, remarks } = req.body;
        if (!id) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Expense ID is required.', details: [] } });
            return;
        }
        if (!amountPaid || Number(amountPaid) <= 0) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid payment amount is required.', details: [{ field: 'amountPaid', message: 'Must be greater than 0' }] } });
            return;
        }
        if (!paymentMode) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Payment mode is required.', details: [{ field: 'paymentMode', message: 'Payment mode is required.' }] } });
            return;
        }
        if (['Bank Transfer', 'UPI', 'Cheque'].includes(paymentMode) && (!transactionRef || !transactionRef.trim())) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Transaction reference is mandatory for ${paymentMode}.`, details: [{ field: 'transactionRef', message: 'Transaction reference is required.' }] } });
            return;
        }
        const expense = await expenseRepository.disburse(id, {
            amountPaid: Number(amountPaid),
            paymentMode,
            transactionRef: transactionRef ? transactionRef.trim() : undefined,
            remarks: remarks ? remarks.trim() : undefined,
        });
        res.json({ success: true, data: expense, message: 'Payment disbursement recorded successfully by Accounts.' });
    }
    catch (error) {
        res.status(400).json({ success: false, error: { code: 'DISBURSEMENT_FAILED', message: error.message || 'Disbursement failed.', details: [] } });
    }
};
//# sourceMappingURL=expenseController.js.map
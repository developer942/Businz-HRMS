import { expenseRepository } from '../repositories/expenseRepository.js';
import { createExpenseSchema } from '../validators/expenseValidators.js';
export const listExpenses = async (req, res, next) => {
    try {
        const role = String(req.user?.role || '');
        const ownEmployeeId = role === 'Employee' ? req.user?.employeeId : undefined;
        if (role === 'Employee' && !ownEmployeeId) {
            res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee profile is required.', details: [{ field: 'employeeId', message: 'Employee profile is required.' }] } });
            return;
        }
        const expenses = await expenseRepository.list(req.user?.company_id || req.user?.companyId || 'company-a', ownEmployeeId);
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
        if (!isEmployee && !isHr) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only employees and HR can submit expense claims.', details: [] } });
            return;
        }
        const employeeId = isEmployee ? (req.user?.employeeId || req.user?.id) : input.employeeId;
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
//# sourceMappingURL=expenseController.js.map
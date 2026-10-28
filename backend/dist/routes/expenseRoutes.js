import { Router } from 'express';
import { createExpense, listExpenses, approveExpenseClaim, rejectExpenseClaim, disburseExpenseClaim } from '../controllers/expenseController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
export const expenseRouter = Router();
expenseRouter.use(authenticateToken);
expenseRouter.get('/', listExpenses);
expenseRouter.post('/', createExpense);
// CEO alone approves or rejects expense claims
expenseRouter.post('/:id/approve', requireRoles(['CEO', 'Super Admin']), approveExpenseClaim);
expenseRouter.post('/:id/reject', requireRoles(['CEO', 'Super Admin']), rejectExpenseClaim);
// Accounts distributes payment for CEO-approved claims
expenseRouter.post('/:id/disburse', requireRoles(['Finance Manager', 'Finance', 'Accountant', 'Admin', 'Super Admin', 'CEO']), disburseExpenseClaim);
//# sourceMappingURL=expenseRoutes.js.map
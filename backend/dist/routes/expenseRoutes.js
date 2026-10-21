import { Router } from 'express';
import { createExpense, listExpenses } from '../controllers/expenseController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
export const expenseRouter = Router();
expenseRouter.use(authenticateToken);
expenseRouter.get('/', listExpenses);
expenseRouter.post('/', createExpense);
//# sourceMappingURL=expenseRoutes.js.map
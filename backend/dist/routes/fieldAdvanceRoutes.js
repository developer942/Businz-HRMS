import { Router } from 'express';
import { listFieldVisits, getFieldVisitDetail, createFieldVisit, approveAdvance, disburseAdvance, addExpenseItem, updateExpenseItem, deleteExpenseItem, submitSettlement, reviewSettlement, reportBalanceReturn, confirmBalanceReturn, disburseReimbursement, getFinancialSummary, getCeoMasterAnalytics, listDailyExpensesHandler, } from '../controllers/fieldAdvanceController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
export const fieldAdvanceRouter = Router();
fieldAdvanceRouter.use(authenticateToken);
// Summary, Master Analytics and Daily Expenses endpoints
fieldAdvanceRouter.get('/summary', getFinancialSummary);
fieldAdvanceRouter.get('/master-analytics', getCeoMasterAnalytics);
fieldAdvanceRouter.get('/analytics', getCeoMasterAnalytics);
fieldAdvanceRouter.get('/daily-expenses', listDailyExpensesHandler);
fieldAdvanceRouter.get('/', listFieldVisits);
fieldAdvanceRouter.get('/:id', getFieldVisitDetail);
// Create new field visit (Option A or Option B)
fieldAdvanceRouter.post('/', createFieldVisit);
// Advance approval (CEO / HR — controller enforces HR-cannot-approve-HR and Accounts-cannot-approve)
fieldAdvanceRouter.post('/:id/approve-advance', approveAdvance);
// Advance disbursement (Accounts)
fieldAdvanceRouter.post('/:id/disburse-advance', disburseAdvance);
// Daily expense items
fieldAdvanceRouter.post('/:id/expenses', addExpenseItem);
fieldAdvanceRouter.put('/expenses/:expenseId', updateExpenseItem);
fieldAdvanceRouter.delete('/expenses/:expenseId', deleteExpenseItem);
// Settlement submission & review
fieldAdvanceRouter.post('/:id/submit-settlement', submitSettlement);
fieldAdvanceRouter.post('/:id/review-settlement', reviewSettlement);
// Scenario 1: Return unused balance to Accounts
fieldAdvanceRouter.post('/:id/report-return', reportBalanceReturn);
fieldAdvanceRouter.post('/returns/:returnId/confirm', confirmBalanceReturn);
// Scenario 2 & 3: Reimbursement payout to Employee
fieldAdvanceRouter.post('/:id/disburse-reimbursement', disburseReimbursement);
//# sourceMappingURL=fieldAdvanceRoutes.js.map
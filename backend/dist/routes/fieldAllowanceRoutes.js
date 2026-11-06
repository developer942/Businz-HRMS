import { Router } from 'express';
import { fieldAllowanceController } from '../controllers/fieldAllowanceController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
export const fieldAllowanceRouter = Router();
fieldAllowanceRouter.use(authenticateToken);
fieldAllowanceRouter.get('/summary', requireRoles(['HR', 'HR Manager', 'HR Admin', 'Admin', 'Management', 'ERP Administrator']), (req, res, next) => fieldAllowanceController.summary(req, res, next));
// Department/designation-based Accounts users are authorized by the domain service.
fieldAllowanceRouter.get('/distributions', (req, res, next) => fieldAllowanceController.history(req, res, next));
fieldAllowanceRouter.get('/requests', (req, res, next) => fieldAllowanceController.list(req, res, next));
fieldAllowanceRouter.post('/requests', (req, res, next) => fieldAllowanceController.create(req, res, next));
fieldAllowanceRouter.get('/requests/:id', (req, res, next) => fieldAllowanceController.detail(req, res, next));
fieldAllowanceRouter.patch('/requests/:id', (req, res, next) => fieldAllowanceController.update(req, res, next));
fieldAllowanceRouter.post('/requests/:id/decision', requireRoles(['HR', 'HR Manager', 'HR Admin', 'Admin', 'Management', 'ERP Administrator']), (req, res, next) => fieldAllowanceController.decide(req, res, next));
fieldAllowanceRouter.post('/requests/:id/distributions', (req, res, next) => fieldAllowanceController.distribute(req, res, next));
fieldAllowanceRouter.post('/requests/:id/daily-reports', (req, res, next) => fieldAllowanceController.addDailyReport(req, res, next));
fieldAllowanceRouter.post('/requests/:id/complete', (req, res, next) => fieldAllowanceController.complete(req, res, next));
//# sourceMappingURL=fieldAllowanceRoutes.js.map
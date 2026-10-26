import { Router } from 'express';
import { payrollController } from '../controllers/payrollController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles, requirePermission, requireSpecialPermission } from '../middleware/rbacMiddleware.js';

export const payrollRouter = Router();

// Apply auth to all payroll routes
payrollRouter.use(authenticateToken);

// Settings & Components
payrollRouter.get('/settings', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getSettings(req, res, next));
payrollRouter.put('/settings', requirePermission('payroll', 'edit'), (req, res, next) =>
  payrollController.updateSettings(req, res, next)
);
payrollRouter.get('/components', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getComponents(req, res, next));
payrollRouter.put('/components', requirePermission('payroll', 'edit'), (req, res, next) => payrollController.updateComponents(req, res, next));
payrollRouter.post('/evaluate-eligibility', requirePermission('payroll', 'view'), (req, res, next) => payrollController.evaluateEligibility(req, res, next));

// Preview (Authoritative calculation preview)
payrollRouter.post('/preview', requirePermission('payroll', 'view'), (req, res, next) => payrollController.previewPayroll(req, res, next));

// Payroll Runs
payrollRouter.post('/runs', requirePermission('payroll', 'create'), (req, res, next) =>
  payrollController.createRun(req, res, next)
);
payrollRouter.get('/runs', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getAllRuns(req, res, next));
payrollRouter.get('/runs/:id', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getRunById(req, res, next));

// Workflow actions: Process -> Approve -> Pay
payrollRouter.post('/runs/:id/process', requireSpecialPermission('process_payroll'), (req, res, next) =>
  payrollController.processRun(req, res, next)
);
payrollRouter.post('/runs/:id/approve', requireSpecialPermission('approve_payroll'), (req, res, next) =>
  payrollController.approveRun(req, res, next)
);
payrollRouter.post('/runs/:id/pay', requireRoles(['Super Admin', 'CEO', 'Finance Manager', 'HR Manager', 'HR Admin', 'HR']), (req, res, next) =>
  payrollController.payRun(req, res, next)
);

// Processed Records & Payslips
payrollRouter.get('/records', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getRecords(req, res, next));
payrollRouter.get('/records/:id', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getRecords(req, res, next));

payrollRouter.get('/payslips/:id', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getPayslip(req, res, next));
payrollRouter.get('/employees/:employeeId/payslips', requirePermission('payroll', 'view'), (req, res, next) => payrollController.getPayslip(req, res, next));

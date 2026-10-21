import { Router } from 'express';
import {
  getShifts,
  getShiftAssignmentSummary,
  createShift,
  assignEmployeesToShift,
  createShiftRequest,
  updateShiftRequestReason,
} from '../controllers/shiftController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles, scopeDataAccess } from '../middleware/rbacMiddleware.js';

export const shiftRouter = Router();

shiftRouter.use(authenticateToken);

shiftRouter.get('/', getShifts);
shiftRouter.get('/assignment-summary', scopeDataAccess, getShiftAssignmentSummary);
shiftRouter.post('/requests', createShiftRequest);
shiftRouter.patch('/requests/:id', updateShiftRequestReason);
shiftRouter.post('/', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), createShift);
shiftRouter.put('/:id/assignments', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), assignEmployeesToShift);

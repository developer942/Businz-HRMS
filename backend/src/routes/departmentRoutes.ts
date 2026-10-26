import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../controllers/departmentController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';

export const departmentRouter = Router();

// Department routes (all require authentication)
departmentRouter.use(authenticateToken);

departmentRouter.get('/', getDepartments);
departmentRouter.post('/', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'Admin', 'HR Admin']), createDepartment);
departmentRouter.put('/:id', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'Admin', 'HR Admin']), updateDepartment);
departmentRouter.delete('/:id', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'Admin', 'HR Admin']), deleteDepartment);

import { Router } from 'express';
import { getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee, resetEmployeeLogin, updateEmployeeLoginStatus, getEmployeeLoginAccount, sendEmployeeCredentials, sendEmployeeOfferLetter, } from '../controllers/employeeController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles, requirePermission, scopeDataAccess } from '../middleware/rbacMiddleware.js';
export const employeeRouter = Router();
// Automated Credential Email Dispatch
employeeRouter.post('/send-credentials', sendEmployeeCredentials);
employeeRouter.use(authenticateToken);
employeeRouter.get('/', scopeDataAccess, requirePermission('employees', 'view'), getEmployees);
employeeRouter.post('/send-offer-letter', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), sendEmployeeOfferLetter);
employeeRouter.get('/:id', scopeDataAccess, requirePermission('employees', 'view'), getEmployeeById);
employeeRouter.post('/', requirePermission('employees', 'create'), createEmployee);
employeeRouter.put('/:id', requirePermission('employees', 'edit'), updateEmployee);
employeeRouter.delete('/:id', requirePermission('employees', 'delete'), deleteEmployee);
// Login Account Management (HR Admin / CEO / Super Admin)
employeeRouter.post('/:id/reset-login', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), resetEmployeeLogin);
employeeRouter.put('/:id/login-status', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), updateEmployeeLoginStatus);
employeeRouter.get('/:id/login-account', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), getEmployeeLoginAccount);
//# sourceMappingURL=employeeRoutes.js.map
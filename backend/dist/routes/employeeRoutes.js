import { Router } from 'express';
import { getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee, resetEmployeeLogin, updateEmployeeLoginStatus, getEmployeeLoginAccount, sendEmployeeCredentials, sendEmployeeOfferLetter, } from '../controllers/employeeController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles, requirePermission, scopeDataAccess } from '../middleware/rbacMiddleware.js';
import { credentialDispatchRateLimiter } from '../middleware/rateLimiter.js';
export const employeeRouter = Router();
employeeRouter.use(authenticateToken);
// Automated Credential Email Dispatch (Strictly authorized HR/Admin roles with rate limiting)
employeeRouter.post('/send-credentials', credentialDispatchRateLimiter, requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'ERP Administrator']), sendEmployeeCredentials);
employeeRouter.get('/', scopeDataAccess, requirePermission('employees', 'view'), getEmployees);
employeeRouter.post('/send-offer-letter', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin']), sendEmployeeOfferLetter);
employeeRouter.get('/:id', scopeDataAccess, requirePermission('employees', 'view'), getEmployeeById);
employeeRouter.post('/', requirePermission('employees', 'create'), createEmployee);
employeeRouter.put('/:id', requirePermission('employees', 'edit'), updateEmployee);
employeeRouter.delete('/:id', requirePermission('employees', 'delete'), deleteEmployee);
// Login Account Management (HR Admin / CEO / Super Admin / Admin)
employeeRouter.post('/:id/reset-login', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'ERP Administrator']), resetEmployeeLogin);
employeeRouter.put('/:id/login-status', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'ERP Administrator']), updateEmployeeLoginStatus);
employeeRouter.get('/:id/login-account', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'ERP Administrator']), getEmployeeLoginAccount);
//# sourceMappingURL=employeeRoutes.js.map
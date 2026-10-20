import { Router } from 'express';
import { customerController } from '../controllers/customerController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
export const customerRouter = Router();
// OCR Visiting Card Scan endpoint (allow scanning even if session token is refreshing)
customerRouter.post('/ocr-scan', customerController.scanCardOcr.bind(customerController));
// Protect data-access customer routes with authentication
customerRouter.use(authenticateToken);
// Duplicate check endpoint
customerRouter.get('/check-duplicate', requirePermission('customer_data', 'view'), customerController.checkDuplicate.bind(customerController));
// Record WhatsApp Consent Audit
customerRouter.post('/consent', requirePermission('customer_data', 'edit'), customerController.recordConsent.bind(customerController));
// List Customers (Search, Filter, Paginate)
customerRouter.get('/', requirePermission('customer_data', 'view'), customerController.getCustomers.bind(customerController));
// Get Single Customer Details
customerRouter.get('/:id', requirePermission('customer_data', 'view'), customerController.getCustomerById.bind(customerController));
// Save / Add Customer
customerRouter.post('/', requirePermission('customer_data', 'create'), customerController.saveCustomer.bind(customerController));
//# sourceMappingURL=customerRoutes.js.map
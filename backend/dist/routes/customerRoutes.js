import { Router } from 'express';
import { customerController } from '../controllers/customerController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { ocrRateLimiter } from '../middleware/rateLimiter.js';
export const customerRouter = Router();
// Protect all customer routes (including OCR scan) with authentication
customerRouter.use(authenticateToken);
// OCR Visiting Card Scan endpoint (authenticated, role-authorized, and rate-limited)
customerRouter.post('/ocr-scan', ocrRateLimiter, requirePermission('customer_data', 'create'), customerController.scanCardOcr.bind(customerController));
// Duplicate check endpoint
customerRouter.get('/check-duplicate', requirePermission('customer_data', 'view'), customerController.checkDuplicate.bind(customerController));
// Record WhatsApp Consent Audit
customerRouter.post('/consent', requirePermission('customer_data', 'create'), customerController.recordConsent.bind(customerController));
// List Customers (Search, Filter, Paginate)
customerRouter.get('/', requirePermission('customer_data', 'view'), customerController.getCustomers.bind(customerController));
// Get Single Customer Details
customerRouter.get('/:id', requirePermission('customer_data', 'view'), customerController.getCustomerById.bind(customerController));
// Save / Add Customer
customerRouter.post('/', requirePermission('customer_data', 'create'), customerController.saveCustomer.bind(customerController));
//# sourceMappingURL=customerRoutes.js.map
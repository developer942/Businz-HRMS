import { Router } from 'express';
import { customerController } from '../controllers/customerController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';

export const whatsappRouter = Router();

// Meta Webhook Endpoints (Public - Meta Graph API calls these directly)
whatsappRouter.get('/webhook', customerController.verifyWebhook.bind(customerController));
whatsappRouter.post('/webhook', customerController.handleWebhook.bind(customerController));

// Authenticated WhatsApp Endpoints
whatsappRouter.use(authenticateToken);

// WhatsApp Cloud API Configuration
whatsappRouter.get(
  '/config',
  requirePermission('settings', 'view'),
  customerController.getWhatsAppConfig.bind(customerController)
);
whatsappRouter.post(
  '/config',
  requirePermission('settings', 'edit'),
  customerController.saveWhatsAppConfig.bind(customerController)
);
whatsappRouter.post(
  '/test-connection',
  requirePermission('settings', 'edit'),
  customerController.testWhatsAppConnection.bind(customerController)
);

// Template Management
whatsappRouter.get(
  '/templates',
  requirePermission('customer_data', 'view'),
  customerController.getTemplates.bind(customerController)
);

whatsappRouter.post(
  '/templates',
  requirePermission('customer_data', 'create'),
  customerController.saveTemplate.bind(customerController)
);

whatsappRouter.post(
  '/templates/submit',
  requirePermission('customer_data', 'create'),
  customerController.submitTemplate.bind(customerController)
);

whatsappRouter.get(
  '/templates/:name/status',
  requirePermission('customer_data', 'view'),
  customerController.checkTemplateStatus.bind(customerController)
);
whatsappRouter.get(
  '/templates/:id/status',
  requirePermission('customer_data', 'view'),
  customerController.checkTemplateStatus.bind(customerController)
);

// Send WhatsApp Message
whatsappRouter.post(
  '/send',
  requirePermission('customer_data', 'edit'),
  customerController.sendMessage.bind(customerController)
);

// Message History
whatsappRouter.get(
  '/messages',
  requirePermission('customer_data', 'view'),
  customerController.getMessageHistory.bind(customerController)
);

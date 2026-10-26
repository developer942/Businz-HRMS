/**
 * WhatsApp CRM Router for BUSINZ HRMS
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import { Router } from 'express';
import { crmController } from '../controllers/crmController.js';
import { crmWebhookController } from '../controllers/crmWebhookController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requirePermission, requireRoles } from '../middleware/rbacMiddleware.js';

export const crmRouter = Router();

// ============================================================
// Public Webhook Endpoints (Called directly by Meta Cloud API)
// ============================================================
crmRouter.get('/webhook', (req, res) => crmWebhookController.verifyWebhook(req, res));
crmRouter.post('/webhook', (req, res) => crmWebhookController.handleWebhookPayload(req, res));

// ============================================================
// Authenticated CRM API Endpoints (Requires valid JWT & RBAC)
// ============================================================
crmRouter.use(authenticateToken);

// 1. Health & Analytics
crmRouter.get('/health', requirePermission('customer_data', 'view'), (req, res) => crmController.getHealth(req, res));
crmRouter.get('/analytics', requirePermission('customer_data', 'view'), (req, res) => crmController.getAnalytics(req, res));

// 2. Contacts
crmRouter.get('/contacts', requirePermission('customer_data', 'view'), (req, res) => crmController.getContacts(req, res));
crmRouter.get('/contacts/:id', requirePermission('customer_data', 'view'), (req, res) => crmController.getContactById(req, res));
crmRouter.post('/contacts', requirePermission('customer_data', 'create'), (req, res) => crmController.upsertContact(req, res));
crmRouter.delete('/contacts/:id', requirePermission('customer_data', 'delete'), (req, res) => crmController.deleteContact(req, res));
crmRouter.post('/contacts/:id/tags', requirePermission('customer_data', 'edit'), (req, res) => crmController.assignTag(req, res));
crmRouter.delete('/contacts/:id/tags/:tagId', requirePermission('customer_data', 'edit'), (req, res) => crmController.removeTag(req, res));

// 3. Tags
crmRouter.get('/tags', requirePermission('customer_data', 'view'), (req, res) => crmController.getTags(req, res));
crmRouter.post('/tags', requirePermission('customer_data', 'create'), (req, res) => crmController.createTag(req, res));

// 4. Conversations
crmRouter.get('/conversations', requirePermission('customer_data', 'view'), (req, res) => crmController.getConversations(req, res));
crmRouter.get('/conversations/:id', requirePermission('customer_data', 'view'), (req, res) => crmController.getConversationById(req, res));
crmRouter.put('/conversations/:id/assign', requirePermission('customer_data', 'edit'), (req, res) => crmController.assignConversation(req, res));
crmRouter.post('/conversations/:id/read', requirePermission('customer_data', 'edit'), (req, res) => crmController.markAsRead(req, res));

// 5. Messages
crmRouter.get('/conversations/:id/messages', requirePermission('customer_data', 'view'), (req, res) => crmController.getMessages(req, res));
crmRouter.post('/conversations/:id/messages', requirePermission('customer_data', 'edit'), (req, res) => crmController.sendMessage(req, res));
crmRouter.post('/messages/template', requirePermission('customer_data', 'edit'), (req, res) => crmController.sendTemplateMessage(req, res));

// 6. Broadcasts (Restricted strictly to authorized Managers / Admins)
crmRouter.get('/broadcasts', requirePermission('customer_data', 'view'), (req, res) => crmController.getBroadcasts(req, res));
crmRouter.get('/broadcasts/:id', requirePermission('customer_data', 'view'), (req, res) => crmController.getBroadcastById(req, res));
crmRouter.post(
  '/broadcasts',
  requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'Marketing Manager', 'Operations Manager']),
  requirePermission('customer_data', 'create'),
  (req, res) => crmController.createBroadcast(req, res)
);

// 7. Templates
crmRouter.get('/templates', requirePermission('customer_data', 'view'), (req, res) => crmController.getTemplates(req, res));
crmRouter.get('/templates/:id', requirePermission('customer_data', 'view'), (req, res) => crmController.getTemplateById(req, res));
crmRouter.post('/templates/draft', requirePermission('customer_data', 'create'), (req, res) => crmController.saveTemplateDraft(req, res));
crmRouter.post('/templates/sync', requirePermission('customer_data', 'edit'), (req, res) => crmController.syncMetaTemplates(req, res));
crmRouter.post('/templates/:id/submit', requirePermission('customer_data', 'create'), (req, res) => crmController.submitTemplateToMeta(req, res));
crmRouter.post('/templates/:id/duplicate', requirePermission('customer_data', 'create'), (req, res) => crmController.duplicateTemplate(req, res));
crmRouter.delete('/templates/:id', requirePermission('customer_data', 'delete'), (req, res) => crmController.deleteTemplate(req, res));

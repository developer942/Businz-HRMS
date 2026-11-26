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
crmRouter.get('/health', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getHealth(req, res));
crmRouter.get('/analytics', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getAnalytics(req, res));

// 2. Contacts
crmRouter.get('/contacts', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getContacts(req, res));
crmRouter.get('/contacts/:id', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getContactById(req, res));
crmRouter.get('/contacts/:id/marketing-restriction', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getContactMarketingRestriction(req, res));
crmRouter.post('/contacts', requirePermission('whatsapp_crm', 'create'), (req, res) => crmController.upsertContact(req, res));
crmRouter.post('/contacts/:id/avatar', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.updateContactAvatar(req, res));
crmRouter.post('/contacts/:id/consent', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.recordConsent(req, res));
crmRouter.delete('/contacts/:id', requirePermission('whatsapp_crm', 'delete'), (req, res) => crmController.deleteContact(req, res));
crmRouter.post('/contacts/:id/tags', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.assignTag(req, res));
crmRouter.delete('/contacts/:id/tags/:tagId', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.removeTag(req, res));

// 3. Tags
crmRouter.get('/tags', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getTags(req, res));
crmRouter.post('/tags', requirePermission('whatsapp_crm', 'create'), (req, res) => crmController.createTag(req, res));

// 4. Conversations
crmRouter.get('/conversations', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getConversations(req, res));
crmRouter.post('/conversations', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.startOrGetConversation(req, res));
crmRouter.get('/conversations/:id', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getConversationById(req, res));
crmRouter.put('/conversations/:id/assign', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.assignConversation(req, res));
crmRouter.post('/conversations/:id/read', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.markAsRead(req, res));

// 5. Messages
crmRouter.get('/conversations/:id/messages', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getMessages(req, res));
crmRouter.post('/conversations/:id/messages', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.sendMessage(req, res));
crmRouter.post('/messages/template', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.sendTemplateMessage(req, res));

// 6. Broadcasts (Accessible to all authorized HRMS users: Employee, HR, Accounts, CEO)
crmRouter.get('/broadcasts', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getBroadcasts(req, res));
crmRouter.get('/broadcasts/:id', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getBroadcastById(req, res));
crmRouter.post(
  '/broadcasts',
  requirePermission('whatsapp_crm', 'create'),
  (req, res) => crmController.createBroadcast(req, res)
);

// 7. Templates
crmRouter.get('/templates', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getTemplates(req, res));
crmRouter.get('/templates/:id', requirePermission('whatsapp_crm', 'view'), (req, res) => crmController.getTemplateById(req, res));
crmRouter.post('/templates/draft', requirePermission('whatsapp_crm', 'create'), (req, res) => crmController.saveTemplateDraft(req, res));
crmRouter.post('/templates/sync', requirePermission('whatsapp_crm', 'edit'), (req, res) => crmController.syncMetaTemplates(req, res));
crmRouter.post('/templates/:id/submit', requirePermission('whatsapp_crm', 'create'), (req, res) => crmController.submitTemplateToMeta(req, res));
crmRouter.post('/templates/:id/duplicate', requirePermission('whatsapp_crm', 'create'), (req, res) => crmController.duplicateTemplate(req, res));
crmRouter.delete('/templates/:id', requirePermission('whatsapp_crm', 'delete'), (req, res) => crmController.deleteTemplate(req, res));

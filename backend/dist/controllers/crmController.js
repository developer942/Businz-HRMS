/**
 * WhatsApp CRM Controller for BUSINZ HRMS
 * Native REST handlers for CRM operations
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */
import { crmRepository } from '../repositories/crmRepository.js';
import { crmMessageSender } from '../services/whatsapp/crmMessageSender.js';
import { metaApiClient } from '../services/whatsapp/metaApiClient.js';
export class CrmController {
    // ============================================================
    // Contacts
    // ============================================================
    async getContacts(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const search = req.query.search;
            const category = req.query.category;
            const consentStatus = req.query.consentStatus;
            const tagId = req.query.tagId;
            const limit = parseInt(req.query.limit || '50', 10);
            const offset = parseInt(req.query.offset || '0', 10);
            const result = await crmRepository.getContacts({
                companyId,
                search,
                category,
                consentStatus,
                tagId,
                limit,
                offset
            });
            res.status(200).json({ success: true, data: result.contacts, total: result.total });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch contacts' });
        }
    }
    async getContactById(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const contact = await crmRepository.getContactById(id, companyId);
            if (!contact) {
                res.status(404).json({ success: false, error: 'Contact not found' });
                return;
            }
            res.status(200).json({ success: true, data: contact });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error fetching contact' });
        }
    }
    async upsertContact(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { phone, name, email, companyName, designation, category, consentStatus, notes } = req.body;
            if (!phone || !name) {
                res.status(400).json({ success: false, error: 'Name and Phone number are required' });
                return;
            }
            const saved = await crmRepository.upsertContact({
                companyId,
                phone,
                name,
                email,
                companyName,
                designation,
                category: category || 'Customers',
                consentStatus: consentStatus || 'Unknown',
                notes
            });
            res.status(200).json({ success: true, data: saved });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to save contact' });
        }
    }
    async deleteContact(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const success = await crmRepository.deleteContact(id, companyId);
            res.status(200).json({ success });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to delete contact' });
        }
    }
    // ============================================================
    // Tags
    // ============================================================
    async getTags(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const tags = await crmRepository.getTags(companyId);
            res.status(200).json({ success: true, data: tags });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch tags' });
        }
    }
    async createTag(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { name, color } = req.body;
            if (!name) {
                res.status(400).json({ success: false, error: 'Tag name is required' });
                return;
            }
            const tag = await crmRepository.createTag(companyId, name, color || '#0E7490');
            res.status(201).json({ success: true, data: tag });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to create tag' });
        }
    }
    async assignTag(req, res) {
        try {
            const id = String(req.params.id); // contactId
            const { tagId } = req.body;
            if (!tagId) {
                res.status(400).json({ success: false, error: 'tagId is required' });
                return;
            }
            await crmRepository.assignTagToContact(id, String(tagId));
            res.status(200).json({ success: true });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to assign tag' });
        }
    }
    async removeTag(req, res) {
        try {
            const id = String(req.params.id);
            const tagId = String(req.params.tagId);
            await crmRepository.removeTagFromContact(id, tagId);
            res.status(200).json({ success: true });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to remove tag' });
        }
    }
    // ============================================================
    // Conversations
    // ============================================================
    async getConversations(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const status = req.query.status;
            const assignedEmployeeId = req.query.assignedEmployeeId;
            const search = req.query.search;
            const limit = parseInt(req.query.limit || '50', 10);
            const offset = parseInt(req.query.offset || '0', 10);
            const convs = await crmRepository.getConversations({
                companyId,
                status,
                assignedEmployeeId,
                search,
                limit,
                offset
            });
            res.status(200).json({ success: true, data: convs });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch conversations' });
        }
    }
    async getConversationById(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const conv = await crmRepository.getConversationById(id, companyId);
            if (!conv) {
                res.status(404).json({ success: false, error: 'Conversation not found' });
                return;
            }
            res.status(200).json({ success: true, data: conv });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error fetching conversation' });
        }
    }
    async assignConversation(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const { employeeId, employeeName } = req.body;
            const success = await crmRepository.updateConversationAssignment(id, employeeId || null, employeeName || null, companyId);
            res.status(200).json({ success });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to assign conversation' });
        }
    }
    async markAsRead(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            await crmRepository.markConversationRead(id, companyId);
            res.status(200).json({ success: true });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to mark as read' });
        }
    }
    // ============================================================
    // Messages
    // ============================================================
    async getMessages(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id); // conversationId
            const limit = parseInt(req.query.limit || '100', 10);
            const offset = parseInt(req.query.offset || '0', 10);
            const messages = await crmRepository.getMessages(id, companyId, limit, offset);
            res.status(200).json({ success: true, data: messages });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch messages' });
        }
    }
    async sendMessage(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id); // conversationId
            const { text } = req.body;
            const agentEmployeeId = req.user?.employeeId || req.user?.id || 'AGENT-DEFAULT';
            if (!text || !text.trim()) {
                res.status(400).json({ success: false, error: 'Message text is required' });
                return;
            }
            const msg = await crmMessageSender.sendDirectMessage({
                conversationId: id,
                text: text.trim(),
                agentEmployeeId,
                companyId
            });
            res.status(201).json({ success: true, data: msg });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to send message' });
        }
    }
    async sendTemplateMessage(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { contactId, recipientPhone, recipientName, templateName, language, components, category, bodyParameters } = req.body;
            const agentEmployeeId = req.user?.employeeId || req.user?.id || 'AGENT-DEFAULT';
            let targetContactId = contactId;
            if (!targetContactId && recipientPhone) {
                let contact = await crmRepository.getContactById(recipientPhone, companyId);
                if (!contact) {
                    contact = await crmRepository.upsertContact({
                        companyId,
                        phone: recipientPhone,
                        name: recipientName || recipientPhone,
                        sourceType: 'MANUAL',
                        consentStatus: 'Opted In'
                    });
                }
                targetContactId = contact.id;
            }
            if (!targetContactId || !templateName) {
                res.status(400).json({ success: false, error: 'contactId (or recipientPhone) and templateName are required' });
                return;
            }
            // Build components from bodyParameters if provided and components is empty
            const finalComponents = (components && components.length > 0)
                ? components
                : (bodyParameters && Array.isArray(bodyParameters) && bodyParameters.length > 0)
                    ? [{ type: 'body', parameters: bodyParameters.map((p) => ({ type: 'text', text: String(p) })) }]
                    : [];
            const msg = await crmMessageSender.sendTemplateMessage({
                contactId: targetContactId,
                templateName,
                language: language || 'en',
                components: finalComponents,
                category: category || 'UTILITY',
                agentEmployeeId,
                companyId
            });
            res.status(201).json({ success: true, data: msg });
        }
        catch (err) {
            res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Template send failed' });
        }
    }
    async createBroadcast(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const employeeId = req.user?.employeeId || req.user?.id || 'AGENT-DEFAULT';
            const { name, templateName, templateLanguage, templateVariables, audienceFilter, scheduledAt, status, totalRecipients } = req.body;
            const created = await crmRepository.createBroadcast({
                companyId,
                name: name || `Broadcast ${new Date().toLocaleDateString()}`,
                templateName,
                templateLanguage: templateLanguage || 'en',
                templateVariables,
                audienceFilter,
                scheduledAt,
                status: status || 'completed',
                totalRecipients: totalRecipients || 0,
                createdByEmployeeId: employeeId
            });
            res.status(201).json({ success: true, data: created });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to create broadcast' });
        }
    }
    // ============================================================
    // Broadcasts
    // ============================================================
    async getBroadcasts(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const broadcasts = await crmRepository.getBroadcasts(companyId);
            res.status(200).json({ success: true, data: broadcasts });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch broadcasts' });
        }
    }
    async getBroadcastById(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const result = await crmRepository.getBroadcastById(id, companyId);
            if (!result.broadcast) {
                res.status(404).json({ success: false, error: 'Broadcast not found' });
                return;
            }
            res.status(200).json({ success: true, data: result.broadcast, recipients: result.recipients });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error fetching broadcast' });
        }
    }
    // ============================================================
    // Templates & Health
    // ============================================================
    async getTemplates(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const category = req.query.category;
            const status = req.query.status;
            const search = req.query.search;
            let templates = await crmRepository.getTemplates(companyId, { category, status, search });
            // If database has 0 templates and no query filters, attempt an initial auto-sync with Meta
            if (templates.length === 0 && !category && !status && !search) {
                try {
                    const metaRes = await metaApiClient.getTemplates(companyId);
                    if (metaRes.success && Array.isArray(metaRes.data) && metaRes.data.length > 0) {
                        for (const mt of metaRes.data) {
                            await crmRepository.upsertMetaTemplate(mt, companyId);
                        }
                        templates = await crmRepository.getTemplates(companyId);
                    }
                }
                catch {
                    // Non-blocking auto-sync
                }
            }
            res.status(200).json({ success: true, data: templates });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch templates' });
        }
    }
    async getTemplateById(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const template = await crmRepository.getTemplateById(id, companyId);
            if (!template) {
                res.status(404).json({ success: false, error: 'Template not found' });
                return;
            }
            res.status(200).json({ success: true, data: template });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch template' });
        }
    }
    async saveTemplateDraft(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const { name, category, language, headerType, headerContent, headerExample, bodyText, bodyExampleValues, footerText, buttons, rawComponents, status } = req.body;
            if (!name || !name.trim()) {
                res.status(400).json({ success: false, error: 'Template name is required' });
                return;
            }
            const cleanName = name.toLowerCase().trim();
            if (!/^[a-z0-9_]+$/.test(cleanName)) {
                res.status(400).json({
                    success: false,
                    error: 'Template name can only contain lowercase alphanumeric characters and underscores (e.g. order_update_v1)'
                });
                return;
            }
            if (!bodyText || !bodyText.trim()) {
                res.status(400).json({ success: false, error: 'Message body text is required' });
                return;
            }
            const validCategories = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
            const cat = (category || 'MARKETING').toUpperCase();
            if (!validCategories.includes(cat)) {
                res.status(400).json({ success: false, error: 'Category must be MARKETING, UTILITY, or AUTHENTICATION' });
                return;
            }
            const saved = await crmRepository.saveTemplateDraft({
                name: cleanName,
                category: cat,
                language: language || 'en',
                headerType: headerType || 'NONE',
                headerContent: headerContent || null,
                headerExample: headerExample || [],
                bodyText: bodyText.trim(),
                bodyExampleValues: bodyExampleValues || [],
                footerText: footerText ? footerText.trim() : null,
                buttons: buttons || [],
                rawComponents: rawComponents || [],
                status: status || 'DRAFT'
            }, companyId);
            res.status(200).json({ success: true, data: saved });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to save template draft' });
        }
    }
    async submitTemplateToMeta(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const template = await crmRepository.getTemplateById(id, companyId);
            if (!template) {
                res.status(404).json({ success: false, error: 'Template not found' });
                return;
            }
            // Pre-submission validation
            if (!/^[a-z0-9_]+$/.test(template.name)) {
                res.status(400).json({
                    success: false,
                    error: 'Template name must contain only lowercase letters, numbers, and underscores.'
                });
                return;
            }
            if (!template.bodyText.trim()) {
                res.status(400).json({ success: false, error: 'Template body cannot be empty.' });
                return;
            }
            // Check dynamic variables in body: {{1}}, {{2}}...
            const variableMatches = template.bodyText.match(/\{\{(\d+)\}\}/g) || [];
            const varCount = variableMatches.length;
            if (varCount > 0) {
                const sampleValues = template.bodyExampleValues || [];
                if (sampleValues.length < varCount || sampleValues.some(v => !v || !v.trim())) {
                    res.status(400).json({
                        success: false,
                        error: `Body text has ${varCount} dynamic variable(s). Meta requires a non-empty sample value for each variable (e.g. {{1}} -> John).`
                    });
                    return;
                }
            }
            // Footer max length check
            if (template.footerText && template.footerText.length > 60) {
                res.status(400).json({ success: false, error: 'Footer text exceeds Meta maximum limit of 60 characters.' });
                return;
            }
            // Check Meta API Credentials
            const config = await metaApiClient.getConfig(companyId);
            if (!config || !config.wabaId || !config.accessToken) {
                res.status(400).json({
                    success: false,
                    error: 'Meta WhatsApp Cloud API credentials missing or incomplete in Settings.'
                });
                return;
            }
            // Submit to Meta Graph API: POST /{WABA_ID}/message_templates
            const submitResult = await metaApiClient.createTemplate({
                name: template.name,
                category: template.category,
                language: template.language,
                headerType: template.headerType,
                headerContent: template.headerContent,
                headerExample: template.headerExample,
                bodyText: template.bodyText,
                bodyExampleValues: template.bodyExampleValues,
                footerText: template.footerText,
                buttons: template.buttons
            }, companyId);
            if (!submitResult.success) {
                // Meta rejected the request
                await crmRepository.updateTemplateStatus(id, {
                    status: 'REJECTED',
                    rejectionReason: submitResult.error || 'Meta rejected template request'
                }, companyId);
                res.status(400).json({
                    success: false,
                    error: submitResult.error || 'Meta template submission failed'
                });
                return;
            }
            // Update local database status with Meta's response
            const updated = await crmRepository.updateTemplateStatus(id, {
                status: submitResult.status || 'PENDING',
                metaTemplateId: submitResult.id,
                rejectionReason: null
            }, companyId);
            res.status(200).json({
                success: true,
                message: 'Template submitted to Meta successfully.',
                data: updated
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: err instanceof Error ? err.message : 'Error submitting template to Meta'
            });
        }
    }
    async syncMetaTemplates(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const metaRes = await metaApiClient.getTemplates(companyId);
            if (!metaRes.success) {
                res.status(400).json({ success: false, error: metaRes.error });
                return;
            }
            const metaTemplates = metaRes.data || [];
            let syncedCount = 0;
            for (const tmpl of metaTemplates) {
                await crmRepository.upsertMetaTemplate(tmpl, companyId);
                syncedCount++;
            }
            const allTemplates = await crmRepository.getTemplates(companyId);
            res.status(200).json({
                success: true,
                message: `Successfully synchronized ${syncedCount} template(s) from Meta Cloud API.`,
                data: allTemplates
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: err instanceof Error ? err.message : 'Failed to sync templates with Meta'
            });
        }
    }
    async duplicateTemplate(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const source = await crmRepository.getTemplateById(id, companyId);
            if (!source) {
                res.status(404).json({ success: false, error: 'Source template not found' });
                return;
            }
            const copySuffix = Date.now().toString().slice(-4);
            const newName = `${source.name}_copy_${copySuffix}`.slice(0, 50);
            const duplicated = await crmRepository.saveTemplateDraft({
                name: newName,
                category: source.category,
                language: source.language,
                headerType: source.headerType,
                headerContent: source.headerContent,
                headerExample: source.headerExample,
                bodyText: source.bodyText,
                bodyExampleValues: source.bodyExampleValues,
                footerText: source.footerText,
                buttons: source.buttons,
                status: 'DRAFT'
            }, companyId);
            res.status(201).json({ success: true, data: duplicated });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: err instanceof Error ? err.message : 'Failed to duplicate template'
            });
        }
    }
    async deleteTemplate(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const id = String(req.params.id);
            const template = await crmRepository.getTemplateById(id, companyId);
            if (!template) {
                res.status(404).json({ success: false, error: 'Template not found' });
                return;
            }
            // If template was already submitted to Meta and approved/pending, attempt to delete on Meta
            if (template.metaTemplateId || template.status === 'APPROVED' || template.status === 'PENDING') {
                try {
                    await metaApiClient.deleteTemplate(template.name, companyId);
                }
                catch (metaErr) {
                    console.warn('[CrmController] Meta template deletion warning:', metaErr);
                }
            }
            await crmRepository.deleteTemplate(id, companyId);
            res.status(200).json({ success: true, message: 'Template deleted successfully' });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: err instanceof Error ? err.message : 'Failed to delete template'
            });
        }
    }
    async getHealth(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const health = await metaApiClient.checkConnectionHealth(companyId);
            res.status(200).json({ success: true, data: health });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error checking health' });
        }
    }
    async getAnalytics(req, res) {
        try {
            const companyId = req.user?.company_id || 'company-a';
            const summary = await crmRepository.getAnalyticsSummary(companyId);
            res.status(200).json({ success: true, data: summary });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch analytics' });
        }
    }
}
export const crmController = new CrmController();
//# sourceMappingURL=crmController.js.map
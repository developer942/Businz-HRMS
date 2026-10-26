import { customerRepository } from '../repositories/customerRepository.js';
import { whatsappService } from '../services/whatsappService.js';
import { ocrService } from '../services/ocrService.js';
import { saveCustomerSchema, recordConsentSchema, sendWhatsAppSchema, saveTemplateSchema, ocrScanSchema } from '../validators/customerValidators.js';
export class CustomerController {
    // 1. Get Customers List
    async getCustomers(req, res) {
        try {
            const companyId = req.query.companyId || req.user?.company_id || 'company-a';
            const search = req.query.search;
            const employeeName = req.query.employeeName;
            const collectedFrom = req.query.collectedFrom;
            const collectedTo = req.query.collectedTo;
            const consentStatus = req.query.consentStatus;
            const page = req.query.page ? parseInt(req.query.page, 10) : 1;
            const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 10;
            const result = await customerRepository.getCustomers({
                companyId,
                search,
                employeeName,
                collectedFrom,
                collectedTo,
                consentStatus,
                page,
                pageSize
            });
            res.status(200).json({
                success: true,
                data: result
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 2. Get Single Customer
    async getCustomerById(req, res) {
        try {
            const companyId = req.query.companyId || req.user?.company_id || 'company-a';
            const paramId = req.params.id;
            const customerId = Array.isArray(paramId) ? paramId[0] : paramId;
            const customer = await customerRepository.getCustomerById(customerId, companyId);
            if (!customer) {
                res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Customer record not found' }
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: customer
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 3. Check Duplicate Customer by Phone
    async checkDuplicate(req, res) {
        try {
            const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
            const phone = (req.query.contactNumber || req.query.phone);
            const excludeId = req.query.excludeId;
            if (!phone) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_INPUT', message: 'Phone number is required' }
                });
                return;
            }
            const duplicate = await customerRepository.findDuplicateCustomer(companyId, phone, excludeId);
            res.status(200).json({
                success: true,
                data: {
                    isDuplicate: Boolean(duplicate),
                    existingCustomer: duplicate
                }
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 4. Save / Update Customer
    async saveCustomer(req, res) {
        try {
            const parsed = saveCustomerSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid customer fields',
                        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
                    }
                });
                return;
            }
            const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
            // Check for duplicate phone
            const duplicate = await customerRepository.findDuplicateCustomer(companyId, parsed.data.contactNumber, parsed.data.id);
            if (duplicate && !parsed.data.id) {
                res.status(409).json({
                    success: false,
                    error: {
                        code: 'DUPLICATE_CUSTOMER',
                        message: `A customer with number ${parsed.data.contactNumber} already exists (${duplicate.customerName} - ${duplicate.customerId}).`,
                        existingCustomer: duplicate
                    }
                });
                return;
            }
            const collectedByName = req.user?.name || req.user?.employeeId || 'Employee';
            const collectedById = req.user?.id;
            const saved = await customerRepository.saveCustomer({
                ...parsed.data,
                customerId: parsed.data.id ? parsed.data.customerId : undefined,
                companyId,
                collectedByName,
                collectedById,
                collectedDate: parsed.data.collectedDate || new Date().toISOString().split('T')[0],
                email: parsed.data.email || undefined,
                companyName: parsed.data.companyName || undefined,
                designation: parsed.data.designation || undefined,
                alternateContactNumber: parsed.data.alternateContactNumber || undefined,
                address: parsed.data.address || undefined,
                website: parsed.data.website || undefined,
                visitingCardUrl: parsed.data.visitingCardUrl || undefined,
                notes: parsed.data.notes || undefined,
                consentTimestamp: parsed.data.consentStatus === 'Opted In' ? (parsed.data.consentTimestamp || new Date().toISOString()) : undefined,
                consentSource: parsed.data.consentStatus === 'Opted In' ? (parsed.data.consentSource || 'Visiting Card Submission') : undefined,
                consentPurpose: parsed.data.consentStatus === 'Opted In' ? (parsed.data.consentPurpose || 'Business Communications') : undefined
            });
            res.status(201).json({
                success: true,
                data: saved,
                message: 'Customer saved successfully'
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 5. Record WhatsApp Consent
    async recordConsent(req, res) {
        try {
            const parsed = recordConsentSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid consent data' }
                });
                return;
            }
            const record = await customerRepository.recordConsent({
                ...parsed.data,
                recordedById: req.user?.id,
                recordedByName: req.user?.name,
                ipAddress: req.ip
            });
            res.status(200).json({
                success: true,
                data: record,
                message: 'Consent record updated'
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 6. OCR Visiting Card Scan
    async scanCardOcr(req, res) {
        try {
            const parsed = ocrScanSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid image format or payload' }
                });
                return;
            }
            const extracted = await ocrService.extractCardDetails(parsed.data.imageBase64, parsed.data.mimeType, parsed.data.geminiApiKey, parsed.data.ocrModel);
            res.status(200).json({
                success: true,
                data: extracted
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'OCR_ERROR', message: err.message }
            });
        }
    }
    // 7. Get WhatsApp Templates
    async getTemplates(req, res) {
        try {
            const companyId = req.query.companyId || req.user?.company_id || 'company-a';
            const templates = await customerRepository.getTemplates(companyId);
            res.status(200).json({
                success: true,
                data: templates
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 8. Save / Update WhatsApp Template
    async saveTemplate(req, res) {
        try {
            const parsed = saveTemplateSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid template structure' }
                });
                return;
            }
            const companyId = parsed.data.companyId || req.user?.company_id || 'company-a';
            const saved = await customerRepository.saveTemplate({
                ...parsed.data,
                companyId,
                createdById: req.user?.id
            });
            res.status(201).json({
                success: true,
                data: saved,
                message: 'Template saved successfully'
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 9. Submit Template to Meta for Approval
    async submitTemplate(req, res) {
        try {
            const companyId = req.body.companyId || req.user?.company_id || 'company-a';
            const templateId = req.params.id;
            const templates = await customerRepository.getTemplates(companyId);
            const target = templates.find(t => t.id === templateId);
            if (!target) {
                res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Template not found' }
                });
                return;
            }
            const result = await whatsappService.submitTemplateToMeta(companyId, target);
            if (!result.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'META_REJECTION', message: result.error || 'Failed to submit template to Meta' }
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: result,
                message: 'Template submitted to Meta for review'
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 10. Check Template Approval Status with Meta
    async checkTemplateStatus(req, res) {
        try {
            const companyId = req.query.companyId || req.user?.company_id || 'company-a';
            const paramId = req.params.id || req.params.name;
            const templateId = Array.isArray(paramId) ? paramId[0] : paramId;
            const templates = await customerRepository.getTemplates(companyId);
            const target = templates.find(t => t.id === templateId || t.metaTemplateName === templateId);
            if (!target) {
                res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Template not found' }
                });
                return;
            }
            const updated = await whatsappService.syncTemplateStatus(companyId, target);
            res.status(200).json({
                success: true,
                data: updated
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 11. Send WhatsApp Template Message
    async sendMessage(req, res) {
        try {
            const parsed = sendWhatsAppSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid sending parameters' }
                });
                return;
            }
            const companyId = parsed.data.companyId || req.user?.company_id || 'company-a';
            // 1. Verify Customer exists and consent status
            if (parsed.data.customerContactId) {
                const customer = await customerRepository.getCustomerById(parsed.data.customerContactId, companyId);
                if (customer && customer.consentStatus !== 'Opted In') {
                    res.status(403).json({
                        success: false,
                        error: {
                            code: 'CONSENT_REQUIRED',
                            message: `Customer "${customer.customerName}" has not opted in for WhatsApp messages (Current status: ${customer.consentStatus}). You must obtain explicit permission before sending.`
                        }
                    });
                    return;
                }
            }
            // 2. Find and verify template
            const templates = await customerRepository.getTemplates(companyId);
            const template = templates.find(t => t.id === parsed.data.templateId || t.metaTemplateName === parsed.data.templateId);
            if (!template) {
                res.status(404).json({
                    success: false,
                    error: { code: 'TEMPLATE_NOT_FOUND', message: 'Selected template does not exist' }
                });
                return;
            }
            if (template.status !== 'APPROVED') {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'TEMPLATE_NOT_APPROVED',
                        message: `Template "${template.templateName}" is currently ${template.status}. Only APPROVED templates can be dispatched.`
                    }
                });
                return;
            }
            // 3. Dispatch Message
            const result = await whatsappService.sendTemplateMessage({
                companyId,
                customerContactId: parsed.data.customerContactId,
                customerName: parsed.data.customerName,
                recipientPhone: parsed.data.recipientPhone,
                template,
                variableValues: parsed.data.variableValues,
                sentById: req.user?.id,
                sentByName: req.user?.name || 'Authorized Staff'
            });
            if (!result.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'SEND_FAILED', message: result.error || 'Failed to dispatch WhatsApp message' }
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: result,
                message: 'WhatsApp message dispatched successfully'
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 12. Get WhatsApp Message History
    async getMessageHistory(req, res) {
        try {
            const companyId = req.query.companyId || req.user?.company_id || 'company-a';
            const customerName = req.query.customerName;
            const employeeName = req.query.employeeName;
            const templateName = req.query.templateName;
            const status = req.query.status;
            const dateFrom = req.query.dateFrom;
            const dateTo = req.query.dateTo;
            const page = req.query.page ? parseInt(req.query.page, 10) : 1;
            const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 15;
            const history = await customerRepository.getMessages({
                companyId,
                customerName,
                employeeName,
                templateName,
                status,
                dateFrom,
                dateTo,
                page,
                pageSize
            });
            res.status(200).json({
                success: true,
                data: history
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 13. Get WhatsApp Integration Status
    async getWhatsAppConfig(req, res) {
        try {
            const companyId = req.query.companyId || req.user?.company_id || 'company-a';
            const config = await whatsappService.getCompanyWhatsAppConfig(companyId);
            res.status(200).json({
                success: true,
                data: {
                    isConfigured: Boolean(config && config.phoneNumberId && config.accessToken),
                    phoneNumberId: config?.phoneNumberId || '',
                    wabaId: config?.wabaId || '',
                    webhookSecret: config?.webhookSecret ? '••••••••' : ''
                    // Access token is NEVER returned to client
                }
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message }
            });
        }
    }
    // 14. Test WhatsApp Config Handshake on Backend (without saving)
    async testWhatsAppConnection(req, res) {
        try {
            const { phoneNumberId, wabaId, accessToken, webhookSecret } = req.body;
            const cleanPhoneId = typeof phoneNumberId === 'string' ? phoneNumberId.trim() : String(phoneNumberId || '').trim();
            const cleanWabaId = typeof wabaId === 'string' ? wabaId.trim() : String(wabaId || '').trim();
            const cleanToken = typeof accessToken === 'string' ? accessToken.trim() : String(accessToken || '').trim();
            const cleanSecret = typeof webhookSecret === 'string' ? webhookSecret.trim() : String(webhookSecret || '').trim();
            if (!cleanPhoneId) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Phone Number ID is required.' }
                });
                return;
            }
            if (!/^\d+$/.test(cleanPhoneId)) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Phone Number ID must contain only digits (0–9). Letters, spaces, and special characters are rejected.' }
                });
                return;
            }
            if (!cleanWabaId) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Business Account ID (WABA ID) is required.' }
                });
                return;
            }
            if (!/^\d+$/.test(cleanWabaId)) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Business Account ID (WABA ID) must contain only digits (0–9). Alphabetic and special characters are rejected.' }
                });
                return;
            }
            if (!cleanToken) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Permanent Access Token is required.' }
                });
                return;
            }
            if (!cleanSecret) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Webhook Verification Token is required.' }
                });
                return;
            }
            const config = {
                phoneNumberId: cleanPhoneId,
                wabaId: cleanWabaId,
                accessToken: cleanToken,
                webhookSecret: cleanSecret
            };
            const testRes = await whatsappService.testConnection(config);
            if (!testRes.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'HANDSHAKE_FAILED', message: testRes.message }
                });
                return;
            }
            res.status(200).json({
                success: true,
                message: testRes.message,
                verifiedNumber: testRes.verifiedNumber,
                accountName: testRes.accountName
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message || 'Server error testing connection' }
            });
        }
    }
    // 15. Save and Test WhatsApp Config on Backend
    async saveWhatsAppConfig(req, res) {
        try {
            const companyId = req.body.companyId || req.user?.company_id || 'company-a';
            const { phoneNumberId, wabaId, accessToken, webhookSecret } = req.body;
            const cleanPhoneId = typeof phoneNumberId === 'string' ? phoneNumberId.trim() : String(phoneNumberId || '').trim();
            const cleanWabaId = typeof wabaId === 'string' ? wabaId.trim() : String(wabaId || '').trim();
            const cleanToken = typeof accessToken === 'string' ? accessToken.trim() : String(accessToken || '').trim();
            const cleanSecret = typeof webhookSecret === 'string' ? webhookSecret.trim() : String(webhookSecret || '').trim();
            if (!cleanPhoneId) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Phone Number ID is required.' }
                });
                return;
            }
            if (!/^\d+$/.test(cleanPhoneId)) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Phone Number ID must contain only digits (0–9). Letters, spaces, and special characters are rejected.' }
                });
                return;
            }
            if (!cleanWabaId) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Business Account ID (WABA ID) is required.' }
                });
                return;
            }
            if (!/^\d+$/.test(cleanWabaId)) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'WhatsApp Business Account ID (WABA ID) must contain only digits (0–9). Alphabetic and special characters are rejected.' }
                });
                return;
            }
            if (!cleanToken) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Permanent Access Token is required.' }
                });
                return;
            }
            if (!cleanSecret) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Webhook Verification Token is required.' }
                });
                return;
            }
            const config = {
                phoneNumberId: cleanPhoneId,
                wabaId: cleanWabaId,
                accessToken: cleanToken,
                webhookSecret: cleanSecret
            };
            const testRes = await whatsappService.testConnection(config);
            if (!testRes.success) {
                res.status(400).json({
                    success: false,
                    error: { code: 'HANDSHAKE_FAILED', message: testRes.message }
                });
                return;
            }
            await whatsappService.saveCompanyWhatsAppConfig(companyId, config);
            res.status(200).json({
                success: true,
                message: testRes.message,
                verifiedNumber: testRes.verifiedNumber,
                accountName: testRes.accountName
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: err.message || 'Server error saving configuration' }
            });
        }
    }
    // 16. Meta Webhook Verification Handshake (GET)
    async verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET || 'vrm_wa_webhook_sec_2026';
        let isValid = (token === expectedSecret || token === 'businz_hrms_meta_token');
        if (!isValid && token) {
            try {
                const companyConfig = await whatsappService.getCompanyWhatsAppConfig('company-a');
                if (companyConfig?.webhookSecret && token === companyConfig.webhookSecret) {
                    isValid = true;
                }
            }
            catch { }
        }
        if (mode === 'subscribe' && isValid) {
            res.status(200).send(challenge);
        }
        else {
            res.status(403).send('Forbidden verification token');
        }
    }
    // 16. Meta Webhook Ingestion (POST)
    async handleWebhook(req, res) {
        try {
            // Immediately acknowledge HTTP 200 OK to Meta to prevent timeout/retries
            res.status(200).json({ status: 'received' });
            // Process delivery status asynchronously
            await whatsappService.handleWebhookPayload(req.body);
        }
        catch (err) {
            console.error('Error handling Meta webhook:', err);
        }
    }
}
export const customerController = new CustomerController();
//# sourceMappingURL=customerController.js.map
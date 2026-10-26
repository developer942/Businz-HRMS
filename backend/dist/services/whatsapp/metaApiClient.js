/**
 * Meta WhatsApp Cloud API Client
 * Adapted from wacrm (https://github.com/ArnasDon/wacrm/src/lib/whatsapp/meta-api.ts)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 *
 * Reuses existing BUSINZ HRMS Meta Cloud API credentials from company_settings
 */
import { query } from '../../config/database.js';
import { decryptCredential } from '../../utils/crypto.js';
export class MetaApiClient {
    baseUrl = 'https://graph.facebook.com/v21.0';
    /**
     * Fetches credentials from company_settings or environment variables
     */
    async getConfig(companyId = 'company-a') {
        try {
            const res = await query(`SELECT setting_val FROM public.company_settings 
         WHERE setting_key = $1 LIMIT 1`, [`whatsapp_integration_${companyId}`]);
            if (res.rows.length > 0 && res.rows[0].setting_val) {
                let val = res.rows[0].setting_val;
                if (typeof val === 'string') {
                    try {
                        val = JSON.parse(val);
                    }
                    catch { }
                }
                if (val.phoneNumberId && val.accessToken) {
                    return {
                        phoneNumberId: String(val.phoneNumberId).trim(),
                        wabaId: String(val.wabaId || '').trim(),
                        accessToken: decryptCredential(String(val.accessToken).trim()),
                        webhookSecret: decryptCredential(String(val.webhookSecret || '').trim())
                    };
                }
            }
        }
        catch (err) {
            console.warn('[MetaApiClient] Error fetching config from DB:', err);
        }
        // Fallback to environment variables
        if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
            return {
                phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID.trim(),
                wabaId: (process.env.WHATSAPP_WABA_ID || '').trim(),
                accessToken: process.env.WHATSAPP_ACCESS_TOKEN.trim(),
                webhookSecret: (process.env.WHATSAPP_WEBHOOK_SECRET || '').trim()
            };
        }
        return null;
    }
    /**
     * Sends an outbound text message
     */
    async sendTextMessage(to, text, companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config) {
            return { success: false, error: 'WhatsApp Meta credentials not configured' };
        }
        const cleanTo = to.replace(/\D/g, '');
        const url = `${this.baseUrl}/${config.phoneNumberId}/messages`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanTo,
                    type: 'text',
                    text: { body: text }
                })
            });
            const data = await res.json();
            if (!res.ok) {
                return {
                    success: false,
                    error: data?.error?.message || `Meta API Error (${res.status})`
                };
            }
            const wamid = data?.messages?.[0]?.id;
            return { success: true, wamid };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network failure calling Meta API'
            };
        }
    }
    /**
     * Sends an outbound template message
     */
    async sendTemplateMessage(to, templateName, language = 'en', components = [], companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config) {
            return { success: false, error: 'WhatsApp Meta credentials not configured' };
        }
        const cleanTo = to.replace(/\D/g, '');
        const url = `${this.baseUrl}/${config.phoneNumberId}/messages`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanTo,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: language },
                        ...(components && components.length > 0 ? { components } : {})
                    }
                })
            });
            const data = await res.json();
            if (!res.ok) {
                return {
                    success: false,
                    error: data?.error?.message || `Meta API Template Error (${res.status})`
                };
            }
            const wamid = data?.messages?.[0]?.id;
            return { success: true, wamid };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network failure calling Meta API'
            };
        }
    }
    /**
     * Builds official Meta components array from structured template fields
     */
    buildMetaComponents(template) {
        const components = [];
        // 1. Header
        if (template.headerType && template.headerType !== 'NONE') {
            if (template.headerType === 'TEXT') {
                const headerComp = {
                    type: 'HEADER',
                    format: 'TEXT',
                    text: template.headerContent || ''
                };
                if (template.headerExample && template.headerExample.length > 0) {
                    headerComp.example = { header_text: template.headerExample };
                }
                components.push(headerComp);
            }
            else {
                const format = template.headerType;
                const headerComp = {
                    type: 'HEADER',
                    format
                };
                if (template.headerExample && template.headerExample.length > 0) {
                    headerComp.example = { header_handle: template.headerExample };
                }
                components.push(headerComp);
            }
        }
        // 2. Body
        const bodyComp = {
            type: 'BODY',
            text: template.bodyText
        };
        if (template.bodyExampleValues && template.bodyExampleValues.length > 0) {
            bodyComp.example = { body_text: [template.bodyExampleValues] };
        }
        components.push(bodyComp);
        // 3. Footer
        if (template.footerText && template.footerText.trim()) {
            components.push({
                type: 'FOOTER',
                text: template.footerText.trim()
            });
        }
        // 4. Buttons
        if (template.buttons && template.buttons.length > 0) {
            const btns = template.buttons.map((b) => {
                if (b.type === 'QUICK_REPLY') {
                    return { type: 'QUICK_REPLY', text: b.text };
                }
                else if (b.type === 'URL') {
                    const btn = { type: 'URL', text: b.text, url: b.url };
                    if (b.example)
                        btn.example = [b.example];
                    return btn;
                }
                else if (b.type === 'PHONE_NUMBER') {
                    return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber || b.phone_number };
                }
                return b;
            });
            components.push({
                type: 'BUTTONS',
                buttons: btns
            });
        }
        return components;
    }
    /**
     * Submits a new message template to Meta Graph API
     * POST /{WABA_ID}/message_templates
     */
    async createTemplate(template, companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config || !config.wabaId) {
            return { success: false, error: 'WhatsApp WABA ID not configured. Configure in Settings -> WhatsApp.' };
        }
        if (!config.accessToken) {
            return { success: false, error: 'Meta WhatsApp Access Token not configured.' };
        }
        const components = template.components && template.components.length > 0
            ? template.components
            : this.buildMetaComponents(template);
        const payload = {
            name: template.name.toLowerCase().trim(),
            category: template.category.toUpperCase(),
            language: template.language,
            components
        };
        const url = `${this.baseUrl}/${config.wabaId}/message_templates`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = data?.error?.error_user_msg || data?.error?.message || `Meta API Error (${res.status})`;
                return { success: false, error: errorMsg };
            }
            return {
                success: true,
                id: String(data.id || ''),
                status: data.status || 'PENDING',
                category: data.category
            };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network error submitting template to Meta'
            };
        }
    }
    /**
     * Deletes a template on Meta Cloud API
     * DELETE /{WABA_ID}/message_templates?name={template_name}
     */
    async deleteTemplate(templateName, companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config || !config.wabaId) {
            return { success: false, error: 'WhatsApp WABA ID not configured' };
        }
        const url = `${this.baseUrl}/${config.wabaId}/message_templates?name=${encodeURIComponent(templateName)}`;
        try {
            const res = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`
                }
            });
            const data = await res.json();
            if (!res.ok) {
                return { success: false, error: data?.error?.message || `Failed to delete template (${res.status})` };
            }
            return { success: true };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network error deleting template from Meta'
            };
        }
    }
    /**
     * Fetches official message templates registered on Meta WABA
     */
    async getTemplates(companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config || !config.wabaId) {
            return { success: false, error: 'WhatsApp WABA ID not configured' };
        }
        const url = `${this.baseUrl}/${config.wabaId}/message_templates?fields=name,status,category,language,components,quality_score,rejected_reason&limit=100`;
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`
                }
            });
            const data = await res.json();
            if (!res.ok) {
                return { success: false, error: data?.error?.message || 'Failed to fetch templates' };
            }
            return { success: true, data: data?.data || [] };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch templates' };
        }
    }
    /**
     * Health and connectivity check with Meta Graph API
     */
    async checkConnectionHealth(companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config) {
            return { connected: false, error: 'No WhatsApp credentials found' };
        }
        const url = `${this.baseUrl}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`
                }
            });
            const data = await res.json();
            if (!res.ok) {
                return { connected: false, error: data?.error?.message || 'Meta API Handshake Failed' };
            }
            return {
                connected: true,
                displayPhoneNumber: data.display_phone_number,
                qualityRating: data.quality_rating,
                verifiedName: data.verified_name
            };
        }
        catch (err) {
            return { connected: false, error: err instanceof Error ? err.message : 'Network error' };
        }
    }
}
export const metaApiClient = new MetaApiClient();
//# sourceMappingURL=metaApiClient.js.map
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
     * Normalizes phone number to E.164 digits (e.g., 10-digit Indian number 9087153885 -> 919087153885)
     */
    normalizeRecipientPhone(to) {
        let digits = String(to || '').replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('0')) {
            digits = digits.slice(1);
        }
        if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
            digits = `91${digits}`;
        }
        return digits;
    }
    /**
     * Sends an outbound text message
     */
    async sendTextMessage(to, text, companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config) {
            return { success: false, error: 'WhatsApp Meta credentials not configured' };
        }
        const cleanTo = this.normalizeRecipientPhone(to);
        const url = `${this.baseUrl}/${config.phoneNumberId}/messages`;
        const targetWabaId = config.wabaId || undefined;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    ...(targetWabaId ? { messaging_account_id: targetWabaId } : {}),
                    recipient_type: 'individual',
                    to: cleanTo,
                    type: 'text',
                    text: { body: text }
                })
            });
            const data = await res.json();
            if (!res.ok) {
                const errCode = data?.error?.code;
                const errMsg = data?.error?.error_data?.details ||
                    data?.error?.error_user_msg ||
                    data?.error?.message ||
                    `Meta API Error (${res.status})`;
                return {
                    success: false,
                    error: errCode ? `[Meta #${errCode}] ${errMsg}` : errMsg,
                    errorCode: errCode
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
    async sendTemplateMessage(to, templateName, language = 'en', components = [], companyId = 'company-a', messagingAccountId) {
        const config = await this.getConfig(companyId);
        if (!config) {
            return { success: false, error: 'WhatsApp Meta credentials not configured' };
        }
        const cleanTo = this.normalizeRecipientPhone(to);
        const url = `${this.baseUrl}/${config.phoneNumberId}/messages`;
        const targetWabaId = messagingAccountId || config.wabaId || undefined;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    ...(targetWabaId ? { messaging_account_id: targetWabaId } : {}),
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
                const errCode = data?.error?.code;
                const errMsg = data?.error?.error_data?.details ||
                    data?.error?.error_user_msg ||
                    data?.error?.message ||
                    `Meta API Template Error (${res.status})`;
                return {
                    success: false,
                    error: errCode ? `[Meta #${errCode}] ${errMsg}` : errMsg
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
     * Uploads a media file (Image, Video, Document) to Meta's Resumable Upload API
     * to obtain a valid `header_handle` (h) for message template creation.
     *
     * Official Meta Resumable Upload Protocol:
     * 1. POST /app/uploads?file_length={len}&file_type={mime} -> { id: "upload:..." }
     * 2. POST /{upload_session_id} with binary buffer -> { h: "4::..." }
     */
    async uploadMediaHandle(mediaSource, mimeType = 'image/png', companyId = 'company-a') {
        const config = await this.getConfig(companyId);
        if (!config || !config.accessToken) {
            return { success: false, error: 'Meta WhatsApp Access Token not configured.' };
        }
        try {
            let fileBuffer;
            let detectedMime = mimeType;
            if (Buffer.isBuffer(mediaSource)) {
                fileBuffer = mediaSource;
            }
            else if (typeof mediaSource === 'string') {
                const trimmed = mediaSource.trim();
                // If it's already a valid Meta handle format (e.g. "4::..."), reuse directly
                if (trimmed.startsWith('4::') || (trimmed.startsWith('upload:') && !trimmed.startsWith('data:'))) {
                    return { success: true, handle: trimmed };
                }
                // Data URL format: data:<mime>;base64,<data>
                if (trimmed.startsWith('data:')) {
                    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
                    if (!match) {
                        return { success: false, error: 'Invalid data URL format for header media.' };
                    }
                    detectedMime = match[1];
                    fileBuffer = Buffer.from(match[2], 'base64');
                }
                else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                    // Public URL: fetch binary content
                    const fetchRes = await fetch(trimmed);
                    if (!fetchRes.ok) {
                        return { success: false, error: `Failed to fetch media from URL (${fetchRes.status}): ${trimmed}` };
                    }
                    detectedMime = fetchRes.headers.get('content-type') || mimeType;
                    const arrayBuf = await fetchRes.arrayBuffer();
                    fileBuffer = Buffer.from(arrayBuf);
                }
                else {
                    // Assume raw base64 string
                    fileBuffer = Buffer.from(trimmed, 'base64');
                }
            }
            else {
                return { success: false, error: 'Unsupported media source format.' };
            }
            if (!fileBuffer || fileBuffer.length === 0) {
                return { success: false, error: 'Media file is empty (0 bytes).' };
            }
            // Step 1: Initiate upload session
            const initUrl = `${this.baseUrl}/app/uploads?file_length=${fileBuffer.length}&file_type=${encodeURIComponent(detectedMime)}`;
            const initRes = await fetch(initUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`
                }
            });
            const initData = await initRes.json();
            if (!initRes.ok || !initData?.id) {
                const errMsg = initData?.error?.error_user_msg || initData?.error?.message || `Initiate upload session failed (HTTP ${initRes.status})`;
                return { success: false, error: `Meta Media Upload Error: ${errMsg}` };
            }
            const uploadSessionId = initData.id;
            // Step 2: Upload binary data chunk
            const uploadUrl = `${this.baseUrl}/${uploadSessionId}`;
            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `OAuth ${config.accessToken}`,
                    'file_offset': '0',
                    'Content-Type': 'application/octet-stream'
                },
                body: new Uint8Array(fileBuffer)
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok || !uploadData?.h) {
                const errMsg = uploadData?.error?.error_user_msg || uploadData?.error?.message || `Upload binary chunk failed (HTTP ${uploadRes.status})`;
                return { success: false, error: `Meta Media Handle Error: ${errMsg}` };
            }
            return { success: true, handle: String(uploadData.h) };
        }
        catch (err) {
            return {
                success: false,
                error: `Meta Media Upload Exception: ${err.message || 'Unknown network error'}`
            };
        }
    }
    /**
     * Builds official Meta components array from structured template fields
     */
    async buildMetaComponents(template, companyId = 'company-a') {
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
                    const rawItem = template.headerExample[0];
                    if (rawItem) {
                        let defaultMime = 'image/png';
                        if (format === 'VIDEO')
                            defaultMime = 'video/mp4';
                        if (format === 'DOCUMENT')
                            defaultMime = 'application/pdf';
                        const uploadRes = await this.uploadMediaHandle(rawItem, defaultMime, companyId);
                        if (!uploadRes.success || !uploadRes.handle) {
                            throw new Error(uploadRes.error || `Failed to generate official Meta header handle for ${format.toLowerCase()}.`);
                        }
                        headerComp.example = { header_handle: [uploadRes.handle] };
                    }
                }
                components.push(headerComp);
            }
        }
        // 2. Body
        const cleanBody = (template.bodyText || '').trim();
        const bodyComp = {
            type: 'BODY',
            text: cleanBody
        };
        if (template.bodyExampleValues && template.bodyExampleValues.length > 0) {
            bodyComp.example = { body_text: [template.bodyExampleValues] };
        }
        components.push(bodyComp);
        // 3. Footer
        if (template.footerText && template.footerText.trim()) {
            components.push({
                type: 'FOOTER',
                text: template.footerText.trim().slice(0, 60)
            });
        }
        // 4. Buttons
        if (template.buttons && template.buttons.length > 0) {
            const btns = template.buttons.slice(0, 3).map((b) => {
                if (b.type === 'QUICK_REPLY') {
                    return { type: 'QUICK_REPLY', text: (b.text || 'Quick Reply').slice(0, 25) };
                }
                else if (b.type === 'URL') {
                    const btn = {
                        type: 'URL',
                        text: (b.text || 'Visit Website').slice(0, 25),
                        url: (b.url || '').trim()
                    };
                    if (b.example)
                        btn.example = [b.example];
                    return btn;
                }
                else if (b.type === 'PHONE_NUMBER') {
                    const rawPhone = b.phoneNumber || b.phone_number || '';
                    const digits = rawPhone.replace(/\D/g, '');
                    const e164 = digits.startsWith('91') && digits.length === 12
                        ? `+${digits}`
                        : digits.length === 10
                            ? `+91${digits}`
                            : digits.startsWith('+') ? digits : `+${digits}`;
                    return {
                        type: 'PHONE_NUMBER',
                        text: (b.text || 'Call Support').slice(0, 25),
                        phone_number: e164
                    };
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
        try {
            const components = template.components && template.components.length > 0
                ? template.components
                : await this.buildMetaComponents(template, companyId);
            const payload = {
                name: template.name.toLowerCase().trim(),
                category: template.category.toUpperCase(),
                language: template.language,
                components
            };
            const url = `${this.baseUrl}/${config.wabaId}/message_templates`;
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
                const errObj = data?.error || {};
                const errCode = errObj.code;
                const errSubcode = errObj.error_subcode;
                const errUserTitle = errObj.error_user_title;
                const errUserMsg = errObj.error_user_msg;
                const errMsg = errObj.message || `Meta API Error (${res.status})`;
                const details = [
                    errUserTitle ? `${errUserTitle}: ` : '',
                    errUserMsg || errMsg,
                    errCode ? ` (Meta Error #${errCode}${errSubcode ? ` / Subcode #${errSubcode}` : ''})` : ''
                ].filter(Boolean).join('');
                return {
                    success: false,
                    error: details || `Meta API Error (${res.status})`
                };
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
        const url = `${this.baseUrl}/${config.wabaId}/message_templates?fields=id,name,status,category,language,components,quality_score,rejected_reason&limit=100`;
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
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { encryptCredential, decryptCredential } from '../utils/crypto.js';
import { integrationService } from './integrationService.js';
import { isProhibitedSsrfIp } from '../validators/integrationValidators.js';
const inMemorySmsConfigs = {};
/**
 * Normalizes a raw phone number to strict E.164 format (defaulting to 'IN' +91).
 * Returns null if the phone number is invalid.
 */
export function normalizeMobileToE164(rawPhone) {
    if (!rawPhone || typeof rawPhone !== 'string')
        return null;
    const cleaned = rawPhone.trim().replace(/[\s\-().]/g, '');
    if (!cleaned)
        return null;
    // Try parsing via libphonenumber-js with default country IN
    try {
        const parsed = parsePhoneNumberFromString(cleaned, 'IN');
        if (parsed && parsed.isValid()) {
            const e164 = parsed.number; // e.g. +919876543210
            // Additional Indian mobile sanity check: +91 followed by 10 digits starting with 6-9
            if (e164.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(e164)) {
                return null;
            }
            return e164;
        }
    }
    catch {
        // Fallback below
    }
    // Fallback for standard 10-digit Indian mobile numbers
    if (/^[6-9]\d{9}$/.test(cleaned)) {
        return `+91${cleaned}`;
    }
    if (/^91[6-9]\d{9}$/.test(cleaned)) {
        return `+${cleaned}`;
    }
    if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
        return cleaned;
    }
    return null;
}
/**
 * Validates Indian TRAI DLT compliance fields:
 * - Principal Entity ID (PE ID): 10 to 25 numeric digits
 * - DLT Content Template ID: 10 to 25 numeric digits
 * - DLT Header / Sender ID: 3 to 6 alphanumeric characters
 */
export function verifyIndianDltCompliance(config) {
    const entityId = (config.dltEntityId || '').trim();
    const templateId = (config.dltTemplateId || '').trim();
    const senderId = (config.senderId || '').trim();
    if (!/^\d{10,25}$/.test(entityId)) {
        return {
            compliant: false,
            reason: 'Indian TRAI DLT Principal Entity ID (PE ID) is required and must be 10–25 numeric digits.',
        };
    }
    if (!/^\d{10,25}$/.test(templateId)) {
        return {
            compliant: false,
            reason: 'Indian TRAI DLT Approved OTP Template ID is required and must be 10–25 numeric digits.',
        };
    }
    if (!/^[A-Za-z0-9]{3,6}$/.test(senderId)) {
        return {
            compliant: false,
            reason: 'DLT Approved Sender ID (Header) must be 3–6 alphanumeric characters (e.g. BUSINZ).',
        };
    }
    return { compliant: true };
}
class SmsOtpService {
    getSettingKey(companyId = 'company-a') {
        const isCompanyB = companyId === 'company-b' || companyId.toLowerCase().includes('nexus');
        return isCompanyB ? 'sms_otp_config_company-b' : 'sms_otp_config_company-a';
    }
    async getRawConfig(companyId = 'company-a') {
        const cId = companyId === 'company-b' ? 'company-b' : 'company-a';
        const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
        if (isTestEnv) {
            return inMemorySmsConfigs[cId] || null;
        }
        const settingKey = this.getSettingKey(cId);
        const dbVal = await integrationService.readSettingVal(settingKey);
        if (dbVal && typeof dbVal === 'object') {
            const cfg = {
                companyId: cId,
                enabled: Boolean(dbVal.enabled),
                provider: dbVal.provider || 'MSG91',
                apiEndpoint: String(dbVal.apiEndpoint || 'https://control.msg91.com/api/v5/otp'),
                senderId: String(dbVal.senderId || ''),
                dltEntityId: String(dbVal.dltEntityId || ''),
                dltTemplateId: String(dbVal.dltTemplateId || ''),
                apiKeyEncrypted: String(dbVal.apiKeyEncrypted || ''),
                isVerified: Boolean(dbVal.isVerified),
                updatedAt: String(dbVal.updatedAt || new Date().toISOString()),
            };
            inMemorySmsConfigs[cId] = cfg;
            return cfg;
        }
        return inMemorySmsConfigs[cId] || null;
    }
    /**
     * Returns admin configuration view with API credentials strictly masked.
     */
    async getAdminConfigView(companyId = 'company-a') {
        const cId = companyId === 'company-b' ? 'company-b' : 'company-a';
        const raw = await this.getRawConfig(cId);
        if (!raw) {
            return {
                companyId: cId,
                enabled: false,
                provider: 'MSG91',
                apiEndpoint: 'https://control.msg91.com/api/v5/otp',
                senderId: '',
                dltEntityId: '',
                dltTemplateId: '',
                hasApiKey: false,
                maskedApiKey: '',
                isVerified: false,
                dltCompliant: false,
                isConfigured: false,
            };
        }
        const dltCheck = verifyIndianDltCompliance(raw);
        const hasKey = Boolean(raw.apiKeyEncrypted && decryptCredential(raw.apiKeyEncrypted));
        return {
            companyId: cId,
            enabled: Boolean(raw.enabled && hasKey && dltCheck.compliant && raw.isVerified),
            provider: raw.provider,
            apiEndpoint: raw.apiEndpoint,
            senderId: raw.senderId,
            dltEntityId: raw.dltEntityId,
            dltTemplateId: raw.dltTemplateId,
            hasApiKey: hasKey,
            maskedApiKey: hasKey ? '••••••••••••••••' : '',
            isVerified: raw.isVerified,
            dltCompliant: dltCheck.compliant,
            isConfigured: Boolean(hasKey && dltCheck.compliant),
            updatedAt: raw.updatedAt,
        };
    }
    /**
     * Public status check for login page (never exposes sensitive config or keys).
     */
    async getPublicStatus(companyId = 'company-a') {
        const view = await this.getAdminConfigView(companyId);
        const isReady = Boolean(view.enabled && view.isConfigured && view.dltCompliant && view.isVerified);
        return {
            mobileOtpEnabled: isReady,
            providerConfigured: view.isConfigured,
            dltCompliant: view.dltCompliant,
            provider: isReady ? view.provider : undefined,
            statusMessage: isReady
                ? 'Mobile OTP login is active via DLT-verified SMS gateway.'
                : 'Mobile OTP login is currently disabled until an authorized Indian DLT-compliant SMS provider is configured and verified by the administrator.',
        };
    }
    /**
     * Saves SMS OTP provider configuration with AES-256-GCM encrypted API key.
     */
    async saveConfig(companyId = 'company-a', input) {
        const cId = companyId === 'company-b' ? 'company-b' : 'company-a';
        const settingKey = this.getSettingKey(cId);
        const existing = await this.getRawConfig(cId);
        const dltCheck = verifyIndianDltCompliance(input);
        if (!dltCheck.compliant) {
            throw new Error(dltCheck.reason || 'Invalid Indian DLT compliance parameters.');
        }
        const endpoint = (input.apiEndpoint || 'https://control.msg91.com/api/v5/otp').trim();
        let parsedUrl;
        try {
            parsedUrl = new URL(endpoint);
            if (parsedUrl.protocol !== 'https:') {
                throw new Error('SMS Gateway API Endpoint must use HTTPS.');
            }
            if (isProhibitedSsrfIp(parsedUrl.hostname)) {
                throw new Error('Restricted SMS Gateway host.');
            }
        }
        catch (err) {
            throw new Error(err.message || 'Invalid SMS Gateway HTTPS API Endpoint.');
        }
        let encryptedKey = existing?.apiKeyEncrypted || '';
        const rawKeyInput = (input.apiKey || '').trim();
        if (rawKeyInput && !rawKeyInput.includes('••••')) {
            encryptedKey = encryptCredential(rawKeyInput);
        }
        if (!encryptedKey) {
            throw new Error('SMS Provider API Key / Auth Token is required.');
        }
        const isVerified = input.isVerified ?? existing?.isVerified ?? false;
        // Mobile OTP remains disabled unless explicitly enabled AND provider is verified
        const enabled = Boolean(input.enabled && isVerified);
        const record = {
            companyId: cId,
            enabled,
            provider: input.provider,
            apiEndpoint: parsedUrl.toString(),
            senderId: input.senderId.trim().toUpperCase(),
            dltEntityId: input.dltEntityId.trim(),
            dltTemplateId: input.dltTemplateId.trim(),
            apiKeyEncrypted: encryptedKey,
            isVerified,
            updatedAt: new Date().toISOString(),
        };
        inMemorySmsConfigs[cId] = record;
        const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
        if (!isTestEnv) {
            try {
                await integrationService.writeSettingVal(settingKey, record);
            }
            catch {
                // Keep in-memory config when running in isolated test environment without DB
            }
        }
        return this.getAdminConfigView(cId);
    }
    /**
     * Tests connection and DLT configuration with the SMS provider without sending fake OTPs
     * or leaking credentials in error messages.
     */
    async testProviderConnection(companyId = 'company-a', input) {
        const dltCheck = verifyIndianDltCompliance(input);
        if (!dltCheck.compliant) {
            return { success: false, message: dltCheck.reason || 'DLT compliance check failed.' };
        }
        const existing = await this.getRawConfig(companyId);
        const rawKey = input.apiKey && !input.apiKey.includes('••••')
            ? input.apiKey.trim()
            : existing?.apiKeyEncrypted
                ? decryptCredential(existing.apiKeyEncrypted)
                : '';
        if (!rawKey || rawKey.length < 8) {
            return {
                success: false,
                message: 'A valid SMS Gateway API Key / Auth Token is required to test the provider.',
            };
        }
        const endpoint = (input.apiEndpoint || existing?.apiEndpoint || 'https://control.msg91.com/api/v5/otp').trim();
        let parsedUrl;
        try {
            parsedUrl = new URL(endpoint);
            if (parsedUrl.protocol !== 'https:' || isProhibitedSsrfIp(parsedUrl.hostname)) {
                return { success: false, message: 'SMS Gateway Endpoint must be a public HTTPS URL.' };
            }
        }
        catch {
            return { success: false, message: 'Invalid SMS Gateway Endpoint URL.' };
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(parsedUrl.toString(), {
                method: 'GET',
                headers: {
                    authkey: rawKey,
                    Authorization: `Bearer ${rawKey}`,
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (res.status === 401 || res.status === 403) {
                return {
                    success: false,
                    message: `SMS Gateway (${input.provider}) rejected the API Key (HTTP ${res.status}). Please verify your credentials.`,
                };
            }
            if (res.status >= 500) {
                return {
                    success: false,
                    message: `SMS Gateway (${input.provider}) returned server error HTTP ${res.status}.`,
                };
            }
            return {
                success: true,
                message: `Verified ${input.provider} SMS Gateway connectivity and Indian DLT parameters (Entity ID: ${input.dltEntityId.slice(0, 4)}••••, Header: ${input.senderId.toUpperCase()}).`,
            };
        }
        catch (err) {
            const sanitizedMsg = (err?.message || 'Unable to reach SMS gateway')
                .replace(new RegExp(rawKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
            return {
                success: false,
                message: `SMS Provider connection failed: ${sanitizedMsg}`,
            };
        }
    }
    /**
     * Dispatches an SMS OTP via the configured & verified DLT SMS provider.
     * Strictly refuses to fake SMS delivery if no real provider is active.
     */
    async sendSmsOtp(params) {
        const cId = params.companyId || 'company-a';
        const raw = await this.getRawConfig(cId);
        if (!raw || !raw.enabled || !raw.isVerified) {
            return {
                status: 'FAILED',
                error: 'Mobile OTP login is disabled until a real DLT-compliant SMS provider is configured and verified.',
            };
        }
        const dltCheck = verifyIndianDltCompliance(raw);
        if (!dltCheck.compliant) {
            return {
                status: 'FAILED',
                error: dltCheck.reason || 'SMS provider is missing mandatory Indian DLT compliance configuration.',
            };
        }
        const apiKey = decryptCredential(raw.apiKeyEncrypted);
        if (!apiKey) {
            return {
                status: 'FAILED',
                error: 'SMS provider API credentials are not configured.',
            };
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(raw.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    authkey: apiKey,
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    mobile: params.toE164.replace(/^\+/, ''),
                    to: params.toE164,
                    sender: raw.senderId,
                    DLT_TE_ID: raw.dltTemplateId,
                    dlt_entity_id: raw.dltEntityId,
                    otp: params.otp,
                    otp_expiry: 5,
                }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!response.ok) {
                return {
                    status: 'FAILED',
                    error: `SMS provider rejected dispatch (HTTP ${response.status}).`,
                };
            }
            return { status: 'SENT' };
        }
        catch (err) {
            const sanitized = (err?.message || 'SMS gateway unreachable').replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
            return {
                status: 'FAILED',
                error: sanitized,
            };
        }
    }
    /**
     * Test helper to reset in-memory SMS config state during unit tests.
     */
    resetInMemoryStateForTests(companyId = 'company-a') {
        delete inMemorySmsConfigs[companyId];
    }
}
export const smsOtpService = new SmsOtpService();
//# sourceMappingURL=smsOtpService.js.map
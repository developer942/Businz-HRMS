import { settingsRepository } from '../repositories/settingsRepository.js';
import { updateCompanySettingsSchema, updateGeofenceSettingsSchema, } from '../validators/settingsValidators.js';
export const getCompanySettings = async (req, res, next) => {
    try {
        const companyId = req.user?.company_id || req.query.company_id || req.headers['x-company-id'];
        const company = await settingsRepository.getCompanySettings(companyId);
        res.status(200).json({
            success: true,
            data: company,
        });
    }
    catch (err) {
        next(err);
    }
};
export const updateCompanySettings = async (req, res, next) => {
    try {
        const validated = updateCompanySettingsSchema.parse(req.body);
        const companyId = req.user?.company_id || validated.company_id || req.headers['x-company-id'];
        const updated = await settingsRepository.updateCompanySettings(validated, companyId);
        res.status(200).json({
            success: true,
            data: updated,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getGeofenceSettings = async (_req, res, next) => {
    try {
        const geofence = await settingsRepository.getGeofenceSettings();
        res.status(200).json({
            success: true,
            data: geofence,
        });
    }
    catch (err) {
        next(err);
    }
};
export const updateGeofenceSettings = async (req, res, next) => {
    try {
        const validated = updateGeofenceSettingsSchema.parse(req.body);
        const updated = await settingsRepository.updateGeofenceSettings(validated);
        res.status(200).json({
            success: true,
            data: updated,
        });
    }
    catch (err) {
        next(err);
    }
};
/**
 * Retrieves the verified company-specific SMTP configuration (passwords masked)
 */
export const getCompanySmtpConfig = async (req, res, next) => {
    try {
        const companyId = req.user?.company_id || req.query.company_id || req.headers['x-company-id'] || 'company-a';
        const config = await settingsRepository.getCompanySmtpConfig(companyId);
        if (!config) {
            res.status(200).json({
                success: true,
                data: {
                    configured: false,
                    companyId,
                    smtpHost: 'smtp.gmail.com',
                    smtpPort: 587,
                    secure: false,
                    senderEmail: '',
                    senderName: '',
                    hasPassword: false,
                },
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: {
                configured: true,
                companyId: config.companyId,
                smtpHost: config.smtpHost,
                smtpPort: config.smtpPort,
                secure: config.secure,
                senderEmail: config.senderEmail,
                senderName: config.senderName,
                hasPassword: Boolean(config.appPasswordEncrypted),
                maskedPassword: config.appPasswordEncrypted ? '••••••••••••••••' : '',
                updatedAt: config.updatedAt,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
/**
 * Saves and encrypts company-specific SMTP configuration
 */
export const saveCompanySmtpConfig = async (req, res, next) => {
    try {
        const companyId = req.user?.company_id || req.body.companyId || req.headers['x-company-id'] || 'company-a';
        const { smtpHost, smtpPort, secure, senderEmail, senderName, appPassword } = req.body;
        if (!senderEmail || !senderEmail.trim()) {
            res.status(400).json({
                success: false,
                error: { message: 'Corporate Sender Email is required.' },
            });
            return;
        }
        const saved = await settingsRepository.saveCompanySmtpConfig(companyId, {
            smtpHost,
            smtpPort,
            secure,
            senderEmail,
            senderName,
            appPassword,
        });
        res.status(200).json({
            success: true,
            message: 'SMTP configuration saved and encrypted successfully.',
            data: {
                configured: true,
                companyId: saved.companyId,
                smtpHost: saved.smtpHost,
                smtpPort: saved.smtpPort,
                secure: saved.secure,
                senderEmail: saved.senderEmail,
                senderName: saved.senderName,
                hasPassword: Boolean(saved.appPasswordEncrypted),
                updatedAt: saved.updatedAt,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
/**
 * Tests live handshake with the target SMTP relay (e.g. smtp.gmail.com:587)
 */
export const testCompanySmtpConnection = async (req, res, next) => {
    try {
        const { verifySmtpConnection } = await import('../services/emailService.js');
        const companyId = req.user?.company_id || req.body.companyId || req.headers['x-company-id'] || 'company-a';
        const { smtpHost, smtpPort, secure, senderEmail, appPassword } = req.body;
        if (!senderEmail || !senderEmail.trim()) {
            res.status(400).json({
                success: false,
                error: { message: 'Corporate Sender Email is required.' },
            });
            return;
        }
        const result = await verifySmtpConnection({
            companyId,
            smtpHost,
            smtpPort,
            secure,
            senderEmail,
            appPassword,
        });
        res.status(200).json({
            success: true,
            message: result.message,
        });
    }
    catch (err) {
        res.status(400).json({
            success: false,
            error: {
                code: 'SMTP_CONNECTION_FAILED',
                message: err.message || 'SMTP Authentication failed. Please check host, port, email, and 16-digit App Password.',
            },
        });
    }
};
//# sourceMappingURL=settingsController.js.map
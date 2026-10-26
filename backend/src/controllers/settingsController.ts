import { Request, Response, NextFunction } from 'express';
import { settingsRepository } from '../repositories/settingsRepository.js';
import {
  updateCompanySettingsSchema,
  updateGeofenceSettingsSchema,
} from '../validators/settingsValidators.js';
import {
  smtpConfigSchema,
  metaAdsConfigSchema,
  biometricConfigSchema,
  accountingConfigSchema,
} from '../validators/integrationValidators.js';
import { integrationService } from '../services/integrationService.js';

export const getCompanySettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || (req.query.company_id as string) || (req.headers['x-company-id'] as string);
    const company = await settingsRepository.getCompanySettings(companyId);
    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (err) {
    next(err);
  }
};

export const updateCompanySettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = updateCompanySettingsSchema.parse(req.body);
    const companyId = req.user?.company_id || validated.company_id || (req.headers['x-company-id'] as string);
    const updated = await settingsRepository.updateCompanySettings(validated, companyId);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const getGeofenceSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const geofence = await settingsRepository.getGeofenceSettings();
    res.status(200).json({
      success: true,
      data: geofence,
    });
  } catch (err) {
    next(err);
  }
};

export const updateGeofenceSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = updateGeofenceSettingsSchema.parse(req.body);
    const updated = await settingsRepository.updateGeofenceSettings(validated);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves the verified company-specific SMTP configuration (passwords masked)
 */
export const getCompanySmtpConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || (req.query.company_id as string) || (req.headers['x-company-id'] as string) || 'company-a';
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
  } catch (err) {
    next(err);
  }
};

/**
 * Saves and encrypts company-specific SMTP configuration
 */
export const saveCompanySmtpConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || req.body.companyId || (req.headers['x-company-id'] as string) || 'company-a';
    
    // Strict Schema Validation
    const validation = smtpConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid SMTP configuration',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { smtpHost, smtpPort, secure, senderEmail, senderName, appPassword } = validation.data;

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
  } catch (err) {
    next(err);
  }
};

/**
 * Tests live handshake with the target SMTP relay (e.g. smtp.gmail.com:587)
 */
export const testCompanySmtpConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { verifySmtpConnection } = await import('../services/emailService.js');
    const companyId = req.user?.company_id || req.body.companyId || (req.headers['x-company-id'] as string) || 'company-a';

    // Strict Schema Validation
    const validation = smtpConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid SMTP parameters',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { smtpHost, smtpPort, secure, senderEmail, appPassword, testRecipientEmail } = validation.data;

    const result = await verifySmtpConnection({
      companyId,
      smtpHost,
      smtpPort,
      secure,
      senderEmail,
      appPassword,
      testRecipientEmail,
    });

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: {
        code: err.code || 'SMTP_CONNECTION_FAILED',
        message: err.message || 'SMTP Authentication failed. Please check host, port, email, and 16-digit App Password.',
      },
    });
  }
};

// ============================================================================
// META ADS HANDLERS
// ============================================================================

export const getMetaAdsConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || (req.query.company_id as string) || 'company-a';
    const config = await integrationService.getMetaAdsConfig(companyId);
    res.status(200).json({
      success: true,
      data: config || {
        businessId: '',
        adAccountId: '',
        pixelId: '',
        autoIngestCandidates: false,
        targetJobPost: '',
        isConfigured: false
      }
    });
  } catch (err) {
    next(err);
  }
};

export const saveMetaAdsConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || req.body.companyId || 'company-a';
    const validation = metaAdsConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid Meta Ads configuration',
          details: validation.error.errors
        }
      });
      return;
    }

    await integrationService.saveMetaAdsConfig(companyId, validation.data);

    res.status(200).json({
      success: true,
      message: 'Meta Ads configuration saved successfully.'
    });
  } catch (err) {
    next(err);
  }
};

export const testMetaAdsConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validation = metaAdsConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid Meta Ads credentials',
          details: validation.error.errors
        }
      });
      return;
    }

    const result = await integrationService.testMetaAdsConnection(validation.data);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'HANDSHAKE_FAILED',
          message: result.message
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
      accountName: result.accountName,
      accountStatus: result.accountStatus
    });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// BIOMETRIC ATTENDANCE GATEWAY HANDLERS
// ============================================================================

export const getBiometricsConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || (req.query.company_id as string) || 'company-a';
    const config = await integrationService.getBiometricsConfig(companyId);
    res.status(200).json({
      success: true,
      data: config || {
        deviceIp: '',
        devicePort: 4370,
        syncIntervalMins: 15,
        deviceBrand: '',
        autoSyncMusterRoll: false,
        isConfigured: false
      }
    });
  } catch (err) {
    next(err);
  }
};

export const saveBiometricsConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || req.body.companyId || 'company-a';
    const validation = biometricConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid Biometric hardware configuration',
          details: validation.error.errors
        }
      });
      return;
    }

    await integrationService.saveBiometricsConfig(companyId, validation.data);

    res.status(200).json({
      success: true,
      message: 'Biometric hardware configuration saved successfully.'
    });
  } catch (err) {
    next(err);
  }
};

export const testBiometricsConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validation = biometricConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid Biometric device settings',
          details: validation.error.errors
        }
      });
      return;
    }

    const result = await integrationService.testBiometricsConnection(validation.data);
    if (!result.success) {
      res.status(400).json({
        success: false,
        isLanDevice: result.isLanDevice ?? false,
        error: {
          code: result.isLanDevice ? 'LAN_DEVICE_UNREACHABLE' : 'DEVICE_UNREACHABLE',
          message: result.message
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// ACCOUNTING (TALLY & ZOHO) HANDLERS
// ============================================================================

export const getAccountingConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || (req.query.company_id as string) || 'company-a';
    const config = await integrationService.getAccountingConfig(companyId);
    res.status(200).json({
      success: true,
      data: config || {
        accountingProvider: 'Tally Prime XML Server',
        serverEndpoint: '',
        companyNameInTally: '',
        organizationId: '',
        autoSyncFrequency: 'Monthly on Payroll Close',
        isConfigured: false
      }
    });
  } catch (err) {
    next(err);
  }
};

export const saveAccountingConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || req.body.companyId || 'company-a';
    const validation = accountingConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid Accounting configuration',
          details: validation.error.errors
        }
      });
      return;
    }

    await integrationService.saveAccountingConfig(companyId, validation.data);

    res.status(200).json({
      success: true,
      message: 'Accounting integration configuration saved successfully.'
    });
  } catch (err) {
    next(err);
  }
};

export const testAccountingConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validation = accountingConfigSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0]?.message || 'Invalid Accounting parameters',
          details: validation.error.errors
        }
      });
      return;
    }

    const result = await integrationService.testAccountingConnection(validation.data);
    if (!result.success) {
      res.status(400).json({
        success: false,
        isLanEndpoint: result.isLanEndpoint ?? false,
        error: {
          code: result.isLanEndpoint ? 'LAN_ENDPOINT_UNREACHABLE' : 'ACCOUNTING_CONNECT_FAILED',
          message: result.message
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    next(err);
  }
};

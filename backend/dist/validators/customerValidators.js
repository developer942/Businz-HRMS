import { z } from 'zod';
import { hasUnicodeLetter, isValidCustomerName, normalizeCustomerPhone, normalizeCustomerWebsite } from '../utils/customerContactValidation.js';
const optionalText = (max) => z.string().trim().max(max).optional().nullable();
const optionalPhone = z.string().trim().max(40).optional().nullable().transform((value, context) => {
    if (!value)
        return undefined;
    const normalized = normalizeCustomerPhone(value);
    if (!normalized) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid alternate mobile or landline number' });
        return z.NEVER;
    }
    return normalized;
});
const website = z.string().trim().max(2048).optional().nullable().transform((value, context) => {
    if (!value)
        return undefined;
    const normalized = normalizeCustomerWebsite(value);
    if (!normalized) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Website must use http or https and contain a valid domain' });
        return z.NEVER;
    }
    return normalized;
});
export const saveCustomerSchema = z.object({
    id: z.string().optional(),
    customerId: z.string().optional(),
    companyId: z.string().default('company-a'),
    customerName: z.string().trim().min(1, 'Customer Name is required').max(120).refine(isValidCustomerName, 'Customer Name must contain letters and only use valid name punctuation'),
    companyName: optionalText(160),
    designation: optionalText(120).refine(value => !value || hasUnicodeLetter(value), 'Designation must contain letters'),
    contactNumber: z.string().trim().min(1, 'Primary Contact Number is required').max(40).transform((value, context) => {
        const normalized = normalizeCustomerPhone(value);
        if (!normalized) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number; India is the default country' });
            return z.NEVER;
        }
        return normalized;
    }),
    alternateContactNumber: optionalPhone,
    email: z.string().trim().max(254).email('Invalid email address').optional().or(z.literal('')).nullable(),
    address: optionalText(1000),
    website,
    visitingCardUrl: z.string().optional().nullable(),
    collectedById: z.string().optional().nullable(),
    collectedByName: z.string().default('Employee'),
    collectedDate: z.string().optional(),
    consentStatus: z.enum(['Opted In', 'Not Opted In', 'Unknown']).default('Unknown'),
    consentTimestamp: z.string().optional().nullable(),
    consentSource: z.string().optional().nullable(),
    consentPurpose: z.string().optional().nullable(),
    notes: optionalText(2000)
});
export const recordConsentSchema = z.object({
    customerContactId: z.string().min(1, 'customerContactId is required'),
    companyId: z.string().default('company-a'),
    consentStatus: z.enum(['Opted In', 'Not Opted In', 'Unknown']),
    source: z.string().min(1, 'Consent source is required'),
    purpose: z.string().min(1, 'Consent purpose is required'),
    notes: z.string().optional()
});
export const sendWhatsAppSchema = z.object({
    companyId: z.string().default('company-a'),
    customerContactId: z.string().optional(),
    customerName: z.string().min(1, 'Customer Name is required'),
    recipientPhone: z.string().min(7, 'Recipient Phone is required'),
    templateId: z.string().min(1, 'Template selection is required'),
    variableValues: z.record(z.string(), z.string()).default({})
});
export const saveTemplateSchema = z.object({
    id: z.string().optional(),
    companyId: z.string().default('company-a'),
    templateName: z.string().min(1, 'Template Name is required'),
    metaTemplateName: z.string().min(1, 'Meta Template Name is required'),
    metaTemplateId: z.string().optional(),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('UTILITY'),
    language: z.string().default('en_US'),
    bodyText: z.string().min(1, 'Body Text is required'),
    variableMapping: z.array(z.object({
        placeholder: z.string(),
        metaParamIndex: z.number(),
        description: z.string()
    })).default([]),
    sampleValues: z.record(z.string(), z.string()).default({}),
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED']).default('DRAFT'),
    isActive: z.boolean().default(true)
});
export const ocrScanSchema = z.object({
    imageBase64: z.string().min(10, 'Base64 image is required'),
    mimeType: z.string().default('image/jpeg'),
    geminiApiKey: z.string().optional(),
    ocrModel: z.string().optional()
});
//# sourceMappingURL=customerValidators.js.map
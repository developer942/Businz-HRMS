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
    customerContactId: z.string().optional(),
    customerId: z.string().optional(),
    companyId: z.string().default('company-a'),
    consentStatus: z.enum(['Opted In', 'Not Opted In', 'Unknown']),
    source: z.string().min(1, 'Consent source is required'),
    purpose: z.string().min(1, 'Consent purpose is required'),
    notes: z.string().optional()
}).refine(data => Boolean(data.customerContactId || data.customerId), {
    message: 'customerContactId or customerId is required',
    path: ['customerContactId']
});
export const sendWhatsAppSchema = z.object({
    companyId: z.string().default('company-a'),
    customerContactId: z.string().optional(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    recipientPhone: z.string().optional(),
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
export const ALLOWED_OCR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_OCR_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB decoded limit
export const MAX_OCR_BASE64_LENGTH = 7_000_000; // ~5.25 MB base64 ceiling
export function verifyImageMagicBytes(buffer, mimeType) {
    if (!buffer || buffer.length < 12) {
        return false;
    }
    if (mimeType === 'image/jpeg') {
        // JPEG magic bytes: FF D8 FF
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
        // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
        return (buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47 &&
            buffer[4] === 0x0d &&
            buffer[5] === 0x0a &&
            buffer[6] === 0x1a &&
            buffer[7] === 0x0a);
    }
    if (mimeType === 'image/webp') {
        // WebP magic bytes: "RIFF" (bytes 0..3) and "WEBP" (bytes 8..11)
        return (buffer[0] === 0x52 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x46 &&
            buffer[8] === 0x57 &&
            buffer[9] === 0x45 &&
            buffer[10] === 0x42 &&
            buffer[11] === 0x50);
    }
    return false;
}
export const ocrScanSchema = z.object({
    imageBase64: z
        .string()
        .min(16, 'Base64 image is required')
        .max(MAX_OCR_BASE64_LENGTH, 'Image exceeds maximum allowed size of 5 MB'),
    mimeType: z.enum(ALLOWED_OCR_MIME_TYPES).default('image/jpeg'),
    geminiApiKey: z.string().max(256).optional(),
    ocrModel: z.string().max(100).optional()
});
//# sourceMappingURL=customerValidators.js.map
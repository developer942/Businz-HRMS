import { z } from 'zod';

export const saveCustomerSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().optional(),
  companyId: z.string().default('company-a'),
  customerName: z.string().min(1, 'Customer Name is required'),
  companyName: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  contactNumber: z.string().min(7, 'A valid contact number is required'),
  alternateContactNumber: z.string().optional().nullable(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')).nullable(),
  address: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  visitingCardUrl: z.string().optional().nullable(),
  collectedById: z.string().optional().nullable(),
  collectedByName: z.string().default('Employee'),
  collectedDate: z.string().optional(),
  consentStatus: z.enum(['Opted In', 'Not Opted In', 'Unknown']).default('Unknown'),
  consentTimestamp: z.string().optional().nullable(),
  consentSource: z.string().optional().nullable(),
  consentPurpose: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
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

export type WhatsAppConsentStatus = 'Opted In' | 'Not Opted In' | 'Unknown';

export type WhatsAppMessageStatus = 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';

export type WhatsAppTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type WhatsAppTemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';

export interface CustomerContactModel {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  companyName?: string;
  designation?: string;
  contactNumber: string;
  alternateContactNumber?: string;
  email?: string;
  address?: string;
  website?: string;
  visitingCardUrl?: string;
  collectedById?: string;
  collectedByName: string;
  collectedDate: string;
  consentStatus: WhatsAppConsentStatus;
  consentTimestamp?: string;
  consentSource?: string;
  consentPurpose?: string;
  lastWhatsappStatus?: WhatsAppMessageStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerConsentRecordModel {
  id: string;
  companyId: string;
  customerContactId: string;
  consentStatus: WhatsAppConsentStatus;
  source: string;
  purpose: string;
  recordedById?: string;
  recordedByName?: string;
  timestamp: string;
  ipAddress?: string;
  notes?: string;
}

export interface WhatsAppTemplateModel {
  id: string;
  companyId: string;
  templateName: string;
  metaTemplateName: string;
  metaTemplateId?: string;
  category: WhatsAppTemplateCategory;
  language: string;
  bodyText: string;
  variableMapping: Array<{
    placeholder: string; // e.g. '{{customer_name}}'
    metaParamIndex: number; // e.g. 1
    description: string;
  }>;
  sampleValues: Record<string, string>;
  status: WhatsAppTemplateStatus;
  rejectionReason?: string;
  isActive: boolean;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsAppMessageModel {
  id: string;
  companyId: string;
  customerContactId?: string;
  customerName: string;
  recipientPhone: string;
  templateId?: string;
  templateName: string;
  renderedBody: string;
  sentById?: string;
  sentByName: string;
  providerMessageId?: string;
  status: WhatsAppMessageStatus;
  errorCode?: string;
  errorMessage?: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  rawResponse?: any;
  createdAt?: string;
  updatedAt?: string;
}

export type FieldVerificationStatus = 'valid' | 'needs_review' | 'not_found';

export interface CardFieldEvidence {
  value: string | null;
  evidence: string;
  status: FieldVerificationStatus;
  reviewReason?: string;
}

export interface ExtractedCardDetails {
  person_name?: string | null;
  customerName: string;
  designation?: string | null;
  company_name?: string | null;
  companyName: string;
  phone_numbers: string[];
  contactNumber: string;
  alternateContactNumber: string;
  emails: string[];
  email: string;
  website?: string | null;
  address?: string | null;
  raw_text: string;
  review_required_fields: string[];
  notes: string;
  fields?: {
    customerName: CardFieldEvidence;
    companyName: CardFieldEvidence;
    designation: CardFieldEvidence;
    contactNumber: CardFieldEvidence;
    alternateContactNumber: CardFieldEvidence;
    email: CardFieldEvidence;
    website: CardFieldEvidence;
    address: CardFieldEvidence;
  };
  visibleTextBlocks?: string[];
  overallStatus?: 'valid' | 'needs_review' | 'unclear_image';
  reviewSummary?: string[];
  validFieldsCount?: number;
  totalFieldsCount?: number;
  extractionEngine?: 'gemini' | 'rule_based' | 'tesseract';
  modelUsed?: string;
}

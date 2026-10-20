export type WhatsAppConsentStatus = 'Opted In' | 'Not Opted In' | 'Unknown';

export type WhatsAppMessageStatus = 
  | 'queued' 
  | 'accepted' 
  | 'sent' 
  | 'delivered' 
  | 'read' 
  | 'failed';

export type WhatsAppTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type WhatsAppTemplateStatus = 
  | 'DRAFT' 
  | 'PENDING' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'PAUSED' 
  | 'DISABLED';

export interface CustomerContact {
  id: string;
  customerId: string;
  companyId: string;
  customerName: string;
  companyName?: string;
  designation?: string;
  contactNumber: string;
  alternateContactNumber?: string;
  email?: string;
  address?: string;
  website?: string;
  collectedById: string;
  collectedByName: string;
  collectedDate: string;
  visitingCardUrl?: string;
  notes?: string;
  consentStatus: WhatsAppConsentStatus;
  consentTimestamp?: string;
  consentSource?: string;
  consentPurpose?: string;
  lastMessageStatus?: WhatsAppMessageStatus;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConsentRecord {
  id: string;
  customerId: string;
  companyId: string;
  consentStatus: WhatsAppConsentStatus;
  source: string;
  method: string;
  purpose: string;
  recordedById: string;
  recordedByName: string;
  notes?: string;
  createdAt: string;
}

export interface WhatsAppTemplate {
  id: string;
  companyId: string;
  templateName: string;
  metaTemplateName: string;
  category: WhatsAppTemplateCategory;
  language: string;
  bodyText: string;
  variables: string[];
  sampleValues: Record<string, string>;
  status: WhatsAppTemplateStatus;
  metaTemplateId?: string;
  rejectionReason?: string;
  version: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppMessage {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  templateId?: string;
  templateName: string;
  senderEmployeeId: string;
  senderEmployeeName: string;
  renderedBody: string;
  variableValues: Record<string, string>;
  metaMessageId?: string;
  status: WhatsAppMessageStatus;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
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
  customerName?: string;
  designation?: string | null;
  company_name?: string | null;
  companyName?: string;
  phone_numbers?: string[];
  contactNumber?: string;
  alternateContactNumber?: string;
  emails?: string[];
  email?: string;
  address?: string;
  website?: string;
  rawText?: string;
  raw_text?: string;
  review_required_fields?: string[];
  notes?: string;
  confidence?: number;
  confidenceScore?: number;
  validFieldsCount?: number;
  totalFieldsCount?: number;
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
  extractionEngine?: 'gemini' | 'rule_based' | 'tesseract';
  modelUsed?: string;
}

export interface CustomerFilterOptions {
  search?: string;
  employeeName?: string;
  collectedFrom?: string;
  collectedTo?: string;
  consentStatus?: WhatsAppConsentStatus | '';
  page: number;
  pageSize: number;
}

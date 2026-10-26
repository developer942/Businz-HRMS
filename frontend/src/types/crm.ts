/**
 * WhatsApp CRM Types for BUSINZ HRMS Frontend
 * Adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

export type CrmContactCategory = 'Employees' | 'Scanned Contacts' | 'Customers' | 'Others';
export type CrmConsentStatus = 'Opted In' | 'Pending' | 'Opted Out' | 'Unknown';
export type CrmConversationStatus = 'open' | 'closed' | 'snoozed';
export type CrmMessageSenderType = 'customer' | 'agent' | 'bot' | 'system';
export type CrmMessageContentType = 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive';
export type CrmMessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';

export interface CrmTag {
  id: string;
  name: string;
  color: string;
  companyId: string;
  createdAt: string;
}

export interface CrmContact {
  id: string;
  companyId: string;
  phone: string;
  phoneNormalized: string;
  name: string;
  email?: string;
  companyName?: string;
  designation?: string;
  category: CrmContactCategory;
  sourceType: string;
  sourceReferenceId?: string;
  avatarUrl?: string;
  notes?: string;
  tags?: CrmTag[];
  consentStatus: CrmConsentStatus;
  consentSource?: string;
  consentTimestamp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmConversation {
  id: string;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  contactCategory?: CrmContactCategory;
  contactConsent?: CrmConsentStatus;
  companyId: string;
  status: CrmConversationStatus;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  lastMessageText?: string;
  lastMessageTimestamp?: string;
  unreadCount: number;
  tags?: CrmTag[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmMessage {
  id: string;
  conversationId: string;
  companyId: string;
  senderType: CrmMessageSenderType;
  agentEmployeeId?: string;
  contentType: CrmMessageContentType;
  contentText?: string;
  mediaUrl?: string;
  templateName?: string;
  wamid?: string;
  status: CrmMessageStatus;
  createdAt: string;
}

export interface CrmBroadcast {
  id: string;
  companyId: string;
  name?: string;
  campaignName?: string;
  templateName: string;
  templateLanguage?: string;
  templateVariables?: any;
  targetCategory?: string;
  targetTagId?: string;
  audienceFilter?: any;
  totalRecipients: number;
  sentCount?: number;
  successfulCount?: number;
  failedCount?: number;
  deliveredCount: number;
  readCount: number;
  repliedCount?: number;
  scheduledAt?: string;
  sentAt?: string;
  status: 'draft' | 'sending' | 'completed' | 'failed';
  createdByEmployeeId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CrmAnalyticsKPIs {
  totalContacts: number;
  optedInContacts: number;
  activeConversations: number;
  totalMessagesToday: number;
  totalInbound: number;
  totalOutbound: number;
  deliveryRatePercent: number;
  readRatePercent: number;
  categoryBreakdown: Record<string, number>;
}

export type CrmTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type CrmTemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
export type CrmTemplateHeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export interface CrmTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phoneNumber?: string;
  example?: string;
}

export interface CrmTemplate {
  id: string;
  companyId: string;
  metaTemplateId?: string | null;
  name: string;
  category: CrmTemplateCategory;
  language: string;
  status: CrmTemplateStatus;
  headerType?: CrmTemplateHeaderType | null;
  headerContent?: string | null;
  headerExample?: string[] | null;
  bodyText: string;
  bodyExampleValues?: string[] | null;
  footerText?: string | null;
  buttons?: CrmTemplateButton[] | null;
  rawComponents?: any[] | null;
  rejectionReason?: string | null;
  qualityScore?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

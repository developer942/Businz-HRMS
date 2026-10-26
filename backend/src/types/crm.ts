/**
 * WhatsApp CRM Types for BUSINZ HRMS
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

export type CrmContactCategory = 'Employees' | 'Scanned Contacts' | 'Customers' | 'Others';
export type CrmContactSource = 'HRMS_EMPLOYEE' | 'VISITING_CARD' | 'MANUAL' | 'INBOUND_CHAT';
export type CrmConsentStatus = 'Opted In' | 'Not Opted In' | 'Unknown';
export type CrmConversationStatus = 'open' | 'pending' | 'closed';
export type CrmSenderType = 'customer' | 'agent' | 'bot';
export type CrmContentType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'template' | 'interactive';
export type CrmMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type CrmBroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'paused';
export type CrmRecipientStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'skipped_no_consent';

export interface CrmTag {
  id: string;
  companyId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface CrmContact {
  id: string;
  companyId: string;
  phone: string;
  phoneNormalized: string;
  name: string;
  email?: string | null;
  companyName?: string | null;
  designation?: string | null;
  category: CrmContactCategory;
  sourceType: CrmContactSource;
  sourceId?: string | null;
  consentStatus: CrmConsentStatus;
  consentSource?: string | null;
  consentTimestamp?: string | null;
  avatarUrl?: string | null;
  visitingCardUrl?: string | null;
  notes?: string | null;
  tags?: CrmTag[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmConversation {
  id: string;
  companyId: string;
  contactId: string;
  contact?: CrmContact;
  status: CrmConversationStatus;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  aiAutoreplyDisabled: boolean;
  aiReplyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmMessage {
  id: string;
  conversationId: string;
  companyId: string;
  senderType: CrmSenderType;
  senderId?: string | null;
  contentType: CrmContentType;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
  templateVariables?: Record<string, any> | null;
  interactivePayload?: Record<string, any> | null;
  wamid?: string | null;
  status: CrmMessageStatus;
  failureReason?: string | null;
  createdAt: string;
}

export interface CrmBroadcast {
  id: string;
  companyId: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  templateVariables?: Record<string, any> | null;
  audienceFilter?: {
    category?: CrmContactCategory | 'ALL';
    tagIds?: string[];
    consentOnly?: boolean;
    searchQuery?: string;
  } | null;
  scheduledAt?: string | null;
  status: CrmBroadcastStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  createdByEmployeeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmBroadcastRecipient {
  id: string;
  broadcastId: string;
  contactId: string;
  phone: string;
  contactName?: string;
  wamid?: string | null;
  status: CrmRecipientStatus;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface CrmAutomation {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  triggerType: 'message_received' | 'contact_created' | 'tag_added' | 'out_of_hours';
  triggerConfig: Record<string, any>;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string | null;
  steps?: CrmAutomationStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmAutomationStep {
  id: string;
  automationId: string;
  parentStepId?: string | null;
  branch?: 'yes' | 'no' | null;
  stepType: 'send_message' | 'send_template' | 'assign_agent' | 'add_tag' | 'wait' | 'condition';
  stepConfig: Record<string, any>;
  position: number;
  createdAt: string;
}

export interface CrmAiConfig {
  id: string;
  companyId: string;
  provider: 'openai' | 'anthropic' | 'deepseek';
  model: string;
  apiKey?: string | null;
  systemPrompt?: string | null;
  isActive: boolean;
  autoReplyEnabled: boolean;
  autoReplyMaxPerConversation: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmAiKnowledge {
  id: string;
  companyId: string;
  title: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CrmAnalyticsSummary {
  totalConversations: number;
  openConversations: number;
  totalContacts: number;
  messagesSent: number;
  messagesReceived: number;
  deliveryRate: number;
  readRate: number;
  activeBroadcasts: number;
  whatsappHealth: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  qualityRating?: string;
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

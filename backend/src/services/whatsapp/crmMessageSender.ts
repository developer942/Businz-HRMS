/**
 * CRM Message Sender Service
 * Enforces Consent, Persists Messages, and Dispatches via Meta Cloud API
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import { crmRepository } from '../../repositories/crmRepository.js';
import { metaApiClient } from './metaApiClient.js';
import { CrmMessage, CrmContact } from '../../types/crm.js';

export class CrmMessageSender {
  /**
   * Send a direct agent message in a conversation thread
   */
  async sendDirectMessage(params: {
    conversationId: string;
    text: string;
    agentEmployeeId?: string;
    companyId?: string;
  }): Promise<CrmMessage> {
    const { conversationId, text, agentEmployeeId, companyId = 'company-a' } = params;

    const conv = await crmRepository.getConversationById(conversationId, companyId);
    if (!conv) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const contact = conv.contact || await crmRepository.getContactById(conv.contactId, companyId);
    if (!contact) {
      throw new Error(`Contact for conversation ${conversationId} not found`);
    }

    // Call Meta Graph API
    const metaRes = await metaApiClient.sendTextMessage(contact.phone, text, companyId);
    const status = metaRes.success ? 'sent' : 'failed';
    const failureReason = metaRes.error || null;
    const wamid = metaRes.wamid || null;

    // Log message to database
    return await crmRepository.insertMessage({
      conversationId,
      companyId,
      senderType: 'agent',
      senderId: agentEmployeeId || 'AGENT-DEFAULT',
      contentType: 'text',
      contentText: text,
      wamid: wamid || undefined,
      status,
      failureReason: failureReason || undefined
    });
  }

  /**
   * Send a WhatsApp template message with strict Consent Verification
   */
  async sendTemplateMessage(params: {
    contactId: string;
    templateName: string;
    language?: string;
    components?: any[];
    category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    agentEmployeeId?: string;
    companyId?: string;
  }): Promise<CrmMessage> {
    const {
      contactId,
      templateName,
      language = 'en',
      components = [],
      category = 'UTILITY',
      agentEmployeeId,
      companyId = 'company-a'
    } = params;

    const contact = await crmRepository.getContactById(contactId, companyId);
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    // Strict Anti-Spam / Consent Check for Marketing Templates
    if (category === 'MARKETING' && contact.consentStatus !== 'Opted In') {
      throw new Error(
        `Consent Policy Violation: Contact ${contact.name} (${contact.phone}) has consent status '${contact.consentStatus}'. Explicit opt-in consent is required before sending marketing templates.`
      );
    }

    // Ensure conversation exists
    const conv = await crmRepository.getOrCreateConversation(contact.id, companyId);

    // Call Meta Graph API
    const metaRes = await metaApiClient.sendTemplateMessage(
      contact.phone,
      templateName,
      language,
      components,
      companyId
    );

    const status = metaRes.success ? 'sent' : 'failed';
    const failureReason = metaRes.error || null;
    const wamid = metaRes.wamid || null;

    // Log message to database
    return await crmRepository.insertMessage({
      conversationId: conv.id,
      companyId,
      senderType: 'agent',
      senderId: agentEmployeeId || 'AGENT-DEFAULT',
      contentType: 'template',
      templateName,
      templateVariables: { components },
      wamid: wamid || undefined,
      status,
      failureReason: failureReason || undefined
    });
  }
}

export const crmMessageSender = new CrmMessageSender();

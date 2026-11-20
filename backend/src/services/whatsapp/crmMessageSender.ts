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
    headerUrl?: string;
    headerType?: string;
    bodyParameters?: string[];
    agentEmployeeId?: string;
    companyId?: string;
  }): Promise<CrmMessage> {
    const {
      contactId,
      templateName,
      language = 'en',
      components = [],
      category = 'UTILITY',
      headerUrl,
      headerType,
      bodyParameters,
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

    // Resolve template metadata (exact language code e.g. en, header image, and buttons) from database
    let effectiveLanguage = language || 'en';
    let renderedBodyText = `[Template: ${templateName}]`;
    let templateButtons: any[] = [];
    let templateHeaderType: string = headerType || 'NONE';
    let finalHeaderUrl: string | null = headerUrl || null;
    let finalComponents = Array.isArray(components) ? [...components] : [];

    try {
      const templates = await crmRepository.getTemplates(companyId, { search: templateName });
      const matchedTmpl = templates.find(t => t.name.toLowerCase() === templateName.toLowerCase().trim());
      if (matchedTmpl) {
        if (matchedTmpl.language) {
          effectiveLanguage = matchedTmpl.language;
        }
        if (matchedTmpl.headerType) {
          templateHeaderType = matchedTmpl.headerType;
        }
        if (Array.isArray(matchedTmpl.buttons) && matchedTmpl.buttons.length > 0) {
          templateButtons = matchedTmpl.buttons;
        }

        // Determine header URL
        if (templateHeaderType === 'IMAGE') {
          const content = matchedTmpl.headerContent;
          finalHeaderUrl = headerUrl
            || (content && !content.includes('brand-logo.png') ? content : null)
            || (matchedTmpl.headerExample && matchedTmpl.headerExample[0] && !matchedTmpl.headerExample[0].startsWith('https://scontent.') ? matchedTmpl.headerExample[0] : null)
            || 'https://hrms.businz.com/vrm-banner.png';
        } else if (templateHeaderType === 'DOCUMENT') {
          finalHeaderUrl = headerUrl
            || matchedTmpl.headerContent
            || (matchedTmpl.headerExample && matchedTmpl.headerExample[0])
            || 'https://hrms.businz.com/VRM_Product_Catalogue.pdf';
        } else if (templateHeaderType === 'VIDEO') {
          finalHeaderUrl = headerUrl
            || matchedTmpl.headerContent
            || (matchedTmpl.headerExample && matchedTmpl.headerExample[0])
            || null;
        }

        // 1. Ensure Header Component is present if template requires an IMAGE, DOCUMENT, VIDEO or TEXT header
        const hasHeaderComp = finalComponents.some(
          (c: any) => String(c?.type || '').toLowerCase() === 'header'
        );

        if (!hasHeaderComp && templateHeaderType && templateHeaderType !== 'NONE') {
          if (templateHeaderType === 'IMAGE' && finalHeaderUrl) {
            finalComponents.unshift({
              type: 'header',
              parameters: [
                {
                  type: 'image',
                  image: {
                    link: finalHeaderUrl
                  }
                }
              ]
            });
          } else if (templateHeaderType === 'DOCUMENT' && finalHeaderUrl) {
            finalComponents.unshift({
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    link: finalHeaderUrl,
                    filename: matchedTmpl.headerContent || 'Document.pdf'
                  }
                }
              ]
            });
          } else if (templateHeaderType === 'VIDEO' && finalHeaderUrl) {
            finalComponents.unshift({
              type: 'header',
              parameters: [
                {
                  type: 'video',
                  video: {
                    link: finalHeaderUrl
                  }
                }
              ]
            });
          } else if (templateHeaderType === 'TEXT' && matchedTmpl.headerContent) {
            finalComponents.unshift({
              type: 'header',
              parameters: [
                {
                  type: 'text',
                  text: matchedTmpl.headerContent
                }
              ]
            });
          }
        }

        // 2. Ensure Body Component is present
        const hasBodyComp = finalComponents.some(
          (c: any) => String(c?.type || '').toLowerCase() === 'body'
        );

        if (!hasBodyComp) {
          const bodyParams = (bodyParameters && Array.isArray(bodyParameters) && bodyParameters.length > 0)
            ? bodyParameters
            : (matchedTmpl.bodyExampleValues && matchedTmpl.bodyExampleValues.length > 0)
              ? matchedTmpl.bodyExampleValues
              : [contact.name || 'Valued Customer'];

          finalComponents.push({
            type: 'body',
            parameters: bodyParams.map((p: any) => ({ type: 'text', text: String(p) }))
          });
        }

        // 3. Render substituted body text for inbox snippet
        if (matchedTmpl.bodyText) {
          let body = matchedTmpl.bodyText;
          const bodyComp = finalComponents.find(
            (c: any) => String(c?.type || '').toLowerCase() === 'body'
          );
          const paramsList = Array.isArray(bodyComp?.parameters) ? bodyComp.parameters : [];
          paramsList.forEach((p: any, idx: number) => {
            const val = p?.text ?? '';
            body = body.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), String(val));
          });
          renderedBodyText = body;
        }
      } else if (templateName.toLowerCase().trim() === 'hello_world' && (!language || language === 'en')) {
        effectiveLanguage = 'en_US';
        renderedBodyText =
          'Hello World\nWelcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.';
      }
    } catch (err) {
      console.warn('[CrmMessageSender] Template metadata resolution error:', err);
    }

    // Call Meta Graph API
    const metaRes = await metaApiClient.sendTemplateMessage(
      contact.phone,
      templateName,
      effectiveLanguage,
      finalComponents,
      companyId
    );

    const status = metaRes.success ? 'sent' : 'failed';
    const failureReason = metaRes.error || null;
    const wamid = metaRes.wamid || null;

    // Log message to database - strictly preserving contentType: 'template', mediaUrl, and interactivePayload buttons
    return await crmRepository.insertMessage({
      conversationId: conv.id,
      companyId,
      senderType: 'agent',
      senderId: agentEmployeeId || 'AGENT-DEFAULT',
      contentType: 'template',
      contentText: renderedBodyText,
      mediaUrl: finalHeaderUrl || undefined,
      templateName,
      templateVariables: {
        templateName,
        language: effectiveLanguage,
        components: finalComponents,
        headerType: templateHeaderType,
        headerUrl: finalHeaderUrl,
        buttons: templateButtons
      },
      interactivePayload: templateButtons.length > 0 ? { buttons: templateButtons } : undefined,
      wamid: wamid || undefined,
      status,
      failureReason: failureReason || undefined
    });
  }
}

export const crmMessageSender = new CrmMessageSender();

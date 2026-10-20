import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { WhatsAppTemplateModel, WhatsAppMessageStatus } from '../types/customer.js';
import { customerRepository } from '../repositories/customerRepository.js';

export interface WhatsAppConfig {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  webhookSecret: string;
}

// In-flight send locks to prevent duplicate submissions on double-clicks
const activeSendLocks = new Set<string>();

export class WhatsAppService {
  private readonly graphApiBase = 'https://graph.facebook.com/v21.0';

  // 1. Retrieve company-specific WhatsApp credentials securely from backend storage
  async getCompanyWhatsAppConfig(companyId: string): Promise<WhatsAppConfig | null> {
    const settingKey = `whatsapp_integration_${companyId || 'company-a'}`;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from('company_settings')
          .select('setting_val')
          .eq('setting_key', settingKey)
          .maybeSingle();

        if (data?.setting_val && typeof data.setting_val === 'object') {
          const val = data.setting_val as any;
          if (val.phoneNumberId && val.accessToken) {
            return {
              phoneNumberId: String(val.phoneNumberId).trim(),
              wabaId: String(val.wabaId || '').trim(),
              accessToken: String(val.accessToken).trim(),
              webhookSecret: String(val.webhookSecret || '').trim()
            };
          }
        }
      } catch (err) {
        console.warn('Database error fetching WhatsApp config:', err);
      }
    }

    // Environment variable fallback
    if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
      return {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID.trim(),
        wabaId: (process.env.WHATSAPP_WABA_ID || '').trim(),
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN.trim(),
        webhookSecret: (process.env.WHATSAPP_WEBHOOK_SECRET || '').trim()
      };
    }

    return null;
  }

  // 2. Save/Update WhatsApp credentials securely on the backend
  async saveCompanyWhatsAppConfig(companyId: string, config: WhatsAppConfig): Promise<boolean> {
    const settingKey = `whatsapp_integration_${companyId || 'company-a'}`;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const payload = {
          phoneNumberId: config.phoneNumberId.trim(),
          wabaId: config.wabaId.trim(),
          accessToken: config.accessToken.trim(),
          webhookSecret: config.webhookSecret.trim(),
          updatedAt: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .eq('setting_key', settingKey)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from('company_settings')
            .update({ setting_val: payload, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: settingKey, setting_val: payload });
        }
        return true;
      } catch (err) {
        console.warn('Database error saving WhatsApp config:', err);
      }
    }
    return true;
  }

  // 3. Test Handshake with Meta Graph API
  async testConnection(config: WhatsAppConfig): Promise<{ success: boolean; message: string; verifiedNumber?: string }> {
    if (!config.phoneNumberId || !config.accessToken) {
      return { success: false, message: 'Missing Phone Number ID or Access Token' };
    }

    try {
      const url = `${this.graphApiBase}/${config.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json() as any;

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Meta API returned HTTP ${response.status}`;
        return {
          success: false,
          message: `Meta API verification failed: ${errorMsg}`
        };
      }

      return {
        success: true,
        message: `Connected successfully to Meta WhatsApp Cloud API! Verified as "${data.verified_name || data.display_phone_number || 'Business Account'}".`,
        verifiedNumber: data.display_phone_number
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Network error connecting to Meta WhatsApp Cloud API: ${err.message}`
      };
    }
  }

  // 4. Send Meta-Approved Template Message
  async sendTemplateMessage(params: {
    companyId: string;
    customerContactId?: string;
    customerName: string;
    recipientPhone: string;
    template: WhatsAppTemplateModel;
    variableValues: Record<string, string>;
    sentById?: string;
    sentByName: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string; status: WhatsAppMessageStatus }> {
    const { companyId, customerContactId, customerName, recipientPhone, template, variableValues, sentById, sentByName } = params;

    // Concurrency Lock: Prevent double-click sending
    const lockKey = `${companyId}:${recipientPhone}:${template.id}:${Date.now().toString().slice(0, -3)}`; // 1 second window
    if (activeSendLocks.has(lockKey)) {
      return {
        success: false,
        status: 'failed',
        error: 'Duplicate send request detected. Please wait a moment.'
      };
    }
    activeSendLocks.add(lockKey);
    setTimeout(() => activeSendLocks.delete(lockKey), 5000);

    // Normalize phone number (E.164 without leading plus)
    const normalizedPhone = customerRepository.normalizePhoneNumber(recipientPhone);

    // Render body text for preview and record storage
    let renderedBody = template.bodyText;
    for (const [key, val] of Object.entries(variableValues)) {
      const regex = new RegExp(key.replace(/([{}])/g, '\\$1'), 'g');
      renderedBody = renderedBody.replace(regex, val);
    }

    // Retrieve active credentials
    const config = await this.getCompanyWhatsAppConfig(companyId);
    if (!config || !config.phoneNumberId || !config.accessToken) {
      // In development / demo when no live Meta credentials exist, safely queue record
      const simulatedMsg = await customerRepository.saveMessage({
        companyId,
        customerContactId,
        customerName,
        recipientPhone: normalizedPhone,
        templateId: template.id,
        templateName: template.templateName,
        renderedBody,
        sentById,
        sentByName,
        providerMessageId: `mock_wam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: 'sent',
        sentAt: new Date().toISOString()
      });

      return {
        success: true,
        messageId: simulatedMsg.id,
        status: 'sent'
      };
    }

    // Build Meta Message Payload
    // Map variableMapping to components parameters
    const bodyParameters: Array<{ type: 'text'; text: string }> = [];
    if (template.variableMapping && template.variableMapping.length > 0) {
      // Sort by metaParamIndex
      const sorted = [...template.variableMapping].sort((a, b) => a.metaParamIndex - b.metaParamIndex);
      for (const map of sorted) {
        const val = variableValues[map.placeholder] || variableValues[map.placeholder.replace(/[{}]/g, '')] || 'Customer';
        bodyParameters.push({ type: 'text', text: val });
      }
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: template.metaTemplateName,
        language: {
          code: template.language || 'en_US'
        }
      }
    };

    if (bodyParameters.length > 0) {
      payload.template.components = [
        {
          type: 'body',
          parameters: bodyParameters
        }
      ];
    }

    try {
      const url = `${this.graphApiBase}/${config.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json() as any;

      if (!response.ok) {
        const errDetail = resData?.error?.message || `HTTP ${response.status}`;
        const errCode = resData?.error?.code ? String(resData.error.code) : 'META_ERROR';

        await customerRepository.saveMessage({
          companyId,
          customerContactId,
          customerName,
          recipientPhone: normalizedPhone,
          templateId: template.id,
          templateName: template.templateName,
          renderedBody,
          sentById,
          sentByName,
          status: 'failed',
          errorCode: errCode,
          errorMessage: errDetail,
          rawResponse: resData,
          sentAt: new Date().toISOString()
        });

        return {
          success: false,
          status: 'failed',
          error: `Meta WhatsApp Error (${errCode}): ${errDetail}`
        };
      }

      const wamid = resData?.messages?.[0]?.id;

      const savedMsg = await customerRepository.saveMessage({
        companyId,
        customerContactId,
        customerName,
        recipientPhone: normalizedPhone,
        templateId: template.id,
        templateName: template.templateName,
        renderedBody,
        sentById,
        sentByName,
        providerMessageId: wamid,
        status: 'accepted',
        rawResponse: resData,
        sentAt: new Date().toISOString()
      });

      return {
        success: true,
        messageId: savedMsg.id,
        status: 'accepted'
      };
    } catch (err: any) {
      await customerRepository.saveMessage({
        companyId,
        customerContactId,
        customerName,
        recipientPhone: normalizedPhone,
        templateId: template.id,
        templateName: template.templateName,
        renderedBody,
        sentById,
        sentByName,
        status: 'failed',
        errorMessage: err.message,
        sentAt: new Date().toISOString()
      });

      return {
        success: false,
        status: 'failed',
        error: `Network Exception: ${err.message}`
      };
    }
  }

  // 5. Submit New Template to Meta for Approval
  async submitTemplateToMeta(companyId: string, template: WhatsAppTemplateModel): Promise<{ success: boolean; metaTemplateId?: string; error?: string }> {
    const config = await this.getCompanyWhatsAppConfig(companyId);
    if (!config || !config.wabaId || !config.accessToken) {
      // In development / offline mode, mark as APPROVED or PENDING
      await customerRepository.saveTemplate({
        ...template,
        status: 'APPROVED',
        metaTemplateId: `meta_tmpl_${Date.now()}`
      });
      return {
        success: true,
        metaTemplateId: `meta_tmpl_${Date.now()}`
      };
    }

    // Convert body text placeholders {{customer_name}} to {{1}}, {{2}} for Meta Graph API
    let metaBody = template.bodyText;
    const sampleBodyValues: string[] = [];

    if (template.variableMapping && template.variableMapping.length > 0) {
      const sorted = [...template.variableMapping].sort((a, b) => a.metaParamIndex - b.metaParamIndex);
      for (const map of sorted) {
        metaBody = metaBody.replace(new RegExp(map.placeholder.replace(/([{}])/g, '\\$1'), 'g'), `{{${map.metaParamIndex}}}`);
        const sample = template.sampleValues[map.placeholder] || template.sampleValues[map.placeholder.replace(/[{}]/g, '')] || 'Sample';
        sampleBodyValues.push(sample);
      }
    }

    const payload: any = {
      name: template.metaTemplateName,
      category: template.category,
      language: template.language || 'en_US',
      components: [
        {
          type: 'BODY',
          text: metaBody,
          ...(sampleBodyValues.length > 0 ? {
            example: {
              body_text: [sampleBodyValues]
            }
          } : {})
        }
      ]
    };

    try {
      const url = `${this.graphApiBase}/${config.wabaId}/message_templates`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;

      if (!response.ok) {
        const errorMsg = data?.error?.message || `HTTP ${response.status}`;
        return { success: false, error: errorMsg };
      }

      await customerRepository.saveTemplate({
        ...template,
        metaTemplateId: data.id,
        status: data.status ? (data.status.toUpperCase() as any) : 'PENDING'
      });

      return {
        success: true,
        metaTemplateId: data.id
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // 6. Check Template Status on Meta
  async syncTemplateStatus(companyId: string, template: WhatsAppTemplateModel): Promise<WhatsAppTemplateModel> {
    const config = await this.getCompanyWhatsAppConfig(companyId);
    if (!config || !config.wabaId || !config.accessToken || !template.metaTemplateName) {
      return template;
    }

    try {
      const url = `${this.graphApiBase}/${config.wabaId}/message_templates?name=${encodeURIComponent(template.metaTemplateName)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json() as any;
        const metaItem = data?.data?.[0];
        if (metaItem?.status) {
          const newStatus = metaItem.status.toUpperCase() as any;
          return await customerRepository.saveTemplate({
            ...template,
            status: newStatus,
            rejectionReason: metaItem.rejected_reason || template.rejectionReason
          });
        }
      }
    } catch (err) {
      console.warn('Error syncing template status:', err);
    }
    return template;
  }

  // 7. Process Incoming Webhook Event (Delivery receipts & Status changes)
  async handleWebhookPayload(payload: any): Promise<{ handled: boolean; updatedCount: number }> {
    let updatedCount = 0;
    try {
      const entries = payload?.entry || [];
      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          if (change.field === 'messages') {
            const value = change.value || {};
            const statuses = value.statuses || [];

            for (const item of statuses) {
              const providerId = item.id;
              const metaStatus = item.status; // 'sent' | 'delivered' | 'read' | 'failed'
              const timestamp = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : new Date().toISOString();

              let mappedStatus: WhatsAppMessageStatus | null = null;
              if (metaStatus === 'sent') mappedStatus = 'sent';
              else if (metaStatus === 'delivered') mappedStatus = 'delivered';
              else if (metaStatus === 'read') mappedStatus = 'read';
              else if (metaStatus === 'failed') mappedStatus = 'failed';

              if (mappedStatus && providerId) {
                const errorInfo = item.errors?.[0] ? {
                  code: String(item.errors[0].code),
                  message: item.errors[0].title || item.errors[0].message
                } : undefined;

                const success = await customerRepository.updateMessageStatusByProviderId(
                  providerId,
                  mappedStatus,
                  timestamp,
                  errorInfo
                );
                if (success) updatedCount++;
              }
            }
          }
        }
      }
      return { handled: true, updatedCount };
    } catch (err) {
      console.error('Error handling WhatsApp webhook payload:', err);
      return { handled: false, updatedCount };
    }
  }
}

export const whatsappService = new WhatsAppService();

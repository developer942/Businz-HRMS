/**
 * WhatsApp CRM Webhook Controller
 * Handles Meta Graph API Webhook Verification & Inbound Events
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */
import { metaApiClient } from '../services/whatsapp/metaApiClient.js';
import { crmRepository } from '../repositories/crmRepository.js';
export class CrmWebhookController {
    /**
     * Meta Webhook Handshake Verification (GET)
     */
    async verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const companyId = String(req.query['companyId'] || 'company-a');
        const config = await metaApiClient.getConfig(companyId);
        const expectedToken = config?.webhookSecret || process.env.WHATSAPP_WEBHOOK_SECRET || 'businz_hrms_webhook_secret';
        if (mode === 'subscribe' && token === expectedToken) {
            console.log('[WhatsApp Webhook] Handshake verified successfully for company:', companyId);
            res.status(200).send(challenge);
        }
        else {
            console.warn('[WhatsApp Webhook] Verification token mismatch. Got:', token);
            res.status(403).send('Forbidden: Token mismatch');
        }
    }
    /**
     * Inbound WhatsApp Webhook Processor (POST)
     */
    async handleWebhookPayload(req, res) {
        // Immediate 200 OK acknowledgment to Meta to prevent retry loops
        res.status(200).json({ success: true });
        try {
            const body = req.body;
            if (!body || body.object !== 'whatsapp_business_account')
                return;
            const entries = body.entry || [];
            for (const entry of entries) {
                const changes = entry.changes || [];
                for (const change of changes) {
                    if (change.field !== 'messages')
                        continue;
                    const value = change.value;
                    if (!value)
                        continue;
                    // 1. Process Message Delivery Status Updates (sent, delivered, read, failed)
                    const statuses = value.statuses || [];
                    for (const st of statuses) {
                        const wamid = st.id;
                        const status = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
                        const failureReason = st.errors ? JSON.stringify(st.errors) : undefined;
                        if (wamid && status) {
                            await crmRepository.updateMessageStatusByWamid(wamid, status, failureReason).catch(err => {
                                console.warn('[CrmWebhook] Error updating message status:', err);
                            });
                        }
                    }
                    // 2. Process Inbound Messages from Customers
                    const messages = value.messages || [];
                    const contactsMeta = value.contacts || [];
                    for (const msg of messages) {
                        const senderPhone = msg.from;
                        const wamid = msg.id;
                        const contactMeta = contactsMeta.find((c) => c.wa_id === senderPhone);
                        const customerName = contactMeta?.profile?.name || `Customer ${senderPhone}`;
                        // Find or create contact
                        let contact = await crmRepository.getContactById(senderPhone, 'company-a');
                        if (!contact) {
                            contact = await crmRepository.upsertContact({
                                companyId: 'company-a',
                                phone: senderPhone,
                                name: customerName,
                                category: 'Customers',
                                sourceType: 'INBOUND_CHAT',
                                consentStatus: 'Opted In', // Inbound customer initiation provides explicit communication consent
                                consentSource: 'Inbound WhatsApp Message',
                                consentTimestamp: new Date().toISOString()
                            });
                        }
                        // Get or create conversation thread
                        const conv = await crmRepository.getOrCreateConversation(contact.id, 'company-a');
                        // Determine message content
                        let contentType = 'text';
                        let contentText = '';
                        let mediaUrl;
                        if (msg.type === 'text') {
                            contentType = 'text';
                            contentText = msg.text?.body || '';
                        }
                        else if (msg.type === 'image') {
                            contentType = 'image';
                            contentText = msg.image?.caption || '';
                            mediaUrl = msg.image?.id; // Meta Media ID
                        }
                        else if (msg.type === 'document') {
                            contentType = 'document';
                            contentText = msg.document?.caption || msg.document?.filename || 'Document';
                            mediaUrl = msg.document?.id;
                        }
                        else if (msg.type === 'audio') {
                            contentType = 'audio';
                            mediaUrl = msg.audio?.id;
                        }
                        else if (msg.type === 'button') {
                            contentType = 'interactive';
                            contentText = msg.button?.text || '';
                        }
                        else if (msg.type === 'interactive') {
                            contentType = 'interactive';
                            contentText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || 'Interactive Response';
                        }
                        // Save inbound message
                        await crmRepository.insertMessage({
                            conversationId: conv.id,
                            companyId: 'company-a',
                            senderType: 'customer',
                            contentType,
                            contentText,
                            mediaUrl,
                            wamid,
                            status: 'delivered'
                        });
                        console.log(`[CrmWebhook] Recorded inbound message from ${customerName} (${senderPhone})`);
                    }
                }
            }
        }
        catch (err) {
            console.error('[CrmWebhook] Error processing webhook payload:', err);
        }
    }
}
export const crmWebhookController = new CrmWebhookController();
//# sourceMappingURL=crmWebhookController.js.map
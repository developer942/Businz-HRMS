/**
 * WhatsApp CRM Repository for BUSINZ HRMS
 * Native Hostinger VPS PostgreSQL Operations via PostgREST Client
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import {
  CrmContact,
  CrmTag,
  CrmConversation,
  CrmMessage,
  CrmBroadcast,
  CrmBroadcastRecipient,
  CrmAnalyticsSummary,
  CrmTemplate
} from '../types/crm.js';

export class CrmRepository {
  // ============================================================
  // 1. CONTACTS
  // ============================================================

  async getContacts(params: {
    companyId: string;
    search?: string;
    category?: string;
    consentStatus?: string;
    tagId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ contacts: CrmContact[]; total: number }> {
    const { companyId, search, category, consentStatus, tagId, limit = 50, offset = 0 } = params;
    const supabase = getSupabaseAdmin();

    let query = supabase.from('crm_contacts')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId || 'company-a');

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      query = query.or(`name.ilike.${q},phone.ilike.${q},company_name.ilike.${q}`);
    }

    if (category && category !== 'ALL') {
      query = query.eq('category', category);
    }

    if (consentStatus && consentStatus !== 'ALL') {
      query = query.eq('consent_status', consentStatus);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    return {
      contacts: (data || []).map(this.mapContactRow),
      total: count || 0
    };
  }

  async getContactById(idOrPhone: string, companyId = 'company-a'): Promise<CrmContact | null> {
    const supabase = getSupabaseAdmin();
    let { data } = await supabase.from('crm_contacts')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', idOrPhone)
      .maybeSingle();

    if (!data) {
      const cleanPhone = idOrPhone.replace(/\D/g, '');
      const res = await supabase.from('crm_contacts')
        .select('*')
        .eq('company_id', companyId)
        .or(`phone.eq.${idOrPhone},phone_normalized.eq.${cleanPhone}`)
        .maybeSingle();
      data = res.data;
    }

    if (!data) return null;
    return this.mapContactRow(data);
  }

  async upsertContact(data: Partial<CrmContact> & {
    companyId: string;
    phone: string;
    name?: string;
  }): Promise<CrmContact> {
    const supabase = getSupabaseAdmin();
    const cleanPhone = data.phone.replace(/\D/g, '');

    const { data: existing } = await supabase.from('crm_contacts')
      .select('id')
      .eq('company_id', data.companyId || 'company-a')
      .or(`phone.eq.${data.phone},phone_normalized.eq.${cleanPhone}`)
      .maybeSingle();

    const record: any = {
      company_id: data.companyId || 'company-a',
      phone: data.phone,
      phone_normalized: cleanPhone,
      name: data.name || data.phone,
      email: data.email || null,
      company_name: data.companyName || null,
      designation: data.designation || null,
      category: data.category || 'Customer',
      source_type: data.sourceType || 'MANUAL',
      source_id: data.sourceId || null,
      consent_status: data.consentStatus || 'Pending',
      consent_source: data.consentSource || null,
      consent_timestamp: data.consentTimestamp || new Date().toISOString(),
      avatar_url: data.avatarUrl || null,
      visiting_card_url: data.visitingCardUrl || null,
      notes: data.notes || null,
      updated_at: new Date().toISOString()
    };

    if (existing?.id) {
      const { data: updated, error } = await supabase.from('crm_contacts')
        .update(record)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.mapContactRow(updated);
    } else {
      const { data: created, error } = await supabase.from('crm_contacts')
        .insert(record)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.mapContactRow(created);
    }
  }

  async deleteContact(id: string, companyId = 'company-a'): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('crm_contacts')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    return !error;
  }

  // ============================================================
  // 2. TAGS
  // ============================================================

  async getTags(companyId = 'company-a'): Promise<CrmTag[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_tags')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      color: r.color,
      createdAt: r.created_at
    }));
  }

  async createTag(companyId: string, name: string, color: string): Promise<CrmTag> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_tags')
      .insert({ company_id: companyId || 'company-a', name, color })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      companyId: data.company_id,
      name: data.name,
      color: data.color,
      createdAt: data.created_at
    };
  }

  async assignTagToContact(contactId: string, tagId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    await supabase.from('crm_contact_tags').insert({ contact_id: contactId, tag_id: tagId });
  }

  async removeTagFromContact(contactId: string, tagId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    await supabase.from('crm_contact_tags').delete().eq('contact_id', contactId).eq('tag_id', tagId);
  }

  // ============================================================
  // 3. CONVERSATIONS
  // ============================================================

  async getConversations(params: {
    companyId: string;
    status?: string;
    assignedEmployeeId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<CrmConversation[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase.from('crm_conversations')
      .select('*, crm_contacts(*)')
      .eq('company_id', params.companyId || 'company-a');

    if (params.status && params.status !== 'ALL') {
      query = query.eq('status', params.status);
    }
    if (params.assignedEmployeeId) {
      query = query.eq('assigned_employee_id', params.assignedEmployeeId);
    }

    query = query.order('last_message_at', { ascending: false }).range(params.offset || 0, (params.offset || 0) + (params.limit || 50) - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((r: any) => ({
      ...this.mapConversationRow(r),
      contact: r.crm_contacts ? this.mapContactRow(r.crm_contacts) : undefined
    }));
  }

  async getConversationById(id: string, companyId = 'company-a'): Promise<CrmConversation | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_conversations')
      .select('*, crm_contacts(*)')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      ...this.mapConversationRow(data),
      contact: data.crm_contacts ? this.mapContactRow(data.crm_contacts) : undefined
    };
  }

  async getOrCreateConversation(contactId: string, companyId = 'company-a'): Promise<CrmConversation> {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from('crm_conversations')
      .select('*')
      .eq('company_id', companyId)
      .eq('contact_id', contactId)
      .maybeSingle();

    if (existing) return this.mapConversationRow(existing);

    const { data: created, error } = await supabase.from('crm_conversations')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        status: 'open',
        last_message_at: new Date().toISOString(),
        unread_count: 0
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapConversationRow(created);
  }

  async updateConversationAssignment(
    conversationId: string,
    employeeId: string | null,
    employeeName: string | null,
    companyId = 'company-a'
  ): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('crm_conversations')
      .update({
        assigned_employee_id: employeeId,
        assigned_employee_name: employeeName,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .eq('company_id', companyId);
    return !error;
  }

  async markConversationRead(conversationId: string, companyId = 'company-a'): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('crm_conversations')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('company_id', companyId);
    return !error;
  }

  // ============================================================
  // 4. MESSAGES
  // ============================================================

  async getMessages(
    conversationId: string,
    companyId = 'company-a',
    limit = 50,
    offset = 0
  ): Promise<CrmMessage[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapMessageRow);
  }

  async insertMessage(data: {
    conversationId: string;
    companyId: string;
    senderType: 'customer' | 'agent' | 'bot';
    senderId?: string;
    contentType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template' | 'interactive';
    contentText?: string;
    mediaUrl?: string;
    templateName?: string;
    templateVariables?: any;
    interactivePayload?: any;
    wamid?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed';
    failureReason?: string;
  }): Promise<CrmMessage> {
    const supabase = getSupabaseAdmin();
    const { data: created, error } = await supabase.from('crm_messages')
      .insert({
        conversation_id: data.conversationId,
        company_id: data.companyId || 'company-a',
        sender_type: data.senderType,
        sender_id: data.senderId || (data.senderType === 'customer' ? 'CUSTOMER' : 'AGENT'),
        content_type: data.contentType,
        content_text: data.contentText || null,
        media_url: data.mediaUrl || null,
        template_name: data.templateName || null,
        template_variables: data.templateVariables || null,
        interactive_payload: data.interactivePayload || null,
        wamid: data.wamid || null,
        status: data.status || 'sent',
        failure_reason: data.failureReason || null
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Update conversation last message snippet
    await supabase.from('crm_conversations')
      .update({
        last_message_text: data.contentText || (data.templateName ? `Template: ${data.templateName}` : data.contentType),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', data.conversationId);

    return this.mapMessageRow(created);
  }

  async updateMessageStatusByWamid(
    wamid: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    failureReason?: string | null
  ): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('crm_messages')
      .update({
        status,
        failure_reason: failureReason || null
      })
      .eq('wamid', wamid);
    return !error;
  }

  // ============================================================
  // 5. BROADCASTS
  // ============================================================

  async getBroadcasts(companyId = 'company-a'): Promise<CrmBroadcast[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_broadcasts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(this.mapBroadcastRow);
  }

  async getBroadcastById(id: string, companyId = 'company-a'): Promise<{
    broadcast: CrmBroadcast | null;
    recipients: CrmBroadcastRecipient[];
  }> {
    const supabase = getSupabaseAdmin();
    const { data: bData, error: bError } = await supabase.from('crm_broadcasts')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (bError || !bData) return { broadcast: null, recipients: [] };

    const { data: rData } = await supabase.from('crm_broadcast_recipients')
      .select('*, crm_contacts(name)')
      .eq('broadcast_id', id)
      .order('created_at', { ascending: true });

    const recipients: CrmBroadcastRecipient[] = (rData || []).map((r: any) => ({
      id: r.id,
      broadcastId: r.broadcast_id,
      contactId: r.contact_id,
      phone: r.phone,
      contactName: r.crm_contacts?.name || r.contact_name,
      wamid: r.wamid,
      status: r.status,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
      repliedAt: r.replied_at,
      errorMessage: r.error_message,
      createdAt: r.created_at,
    }));

    return {
      broadcast: this.mapBroadcastRow(bData),
      recipients
    };
  }

  async createBroadcast(data: Partial<CrmBroadcast> & {
    name: string;
    templateName: string;
    companyId: string;
  }): Promise<CrmBroadcast> {
    const supabase = getSupabaseAdmin();
    const { data: created, error } = await supabase.from('crm_broadcasts')
      .insert({
        company_id: data.companyId || 'company-a',
        name: data.name,
        template_name: data.templateName,
        template_language: data.templateLanguage || 'en',
        template_variables: data.templateVariables || null,
        audience_filter: data.audienceFilter || null,
        scheduled_at: data.scheduledAt || null,
        status: data.status || 'draft',
        total_recipients: data.totalRecipients || 0,
        created_by_employee_id: data.createdByEmployeeId || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapBroadcastRow(created);
  }

  // ============================================================
  // 6. ANALYTICS & DASHBOARD
  // ============================================================

  async getAnalyticsSummary(companyId = 'company-a'): Promise<CrmAnalyticsSummary> {
    const supabase = getSupabaseAdmin();
    const [cTotal, cOpen, mTotal, bTotal, contactsTotal] = await Promise.all([
      supabase.from('crm_conversations').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('crm_conversations').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'open'),
      supabase.from('crm_messages').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('crm_broadcasts').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('crm_contacts').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
    ]);

    const messagesSent = mTotal.count || 0;
    const totalConversations = cTotal.count || 0;
    const openConversations = cOpen.count || 0;
    const totalContacts = contactsTotal.count || 0;
    const activeBroadcasts = bTotal.count || 0;

    return {
      totalConversations,
      openConversations,
      totalContacts,
      messagesSent,
      messagesReceived: 0,
      deliveryRate: 100,
      readRate: 95,
      activeBroadcasts,
      whatsappHealth: 'CONNECTED',
      qualityRating: 'GREEN'
    };
  }

  // ============================================================
  // 7. TEMPLATES
  // ============================================================

  async getTemplates(
    companyId = 'company-a',
    filters?: { category?: string; status?: string; search?: string }
  ): Promise<CrmTemplate[]> {
    const supabase = getSupabaseAdmin();
    let q = supabase.from('crm_templates').select('*').eq('company_id', companyId);

    if (filters?.category && filters.category !== 'ALL') {
      q = q.eq('category', filters.category.toUpperCase());
    }
    if (filters?.status && filters.status !== 'ALL') {
      q = q.eq('status', filters.status.toUpperCase());
    }
    if (filters?.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      q = q.or(`name.ilike.${term},body_text.ilike.${term}`);
    }

    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map(this.mapTemplateRow);
  }

  async getTemplateById(id: string, companyId = 'company-a'): Promise<CrmTemplate | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_templates')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapTemplateRow(data);
  }

  async saveTemplateDraft(
    data: {
      id?: string;
      name: string;
      category: string;
      language?: string;
      headerType?: string | null;
      headerContent?: string | null;
      headerExample?: string[] | null;
      bodyText: string;
      bodyExampleValues?: string[] | null;
      footerText?: string | null;
      buttons?: any[] | null;
      rawComponents?: any[] | null;
      status?: string;
    },
    companyId = 'company-a'
  ): Promise<CrmTemplate> {
    const supabase = getSupabaseAdmin();
    const cleanName = data.name.toLowerCase().trim();
    const cleanLang = data.language || 'en';

    // Find existing by ID or (company_id, name, language)
    let existingId: string | null = data.id || null;
    let existingStatus: string | null = null;

    if (!existingId) {
      const { data: match } = await supabase.from('crm_templates')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('name', cleanName)
        .eq('language', cleanLang)
        .maybeSingle();
      if (match) {
        existingId = match.id;
        existingStatus = match.status;
      }
    } else {
      const { data: match } = await supabase.from('crm_templates')
        .select('status')
        .eq('id', existingId)
        .maybeSingle();
      if (match) existingStatus = match.status;
    }

    const payload: any = {
      company_id: companyId,
      name: cleanName,
      category: data.category.toUpperCase(),
      language: cleanLang,
      header_type: data.headerType || 'NONE',
      header_content: data.headerContent || null,
      header_example: data.headerExample || [],
      body_text: data.bodyText,
      body_example_values: data.bodyExampleValues || [],
      footer_text: data.footerText || null,
      buttons: data.buttons || [],
      raw_components: data.rawComponents || [],
      updated_at: new Date().toISOString()
    };

    if (existingId) {
      if (existingStatus !== 'APPROVED') {
        payload.status = data.status || 'DRAFT';
      }
      const { data: updated, error } = await supabase.from('crm_templates')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.mapTemplateRow(updated);
    } else {
      payload.status = data.status || 'DRAFT';
      const { data: created, error } = await supabase.from('crm_templates')
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.mapTemplateRow(created);
    }
  }

  async updateTemplateStatus(
    id: string,
    update: {
      status: string;
      metaTemplateId?: string | null;
      rejectionReason?: string | null;
      qualityScore?: string | null;
    },
    companyId = 'company-a'
  ): Promise<CrmTemplate | null> {
    const supabase = getSupabaseAdmin();
    const updatePayload: any = {
      status: update.status,
      rejection_reason: update.rejectionReason || null,
      updated_at: new Date().toISOString()
    };
    if (update.metaTemplateId) updatePayload.meta_template_id = update.metaTemplateId;
    if (update.qualityScore) updatePayload.quality_score = update.qualityScore;

    const { data, error } = await supabase.from('crm_templates')
      .update(updatePayload)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .maybeSingle();

    if (error || !data) return null;
    return this.mapTemplateRow(data);
  }

  async upsertMetaTemplate(
    metaTmpl: {
      name: string;
      category: string;
      language: string;
      status: string;
      components: any[];
      quality_score?: string;
      rejected_reason?: string;
    },
    companyId = 'company-a'
  ): Promise<CrmTemplate> {
    const supabase = getSupabaseAdmin();
    let headerType = 'NONE';
    let headerContent: string | null = null;
    let headerExample: string[] | null = null;
    let bodyText = '';
    let bodyExampleValues: string[] | null = null;
    let footerText: string | null = null;
    let buttons: any[] = [];

    if (Array.isArray(metaTmpl.components)) {
      for (const comp of metaTmpl.components) {
        if (comp.type === 'HEADER') {
          headerType = comp.format || 'TEXT';
          headerContent = comp.text || null;
          headerExample = comp.example?.header_text || comp.example?.header_handle || null;
        } else if (comp.type === 'BODY') {
          bodyText = comp.text || '';
          bodyExampleValues = comp.example?.body_text?.[0] || null;
        } else if (comp.type === 'FOOTER') {
          footerText = comp.text || null;
        } else if (comp.type === 'BUTTONS') {
          buttons = (comp.buttons || []).map((b: any) => ({
            type: b.type,
            text: b.text,
            url: b.url,
            phoneNumber: b.phone_number,
            example: b.example?.[0]
          }));
        }
      }
    }

    const cleanName = metaTmpl.name.toLowerCase().trim();
    const cleanLang = metaTmpl.language || 'en';

    const { data: match } = await supabase.from('crm_templates')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', cleanName)
      .eq('language', cleanLang)
      .maybeSingle();

    const record: any = {
      company_id: companyId,
      name: cleanName,
      category: (metaTmpl.category || 'UTILITY').toUpperCase(),
      language: cleanLang,
      status: (metaTmpl.status || 'PENDING').toUpperCase(),
      header_type: headerType,
      header_content: headerContent,
      header_example: headerExample || [],
      body_text: bodyText,
      body_example_values: bodyExampleValues || [],
      footer_text: footerText,
      buttons: buttons,
      raw_components: metaTmpl.components || [],
      rejection_reason: metaTmpl.rejected_reason || null,
      quality_score: metaTmpl.quality_score || null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (match) {
      const { data: updated, error } = await supabase.from('crm_templates')
        .update(record)
        .eq('id', match.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.mapTemplateRow(updated);
    } else {
      const { data: created, error } = await supabase.from('crm_templates')
        .insert(record)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.mapTemplateRow(created);
    }
  }

  async deleteTemplate(id: string, companyId = 'company-a'): Promise<CrmTemplate | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_templates')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .maybeSingle();

    if (error || !data) return null;
    return this.mapTemplateRow(data);
  }

  // ============================================================
  // ROW MAPPERS
  // ============================================================

  private mapContactRow(r: any): CrmContact {
    return {
      id: r.id,
      companyId: r.company_id,
      phone: r.phone,
      phoneNormalized: r.phone_normalized,
      name: r.name,
      email: r.email,
      companyName: r.company_name,
      designation: r.designation,
      category: r.category,
      sourceType: r.source_type,
      sourceId: r.source_id,
      consentStatus: r.consent_status,
      consentSource: r.consent_source,
      consentTimestamp: r.consent_timestamp,
      avatarUrl: r.avatar_url,
      visitingCardUrl: r.visiting_card_url,
      notes: r.notes,
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapConversationRow(r: any): CrmConversation {
    return {
      id: r.id,
      companyId: r.company_id,
      contactId: r.contact_id,
      status: r.status,
      assignedEmployeeId: r.assigned_employee_id,
      assignedEmployeeName: r.assigned_employee_name,
      lastMessageText: r.last_message_text,
      lastMessageAt: r.last_message_at,
      unreadCount: r.unread_count || 0,
      aiAutoreplyDisabled: Boolean(r.ai_autoreply_disabled),
      aiReplyCount: r.ai_reply_count || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapMessageRow(r: any): CrmMessage {
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      id: r.id,
      conversationId: r.conversation_id,
      companyId: r.company_id,
      senderType: r.sender_type,
      senderId: r.sender_id,
      contentType: r.content_type,
      contentText: r.content_text,
      mediaUrl: r.media_url,
      templateName: r.template_name,
      templateVariables: r.template_variables ? parse(r.template_variables) : undefined,
      interactivePayload: r.interactive_payload ? parse(r.interactive_payload) : undefined,
      wamid: r.wamid,
      status: r.status,
      failureReason: r.failure_reason,
      createdAt: r.created_at,
    };
  }

  private mapBroadcastRow(r: any): CrmBroadcast {
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      templateName: r.template_name,
      templateLanguage: r.template_language,
      templateVariables: r.template_variables ? parse(r.template_variables) : undefined,
      audienceFilter: r.audience_filter ? parse(r.audience_filter) : undefined,
      scheduledAt: r.scheduled_at,
      status: r.status,
      totalRecipients: r.total_recipients || 0,
      sentCount: r.sent_count || 0,
      deliveredCount: r.delivered_count || 0,
      readCount: r.read_count || 0,
      repliedCount: r.replied_count || 0,
      failedCount: r.failed_count || 0,
      createdByEmployeeId: r.created_by_employee_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapTemplateRow(r: any): CrmTemplate {
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      id: r.id,
      companyId: r.company_id,
      metaTemplateId: r.meta_template_id,
      name: r.name,
      category: r.category,
      language: r.language,
      status: r.status,
      headerType: r.header_type,
      headerContent: r.header_content,
      headerExample: r.header_example ? parse(r.header_example) : null,
      bodyText: r.body_text,
      bodyExampleValues: r.body_example_values ? parse(r.body_example_values) : null,
      footerText: r.footer_text,
      buttons: r.buttons ? parse(r.buttons) : null,
      rawComponents: r.raw_components ? parse(r.raw_components) : null,
      rejectionReason: r.rejection_reason,
      qualityScore: r.quality_score,
      lastSyncedAt: r.last_synced_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

export const crmRepository = new CrmRepository();

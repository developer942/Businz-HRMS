/**
 * WhatsApp CRM Repository for BUSINZ HRMS
 * Native Hostinger VPS PostgreSQL Operations via PostgREST Client
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */
import { getSupabaseAdmin } from '../config/supabase.js';
import { query } from '../config/database.js';
export class CrmRepository {
    // ============================================================
    // 1. CONTACTS
    // ============================================================
    async getContacts(params) {
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
        if (error)
            throw new Error(error.message);
        return {
            contacts: (data || []).map(this.mapContactRow),
            total: count || 0
        };
    }
    async getContactById(idOrPhone, companyId = 'company-a') {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(idOrPhone || '').trim());
        let data = null;
        if (isUuid) {
            try {
                const sqlRes = await query(`SELECT * FROM public.crm_contacts WHERE company_id = $1 AND id = $2 LIMIT 1`, [companyId, idOrPhone.trim()]);
                if (sqlRes.rows.length > 0) {
                    data = sqlRes.rows[0];
                }
            }
            catch (err) {
                console.warn('[CrmRepository] SQL getContactById uuid failed:', err);
            }
        }
        if (!data) {
            const cleanPhone = String(idOrPhone || '').replace(/\D/g, '');
            if (cleanPhone) {
                const last10 = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
                const with91 = last10.length === 10 ? `91${last10}` : cleanPhone;
                try {
                    const sqlRes = await query(`SELECT * FROM public.crm_contacts 
             WHERE company_id = $1 
               AND (
                 phone = $2 
                 OR phone_normalized = $3 
                 OR phone_normalized = $4 
                 OR phone_normalized = $5 
                 OR phone_normalized LIKE '%' || $4
                 OR phone LIKE '%' || $4
               )
             ORDER BY created_at ASC
             LIMIT 1`, [companyId, idOrPhone, cleanPhone, last10, with91]);
                    if (sqlRes.rows.length > 0) {
                        data = sqlRes.rows[0];
                    }
                }
                catch (err) {
                    console.warn('[CrmRepository] SQL getContactById phone failed:', err);
                }
            }
        }
        // Fallback to PostgREST if direct SQL didn't find or errored
        if (!data) {
            const supabase = getSupabaseAdmin();
            if (isUuid) {
                const res = await supabase.from('crm_contacts')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('id', idOrPhone.trim())
                    .maybeSingle();
                data = res.data;
            }
            if (!data) {
                const cleanPhone = String(idOrPhone || '').replace(/\D/g, '');
                if (cleanPhone) {
                    const last10 = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
                    const res = await supabase.from('crm_contacts')
                        .select('*')
                        .eq('company_id', companyId)
                        .or(`phone.eq.${idOrPhone},phone_normalized.eq.${cleanPhone},phone_normalized.eq.${last10}`)
                        .limit(1)
                        .maybeSingle();
                    data = res.data;
                }
            }
        }
        if (!data)
            return null;
        // Duplicate-contact consent resolution: if status is Unknown or missing, check if another row with matching 10 digits has recorded consent
        if (!data.consent_status || data.consent_status === 'Unknown') {
            const clean = String(data.phone_normalized || data.phone || '').replace(/\D/g, '');
            const last10 = clean.slice(-10);
            if (last10.length === 10) {
                try {
                    const matchRes = await query(`SELECT consent_status, consent_source, consent_timestamp, consent_recorded_by_id, consent_recorded_by_name, consent_notes
             FROM public.crm_contacts 
             WHERE company_id = $1 
               AND right(phone_normalized, 10) = $2 
               AND consent_status IN ('Opted In', 'Opted Out')
               AND id <> $3
             ORDER BY updated_at DESC LIMIT 1`, [companyId, last10, data.id]);
                    if (matchRes.rows.length > 0) {
                        const m = matchRes.rows[0];
                        data.consent_status = m.consent_status;
                        data.consent_source = m.consent_source;
                        data.consent_timestamp = m.consent_timestamp;
                        data.consent_recorded_by_id = m.consent_recorded_by_id;
                        data.consent_recorded_by_name = m.consent_recorded_by_name;
                        data.consent_notes = m.consent_notes;
                    }
                }
                catch (e) {
                    console.warn('[CrmRepository] duplicate consent resolve error:', e);
                }
            }
        }
        // Employee avatar fallback: if avatar_url is missing, check linked employee record
        if (data && !data.avatar_url) {
            const clean = String(data.phone_normalized || data.phone || '').replace(/\D/g, '');
            const last10 = clean.slice(-10);
            if (last10.length === 10) {
                try {
                    const empRes = await query(`SELECT avatar_url FROM public.employees 
             WHERE company_id = $1 
               AND (
                 right(regexp_replace(phone, '\\D', '', 'g'), 10) = $2
                 OR right(regexp_replace(personal_mobile, '\\D', '', 'g'), 10) = $2
               )
               AND avatar_url IS NOT NULL AND avatar_url <> ''
             LIMIT 1`, [companyId, last10]);
                    if (empRes.rows.length > 0 && empRes.rows[0].avatar_url) {
                        data.avatar_url = empRes.rows[0].avatar_url;
                    }
                }
                catch (e) {
                    // ignore
                }
            }
        }
        return this.mapContactRow(data);
    }
    async upsertContact(data) {
        const supabase = getSupabaseAdmin();
        const cleanPhone = data.phone.replace(/\D/g, '');
        const last10 = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
        const with91 = last10.length === 10 ? `91${last10}` : cleanPhone;
        // Check existing contact by phone variations with direct SQL
        let existing = null;
        try {
            const existRes = await query(`SELECT * FROM public.crm_contacts 
         WHERE company_id = $1 
           AND (
             phone = $2 
             OR phone_normalized = $3 
             OR phone_normalized = $4 
             OR phone_normalized = $5 
             OR phone_normalized LIKE '%' || $4
             OR phone LIKE '%' || $4
           )
         ORDER BY created_at ASC
         LIMIT 1`, [data.companyId || 'company-a', data.phone, cleanPhone, last10, with91]);
            if (existRes.rows.length > 0) {
                existing = existRes.rows[0];
            }
        }
        catch (err) {
            console.warn('[CrmRepository] SQL upsertContact check failed:', err);
        }
        if (!existing) {
            const { data: pExisting } = await supabase.from('crm_contacts')
                .select('*')
                .eq('company_id', data.companyId || 'company-a')
                .or(`phone.eq.${data.phone},phone_normalized.eq.${cleanPhone},phone_normalized.eq.${last10}`)
                .maybeSingle();
            existing = pExisting;
        }
        const record = {
            company_id: data.companyId || 'company-a',
            phone: data.phone,
            phone_normalized: cleanPhone,
            name: data.name || data.phone,
            email: data.email || null,
            company_name: data.companyName || null,
            designation: data.designation || null,
            category: data.category || 'Customers',
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
            // Do not overwrite existing human name if incoming is just fallback
            if (existing.name && existing.name !== existing.phone && (!data.name || data.name.startsWith('Customer '))) {
                delete record.name;
            }
            const { data: updated, error } = await supabase.from('crm_contacts')
                .update(record)
                .eq('id', existing.id)
                .select()
                .single();
            if (error)
                throw new Error(error.message);
            return this.mapContactRow(updated);
        }
        else {
            const { data: created, error } = await supabase.from('crm_contacts')
                .insert(record)
                .select()
                .single();
            if (error)
                throw new Error(error.message);
            return this.mapContactRow(created);
        }
    }
    async deleteContact(id, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('crm_contacts')
            .delete()
            .eq('id', id)
            .eq('company_id', companyId);
        return !error;
    }
    async recordConsent(params) {
        const { companyId, contactId, consentStatus, consentDate = new Date().toISOString(), source = 'Manual Entry / WhatsApp CRM', notes, recordedById, recordedByName } = params;
        const contact = await this.getContactById(contactId, companyId);
        if (!contact) {
            throw new Error(`Contact ${contactId} not found in company ${companyId}`);
        }
        const clean = String(contact.phoneNormalized || contact.phone || '').replace(/\D/g, '');
        const last10 = clean.slice(-10);
        // 1. Update crm_contacts (both this row and any duplicate row sharing the same 10-digit number)
        try {
            await query(`UPDATE public.crm_contacts
         SET consent_status = $1,
             consent_source = $2,
             consent_timestamp = $3,
             consent_recorded_by_id = $4,
             consent_recorded_by_name = $5,
             consent_notes = $6,
             updated_at = NOW()
         WHERE company_id = $7
           AND (id = $8 OR (right(phone_normalized, 10) = $9 AND $9 <> ''))`, [consentStatus, source, consentDate, recordedById || null, recordedByName || null, notes || null, companyId, contact.id, last10]);
        }
        catch (err) {
            console.warn('[CrmRepository] SQL recordConsent update failed:', err);
        }
        // 2. Sync to customer_contacts if corresponding row exists
        try {
            const enumVal = consentStatus === 'Opted Out' ? 'Opted Out' : (consentStatus === 'Opted In' ? 'Opted In' : 'Unknown');
            await query(`UPDATE public.customer_contacts
         SET consent_status = $1::hr_whatsapp_consent_status,
             consent_source = $2,
             consent_timestamp = $3,
             updated_at = NOW()
         WHERE company_id = $4
           AND (id::text = $5 OR right(regexp_replace(contact_number, '\\D', '', 'g'), 10) = $6)`, [enumVal, source, consentDate, companyId, contact.sourceId || '', last10]);
        }
        catch (err) {
            console.warn('[CrmRepository] customer_contacts consent sync failed:', err);
        }
        // 3. Insert audit entry into customer_consent_records
        try {
            const recStatus = consentStatus === 'Opted Out' ? 'Opted Out' : (consentStatus === 'Opted In' ? 'Opted In' : 'Unknown');
            await query(`INSERT INTO public.customer_consent_records (
           id,
           company_id,
           customer_contact_id,
           crm_contact_id,
           consent_status,
           source,
           purpose,
           recorded_by_id,
           recorded_by_name,
           timestamp,
           notes
         ) VALUES (
           gen_random_uuid(),
           $1,
           (SELECT id FROM public.customer_contacts WHERE company_id = $1 AND (id::text = $2 OR right(regexp_replace(contact_number, '\\D', '', 'g'), 10) = $3) LIMIT 1),
           $4,
           $5::hr_whatsapp_consent_status,
           $6,
           'WhatsApp Marketing & Service Communications',
           $7,
           $8,
           $9,
           $10
         )`, [
                companyId,
                contact.sourceId || '',
                last10,
                contact.id,
                recStatus,
                source,
                recordedById && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordedById) ? recordedById : null,
                recordedByName || null,
                consentDate,
                notes || `Recorded via WhatsApp CRM by ${recordedByName || 'Authorized User'}`
            ]);
        }
        catch (err) {
            console.warn('[CrmRepository] customer_consent_records insert failed:', err);
        }
        const updated = await this.getContactById(contact.id, companyId);
        return updated || contact;
    }
    // ============================================================
    // 2. TAGS
    // ============================================================
    async getTags(companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_tags')
            .select('*')
            .eq('company_id', companyId)
            .order('name', { ascending: true });
        if (error)
            throw new Error(error.message);
        return (data || []).map((r) => ({
            id: r.id,
            companyId: r.company_id,
            name: r.name,
            color: r.color,
            createdAt: r.created_at
        }));
    }
    async createTag(companyId, name, color) {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_tags')
            .insert({ company_id: companyId || 'company-a', name, color })
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return {
            id: data.id,
            companyId: data.company_id,
            name: data.name,
            color: data.color,
            createdAt: data.created_at
        };
    }
    async assignTagToContact(contactId, tagId) {
        const supabase = getSupabaseAdmin();
        await supabase.from('crm_contact_tags').insert({ contact_id: contactId, tag_id: tagId });
    }
    async removeTagFromContact(contactId, tagId) {
        const supabase = getSupabaseAdmin();
        await supabase.from('crm_contact_tags').delete().eq('contact_id', contactId).eq('tag_id', tagId);
    }
    // ============================================================
    // 3. CONVERSATIONS
    // ============================================================
    async getConversations(params) {
        const supabase = getSupabaseAdmin();
        let query = supabase.from('crm_conversations')
            .select('*, crm_contacts(*)')
            .eq('company_id', params.companyId || 'company-a');
        if (params.status && params.status !== 'ALL' && params.status !== 'all') {
            query = query.eq('status', params.status.toLowerCase());
        }
        if (params.assignedEmployeeId) {
            query = query.eq('assigned_employee_id', params.assignedEmployeeId);
        }
        query = query.order('last_message_at', { ascending: false }).range(params.offset || 0, (params.offset || 0) + (params.limit || 100) - 1);
        const { data, error } = await query;
        if (error)
            throw new Error(error.message);
        let mapped = (data || []).map((r) => ({
            ...this.mapConversationRow(r),
            contact: r.crm_contacts ? this.mapContactRow(r.crm_contacts) : undefined
        }));
        if (params.search && params.search.trim()) {
            const term = params.search.trim().toLowerCase();
            mapped = mapped.filter((c) => String(c.contactName || c.contact?.name || '').toLowerCase().includes(term) ||
                String(c.contactPhone || c.contact?.phone || '').toLowerCase().includes(term) ||
                String(c.lastMessageText || '').toLowerCase().includes(term));
        }
        return mapped;
    }
    async getConversationById(id, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_conversations')
            .select('*, crm_contacts(*)')
            .eq('id', id)
            .eq('company_id', companyId)
            .maybeSingle();
        if (error || !data)
            return null;
        return {
            ...this.mapConversationRow(data),
            contact: data.crm_contacts ? this.mapContactRow(data.crm_contacts) : undefined
        };
    }
    async getOrCreateConversation(contactId, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data: existing } = await supabase.from('crm_conversations')
            .select('*, crm_contacts(*)')
            .eq('company_id', companyId)
            .eq('contact_id', contactId)
            .maybeSingle();
        if (existing) {
            return {
                ...this.mapConversationRow(existing),
                contact: existing.crm_contacts ? this.mapContactRow(existing.crm_contacts) : undefined
            };
        }
        const { data: created, error } = await supabase.from('crm_conversations')
            .insert({
            company_id: companyId,
            contact_id: contactId,
            status: 'open',
            last_message_at: new Date().toISOString(),
            unread_count: 0
        })
            .select('*, crm_contacts(*)')
            .single();
        if (error)
            throw new Error(error.message);
        return {
            ...this.mapConversationRow(created),
            contact: created.crm_contacts ? this.mapContactRow(created.crm_contacts) : undefined
        };
    }
    async updateConversationAssignment(conversationId, employeeId, employeeName, companyId = 'company-a') {
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
    async markConversationRead(conversationId, companyId = 'company-a') {
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
    async getMessages(conversationId, companyId = 'company-a', limit = 50, offset = 0) {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('company_id', companyId)
            .order('created_at', { ascending: true })
            .range(offset, offset + limit - 1);
        if (error)
            throw new Error(error.message);
        return (data || []).map(this.mapMessageRow);
    }
    async insertMessage(data) {
        const supabase = getSupabaseAdmin();
        // Prevent duplicate insertion if wamid already exists
        if (data.wamid) {
            try {
                const existRes = await query(`SELECT * FROM public.crm_messages WHERE wamid = $1 LIMIT 1`, [data.wamid]);
                if (existRes.rows.length > 0) {
                    console.log(`[CrmRepository] Message with wamid ${data.wamid} already exists. Returning existing.`);
                    return this.mapMessageRow(existRes.rows[0]);
                }
            }
            catch (err) {
                console.warn('[CrmRepository] Deduplication check failed:', err);
            }
        }
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
        if (error)
            throw new Error(error.message);
        // Update conversation: last message, timestamp, reopen if customer message, and increment unread count
        const isCustomer = data.senderType === 'customer';
        const lastSnippet = data.contentText || (data.templateName ? `Template: ${data.templateName}` : data.contentType);
        const nowIso = new Date().toISOString();
        try {
            if (isCustomer) {
                await query(`UPDATE public.crm_conversations 
           SET last_message_text = $1,
               last_message_at = $2,
               updated_at = $2,
               status = 'open',
               unread_count = unread_count + 1
           WHERE id = $3`, [lastSnippet, nowIso, data.conversationId]);
            }
            else {
                await query(`UPDATE public.crm_conversations 
           SET last_message_text = $1,
               last_message_at = $2,
               updated_at = $2
           WHERE id = $3`, [lastSnippet, nowIso, data.conversationId]);
            }
        }
        catch (convErr) {
            console.warn('[CrmRepository] Error updating conversation metadata:', convErr);
        }
        return this.mapMessageRow(created);
    }
    async updateMessageStatusByWamid(wamid, status, failureReason) {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('crm_messages')
            .update({
            status,
            failure_reason: failureReason || null
        })
            .eq('wamid', wamid);
        return !error;
    }
    /**
     * Checks if a contact has experienced a Meta Error 131049 (Marketing Delivery Restriction)
     * within the last cooldown period (default: 24 hours).
     */
    async getRecentMarketingRestriction(contactId, companyId = 'company-a', cooldownHours = 24) {
        const supabase = getSupabaseAdmin();
        const { data: conv } = await supabase.from('crm_conversations')
            .select('id')
            .eq('contact_id', contactId)
            .eq('company_id', companyId)
            .maybeSingle();
        if (!conv) {
            return { isRestricted: false };
        }
        const { data, error } = await supabase.from('crm_messages')
            .select('created_at, failure_reason')
            .eq('conversation_id', conv.id)
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(15);
        if (error || !data || data.length === 0) {
            return { isRestricted: false };
        }
        const restrictedMsg = data.find((m) => {
            const reason = String(m.failure_reason || '').toLowerCase();
            return reason.includes('131049') || reason.includes('healthy ecosystem') || reason.includes('marketing delivery restricted');
        });
        if (!restrictedMsg) {
            return { isRestricted: false };
        }
        const lastFailedAt = new Date(restrictedMsg.created_at);
        const cooldownMs = cooldownHours * 60 * 60 * 1000;
        const restrictedUntil = new Date(lastFailedAt.getTime() + cooldownMs);
        const now = Date.now();
        if (now < restrictedUntil.getTime()) {
            const remainingMs = restrictedUntil.getTime() - now;
            const remainingHours = Math.max(1, Math.ceil(remainingMs / (3600 * 1000)));
            return {
                isRestricted: true,
                restrictedUntil,
                lastFailedAt,
                remainingHours,
                failureReason: restrictedMsg.failure_reason
            };
        }
        return {
            isRestricted: false,
            restrictedUntil,
            lastFailedAt,
            remainingHours: 0,
            failureReason: restrictedMsg.failure_reason
        };
    }
    /**
     * Records a recipient in crm_broadcast_recipients and refreshes broadcast metrics
     */
    async recordBroadcastRecipient(data) {
        const supabase = getSupabaseAdmin();
        await supabase.from('crm_broadcast_recipients').insert({
            broadcast_id: data.broadcastId,
            contact_id: data.contactId,
            phone: data.phone,
            wamid: data.wamid || null,
            status: data.status,
            sent_at: ['sent', 'delivered', 'read'].includes(data.status) ? new Date().toISOString() : null,
            error_message: data.errorMessage || null
        });
        await this.refreshBroadcastMetrics(data.broadcastId);
    }
    /**
     * Updates recipient delivery status (delivered, read, failed) from Meta Webhook wamid
     * and refreshes the parent broadcast campaign metrics
     */
    async updateBroadcastRecipientStatus(wamid, status, errorMessage) {
        const supabase = getSupabaseAdmin();
        const updateData = { status };
        const nowIso = new Date().toISOString();
        if (status === 'sent')
            updateData.sent_at = nowIso;
        if (status === 'delivered')
            updateData.delivered_at = nowIso;
        if (status === 'read')
            updateData.read_at = nowIso;
        if (status === 'failed')
            updateData.error_message = errorMessage || null;
        const { data: updated, error } = await supabase.from('crm_broadcast_recipients')
            .update(updateData)
            .eq('wamid', wamid)
            .select('broadcast_id');
        if (!error && updated && updated.length > 0) {
            for (const item of updated) {
                if (item.broadcast_id) {
                    await this.refreshBroadcastMetrics(item.broadcast_id);
                }
            }
        }
    }
    /**
     * Recalculates metrics on crm_broadcasts from its recipients
     */
    async refreshBroadcastMetrics(broadcastId) {
        const supabase = getSupabaseAdmin();
        const { data: recs, error } = await supabase.from('crm_broadcast_recipients')
            .select('status')
            .eq('broadcast_id', broadcastId);
        if (error || !recs)
            return;
        const total = recs.length;
        const sent = recs.filter((r) => ['sent', 'delivered', 'read'].includes(r.status)).length;
        const delivered = recs.filter((r) => ['delivered', 'read'].includes(r.status)).length;
        const read = recs.filter((r) => r.status === 'read').length;
        const failed = recs.filter((r) => ['failed', 'skipped_no_consent'].includes(r.status)).length;
        let newStatus = 'sending';
        if (sent + failed >= total && total > 0) {
            newStatus = (failed === total) ? 'failed' : 'sent';
        }
        await supabase.from('crm_broadcasts')
            .update({
            total_recipients: total,
            sent_count: sent,
            delivered_count: delivered,
            read_count: read,
            failed_count: failed,
            status: newStatus,
            updated_at: new Date().toISOString()
        })
            .eq('id', broadcastId);
    }
    // ============================================================
    // 5. BROADCASTS
    // ============================================================
    async getBroadcasts(companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_broadcasts')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(error.message);
        return (data || []).map(this.mapBroadcastRow);
    }
    async getBroadcastById(id, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data: bData, error: bError } = await supabase.from('crm_broadcasts')
            .select('*')
            .eq('id', id)
            .eq('company_id', companyId)
            .maybeSingle();
        if (bError || !bData)
            return { broadcast: null, recipients: [] };
        const { data: rData } = await supabase.from('crm_broadcast_recipients')
            .select('*, crm_contacts(name)')
            .eq('broadcast_id', id)
            .order('created_at', { ascending: true });
        const recipients = (rData || []).map((r) => ({
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
    async createBroadcast(data) {
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
        if (error)
            throw new Error(error.message);
        return this.mapBroadcastRow(created);
    }
    async updateBroadcastStatus(id, status, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('crm_broadcasts')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        return data ? this.mapBroadcastRow(data) : null;
    }
    // ============================================================
    // 6. ANALYTICS & DASHBOARD
    // ============================================================
    async getAnalyticsSummary(companyId = 'company-a') {
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
    async getTemplates(companyId = 'company-a', filters) {
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
        if (error)
            throw new Error(error.message);
        return (data || []).map(this.mapTemplateRow);
    }
    async getTemplateById(id, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_templates')
            .select('*')
            .eq('id', id)
            .eq('company_id', companyId)
            .maybeSingle();
        if (error || !data)
            return null;
        return this.mapTemplateRow(data);
    }
    async saveTemplateDraft(data, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const cleanName = data.name.toLowerCase().trim();
        const cleanLang = data.language || 'en';
        // Find existing by ID or (company_id, name, language)
        let existingId = data.id || null;
        let existingStatus = null;
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
        }
        else {
            const { data: match } = await supabase.from('crm_templates')
                .select('status')
                .eq('id', existingId)
                .maybeSingle();
            if (match)
                existingStatus = match.status;
        }
        const payload = {
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
            if (error)
                throw new Error(error.message);
            return this.mapTemplateRow(updated);
        }
        else {
            payload.status = data.status || 'DRAFT';
            const { data: created, error } = await supabase.from('crm_templates')
                .insert(payload)
                .select()
                .single();
            if (error)
                throw new Error(error.message);
            return this.mapTemplateRow(created);
        }
    }
    async updateTemplateStatus(id, update, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const updatePayload = {
            status: update.status,
            rejection_reason: update.rejectionReason || null,
            updated_at: new Date().toISOString()
        };
        if (update.metaTemplateId)
            updatePayload.meta_template_id = update.metaTemplateId;
        if (update.qualityScore)
            updatePayload.quality_score = update.qualityScore;
        const { data, error } = await supabase.from('crm_templates')
            .update(updatePayload)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .maybeSingle();
        if (error || !data)
            return null;
        return this.mapTemplateRow(data);
    }
    async upsertMetaTemplate(metaTmpl, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        let headerType = 'NONE';
        let headerContent = null;
        let headerExample = null;
        let bodyText = '';
        let bodyExampleValues = null;
        let footerText = null;
        let buttons = [];
        if (Array.isArray(metaTmpl.components)) {
            for (const comp of metaTmpl.components) {
                if (comp.type === 'HEADER') {
                    headerType = comp.format || 'TEXT';
                    headerContent = comp.text || (headerType === 'IMAGE' ? 'https://hrms.businz.com/vrm-banner.png' : null);
                    headerExample = comp.example?.header_text || comp.example?.header_handle || null;
                }
                else if (comp.type === 'BODY') {
                    bodyText = comp.text || '';
                    bodyExampleValues = comp.example?.body_text?.[0] || null;
                }
                else if (comp.type === 'FOOTER') {
                    footerText = comp.text || null;
                }
                else if (comp.type === 'BUTTONS') {
                    buttons = (comp.buttons || []).map((b) => ({
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
        const record = {
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
            meta_template_id: metaTmpl.id ? String(metaTmpl.id) : null,
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
            if (error)
                throw new Error(error.message);
            return this.mapTemplateRow(updated);
        }
        else {
            const { data: created, error } = await supabase.from('crm_templates')
                .insert(record)
                .select()
                .single();
            if (error)
                throw new Error(error.message);
            return this.mapTemplateRow(created);
        }
    }
    async deleteTemplate(id, companyId = 'company-a') {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('crm_templates')
            .delete()
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .maybeSingle();
        if (error || !data)
            return null;
        return this.mapTemplateRow(data);
    }
    // ============================================================
    // ROW MAPPERS
    // ============================================================
    mapContactRow(r) {
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
            consentRecordedById: r.consent_recorded_by_id,
            consentRecordedByName: r.consent_recorded_by_name,
            consentNotes: r.consent_notes,
            avatarUrl: r.avatar_url,
            visitingCardUrl: r.visiting_card_url,
            notes: r.notes,
            tags: Array.isArray(r.tags) ? r.tags : [],
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
    mapConversationRow(r) {
        const contactRow = r.crm_contacts;
        return {
            id: r.id,
            companyId: r.company_id,
            contactId: r.contact_id,
            contactName: contactRow?.name || r.contact_name || undefined,
            contactPhone: contactRow?.phone || r.contact_phone || undefined,
            contactCategory: contactRow?.category || r.contact_category || undefined,
            contactAvatarUrl: contactRow?.avatar_url || r.contact_avatar_url || undefined,
            contactConsent: contactRow?.consent_status || undefined,
            status: r.status,
            assignedEmployeeId: r.assigned_employee_id,
            assignedEmployeeName: r.assigned_employee_name,
            lastMessageText: r.last_message_text,
            lastMessageAt: r.last_message_at,
            lastMessageTimestamp: r.last_message_at || r.updated_at || r.created_at,
            unreadCount: r.unread_count || 0,
            aiAutoreplyDisabled: Boolean(r.ai_autoreply_disabled),
            aiReplyCount: r.ai_reply_count || 0,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
    mapMessageRow(r) {
        const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
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
    mapBroadcastRow(r) {
        const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
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
    mapTemplateRow(r) {
        const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
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
//# sourceMappingURL=crmRepository.js.map
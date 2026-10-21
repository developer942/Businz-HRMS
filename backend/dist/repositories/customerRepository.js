import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
// In-memory fallback buffers for offline / demo mode
const inMemoryCustomers = [];
const inMemoryConsents = [];
const inMemoryTemplates = [
    {
        id: 'tmpl-001',
        companyId: 'company-a',
        templateName: 'Customer Welcome',
        metaTemplateName: 'customer_welcome',
        category: 'UTILITY',
        language: 'en_US',
        bodyText: 'Hello {{customer_name}},\n\nGreetings from {{sender_company}}!\n\nThank you for connecting with our team. We look forward to staying in touch.\n\nBest Regards,\n{{sender_company}} Team',
        variableMapping: [
            { placeholder: '{{customer_name}}', metaParamIndex: 1, description: 'Customer Name' },
            { placeholder: '{{sender_company}}', metaParamIndex: 2, description: 'Sender Company Name' }
        ],
        sampleValues: {
            customer_name: 'John Doe',
            sender_company: 'Businz Enterprise'
        },
        status: 'APPROVED',
        isActive: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 'tmpl-002',
        companyId: 'company-a',
        templateName: 'Meeting Follow-up',
        metaTemplateName: 'meeting_followup',
        category: 'UTILITY',
        language: 'en_US',
        bodyText: 'Hi {{customer_name}},\n\nIt was a pleasure meeting you today regarding {{customer_company}}.\n\nOur executive {{employee_name}} will share the detailed proposal shortly.\n\nFeel free to reach us at {{company_phone}}.\n\nRegards,\n{{sender_company}}',
        variableMapping: [
            { placeholder: '{{customer_name}}', metaParamIndex: 1, description: 'Customer Name' },
            { placeholder: '{{customer_company}}', metaParamIndex: 2, description: 'Customer Company' },
            { placeholder: '{{employee_name}}', metaParamIndex: 3, description: 'Executive Name' },
            { placeholder: '{{company_phone}}', metaParamIndex: 4, description: 'Company Phone' },
            { placeholder: '{{sender_company}}', metaParamIndex: 5, description: 'Sender Company' }
        ],
        sampleValues: {
            customer_name: 'Ananya Sharma',
            customer_company: 'Apex Tech Solutions',
            employee_name: 'Rajesh Kumar',
            company_phone: '+91 9876543210',
            sender_company: 'Businz Enterprise'
        },
        status: 'APPROVED',
        isActive: true,
        createdAt: new Date().toISOString()
    }
];
const inMemoryMessages = [];
export class CustomerRepository {
    // Normalize Indian mobile numbers: strip non-digits, if 10 digits add 91, if starts with 0 replace with 91
    normalizePhoneNumber(phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `91${digits}`;
        }
        if (digits.length === 11 && digits.startsWith('0')) {
            return `91${digits.slice(1)}`;
        }
        if (digits.length >= 11 && digits.startsWith('91')) {
            return digits;
        }
        return digits;
    }
    // 1. Generate Next Customer ID for company
    async generateCustomerId(companyId) {
        const year = new Date().getFullYear();
        const prefix = `CUST-${year}`;
        if (isRealSupabaseConfigured()) {
            const supabase = getSupabaseAdmin();
            const { data, error } = await supabase.rpc('next_customer_contact_id', { p_company_id: companyId });
            if (error || !data)
                throw new Error(`Customer ID generation failed: ${error?.message || 'empty database response'}`);
            return String(data);
        }
        const companyCustomers = inMemoryCustomers.filter(c => c.companyId === companyId);
        const nextNum = (companyCustomers.length + 1).toString().padStart(4, '0');
        return `${prefix}-${nextNum}`;
    }
    // 2. Find duplicates by phone within company
    async findDuplicateCustomer(companyId, phone, excludeId) {
        const normalized = this.normalizePhoneNumber(phone);
        if (isRealSupabaseConfigured()) {
            const supabase = getSupabaseAdmin();
            const variants = Array.from(new Set([phone, normalized, `+${normalized}`].filter(Boolean)));
            let query = supabase
                .from('customer_contacts')
                .select('*')
                .eq('company_id', companyId)
                .in('contact_number', variants)
                .limit(1);
            if (excludeId)
                query = query.neq('id', excludeId);
            const { data, error } = await query.maybeSingle();
            if (error)
                throw new Error(`Duplicate check failed: ${error.message}`);
            if (data)
                return this.mapContactRow(data);
        }
        const match = inMemoryCustomers.find(c => c.companyId === companyId &&
            c.id !== excludeId &&
            (this.normalizePhoneNumber(c.contactNumber) === normalized || c.contactNumber === phone));
        return match || null;
    }
    // 3. Save or Update Customer Contact
    async saveCustomer(data) {
        const companyId = data.companyId || 'company-a';
        const now = new Date().toISOString();
        if (data.id) {
            // Update existing
            if (isRealSupabaseConfigured()) {
                const supabase = getSupabaseAdmin();
                const { data: updated, error } = await supabase
                    .from('customer_contacts')
                    .update({
                    customer_name: data.customerName,
                    company_name: data.companyName,
                    designation: data.designation,
                    contact_number: data.contactNumber,
                    alternate_contact_number: data.alternateContactNumber,
                    email: data.email,
                    address: data.address,
                    website: data.website,
                    visiting_card_url: data.visitingCardUrl,
                    consent_status: data.consentStatus,
                    consent_timestamp: data.consentTimestamp,
                    consent_source: data.consentSource,
                    consent_purpose: data.consentPurpose,
                    notes: data.notes,
                    updated_at: now
                })
                    .eq('id', data.id)
                    .eq('company_id', companyId)
                    .select()
                    .single();
                if (error || !updated)
                    throw new Error(`Customer update failed: ${error?.message || 'record not found in company scope'}`);
                return this.mapContactRow(updated);
            }
            const index = inMemoryCustomers.findIndex(c => c.id === data.id);
            if (index !== -1) {
                const merged = { ...inMemoryCustomers[index], ...data, updatedAt: now };
                inMemoryCustomers[index] = merged;
                return merged;
            }
        }
        // Create new customer
        const customerId = await this.generateCustomerId(companyId);
        const newRecord = {
            id: data.id || `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            companyId,
            customerId,
            customerName: data.customerName,
            companyName: data.companyName,
            designation: data.designation,
            contactNumber: data.contactNumber,
            alternateContactNumber: data.alternateContactNumber,
            email: data.email,
            address: data.address,
            website: data.website,
            visitingCardUrl: data.visitingCardUrl,
            collectedById: data.collectedById,
            collectedByName: data.collectedByName,
            collectedDate: data.collectedDate || now,
            consentStatus: data.consentStatus || 'Unknown',
            consentTimestamp: data.consentTimestamp,
            consentSource: data.consentSource,
            consentPurpose: data.consentPurpose,
            lastWhatsappStatus: data.lastWhatsappStatus,
            notes: data.notes,
            createdAt: now,
            updatedAt: now
        };
        if (isRealSupabaseConfigured()) {
            const supabase = getSupabaseAdmin();
            const { data: inserted, error } = await supabase
                .from('customer_contacts')
                .insert({
                company_id: newRecord.companyId,
                customer_id: newRecord.customerId,
                customer_name: newRecord.customerName,
                company_name: newRecord.companyName,
                designation: newRecord.designation,
                contact_number: newRecord.contactNumber,
                alternate_contact_number: newRecord.alternateContactNumber,
                email: newRecord.email,
                address: newRecord.address,
                website: newRecord.website,
                visiting_card_url: newRecord.visitingCardUrl,
                collected_by_id: newRecord.collectedById,
                collected_by_name: newRecord.collectedByName,
                collected_date: newRecord.collectedDate,
                consent_status: newRecord.consentStatus,
                consent_timestamp: newRecord.consentTimestamp,
                consent_source: newRecord.consentSource,
                consent_purpose: newRecord.consentPurpose,
                notes: newRecord.notes
            })
                .select()
                .single();
            if (error || !inserted)
                throw new Error(`Customer persistence failed: ${error?.message || 'empty database response'}`);
            return this.mapContactRow(inserted);
        }
        inMemoryCustomers.unshift(newRecord);
        return newRecord;
    }
    // 4. Record WhatsApp Consent Audit
    async recordConsent(data) {
        const now = new Date().toISOString();
        const record = {
            id: `cns-${Date.now()}`,
            ...data,
            timestamp: now
        };
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                await supabase.from('customer_consent_records').insert({
                    company_id: record.companyId,
                    customer_contact_id: record.customerContactId,
                    consent_status: record.consentStatus,
                    source: record.source,
                    purpose: record.purpose,
                    recorded_by_id: record.recordedById,
                    recorded_by_name: record.recordedByName,
                    ip_address: record.ipAddress,
                    notes: record.notes
                });
                // Also update contact's current consent fields
                await supabase.from('customer_contacts')
                    .update({
                    consent_status: record.consentStatus,
                    consent_timestamp: now,
                    consent_source: record.source,
                    consent_purpose: record.purpose
                })
                    .eq('id', record.customerContactId);
            }
            catch (err) {
                console.warn('Database error recording consent:', err);
            }
        }
        inMemoryConsents.unshift(record);
        const cIdx = inMemoryCustomers.findIndex(c => c.id === record.customerContactId);
        if (cIdx !== -1) {
            inMemoryCustomers[cIdx].consentStatus = record.consentStatus;
            inMemoryCustomers[cIdx].consentTimestamp = now;
            inMemoryCustomers[cIdx].consentSource = record.source;
            inMemoryCustomers[cIdx].consentPurpose = record.purpose;
        }
        return record;
    }
    // 5. Get Customers List with filtering, pagination & company scoping
    async getCustomers(options) {
        const { companyId, search, employeeName, collectedFrom, collectedTo, consentStatus, page = 1, pageSize = 10 } = options;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                let query = supabase
                    .from('customer_contacts')
                    .select('*', { count: 'exact' })
                    .eq('company_id', companyId);
                if (search && search.trim()) {
                    const q = search.trim();
                    query = query.or(`customer_name.ilike.%${q}%,company_name.ilike.%${q}%,contact_number.ilike.%${q}%,customer_id.ilike.%${q}%`);
                }
                if (employeeName && employeeName !== 'All') {
                    query = query.eq('collected_by_name', employeeName);
                }
                if (consentStatus && consentStatus !== 'All') {
                    query = query.eq('consent_status', consentStatus);
                }
                if (collectedFrom) {
                    query = query.gte('collected_date', collectedFrom);
                }
                if (collectedTo) {
                    query = query.lte('collected_date', `${collectedTo}T23:59:59.999Z`);
                }
                const fromIndex = (page - 1) * pageSize;
                const toIndex = fromIndex + pageSize - 1;
                const { data, count, error } = await query
                    .order('collected_date', { ascending: false })
                    .range(fromIndex, toIndex);
                if (data && !error) {
                    return {
                        customers: data.map(this.mapContactRow),
                        total: count || 0,
                        page,
                        pageSize
                    };
                }
            }
            catch (err) {
                console.warn('Database error in getCustomers:', err);
            }
        }
        let filtered = inMemoryCustomers.filter(c => c.companyId === companyId);
        if (search && search.trim()) {
            const q = search.toLowerCase().trim();
            filtered = filtered.filter(c => c.customerName.toLowerCase().includes(q) ||
                (c.companyName && c.companyName.toLowerCase().includes(q)) ||
                c.contactNumber.includes(q) ||
                c.customerId.toLowerCase().includes(q));
        }
        if (employeeName && employeeName !== 'All') {
            filtered = filtered.filter(c => c.collectedByName === employeeName);
        }
        if (consentStatus && consentStatus !== 'All') {
            filtered = filtered.filter(c => c.consentStatus === consentStatus);
        }
        if (collectedFrom) {
            filtered = filtered.filter(c => c.collectedDate >= collectedFrom);
        }
        if (collectedTo) {
            filtered = filtered.filter(c => c.collectedDate <= `${collectedTo}T23:59:59.999Z`);
        }
        const total = filtered.length;
        const startIndex = (page - 1) * pageSize;
        const paginated = filtered.slice(startIndex, startIndex + pageSize);
        return {
            customers: paginated,
            total,
            page,
            pageSize
        };
    }
    // 6. Get Single Customer by ID
    async getCustomerById(id, companyId) {
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data } = await supabase
                    .from('customer_contacts')
                    .select('*')
                    .eq('id', id)
                    .eq('company_id', companyId)
                    .maybeSingle();
                if (data)
                    return this.mapContactRow(data);
            }
            catch (err) {
                console.warn('Database error in getCustomerById:', err);
            }
        }
        return inMemoryCustomers.find(c => c.id === id && c.companyId === companyId) || null;
    }
    // 7. WhatsApp Templates: List
    async getTemplates(companyId) {
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data, error } = await supabase
                    .from('whatsapp_templates')
                    .select('*')
                    .eq('company_id', companyId)
                    .order('created_at', { ascending: false });
                if (data && !error && data.length > 0) {
                    return data.map(this.mapTemplateRow);
                }
            }
            catch (err) {
                console.warn('Database error in getTemplates:', err);
            }
        }
        return inMemoryTemplates.filter(t => t.companyId === companyId);
    }
    // 8. WhatsApp Templates: Save/Update
    async saveTemplate(template) {
        const now = new Date().toISOString();
        const companyId = template.companyId || 'company-a';
        if (template.id) {
            if (isRealSupabaseConfigured()) {
                try {
                    const supabase = getSupabaseAdmin();
                    const { data, error } = await supabase
                        .from('whatsapp_templates')
                        .update({
                        template_name: template.templateName,
                        meta_template_name: template.metaTemplateName,
                        meta_template_id: template.metaTemplateId,
                        category: template.category,
                        language: template.language,
                        body_text: template.bodyText,
                        variable_mapping: template.variableMapping,
                        sample_values: template.sampleValues,
                        status: template.status,
                        rejection_reason: template.rejectionReason,
                        is_active: template.isActive,
                        updated_at: now
                    })
                        .eq('id', template.id)
                        .select()
                        .single();
                    if (data && !error)
                        return this.mapTemplateRow(data);
                }
                catch (err) {
                    console.warn('Database error updating template:', err);
                }
            }
            const idx = inMemoryTemplates.findIndex(t => t.id === template.id);
            if (idx !== -1) {
                const updated = { ...inMemoryTemplates[idx], ...template, updatedAt: now };
                inMemoryTemplates[idx] = updated;
                return updated;
            }
        }
        const newTmpl = {
            id: template.id || `tmpl-${Date.now()}`,
            companyId,
            templateName: template.templateName,
            metaTemplateName: template.metaTemplateName,
            metaTemplateId: template.metaTemplateId,
            category: template.category,
            language: template.language,
            bodyText: template.bodyText,
            variableMapping: template.variableMapping || [],
            sampleValues: template.sampleValues || {},
            status: template.status || 'DRAFT',
            rejectionReason: template.rejectionReason,
            isActive: template.isActive !== undefined ? template.isActive : true,
            createdById: template.createdById,
            createdAt: now,
            updatedAt: now
        };
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data, error } = await supabase
                    .from('whatsapp_templates')
                    .insert({
                    company_id: newTmpl.companyId,
                    template_name: newTmpl.templateName,
                    meta_template_name: newTmpl.metaTemplateName,
                    meta_template_id: newTmpl.metaTemplateId,
                    category: newTmpl.category,
                    language: newTmpl.language,
                    body_text: newTmpl.bodyText,
                    variable_mapping: newTmpl.variableMapping,
                    sample_values: newTmpl.sampleValues,
                    status: newTmpl.status,
                    rejection_reason: newTmpl.rejectionReason,
                    is_active: newTmpl.isActive,
                    created_by_id: newTmpl.createdById
                })
                    .select()
                    .single();
                if (data && !error)
                    return this.mapTemplateRow(data);
            }
            catch (err) {
                console.warn('Database error inserting template:', err);
            }
        }
        inMemoryTemplates.unshift(newTmpl);
        return newTmpl;
    }
    // 9. Save WhatsApp Message
    async saveMessage(msg) {
        const now = new Date().toISOString();
        const newMsg = {
            id: msg.id || `wmsg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            companyId: msg.companyId,
            customerContactId: msg.customerContactId,
            customerName: msg.customerName,
            recipientPhone: msg.recipientPhone,
            templateId: msg.templateId,
            templateName: msg.templateName,
            renderedBody: msg.renderedBody,
            sentById: msg.sentById,
            sentByName: msg.sentByName,
            providerMessageId: msg.providerMessageId,
            status: msg.status || 'queued',
            errorCode: msg.errorCode,
            errorMessage: msg.errorMessage,
            sentAt: msg.sentAt || now,
            deliveredAt: msg.deliveredAt,
            readAt: msg.readAt,
            rawResponse: msg.rawResponse,
            createdAt: now,
            updatedAt: now
        };
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const { data, error } = await supabase
                    .from('whatsapp_messages')
                    .insert({
                    company_id: newMsg.companyId,
                    customer_contact_id: newMsg.customerContactId,
                    customer_name: newMsg.customerName,
                    recipient_phone: newMsg.recipientPhone,
                    template_id: newMsg.templateId,
                    template_name: newMsg.templateName,
                    rendered_body: newMsg.renderedBody,
                    sent_by_id: newMsg.sentById,
                    sent_by_name: newMsg.sentByName,
                    provider_message_id: newMsg.providerMessageId,
                    status: newMsg.status,
                    error_code: newMsg.errorCode,
                    error_message: newMsg.errorMessage,
                    sent_at: newMsg.sentAt,
                    raw_response: newMsg.rawResponse
                })
                    .select()
                    .single();
                if (data && !error) {
                    // Update customer contact last_whatsapp_status
                    if (newMsg.customerContactId) {
                        await supabase.from('customer_contacts')
                            .update({ last_whatsapp_status: newMsg.status })
                            .eq('id', newMsg.customerContactId);
                    }
                    return this.mapMessageRow(data);
                }
            }
            catch (err) {
                console.warn('Database error saving message:', err);
            }
        }
        inMemoryMessages.unshift(newMsg);
        if (newMsg.customerContactId) {
            const c = inMemoryCustomers.find(item => item.id === newMsg.customerContactId);
            if (c)
                c.lastWhatsappStatus = newMsg.status;
        }
        return newMsg;
    }
    // 10. Update WhatsApp Delivery Status via Webhook
    async updateMessageStatusByProviderId(providerMessageId, status, timestamp, errorInfo) {
        const now = timestamp || new Date().toISOString();
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const payload = {
                    status,
                    updated_at: new Date().toISOString()
                };
                if (status === 'delivered')
                    payload.delivered_at = now;
                if (status === 'read')
                    payload.read_at = now;
                if (errorInfo?.code)
                    payload.error_code = errorInfo.code;
                if (errorInfo?.message)
                    payload.error_message = errorInfo.message;
                const { data } = await supabase
                    .from('whatsapp_messages')
                    .update(payload)
                    .eq('provider_message_id', providerMessageId)
                    .select('customer_contact_id')
                    .maybeSingle();
                if (data?.customer_contact_id) {
                    await supabase.from('customer_contacts')
                        .update({ last_whatsapp_status: status })
                        .eq('id', data.customer_contact_id);
                }
                return true;
            }
            catch (err) {
                console.warn('Database error updating message status:', err);
            }
        }
        const msg = inMemoryMessages.find(m => m.providerMessageId === providerMessageId);
        if (msg) {
            msg.status = status;
            if (status === 'delivered')
                msg.deliveredAt = now;
            if (status === 'read')
                msg.readAt = now;
            if (errorInfo?.code)
                msg.errorCode = errorInfo.code;
            if (errorInfo?.message)
                msg.errorMessage = errorInfo.message;
            if (msg.customerContactId) {
                const c = inMemoryCustomers.find(item => item.id === msg.customerContactId);
                if (c)
                    c.lastWhatsappStatus = status;
            }
            return true;
        }
        return false;
    }
    // 11. Get Message History with Filters
    async getMessages(options) {
        const { companyId, customerName, employeeName, templateName, status, dateFrom, dateTo, page = 1, pageSize = 15 } = options;
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                let query = supabase
                    .from('whatsapp_messages')
                    .select('*', { count: 'exact' })
                    .eq('company_id', companyId);
                if (customerName && customerName.trim()) {
                    query = query.ilike('customer_name', `%${customerName.trim()}%`);
                }
                if (employeeName && employeeName !== 'All') {
                    query = query.eq('sent_by_name', employeeName);
                }
                if (templateName && templateName !== 'All') {
                    query = query.eq('template_name', templateName);
                }
                if (status && status !== 'All') {
                    query = query.eq('status', status);
                }
                if (dateFrom) {
                    query = query.gte('sent_at', dateFrom);
                }
                if (dateTo) {
                    query = query.lte('sent_at', `${dateTo}T23:59:59.999Z`);
                }
                const fromIndex = (page - 1) * pageSize;
                const toIndex = fromIndex + pageSize - 1;
                const { data, count, error } = await query
                    .order('sent_at', { ascending: false })
                    .range(fromIndex, toIndex);
                if (data && !error) {
                    return {
                        messages: data.map(this.mapMessageRow),
                        total: count || 0,
                        page,
                        pageSize
                    };
                }
            }
            catch (err) {
                console.warn('Database error in getMessages:', err);
            }
        }
        let filtered = inMemoryMessages.filter(m => m.companyId === companyId);
        if (customerName && customerName.trim()) {
            const q = customerName.toLowerCase().trim();
            filtered = filtered.filter(m => m.customerName.toLowerCase().includes(q) || m.recipientPhone.includes(q));
        }
        if (employeeName && employeeName !== 'All') {
            filtered = filtered.filter(m => m.sentByName === employeeName);
        }
        if (templateName && templateName !== 'All') {
            filtered = filtered.filter(m => m.templateName === templateName);
        }
        if (status && status !== 'All') {
            filtered = filtered.filter(m => m.status === status);
        }
        if (dateFrom) {
            filtered = filtered.filter(m => m.sentAt >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(m => m.sentAt <= `${dateTo}T23:59:59.999Z`);
        }
        const total = filtered.length;
        const startIndex = (page - 1) * pageSize;
        const paginated = filtered.slice(startIndex, startIndex + pageSize);
        return {
            messages: paginated,
            total,
            page,
            pageSize
        };
    }
    // Row mappers from DB snake_case to TS camelCase
    mapContactRow(row) {
        return {
            id: row.id,
            companyId: row.company_id,
            customerId: row.customer_id,
            customerName: row.customer_name,
            companyName: row.company_name,
            designation: row.designation,
            contactNumber: row.contact_number,
            alternateContactNumber: row.alternate_contact_number,
            email: row.email,
            address: row.address,
            website: row.website,
            visitingCardUrl: row.visiting_card_url,
            collectedById: row.collected_by_id,
            collectedByName: row.collected_by_name,
            collectedDate: row.collected_date,
            consentStatus: row.consent_status,
            consentTimestamp: row.consent_timestamp,
            consentSource: row.consent_source,
            consentPurpose: row.consent_purpose,
            lastWhatsappStatus: row.last_whatsapp_status,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
    mapTemplateRow(row) {
        return {
            id: row.id,
            companyId: row.company_id,
            templateName: row.template_name,
            metaTemplateName: row.meta_template_name,
            metaTemplateId: row.meta_template_id,
            category: row.category,
            language: row.language,
            bodyText: row.body_text,
            variableMapping: row.variable_mapping || [],
            sampleValues: row.sample_values || {},
            status: row.status,
            rejectionReason: row.rejection_reason,
            isActive: row.is_active,
            createdById: row.created_by_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
    mapMessageRow(row) {
        return {
            id: row.id,
            companyId: row.company_id,
            customerContactId: row.customer_contact_id,
            customerName: row.customer_name,
            recipientPhone: row.recipient_phone,
            templateId: row.template_id,
            templateName: row.template_name,
            renderedBody: row.rendered_body,
            sentById: row.sent_by_id,
            sentByName: row.sent_by_name,
            providerMessageId: row.provider_message_id,
            status: row.status,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            sentAt: row.sent_at,
            deliveredAt: row.delivered_at,
            readAt: row.read_at,
            rawResponse: row.raw_response,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
export const customerRepository = new CustomerRepository();
//# sourceMappingURL=customerRepository.js.map
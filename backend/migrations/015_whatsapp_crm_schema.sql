-- ============================================================
-- Migration: 015_whatsapp_crm_schema.sql
-- Module: Native WhatsApp CRM for BUSINZ HRMS
--
-- Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
-- Copyright (c) 2026 Arnas Donauskas - MIT License
--
-- Adapted for BUSINZ HRMS:
-- - Pure PostgreSQL (zero Supabase JS / RLS runtime dependencies)
-- - Native company_id tenancy alignment
-- - Unified contact synchronization (Visiting Card Scanner + Employee Directory)
-- - De-duplication on phone_normalized
-- - Anti-spam consent enforcement
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CRM CONTACTS DIRECTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           TEXT NOT NULL DEFAULT 'company-a',
    phone                TEXT NOT NULL,
    phone_normalized     TEXT GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
    name                 TEXT NOT NULL,
    email                TEXT,
    company_name         TEXT,
    designation          TEXT,
    category             TEXT NOT NULL DEFAULT 'Customers' 
                         CHECK (category IN ('Employees', 'Scanned Contacts', 'Customers', 'Others')),
    source_type          TEXT NOT NULL DEFAULT 'MANUAL'
                         CHECK (source_type IN ('HRMS_EMPLOYEE', 'VISITING_CARD', 'MANUAL', 'INBOUND_CHAT')),
    source_id            TEXT,
    consent_status       TEXT NOT NULL DEFAULT 'Unknown'
                         CHECK (consent_status IN ('Opted In', 'Not Opted In', 'Unknown')),
    consent_source       TEXT,
    consent_timestamp    TIMESTAMPTZ,
    avatar_url           TEXT,
    visiting_card_url    TEXT,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_contacts_company_phone UNIQUE (company_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_lookup ON public.crm_contacts(company_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_category ON public.crm_contacts(company_id, category);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_consent ON public.crm_contacts(company_id, consent_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_source ON public.crm_contacts(company_id, source_type, source_id);

-- ============================================================
-- 2. CRM TAGS & CONTACT_TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_tags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   TEXT NOT NULL DEFAULT 'company-a',
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#0E7490',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_tags UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_contact_tags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id   UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    tag_id       UUID NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_contact_tag UNIQUE (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_tags_contact ON public.crm_contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_tags_tag ON public.crm_contact_tags(tag_id);

-- ============================================================
-- 3. CRM CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_conversations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    contact_id              UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
    assigned_employee_id    TEXT REFERENCES public.employees(employee_id) ON DELETE SET NULL,
    assigned_employee_name  TEXT,
    last_message_text       TEXT,
    last_message_at         TIMESTAMPTZ,
    unread_count            INTEGER NOT NULL DEFAULT 0,
    ai_autoreply_disabled   BOOLEAN NOT NULL DEFAULT FALSE,
    ai_reply_count          INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_conversations_contact UNIQUE (company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_conversations_lookup ON public.crm_conversations(company_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_conversations_assigned ON public.crm_conversations(company_id, assigned_employee_id);

-- ============================================================
-- 4. CRM MESSAGES (Inbound & Outbound)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id       UUID NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
    company_id            TEXT NOT NULL DEFAULT 'company-a',
    sender_type           TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
    sender_id             TEXT,
    content_type          TEXT NOT NULL DEFAULT 'text'
                          CHECK (content_type IN ('text', 'image', 'document', 'audio', 'video', 'location', 'template', 'interactive')),
    content_text          TEXT,
    media_url             TEXT,
    template_name         TEXT,
    template_variables    JSONB,
    interactive_payload   JSONB,
    wamid                 TEXT UNIQUE,
    status                TEXT NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
    failure_reason        TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_messages_conv ON public.crm_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_messages_wamid ON public.crm_messages(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_status ON public.crm_messages(company_id, status);

-- ============================================================
-- 5. CRM BROADCAST CAMPAIGNS & RECIPIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_broadcasts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    name                    TEXT NOT NULL,
    template_name           TEXT NOT NULL,
    template_language       TEXT NOT NULL DEFAULT 'en',
    template_variables      JSONB,
    audience_filter         JSONB,
    scheduled_at            TIMESTAMPTZ,
    status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'paused')),
    total_recipients        INTEGER NOT NULL DEFAULT 0,
    sent_count              INTEGER NOT NULL DEFAULT 0,
    delivered_count         INTEGER NOT NULL DEFAULT 0,
    read_count              INTEGER NOT NULL DEFAULT 0,
    replied_count           INTEGER NOT NULL DEFAULT 0,
    failed_count            INTEGER NOT NULL DEFAULT 0,
    created_by_employee_id  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_broadcast_recipients (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id     UUID NOT NULL REFERENCES public.crm_broadcasts(id) ON DELETE CASCADE,
    contact_id       UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    phone            TEXT NOT NULL,
    wamid            TEXT,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped_no_consent')),
    sent_at          TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    read_at          TIMESTAMPTZ,
    replied_at       TIMESTAMPTZ,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_broadcast_recipients ON public.crm_broadcast_recipients(broadcast_id, status);

-- ============================================================
-- 6. CRM NO-CODE AUTOMATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_automations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         TEXT NOT NULL DEFAULT 'company-a',
    name               TEXT NOT NULL,
    description        TEXT,
    trigger_type       TEXT NOT NULL,
    trigger_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active          BOOLEAN NOT NULL DEFAULT FALSE,
    execution_count    INTEGER NOT NULL DEFAULT 0,
    last_executed_at   TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_automation_steps (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id      UUID NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
    parent_step_id     UUID REFERENCES public.crm_automation_steps(id) ON DELETE CASCADE,
    branch             TEXT CHECK (branch IN ('yes', 'no')),
    step_type          TEXT NOT NULL,
    step_config        JSONB NOT NULL DEFAULT '{}'::jsonb,
    position           INTEGER NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_automation_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id      UUID NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
    company_id         TEXT NOT NULL DEFAULT 'company-a',
    contact_id         UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    trigger_event      TEXT NOT NULL,
    steps_executed     JSONB NOT NULL DEFAULT '[]'::jsonb,
    status             TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    error_message      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_automation_pending_executions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id       UUID NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
    company_id          TEXT NOT NULL DEFAULT 'company-a',
    contact_id          UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    log_id              UUID REFERENCES public.crm_automation_logs(id) ON DELETE CASCADE,
    parent_step_id      UUID REFERENCES public.crm_automation_steps(id) ON DELETE SET NULL,
    branch              TEXT CHECK (branch IN ('yes', 'no')),
    next_step_position  INTEGER NOT NULL,
    context             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
    run_at              TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_auto_pending_due ON public.crm_automation_pending_executions(run_at) WHERE status = 'pending';

-- ============================================================
-- 7. CRM AI CONFIGS & KNOWLEDGE BASE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_ai_configs (
    id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                       TEXT NOT NULL UNIQUE DEFAULT 'company-a',
    provider                         TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'deepseek')),
    model                            TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    api_key                          TEXT,
    system_prompt                    TEXT,
    is_active                        BOOLEAN NOT NULL DEFAULT FALSE,
    auto_reply_enabled               BOOLEAN NOT NULL DEFAULT FALSE,
    auto_reply_max_per_conversation  INTEGER NOT NULL DEFAULT 3 CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 20),
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_ai_knowledge (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   TEXT NOT NULL DEFAULT 'company-a',
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_knowledge ON public.crm_ai_knowledge(company_id, is_active);

-- ============================================================
-- 8. AUTOMATIC CONTACT SYNCHRONIZATION TRIGGERS
-- ============================================================

-- Function: Sync from customer_contacts (Visiting Card Scanner & Form)
CREATE OR REPLACE FUNCTION public.trg_sync_customer_contact_to_crm()
RETURNS TRIGGER AS $$
DECLARE
    clean_phone TEXT;
BEGIN
    clean_phone := regexp_replace(NEW.contact_number, '\D', '', 'g');
    IF clean_phone IS NOT NULL AND length(clean_phone) >= 7 THEN
        INSERT INTO public.crm_contacts (
            company_id,
            phone,
            name,
            email,
            company_name,
            designation,
            category,
            source_type,
            source_id,
            consent_status,
            consent_source,
            consent_timestamp,
            visiting_card_url,
            notes,
            created_at,
            updated_at
        ) VALUES (
            COALESCE(NEW.company_id, 'company-a'),
            NEW.contact_number,
            NEW.customer_name,
            NEW.email,
            NEW.company_name,
            NEW.designation,
            CASE 
                WHEN NEW.visiting_card_url IS NOT NULL AND NEW.visiting_card_url <> '' THEN 'Scanned Contacts'
                ELSE 'Customers'
            END,
            CASE 
                WHEN NEW.visiting_card_url IS NOT NULL AND NEW.visiting_card_url <> '' THEN 'VISITING_CARD'
                ELSE 'MANUAL'
            END,
            NEW.id::TEXT,
            COALESCE(NEW.consent_status::TEXT, 'Unknown'),
            NEW.consent_source,
            NEW.consent_timestamp,
            NEW.visiting_card_url,
            NEW.notes,
            COALESCE(NEW.created_at, NOW()),
            NOW()
        )
        ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
            name = EXCLUDED.name,
            email = COALESCE(EXCLUDED.email, public.crm_contacts.email),
            company_name = COALESCE(EXCLUDED.company_name, public.crm_contacts.company_name),
            designation = COALESCE(EXCLUDED.designation, public.crm_contacts.designation),
            visiting_card_url = COALESCE(EXCLUDED.visiting_card_url, public.crm_contacts.visiting_card_url),
            consent_status = CASE 
                WHEN EXCLUDED.consent_status = 'Opted In' THEN 'Opted In' 
                ELSE public.crm_contacts.consent_status 
            END,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_contacts_crm_sync ON public.customer_contacts;
CREATE TRIGGER trg_customer_contacts_crm_sync
    AFTER INSERT OR UPDATE ON public.customer_contacts
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_customer_contact_to_crm();

-- Function: Sync from employees table
CREATE OR REPLACE FUNCTION public.trg_sync_employee_to_crm()
RETURNS TRIGGER AS $$
DECLARE
    clean_phone TEXT;
    emp_full_name TEXT;
BEGIN
    IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
        clean_phone := regexp_replace(NEW.phone, '\D', '', 'g');
        IF clean_phone IS NOT NULL AND length(clean_phone) >= 7 THEN
            emp_full_name := trim(concat_ws(' ', NEW.first_name, NEW.last_name));
            IF emp_full_name = '' THEN emp_full_name := 'Employee ' || NEW.employee_id; END IF;

            INSERT INTO public.crm_contacts (
                company_id,
                phone,
                name,
                email,
                company_name,
                designation,
                category,
                source_type,
                source_id,
                consent_status,
                consent_source,
                consent_timestamp,
                avatar_url,
                created_at,
                updated_at
            ) VALUES (
                COALESCE(NEW.company_id, 'company-a'),
                NEW.phone,
                emp_full_name,
                NEW.email,
                'Internal Staff',
                NEW.designation,
                'Employees',
                'HRMS_EMPLOYEE',
                NEW.employee_id,
                'Opted In',
                'Internal Employment Contract',
                NOW(),
                NEW.avatar_url,
                COALESCE(NEW.created_at, NOW()),
                NOW()
            )
            ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
                name = EXCLUDED.name,
                email = COALESCE(EXCLUDED.email, public.crm_contacts.email),
                designation = COALESCE(EXCLUDED.designation, public.crm_contacts.designation),
                category = 'Employees',
                source_type = 'HRMS_EMPLOYEE',
                source_id = EXCLUDED.source_id,
                consent_status = 'Opted In',
                avatar_url = COALESCE(EXCLUDED.avatar_url, public.crm_contacts.avatar_url),
                updated_at = NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_crm_sync ON public.employees;
CREATE TRIGGER trg_employees_crm_sync
    AFTER INSERT OR UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_employee_to_crm();

-- ============================================================
-- 9. INITIAL BACKFILL OF EXISTING CONTACTS INTO CRM
-- ============================================================
-- Backfill from customer_contacts
INSERT INTO public.crm_contacts (
    company_id, phone, name, email, company_name, designation, 
    category, source_type, source_id, consent_status, consent_source, 
    consent_timestamp, visiting_card_url, notes, created_at, updated_at
)
SELECT 
    COALESCE(company_id, 'company-a'),
    contact_number,
    customer_name,
    email,
    company_name,
    designation,
    CASE 
        WHEN visiting_card_url IS NOT NULL AND visiting_card_url <> '' THEN 'Scanned Contacts'
        ELSE 'Customers'
    END,
    CASE 
        WHEN visiting_card_url IS NOT NULL AND visiting_card_url <> '' THEN 'VISITING_CARD'
        ELSE 'MANUAL'
    END,
    id::TEXT,
    COALESCE(consent_status::TEXT, 'Unknown'),
    consent_source,
    consent_timestamp,
    visiting_card_url,
    notes,
    created_at,
    NOW()
FROM public.customer_contacts
WHERE regexp_replace(contact_number, '\D', '', 'g') <> ''
ON CONFLICT (company_id, phone_normalized) DO NOTHING;

-- Backfill from employees
INSERT INTO public.crm_contacts (
    company_id, phone, name, email, company_name, designation, 
    category, source_type, source_id, consent_status, consent_source, 
    consent_timestamp, avatar_url, created_at, updated_at
)
SELECT 
    COALESCE(company_id, 'company-a'),
    phone,
    trim(concat_ws(' ', first_name, last_name)),
    email,
    'Internal Staff',
    designation,
    'Employees',
    'HRMS_EMPLOYEE',
    employee_id,
    'Opted In',
    'Internal Employment Contract',
    NOW(),
    avatar_url,
    created_at,
    NOW()
FROM public.employees
WHERE phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> ''
ON CONFLICT (company_id, phone_normalized) DO NOTHING;

-- ============================================================
-- Migration 009: Customer Data Collection & WhatsApp Messaging System
-- Preserves existing schema; additive definitions only.
-- Supports strict tenant isolation (company_id).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. WhatsApp Consent Status Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_whatsapp_consent_status') THEN
        CREATE TYPE public.hr_whatsapp_consent_status AS ENUM (
            'Opted In',
            'Not Opted In',
            'Unknown'
        );
    END IF;
END $$;

-- 2. WhatsApp Message Delivery Status Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_whatsapp_message_status') THEN
        CREATE TYPE public.hr_whatsapp_message_status AS ENUM (
            'queued',
            'accepted',
            'sent',
            'delivered',
            'read',
            'failed'
        );
    END IF;
END $$;

-- 3. WhatsApp Template Category Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_whatsapp_template_category') THEN
        CREATE TYPE public.hr_whatsapp_template_category AS ENUM (
            'MARKETING',
            'UTILITY',
            'AUTHENTICATION'
        );
    END IF;
END $$;

-- 4. WhatsApp Template Approval Status Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_whatsapp_template_status') THEN
        CREATE TYPE public.hr_whatsapp_template_status AS ENUM (
            'DRAFT',
            'PENDING',
            'APPROVED',
            'REJECTED',
            'PAUSED',
            'DISABLED'
        );
    END IF;
END $$;

-- ============================================================
-- 5. Table: customer_contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_contacts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    customer_id             TEXT NOT NULL,
    customer_name           TEXT NOT NULL,
    company_name            TEXT,
    designation             TEXT,
    contact_number          TEXT NOT NULL,
    alternate_contact_number TEXT,
    email                   CITEXT,
    address                 TEXT,
    website                 TEXT,
    visiting_card_url       TEXT,
    collected_by_id         UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    collected_by_name       TEXT NOT NULL,
    collected_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consent_status          public.hr_whatsapp_consent_status NOT NULL DEFAULT 'Unknown',
    consent_timestamp       TIMESTAMPTZ,
    consent_source          TEXT,
    consent_purpose         TEXT,
    last_whatsapp_status    public.hr_whatsapp_message_status,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_company_customer_id UNIQUE (company_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_lookup 
    ON public.customer_contacts(company_id, contact_number);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_collected 
    ON public.customer_contacts(company_id, collected_date DESC);

DROP TRIGGER IF EXISTS trg_customer_contacts_updated_at ON public.customer_contacts;
CREATE TRIGGER trg_customer_contacts_updated_at
    BEFORE UPDATE ON public.customer_contacts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. Table: customer_consent_records (Audit Trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_consent_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          TEXT NOT NULL DEFAULT 'company-a',
    customer_contact_id UUID NOT NULL REFERENCES public.customer_contacts(id) ON DELETE CASCADE,
    consent_status      public.hr_whatsapp_consent_status NOT NULL,
    source              TEXT NOT NULL, -- 'Visiting Card', 'Web Form', 'Verbal', 'Direct Agreement'
    purpose             TEXT NOT NULL, -- e.g. 'Business communications and follow-ups'
    recorded_by_id      UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    recorded_by_name    TEXT,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address          TEXT,
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_consent_records_cid 
    ON public.customer_consent_records(customer_contact_id, timestamp DESC);

-- ============================================================
-- 7. Table: whatsapp_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          TEXT NOT NULL DEFAULT 'company-a',
    template_name       TEXT NOT NULL,
    meta_template_name  TEXT NOT NULL,
    meta_template_id    TEXT,
    category            public.hr_whatsapp_template_category NOT NULL DEFAULT 'UTILITY',
    language            TEXT NOT NULL DEFAULT 'en_US',
    body_text           TEXT NOT NULL,
    variable_mapping    JSONB NOT NULL DEFAULT '[]'::jsonb,
    sample_values       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              public.hr_whatsapp_template_status NOT NULL DEFAULT 'DRAFT',
    rejection_reason    TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id       UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_company_template_name UNIQUE (company_id, template_name)
);

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
    BEFORE UPDATE ON public.whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8. Table: whatsapp_messages (Message History)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          TEXT NOT NULL DEFAULT 'company-a',
    customer_contact_id UUID REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
    customer_name       TEXT NOT NULL,
    recipient_phone     TEXT NOT NULL,
    template_id         UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    template_name       TEXT NOT NULL,
    rendered_body       TEXT NOT NULL,
    sent_by_id          UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    sent_by_name        TEXT NOT NULL,
    provider_message_id TEXT,
    status              public.hr_whatsapp_message_status NOT NULL DEFAULT 'queued',
    error_code          TEXT,
    error_message       TEXT,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at        TIMESTAMPTZ,
    read_at             TIMESTAMPTZ,
    raw_response        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lookup 
    ON public.whatsapp_messages(company_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer 
    ON public.whatsapp_messages(customer_contact_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id 
    ON public.whatsapp_messages(provider_message_id);

DROP TRIGGER IF EXISTS trg_whatsapp_messages_updated_at ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_messages_updated_at
    BEFORE UPDATE ON public.whatsapp_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- ============================================================
-- Migration: 016_crm_templates_schema.sql
-- Module: WhatsApp Template Management & Creation for BUSINZ HRMS
--
-- Pure PostgreSQL (zero Supabase dependencies)
-- Manages local drafts and synchronizes live Meta Cloud API templates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_templates (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           TEXT NOT NULL DEFAULT 'company-a',
    meta_template_id     TEXT,
    name                 TEXT NOT NULL,
    category             TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    language             TEXT NOT NULL DEFAULT 'en',
    status               TEXT NOT NULL DEFAULT 'DRAFT' 
                         CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
    header_type          TEXT DEFAULT 'NONE' CHECK (header_type IN ('NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT')),
    header_content       TEXT,
    header_example       JSONB,
    body_text            TEXT NOT NULL,
    body_example_values  JSONB DEFAULT '[]'::jsonb,
    footer_text          TEXT,
    buttons              JSONB DEFAULT '[]'::jsonb,
    raw_components       JSONB DEFAULT '[]'::jsonb,
    rejection_reason     TEXT,
    quality_score        TEXT,
    last_synced_at       TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_templates_company_name_lang UNIQUE (company_id, name, language)
);

CREATE INDEX IF NOT EXISTS idx_crm_templates_company_status ON public.crm_templates(company_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_templates_company_category ON public.crm_templates(company_id, category);
CREATE INDEX IF NOT EXISTS idx_crm_templates_company_name ON public.crm_templates(company_id, name);

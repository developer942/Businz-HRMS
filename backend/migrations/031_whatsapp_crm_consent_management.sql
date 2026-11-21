-- Migration 031: WhatsApp CRM Consent Recording & Management
-- Support Opted In, Opted Out, Unknown with full audit trail

-- 1. Ensure crm_contacts supports 'Opted In', 'Opted Out', 'Unknown'
ALTER TABLE public.crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_consent_status_check;
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_consent_status_check 
  CHECK (consent_status = ANY (ARRAY['Opted In'::text, 'Opted Out'::text, 'Not Opted In'::text, 'Unknown'::text, 'Pending'::text]));

-- 2. Add audit fields to crm_contacts
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS consent_recorded_by_id TEXT;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS consent_recorded_by_name TEXT;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS consent_notes TEXT;

-- 3. Ensure hr_whatsapp_consent_status enum supports 'Opted Out'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON e.enumtypid = t.oid 
        WHERE t.typname = 'hr_whatsapp_consent_status' AND e.enumlabel = 'Opted Out'
    ) THEN
        ALTER TYPE hr_whatsapp_consent_status ADD VALUE 'Opted Out';
    END IF;
END $$;

-- 4. Adjust customer_consent_records constraints to allow audit tracking for CRM contacts
ALTER TABLE public.customer_consent_records DROP CONSTRAINT IF EXISTS customer_consent_records_customer_contact_id_fkey;
ALTER TABLE public.customer_consent_records ALTER COLUMN customer_contact_id DROP NOT NULL;
ALTER TABLE public.customer_consent_records ADD COLUMN IF NOT EXISTS crm_contact_id UUID;

-- 5. Sync existing recorded consent between duplicate contact records sharing the same last 10 digits
UPDATE public.crm_contacts c1
SET consent_status = c2.consent_status,
    consent_source = c2.consent_source,
    consent_timestamp = c2.consent_timestamp,
    updated_at = NOW()
FROM public.crm_contacts c2
WHERE c1.company_id = c2.company_id
  AND c1.consent_status = 'Unknown'
  AND c2.consent_status IN ('Opted In', 'Opted Out')
  AND right(c1.phone_normalized, 10) = right(c2.phone_normalized, 10)
  AND c1.id <> c2.id;

-- 6. Sync matching customer_contacts rows where CRM contact has Opted In
UPDATE public.customer_contacts cc
SET consent_status = 'Opted In'::hr_whatsapp_consent_status,
    consent_source = c.consent_source,
    consent_timestamp = c.consent_timestamp,
    updated_at = NOW()
FROM public.crm_contacts c
WHERE cc.company_id = c.company_id
  AND (cc.id::text = c.source_id OR right(regexp_replace(cc.contact_number, '\D', '', 'g'), 10) = right(c.phone_normalized, 10))
  AND c.consent_status = 'Opted In'
  AND cc.consent_status <> 'Opted In'::hr_whatsapp_consent_status;

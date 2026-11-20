-- Migration 030: Fix Approved Template Header URL and Ensure WhatsApp Message Rendering
-- Fixes vrm_expo_followup_v1 template header_content and past template message records

-- 1. Ensure header_content for vrm_expo_followup_v1 points to valid public HTTPS image link
UPDATE public.crm_templates
SET header_content = 'https://hrms.businz.com/brand-logo.png',
    updated_at = NOW()
WHERE name = 'vrm_expo_followup_v1' AND (header_content IS NULL OR header_content = '');

-- 2. Populate media_url and interactive_payload on existing template message records
-- for seamless rendering in HRMS Inbox
UPDATE public.crm_messages
SET media_url = 'https://hrms.businz.com/brand-logo.png'
WHERE (template_name = 'vrm_expo_followup_v1' OR content_text ILIKE '%VRM Structures%')
  AND media_url IS NULL;

UPDATE public.crm_messages
SET interactive_payload = '{"buttons": [{"text": "Call Support", "type": "PHONE_NUMBER", "phoneNumber": "+919884330789"}, {"url": "https://vrmstructures.in/", "text": "Visit Website", "type": "URL"}]}'::jsonb
WHERE (template_name = 'vrm_expo_followup_v1' OR content_text ILIKE '%VRM Structures%')
  AND interactive_payload IS NULL;

-- Migration 035: Notifications & Action Workflow Architecture
-- Provides enterprise-grade notification storage, explicit deduplication,
-- action status tracking (Pending/Handled), multi-stage approver resolution, and persistent read state.

-- 1. Upgrade public.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    priority TEXT NOT NULL DEFAULT 'Normal',
    category TEXT NOT NULL DEFAULT 'Announcement',
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a',
    ADD COLUMN IF NOT EXISTS module TEXT,
    ADD COLUMN IF NOT EXISTS record_id TEXT,
    ADD COLUMN IF NOT EXISTS event_type TEXT,
    ADD COLUMN IF NOT EXISTS dedup_key TEXT,
    ADD COLUMN IF NOT EXISTS action_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS action_status TEXT NOT NULL DEFAULT 'None',
    ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sender_name TEXT,
    ADD COLUMN IF NOT EXISTS target_roles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Unique constraint on deduplication key to prevent duplicate notifications
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS unique_notifications_dedup_key;
ALTER TABLE public.notifications ADD CONSTRAINT unique_notifications_dedup_key UNIQUE (dedup_key);

CREATE INDEX IF NOT EXISTS idx_notifications_module_record 
    ON public.notifications(module, record_id);

CREATE INDEX IF NOT EXISTS idx_notifications_company 
    ON public.notifications(company_id);

CREATE INDEX IF NOT EXISTS idx_notifications_action_status 
    ON public.notifications(action_status);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
    ON public.notifications(created_at DESC);

-- 2. Upgrade public.notification_recipients
CREATE TABLE IF NOT EXISTS public.notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    CONSTRAINT unique_notification_employee UNIQUE (notification_id, employee_id)
);

ALTER TABLE public.notification_recipients
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_notif_recipients_emp_read 
    ON public.notification_recipients(employee_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notif_recipients_notif_id 
    ON public.notification_recipients(notification_id);

-- 3. Data migration from legacy company_settings.shared_notifications_data
DO $$
DECLARE
    legacy_data JSONB;
    item JSONB;
    n_id UUID;
    t_title TEXT;
    t_msg TEXT;
    t_prio TEXT;
    t_cat TEXT;
    t_link TEXT;
    t_created TIMESTAMPTZ;
    t_roles TEXT[];
    t_emp_id TEXT;
    emp_uuid UUID;
BEGIN
    SELECT setting_val INTO legacy_data 
    FROM public.company_settings 
    WHERE setting_key = 'shared_notifications_data' 
    LIMIT 1;

    IF legacy_data IS NOT NULL AND jsonb_typeof(legacy_data) = 'array' THEN
        FOR item IN SELECT * FROM jsonb_array_elements(legacy_data)
        LOOP
            t_title := COALESCE(item->>'title', 'Notification');
            t_msg := COALESCE(item->>'message', '');
            t_prio := COALESCE(item->>'priority', 'Normal');
            t_cat := COALESCE(item->>'category', 'Announcement');
            t_link := item->>'link';
            BEGIN
                t_created := (item->>'createdAt')::TIMESTAMPTZ;
            EXCEPTION WHEN OTHERS THEN
                t_created := NOW();
            END;

            -- Insert into notifications if message is not empty
            IF t_msg <> '' THEN
                INSERT INTO public.notifications (
                    title, message, priority, category, link, created_at, timestamp,
                    dedup_key, action_status
                ) VALUES (
                    t_title, t_msg, t_prio, t_cat, t_link, t_created, t_created,
                    'legacy:' || md5(t_title || t_msg || COALESCE(item->>'createdAt', '')),
                    'None'
                )
                ON CONFLICT (dedup_key) DO NOTHING
                RETURNING id INTO n_id;

                -- If successfully inserted, populate recipients
                IF n_id IS NOT NULL THEN
                    IF item->'targetEmployeeIds' IS NOT NULL AND jsonb_typeof(item->'targetEmployeeIds') = 'array' THEN
                        FOR t_emp_id IN SELECT jsonb_array_elements_text(item->'targetEmployeeIds')
                        LOOP
                            SELECT id INTO emp_uuid 
                            FROM public.employees 
                            WHERE employee_id = t_emp_id OR id::text = t_emp_id OR email = t_emp_id 
                            LIMIT 1;

                            IF emp_uuid IS NOT NULL THEN
                                INSERT INTO public.notification_recipients (notification_id, employee_id, is_read)
                                VALUES (n_id, emp_uuid, FALSE)
                                ON CONFLICT (notification_id, employee_id) DO NOTHING;
                            END IF;
                        END LOOP;
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;
END $$;

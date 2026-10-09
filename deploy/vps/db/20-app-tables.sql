-- Businz HRMS: application tables that the frontend/backend use but were missing from schema.sql.
-- Idempotent: safe to run multiple times on an existing database (CREATE ... IF NOT EXISTS only).

-- 1. Key/value store for company details, settings and module data (company_info, policies, etc.)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_val jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Task Management module (full task object kept in task_data)
CREATE TABLE IF NOT EXISTS public.enterprise_tasks (
  id                      text PRIMARY KEY,
  task_number             text,
  title                   text,
  assigned_by             text,
  responsible_person_id   text,
  responsible_person_name text,
  department              text,
  priority                text,
  due_date                text,
  overall_status          text DEFAULT 'OPEN',
  overall_progress        numeric DEFAULT 0,
  task_data               jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_tasks_responsible ON public.enterprise_tasks (responsible_person_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_tasks_created_at ON public.enterprise_tasks (created_at DESC);

-- 3. Payroll statutory settings (single 'global' row, updated by backend settingsRepository)
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_key                  text NOT NULL UNIQUE DEFAULT 'global',
  pf_enabled               boolean DEFAULT false,
  pf_rate                  numeric DEFAULT 12.0,
  pf_wage_ceiling          numeric DEFAULT 15000.0,
  pf_wage_components       jsonb DEFAULT '{"basic":true,"da":true,"conveyance":true,"hra":false,"attendance_bonus":false,"overtime":false,"other_earnings":false}'::jsonb,
  esic_enabled             boolean DEFAULT false,
  esic_rate                numeric DEFAULT 0.75,
  esic_salary_threshold    numeric DEFAULT 21000.0,
  esic_wage_components     jsonb DEFAULT '{"basic":true,"da":true,"conveyance":true,"hra":true,"attendance_bonus":true,"overtime":true,"other_earnings":true}'::jsonb,
  professional_tax_enabled boolean DEFAULT false,
  professional_tax_amount  numeric DEFAULT 0,
  lop_enabled              boolean DEFAULT true,
  attendance_bonus_enabled boolean DEFAULT false,
  overtime_enabled         boolean DEFAULT false,
  standard_working_days    integer DEFAULT 26,
  payroll_cycle_day        integer DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.payroll_settings (org_key) VALUES ('global') ON CONFLICT (org_key) DO NOTHING;

-- 4. Monthly payroll runs (id format: run-YYYY-MM)
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id               text PRIMARY KEY,
  payroll_month    integer NOT NULL,
  payroll_year     integer NOT NULL,
  status           text NOT NULL DEFAULT 'DRAFT',
  total_employees  integer DEFAULT 0,
  total_gross      numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  total_net        numeric DEFAULT 0,
  processed_by     text,
  approved_by      text,
  processed_at     timestamptz,
  approved_at      timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_month, payroll_year)
);

-- 5. Employee salary structures (one active row per employee)
CREATE TABLE IF NOT EXISTS public.salary_structures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  monthly_salary        numeric DEFAULT 0,
  basic_percentage      numeric DEFAULT 0,
  da_percentage         numeric DEFAULT 0,
  conveyance_percentage numeric DEFAULT 0,
  hra_percentage        numeric DEFAULT 0,
  effective_from        date,
  effective_to          date,
  is_active             boolean DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salary_structures_employee ON public.salary_structures (employee_id, is_active);

-- Same access model as the rest of the VPS schema (see 99-vps-access.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    GRANT ALL PRIVILEGES ON public.company_settings, public.enterprise_tasks, public.payroll_settings,
                            public.payroll_runs, public.salary_structures TO web_anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT ALL PRIVILEGES ON public.company_settings, public.enterprise_tasks, public.payroll_settings,
                            public.payroll_runs, public.salary_structures TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT ALL PRIVILEGES ON public.company_settings, public.enterprise_tasks, public.payroll_settings,
                            public.payroll_runs, public.salary_structures TO authenticated;
  END IF;
END $$;

-- Tell PostgREST to pick up the new tables immediately
NOTIFY pgrst, 'reload schema';

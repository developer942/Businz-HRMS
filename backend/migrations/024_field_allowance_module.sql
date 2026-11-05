BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.field_allowance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL DEFAULT 'company-a',
  trip_code TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department_id TEXT,
  department_name TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  customer_site_name TEXT,
  destination TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  travel_mode TEXT,
  description TEXT,
  advance_required BOOLEAN NOT NULL DEFAULT FALSE,
  requested_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (requested_amount >= 0),
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (approved_amount >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','PENDING_APPROVAL','CORRECTION_REQUESTED','REJECTED','APPROVED',
    'AMOUNT_DISTRIBUTED','IN_PROGRESS','COMPLETED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT field_allowance_valid_dates CHECK (end_date >= start_date),
  CONSTRAINT field_allowance_advance_amount CHECK (
    (advance_required = TRUE AND requested_amount > 0) OR
    (advance_required = FALSE AND requested_amount = 0)
  ),
  UNIQUE(company_id, trip_code)
);

CREATE TABLE IF NOT EXISTS public.field_allowance_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.field_allowance_requests(id) ON DELETE CASCADE,
  approved_by TEXT NOT NULL,
  approver_name TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','CORRECTION_REQUESTED')),
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (approved_amount >= 0),
  remarks TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.field_allowance_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.field_allowance_requests(id) ON DELETE RESTRICT,
  distributed_by TEXT NOT NULL,
  distributor_name TEXT NOT NULL,
  distributed_amount NUMERIC(14,2) NOT NULL CHECK (distributed_amount >= 0),
  distribution_date DATE NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.field_allowance_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.field_allowance_requests(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('TRAVEL','FOOD','ROOM','BUS','FUEL','OTHER')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  attachment_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_allowance_requests_company_employee
  ON public.field_allowance_requests(company_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_allowance_requests_company_status
  ON public.field_allowance_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_allowance_distributions_request
  ON public.field_allowance_distributions(request_id, distribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_allowance_daily_reports_request
  ON public.field_allowance_daily_reports(request_id, expense_date DESC);

COMMIT;

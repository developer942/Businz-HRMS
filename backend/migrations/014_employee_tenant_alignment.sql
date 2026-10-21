BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a';

CREATE INDEX IF NOT EXISTS idx_employees_company_employee
  ON public.employees (company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_status
  ON public.employees (company_id, status);

COMMIT;

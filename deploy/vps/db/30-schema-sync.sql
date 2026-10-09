-- Businz HRMS: bring the VPS schema in line with what the application code writes.
-- These changes were applied to the old Supabase project by backend/scripts/syncDatabase.mjs and
-- migrate_employee_fk.mjs, but never made it into schema.sql, so the VPS database was missing them.
-- Idempotent: ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS only. No data is modified.

-- 1. employees: login password + full profile fields used by Add/Edit Employee
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS password                  text,
  ADD COLUMN IF NOT EXISTS work_shift                text,
  ADD COLUMN IF NOT EXISTS address_line1             text,
  ADD COLUMN IF NOT EXISTS address_line2             text,
  ADD COLUMN IF NOT EXISTS city                      text,
  ADD COLUMN IF NOT EXISTS state                     text,
  ADD COLUMN IF NOT EXISTS country                   text,
  ADD COLUMN IF NOT EXISTS pincode                   text,
  ADD COLUMN IF NOT EXISTS highest_qualification     text,
  ADD COLUMN IF NOT EXISTS degree_name               text,
  ADD COLUMN IF NOT EXISTS specialization            text,
  ADD COLUMN IF NOT EXISTS university                text,
  ADD COLUMN IF NOT EXISTS year_of_passing           integer,
  ADD COLUMN IF NOT EXISTS grade_percentage          numeric,
  ADD COLUMN IF NOT EXISTS experience_profile        text,
  ADD COLUMN IF NOT EXISTS total_experience          numeric,
  ADD COLUMN IF NOT EXISTS previous_company          text,
  ADD COLUMN IF NOT EXISTS previous_designation      text,
  ADD COLUMN IF NOT EXISTS previous_department       text,
  ADD COLUMN IF NOT EXISTS employment_start_date     date,
  ADD COLUMN IF NOT EXISTS employment_end_date       date,
  ADD COLUMN IF NOT EXISTS last_drawn_salary         numeric,
  ADD COLUMN IF NOT EXISTS previous_company_location text,
  ADD COLUMN IF NOT EXISTS pan_number                text,
  ADD COLUMN IF NOT EXISTS uan_number                text;
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees (lower(email));
CREATE INDEX IF NOT EXISTS idx_employees_empid ON public.employees (employee_id);

-- 2. attendance_records: late / early / overtime tracking used by attendance + OT approval
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS late_duration_minutes  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_checkout_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_ot_hours    double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_ot_hours      double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_status              text DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS ot_reason              text,
  ADD COLUMN IF NOT EXISTS notes                  text;
CREATE INDEX IF NOT EXISTS idx_attendance_records_emp ON public.attendance_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_shift_date ON public.attendance_records (shift_id, shift_date);

-- 3. leave_requests: approval timestamp (approve/reject sends approved_at; was missing on BOTH databases)
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- 4. field_duty_assignments: backend stores the employee display name
ALTER TABLE public.field_duty_assignments ADD COLUMN IF NOT EXISTS employee_name text;

-- 5. Foreign keys: deleting an employee must not be blocked by their child records
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_employee_id_fkey;
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ALTER COLUMN responsible_person_id DROP NOT NULL;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_responsible_person_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_responsible_person_id_fkey
  FOREIGN KEY (responsible_person_id) REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.task_updates DROP CONSTRAINT IF EXISTS task_updates_employee_id_fkey;
ALTER TABLE public.task_updates ADD CONSTRAINT task_updates_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.performance_scores DROP CONSTRAINT IF EXISTS performance_scores_employee_id_fkey;
ALTER TABLE public.performance_scores ADD CONSTRAINT performance_scores_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_employee_id_fkey;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

-- 5. Enum values the application writes but the original enums did not allow.
--    'Inactive' is set when HR deactivates an employee login (was silently rejected before).
ALTER TYPE public.hr_employee_status   ADD VALUE IF NOT EXISTS 'Inactive';
ALTER TYPE public.hr_attendance_status ADD VALUE IF NOT EXISTS 'Holiday';
ALTER TYPE public.hr_attendance_status ADD VALUE IF NOT EXISTS 'Week Off';
ALTER TYPE public.hr_attendance_status ADD VALUE IF NOT EXISTS 'Missing Punch';

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- Migration 026: Enterprise Overtime Eligibility, Dynamic Calendar/Divisor Engine,
--                Statutory ESIC Integration, Payslip Visibility & Lock Protection
-- ==============================================================================
-- Preserves all existing employee, attendance, salary, and payroll records.

BEGIN;

-- 1. Department-Wise Overtime Eligibility Rules Table
CREATE TABLE IF NOT EXISTS public.department_ot_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id TEXT,
    department_name TEXT NOT NULL UNIQUE,
    standard_shift_hours NUMERIC(5, 2) NOT NULL DEFAULT 9.00 CHECK (standard_shift_hours > 0),
    ot_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    hourly_rate NUMERIC(12, 2) NOT NULL DEFAULT 100.00 CHECK (hourly_rate >= 0),
    wage_base TEXT NOT NULL DEFAULT 'FIXED_HOURLY' CHECK (wage_base IN ('FIXED_HOURLY', 'BASIC', 'GROSS', 'CTC')),
    multiplier TEXT NOT NULL DEFAULT 'Fixed Amount Per Hour',
    effective_from DATE NOT NULL DEFAULT '2020-01-01',
    effective_to DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

-- Seed default department overtime eligibility rules (FLOOR and Dispatch Loading eligible; others restricted)
INSERT INTO public.department_ot_policies (department_name, standard_shift_hours, ot_allowed, hourly_rate, wage_base, multiplier)
VALUES
    ('FLOOR', 9.00, TRUE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Dispatch Loading', 9.00, TRUE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('ACCOUNTS', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('HR', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('DESIGN', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('DEVELOPER', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Digital Marketing', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Dispatch', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Marketing', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Operation', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Production', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Purchase', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Sales', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour'),
    ('Technical Support', 9.00, FALSE, 100.00, 'FIXED_HOURLY', 'Fixed Amount Per Hour')
ON CONFLICT (department_name) DO NOTHING;

-- 2. Employee-Specific Overtime Exception & Statutory Entitlement Table
CREATE TABLE IF NOT EXISTS public.employee_ot_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL UNIQUE,
    employee_name TEXT NOT NULL,
    department TEXT NOT NULL,
    exception_rule TEXT NOT NULL DEFAULT 'Follow Department' CHECK (exception_rule IN ('Follow Department', 'Allow OT', 'Block OT')),
    statutory_entitlement BOOLEAN NOT NULL DEFAULT FALSE,
    override_hourly_rate NUMERIC(12, 2),
    override_multiplier TEXT,
    override_wage_base TEXT CHECK (override_wage_base IS NULL OR override_wage_base IN ('FIXED_HOURLY', 'BASIC', 'GROSS', 'CTC')),
    effective_from DATE NOT NULL DEFAULT '2020-01-01',
    effective_to DATE,
    remarks TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

-- 3. Employee Department History Table (Supports historical department resolution for OT)
CREATE TABLE IF NOT EXISTS public.employee_department_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL,
    department_id TEXT,
    department_name TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    changed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_dept_history_emp ON public.employee_department_history(employee_id, effective_from);

-- 4. Enhance overtime_records Table for Enterprise Workflow, Deduplication & Locking
ALTER TABLE public.overtime_records
    ADD COLUMN IF NOT EXISTS wage_base TEXT DEFAULT 'FIXED_HOURLY',
    ADD COLUMN IF NOT EXISTS divisor_used NUMERIC(5, 2) DEFAULT 26.00,
    ADD COLUMN IF NOT EXISTS calendar_days_in_month INT DEFAULT 30,
    ADD COLUMN IF NOT EXISTS standard_shift_hours NUMERIC(5, 2) DEFAULT 9.00,
    ADD COLUMN IF NOT EXISTS multiplier_value NUMERIC(5, 2) DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS eligibility_source TEXT DEFAULT 'DEPARTMENT_POLICY',
    ADD COLUMN IF NOT EXISTS attendance_record_id TEXT,
    ADD COLUMN IF NOT EXISTS payroll_record_id UUID REFERENCES public.payroll_records(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payroll_month TEXT,
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_backdated_arrear BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS arrear_source_month TEXT;

-- Prevent duplicate overtime payments for the same employee and attendance date
CREATE UNIQUE INDEX IF NOT EXISTS uq_overtime_employee_date
    ON public.overtime_records(employee_id, date)
    WHERE status IN ('PENDING', 'APPROVED', 'PAID');

-- 5. Enhance payroll_settings Table with Divisor Mode & Payslip Overtime Visibility
ALTER TABLE public.payroll_settings
    ADD COLUMN IF NOT EXISTS salary_divisor_mode TEXT NOT NULL DEFAULT 'FIXED_DAYS',
    ADD COLUMN IF NOT EXISTS ot_wage_base TEXT NOT NULL DEFAULT 'FIXED_HOURLY',
    ADD COLUMN IF NOT EXISTS ot_multiplier TEXT NOT NULL DEFAULT 'Fixed Amount Per Hour',
    ADD COLUMN IF NOT EXISTS standard_shift_hours NUMERIC(5, 2) NOT NULL DEFAULT 9.00,
    ADD COLUMN IF NOT EXISTS payslip_overtime_visibility JSONB NOT NULL DEFAULT '{"showOtHoursOnPayslip": true, "showOtAmountOnPayslip": true, "showOtCalculationDetailsOnPayslip": false}'::jsonb;

-- 6. Enhance payroll_records Table with Overtime Rate, Calendar Days, Divisor & Locking
ALTER TABLE public.payroll_records
    ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS calendar_days_in_month INT NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS salary_divisor_used NUMERIC(5, 2) NOT NULL DEFAULT 26.00,
    ADD COLUMN IF NOT EXISTS salary_divisor_mode TEXT NOT NULL DEFAULT 'FIXED_DAYS',
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by TEXT;

COMMIT;


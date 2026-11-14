-- =================================================================================
-- Migration 027: Complete Overtime, Payroll Formula, ESIC & PF Statutory Integration
-- Safe, non-destructive idempotent schema additions. Preserves all historical records.
-- =================================================================================

-- 1. Company & Branch Scoping + Statutory Multiplier & Weekly OT Threshold on Overtime Policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'overtime_policies') THEN
    ALTER TABLE overtime_policies
      ADD COLUMN IF NOT EXISTS company_id VARCHAR(64) DEFAULT 'DEFAULT_COMPANY',
      ADD COLUMN IF NOT EXISTS branch_id VARCHAR(64) DEFAULT 'ALL',
      ADD COLUMN IF NOT EXISTS max_weekly_ot_hours NUMERIC(6, 2) DEFAULT 12.00,
      ADD COLUMN IF NOT EXISTS statutory_multiplier NUMERIC(5, 2) DEFAULT 2.00,
      ADD COLUMN IF NOT EXISTS show_ot_rate_on_payslip BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS show_employer_contributions_on_payslip BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Employee Overtime Exceptions: Reason, Authorization & Company/Branch Isolation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_overtime_exceptions') THEN
    ALTER TABLE employee_overtime_exceptions
      ADD COLUMN IF NOT EXISTS company_id VARCHAR(64) DEFAULT 'DEFAULT_COMPANY',
      ADD COLUMN IF NOT EXISTS branch_id VARCHAR(64) DEFAULT 'ALL',
      ADD COLUMN IF NOT EXISTS reason TEXT,
      ADD COLUMN IF NOT EXISTS authorized_by VARCHAR(128);
  END IF;
END $$;

-- 3. Payroll Records: Global OT Variable, Separate Employer PF (12%) & Employer ESIC (3.25%), and ESIC Coverage Status
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_records') THEN
    ALTER TABLE payroll_records
      ADD COLUMN IF NOT EXISTS ot_variable_amount NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS employer_pf_rate NUMERIC(5, 2) DEFAULT 12.00,
      ADD COLUMN IF NOT EXISTS employer_pf_contribution NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS employer_esic_rate NUMERIC(5, 2) DEFAULT 3.25,
      ADD COLUMN IF NOT EXISTS employer_esic_contribution NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS esic_coverage_status BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

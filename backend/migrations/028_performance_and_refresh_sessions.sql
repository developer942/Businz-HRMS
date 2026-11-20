-- Migration 028: Performance Indexes & Secure Rotating Refresh Sessions
-- Safe, idempotent (IF NOT EXISTS) migration for BUSINZ HRMS.

-- 1. Secure server-side refresh token sessions (hashed SHA-256 only, supports rotation + concurrent grace window)
CREATE TABLE IF NOT EXISTS public.auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_family UUID NOT NULL,
  replaced_by_hash TEXT NULL,
  grace_until TIMESTAMPTZ NULL,
  auth_method TEXT NOT NULL DEFAULT 'password',
  user_agent TEXT NULL,
  ip_address TEXT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_employee_active
  ON public.auth_refresh_tokens (LOWER(employee_code))
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family
  ON public.auth_refresh_tokens (token_family);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires
  ON public.auth_refresh_tokens (expires_at);

-- 2. Functional & composite indexes justified by production EXPLAIN ANALYZE and pg_stat_user_tables
CREATE INDEX IF NOT EXISTS idx_employees_employee_id_lower
  ON public.employees (LOWER(employee_id));

CREATE INDEX IF NOT EXISTS idx_attendance_records_date_checkin_desc
  ON public.attendance_records (date DESC, check_in DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_expenses_date_created_desc
  ON public.expenses (date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_created_desc
  ON public.leave_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_duty_assignments_emp_dates
  ON public.field_duty_assignments (employee_id, start_date, end_date);

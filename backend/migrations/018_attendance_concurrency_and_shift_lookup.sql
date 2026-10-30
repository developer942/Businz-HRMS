-- Migration 018: Attendance Concurrency Audit Table & Shift-Aware Lookup Indexing
-- BUSINZ Enterprise HRMS
--
-- Purpose:
-- 1. Moves all attendance DDL out of normal Punch In / Punch Out runtime API execution.
-- 2. Preserves historical attendance records (including dates with multiple shift/manual entries)
--    without deleting, merging, or overwriting any rows.
-- 3. Preserves the canonical `unique_employee_shift_date UNIQUE (employee_id, shift_id, shift_date)`
--    constraint and adds a fast non-unique composite lookup index on `(employee_id, date DESC, shift_date DESC)`
--    instead of attempting `CREATE UNIQUE INDEX idx_attendance_records_employee_date_unique ON (employee_id, date)`
--    which fails whenever legitimate multi-shift or historical multiple rows exist for a calendar date.
-- 4. Ensures `public.attendance_punch_events` and its `idempotency_key` uniqueness constraint exist
--    for idempotent one-click Punch In / Punch Out deduplication.

CREATE TABLE IF NOT EXISTS public.attendance_punch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('IN', 'OUT')),
  punched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT UNIQUE,
  photo_fingerprint TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_accuracy DOUBLE PRECISION,
  location_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_punch_events_employee_time
  ON public.attendance_punch_events(employee_id, punched_at DESC);

DROP INDEX IF EXISTS public.idx_attendance_records_employee_date_unique;

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date_lookup
  ON public.attendance_records(employee_id, date DESC, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_shift_date
  ON public.attendance_records(employee_id, shift_date);

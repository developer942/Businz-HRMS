-- Migration 029: Permanent Field Employee Automatic GPS Tracking
-- Idempotent (IF NOT EXISTS) schema enhancements for BUSINZ HRMS.

-- 1. Link field trip sessions to authoritative attendance records
ALTER TABLE public.field_trip_sessions
  ADD COLUMN IF NOT EXISTS attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL;

ALTER TABLE public.field_trip_sessions
  ADD COLUMN IF NOT EXISTS is_permanent_field BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Mark field duty assignments as permanent or temporary
ALTER TABLE public.field_duty_assignments
  ADD COLUMN IF NOT EXISTS is_permanent_field BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Performance indexes for live tracking, attendance linking, and profile lookup
CREATE INDEX IF NOT EXISTS idx_field_trips_attendance_rec
  ON public.field_trip_sessions (attendance_record_id);

CREATE INDEX IF NOT EXISTS idx_field_trips_emp_status
  ON public.field_trip_sessions (employee_id, status);

CREATE INDEX IF NOT EXISTS idx_field_duty_permanent
  ON public.field_duty_assignments (employee_id, is_permanent_field);

CREATE INDEX IF NOT EXISTS idx_employees_attendance_method
  ON public.employees (attendance_method);

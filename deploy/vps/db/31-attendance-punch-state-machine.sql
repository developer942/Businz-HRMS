-- BUSINZ HRMS attendance punch safety (additive; does not update historical rows).
-- Apply in development before exercising the new punch endpoint.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE TABLE IF NOT EXISTS public.attendance_punch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id uuid NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  punch_type text NOT NULL CHECK (punch_type IN ('IN', 'OUT')),
  punched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key text NOT NULL UNIQUE,
  photo_fingerprint text NOT NULL,
  location_lat double precision,
  location_lng double precision,
  location_accuracy double precision,
  location_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_attendance_punch_events_employee_time
  ON public.attendance_punch_events(employee_id, punched_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_shift_date
  ON public.attendance_records(employee_id, shift_date);

NOTIFY pgrst, 'reload schema';

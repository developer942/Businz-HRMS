-- Migration 032: Field GPS Tracking Deduplication, Canonical Sessions & Data Integrity
-- Phase 1 Permanent Field Tracking Fix for BUSINZ HRMS.

-- ============================================================================
-- 0. SCHEMA COMPATIBILITY: ENSURE COLUMNS EXIST BEFORE QUERIES
-- ============================================================================

ALTER TABLE public.field_trip_sessions 
    ADD COLUMN IF NOT EXISTS last_gps_update timestamp with time zone,
    ADD COLUMN IF NOT EXISTS is_permanent_field boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS tracking_status text DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS gps_status text DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS attendance_record_id uuid;

ALTER TABLE public.field_duty_assignments 
    ADD COLUMN IF NOT EXISTS is_permanent_field boolean DEFAULT false;

-- ============================================================================
-- 1. RECONCILE EXISTING DUPLICATE & STALE SESSIONS (PRESERVE ALL GPS POINTS)
-- ============================================================================

-- A. Auto-close previous-day sessions that were left incorrectly 'Active'
UPDATE public.field_trip_sessions
SET 
    status = 'Completed',
    trip_end_time = COALESCE(trip_end_time, last_gps_update, trip_start_time + interval '8 hours 30 minutes'),
    check_out_time = COALESCE(check_out_time, last_gps_update, trip_start_time + interval '8 hours 30 minutes'),
    tracking_status = 'Tracking Completed',
    gps_status = 'GPS Off',
    updated_at = NOW()
WHERE status = 'Active' 
  AND trip_start_time::date < CURRENT_DATE;

-- Also close previous-day field duty assignments left 'Active'
UPDATE public.field_duty_assignments
SET 
    status = 'Completed',
    updated_at = NOW()
WHERE status = 'Active' 
  AND end_date < CURRENT_DATE;

-- B. Reconcile duplicate active sessions for today (keep the canonical permanent attendance session)
DO $$
DECLARE
    rec RECORD;
    v_canonical_trip_id UUID;
BEGIN
    -- For any employee who has more than 1 active trip session today:
    FOR rec IN 
        SELECT employee_id, COUNT(*) 
        FROM public.field_trip_sessions 
        WHERE status = 'Active' 
        GROUP BY employee_id 
        HAVING COUNT(*) > 1
    LOOP
        -- Pick the canonical session (prefer permanent field session with attendance_record_id, or newest)
        SELECT id INTO v_canonical_trip_id
        FROM public.field_trip_sessions
        WHERE employee_id = rec.employee_id AND status = 'Active'
        ORDER BY is_permanent_field DESC, attendance_record_id IS NOT NULL DESC, trip_start_time ASC
        LIMIT 1;

        -- Re-parent all location points from the duplicate session(s) into the canonical session
        UPDATE public.field_location_points
        SET trip_id = v_canonical_trip_id
        WHERE trip_id IN (
            SELECT id FROM public.field_trip_sessions 
            WHERE employee_id = rec.employee_id AND status = 'Active' AND id <> v_canonical_trip_id
        );

        -- Mark the duplicate session(s) as Completed so only 1 remains Active
        UPDATE public.field_trip_sessions
        SET status = 'Completed',
            trip_end_time = NOW(),
            check_out_time = NOW(),
            tracking_status = 'Merged into canonical session',
            gps_status = 'GPS Off',
            updated_at = NOW()
        WHERE employee_id = rec.employee_id 
          AND status = 'Active' 
          AND id <> v_canonical_trip_id;
    END LOOP;
END $$;

-- ============================================================================
-- 2. PARTIAL UNIQUE CONSTRAINT: PREVENT DUPLICATE ACTIVE SESSIONS FOREVER
-- ============================================================================

-- At both API and database level, an employee can have at most ONE active tracking session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_trip_per_employee 
  ON public.field_trip_sessions (employee_id) 
  WHERE (status = 'Active');

-- An employee can have at most ONE active permanent field duty assignment
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_perm_duty_per_employee 
  ON public.field_duty_assignments (employee_id) 
  WHERE (status = 'Active' AND is_permanent_field = TRUE);

-- ============================================================================
-- 3. PERFORMANCE INDEXES FOR CONTINUOUS GPS INGESTION & AUDIT LOOKUP
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_field_trip_emp_active 
  ON public.field_trip_sessions (employee_id, status);

CREATE INDEX IF NOT EXISTS idx_field_trip_emp_time 
  ON public.field_trip_sessions (employee_id, trip_start_time DESC);

CREATE INDEX IF NOT EXISTS idx_field_location_trip_recorded 
  ON public.field_location_points (trip_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_field_location_emp_recorded 
  ON public.field_location_points (employee_id, recorded_at DESC);

NOTIFY pgrst, 'reload schema';

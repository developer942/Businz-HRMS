-- ==============================================================================
-- Migration 033: Canonical Tracking Sessions & Historical Data Reconciliation
-- ==============================================================================

BEGIN;

-- 1. Schema Extensions for Canonical Tracking Architecture
ALTER TABLE public.field_duty_assignments
  ADD COLUMN IF NOT EXISTS canonical_session_id UUID REFERENCES public.field_trip_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL;

ALTER TABLE public.field_trip_sessions
  ADD COLUMN IF NOT EXISTS gps_quality TEXT DEFAULT 'No GPS Data',
  ADD COLUMN IF NOT EXISTS child_visits_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ensure an index on attendance_record_id for quick canonical lookup
CREATE INDEX IF NOT EXISTS idx_field_trip_sessions_attendance
  ON public.field_trip_sessions (attendance_record_id)
  WHERE attendance_record_id IS NOT NULL;

-- 2. Dhanasekar J Historical Reconciliation (2026-11-23 & 2026-11-24)
DO $$
DECLARE
  v_emp_id UUID := 'd252d7a5-2417-4dc6-8314-4caa8f6fc76a';
  v_trip_23 UUID := '6ca03033-02e7-4e5b-a736-3cacf2527e57';
  v_dup_trip_23 UUID := '7e39191d-9fb4-4d93-a140-43333587e960';
  v_trip_24 UUID := '90637cb4-9905-42c0-ae9a-db599d5fcf44';
  v_dup_trip_24 UUID := 'd06b2724-c36e-4cab-a2fb-72e6db91a2b8';
  v_assign_site_23 UUID := 'afb2d267-bc70-4718-ab12-a3f657db307e';
  v_assign_perm_23 UUID := 'f1b0a35a-19e9-4ec9-ad6e-89bccf2c3cb5';
  v_assign_site_24 UUID := 'a6ed7de2-e9a4-462e-a6cf-53ad2cf7c95b';
  v_assign_perm_24 UUID := '8aa6845b-380f-4e15-ae42-f0af3c35ad9f';
BEGIN
  -- A. Reconcile 2026-11-23
  -- Move points recorded on 2026-11-23 from duplicate trip to canonical trip 6ca03033
  UPDATE public.field_location_points
  SET trip_id = v_trip_23
  WHERE trip_id = v_dup_trip_23
    AND recorded_at < '2026-11-24 00:00:00+00';

  -- Move points recorded on 2026-11-24 morning from 7e39191d to canonical trip 90637cb4
  UPDATE public.field_location_points
  SET trip_id = v_trip_24
  WHERE trip_id = v_dup_trip_23
    AND recorded_at >= '2026-11-24 00:00:00+00';

  -- Update canonical session for 23 Nov
  UPDATE public.field_trip_sessions
  SET status = 'Auto Closed',
      tracking_status = 'Auto Closed (Cutoff Reached)',
      gps_status = 'GPS Off',
      gps_quality = 'Insufficient GPS Data',
      check_out_time = NULL,
      trip_end_time = NULL,
      total_km = 0.0,
      recorded_distance_meters = 0.0,
      road_matched_distance_meters = 0.0,
      raw_points_count = (SELECT count(*) FROM public.field_location_points WHERE trip_id = v_trip_23),
      accepted_points_count = (SELECT count(*) FROM public.field_location_points WHERE trip_id = v_trip_23 AND is_rejected = FALSE),
      child_visits_count = 1,
      updated_at = NOW()
  WHERE id = v_trip_23;

  -- Link 23 Nov site visit to canonical trip 6ca03033
  UPDATE public.field_duty_assignments
  SET canonical_session_id = v_trip_23,
      status = 'Completed',
      notes = COALESCE(notes, '') || ' [Child visit linked to canonical session]'
  WHERE id = v_assign_site_23;

  -- Archive duplicate artificial assignment
  UPDATE public.field_duty_assignments
  SET status = 'Archived',
      notes = 'Merged into canonical attendance session'
  WHERE id = v_assign_perm_23;

  -- Mark duplicate 23 Nov trip as Cancelled / Merged
  UPDATE public.field_trip_sessions
  SET status = 'Cancelled',
      tracking_status = 'Merged into canonical session',
      gps_status = 'GPS Off',
      notes = 'Merged into canonical session ' || v_trip_23::text
  WHERE id = v_dup_trip_23;

  -- B. Reconcile 2026-11-24
  -- Update canonical session for 24 Nov
  UPDATE public.field_trip_sessions
  SET status = 'Auto Closed',
      tracking_status = 'Auto Closed (Cutoff Reached)',
      gps_status = 'GPS Off',
      gps_quality = 'Partial GPS Data',
      check_out_time = NULL,
      trip_end_time = NULL,
      total_km = 0.0,
      recorded_distance_meters = 0.0,
      road_matched_distance_meters = 0.0,
      raw_points_count = (SELECT count(*) FROM public.field_location_points WHERE trip_id = v_trip_24),
      accepted_points_count = (SELECT count(*) FROM public.field_location_points WHERE trip_id = v_trip_24 AND is_rejected = FALSE),
      child_visits_count = 1,
      updated_at = NOW()
  WHERE id = v_trip_24;

  -- Link 24 Nov site visit to canonical trip 90637cb4
  UPDATE public.field_duty_assignments
  SET canonical_session_id = v_trip_24,
      status = 'Completed',
      notes = COALESCE(notes, '') || ' [Child visit linked to canonical session]'
  WHERE id = v_assign_site_24;

  -- Archive duplicate artificial assignment
  UPDATE public.field_duty_assignments
  SET status = 'Archived',
      notes = 'Merged into canonical attendance session'
  WHERE id = v_assign_perm_24;

  -- Mark duplicate 24 Nov trip as Cancelled / Merged
  UPDATE public.field_trip_sessions
  SET status = 'Cancelled',
      tracking_status = 'Merged into canonical session',
      gps_status = 'GPS Off',
      notes = 'Merged into canonical session ' || v_trip_24::text
  WHERE id = v_dup_trip_24;

  RAISE NOTICE 'Dhanasekar historical records for 2026-11-23 and 2026-11-24 successfully reconciled.';
END $$;

COMMIT;

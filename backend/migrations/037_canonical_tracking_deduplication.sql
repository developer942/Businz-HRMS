-- ==============================================================================
-- Migration 037: Final Canonical Tracking Deduplication & Dhanasekar Fix
-- ==============================================================================

BEGIN;

-- 1. Ensure Dhanasekar J (VRM-042) is configured for 'Tracking Field'
UPDATE public.employees
SET attendance_method = 'Tracking Field'
WHERE employee_id = 'VRM-042' OR id = 'd252d7a5-2417-4dc6-8314-4caa8f6fc76a';

-- 2. Clean up & Reconcile Dhanasekar J Historical Records
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
  -- Transfer any orphaned location points to canonical trip
  UPDATE public.field_location_points
  SET trip_id = v_trip_23
  WHERE trip_id = v_dup_trip_23
     OR (employee_id = v_emp_id AND recorded_at >= '2026-11-23 00:00:00+00' AND recorded_at < '2026-11-24 00:00:00+00' AND trip_id != v_trip_23);

  -- Set canonical session status and metrics for 23 Nov
  UPDATE public.field_trip_sessions
  SET status = 'Auto Closed',
      tracking_status = 'Auto Closed (No Punch Out)',
      gps_status = 'GPS Off',
      gps_quality = 'Insufficient GPS Data',
      check_out_time = NULL,
      trip_end_time = NULL,
      is_permanent_field = TRUE,
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
      canonical_session_id = v_trip_23,
      notes = 'Merged into canonical attendance session'
  WHERE id = v_assign_perm_23;

  -- Mark duplicate 23 Nov trip as Cancelled / Merged
  UPDATE public.field_trip_sessions
  SET status = 'Cancelled',
      tracking_status = 'Merged into canonical session',
      gps_status = 'GPS Off',
      notes = 'Merged into canonical session ' || v_trip_23::text
  WHERE id = v_dup_trip_23;

  -- Cancel any other trips for Dhanasekar on 2026-11-23
  UPDATE public.field_trip_sessions
  SET status = 'Cancelled',
      tracking_status = 'Merged into canonical session',
      notes = 'Merged into canonical session ' || v_trip_23::text
  WHERE employee_id = v_emp_id
    AND id != v_trip_23
    AND trip_start_time::date = '2026-11-23';

  -- B. Reconcile 2026-11-24
  -- Transfer any orphaned location points to canonical trip
  UPDATE public.field_location_points
  SET trip_id = v_trip_24
  WHERE trip_id = v_dup_trip_24
     OR (employee_id = v_emp_id AND recorded_at >= '2026-11-24 00:00:00+00' AND recorded_at < '2026-11-25 00:00:00+00' AND trip_id != v_trip_24);

  -- Set canonical session status and metrics for 24 Nov
  UPDATE public.field_trip_sessions
  SET status = 'Auto Closed',
      tracking_status = 'Auto Closed (No Punch Out)',
      gps_status = 'GPS Off',
      gps_quality = 'Partial GPS Data',
      check_out_time = NULL,
      trip_end_time = NULL,
      is_permanent_field = TRUE,
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
      canonical_session_id = v_trip_24,
      notes = 'Merged into canonical attendance session'
  WHERE id = v_assign_perm_24;

  -- Mark duplicate 24 Nov trip as Cancelled / Merged
  UPDATE public.field_trip_sessions
  SET status = 'Cancelled',
      tracking_status = 'Merged into canonical session',
      gps_status = 'GPS Off',
      notes = 'Merged into canonical session ' || v_trip_24::text
  WHERE id = v_dup_trip_24;

  -- Cancel any other trips for Dhanasekar on 2026-11-24
  UPDATE public.field_trip_sessions
  SET status = 'Cancelled',
      tracking_status = 'Merged into canonical session',
      notes = 'Merged into canonical session ' || v_trip_24::text
  WHERE employee_id = v_emp_id
    AND id != v_trip_24
    AND trip_start_time::date = '2026-11-24';

END $$;

COMMIT;


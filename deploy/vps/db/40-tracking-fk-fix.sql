-- Businz HRMS: Fix foreign key constraints on field tracking, shifts, and job openings.
-- Ensures cascading deletes and prevents RESTRICT errors when updating/deleting records.

ALTER TABLE public.field_duty_assignments DROP CONSTRAINT IF EXISTS field_duty_assignments_employee_id_fkey;
ALTER TABLE public.field_duty_assignments ADD CONSTRAINT field_duty_assignments_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.field_duty_assignments DROP CONSTRAINT IF EXISTS field_duty_assignments_created_by_fkey;
ALTER TABLE public.field_duty_assignments ADD CONSTRAINT field_duty_assignments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.field_location_points DROP CONSTRAINT IF EXISTS field_location_points_employee_id_fkey;
ALTER TABLE public.field_location_points ADD CONSTRAINT field_location_points_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.field_tracking_alerts DROP CONSTRAINT IF EXISTS field_tracking_alerts_employee_id_fkey;
ALTER TABLE public.field_tracking_alerts ADD CONSTRAINT field_tracking_alerts_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.field_trip_sessions DROP CONSTRAINT IF EXISTS field_trip_sessions_employee_id_fkey;
ALTER TABLE public.field_trip_sessions ADD CONSTRAINT field_trip_sessions_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.shift_requests DROP CONSTRAINT IF EXISTS shift_requests_current_shift_id_fkey;
ALTER TABLE public.shift_requests ADD CONSTRAINT shift_requests_current_shift_id_fkey
  FOREIGN KEY (current_shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;

ALTER TABLE public.shift_requests DROP CONSTRAINT IF EXISTS shift_requests_requested_shift_id_fkey;
ALTER TABLE public.shift_requests ADD CONSTRAINT shift_requests_requested_shift_id_fkey
  FOREIGN KEY (requested_shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;

ALTER TABLE public.job_openings DROP CONSTRAINT IF EXISTS job_openings_department_id_fkey;
ALTER TABLE public.job_openings ADD CONSTRAINT job_openings_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';

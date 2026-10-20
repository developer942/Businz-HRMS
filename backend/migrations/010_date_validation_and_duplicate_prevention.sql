-- Migration 010: Global Date Validation & Duplicate Request Prevention
-- BUSINZ Enterprise HRMS
-- Enforces database uniqueness on active (Pending, Approved) employee requests
-- and guarantees non-negative / valid date range order constraints.

DO $$
BEGIN
    -- 1. Partial Unique Index on shift_requests (Prevent duplicate active requests for the same employee and requested_date)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'uq_shift_requests_active_emp_date' AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX uq_shift_requests_active_emp_date
        ON public.shift_requests (employee_id, requested_date)
        WHERE status IN ('Pending', 'Approved');
    END IF;

    -- 2. Partial Unique Index on leave_requests (Prevent duplicate active requests for the same employee and exact date span)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'uq_leave_requests_active_exact_span' AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX uq_leave_requests_active_exact_span
        ON public.leave_requests (employee_id, start_date, end_date)
        WHERE status IN ('Pending', 'Approved');
    END IF;

    -- 3. Check Constraint: Leave end_date >= start_date
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_leave_requests_date_order'
    ) THEN
        ALTER TABLE public.leave_requests
        ADD CONSTRAINT chk_leave_requests_date_order
        CHECK (end_date >= start_date)
        NOT VALID;
    END IF;

    -- 4. Check Constraint: Shift requested_date must be valid (not null and reasonable)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_shift_requests_date_valid'
    ) THEN
        ALTER TABLE public.shift_requests
        ADD CONSTRAINT chk_shift_requests_date_valid
        CHECK (requested_date >= '2020-01-01'::date)
        NOT VALID;
    END IF;

    -- 5. Field Assignments / Field Duty Assignments: Check end_date >= start_date
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'field_assignments'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'chk_field_assignments_date_order'
        ) THEN
            ALTER TABLE public.field_assignments
            ADD CONSTRAINT chk_field_assignments_date_order
            CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
            NOT VALID;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'field_duty_assignments'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'chk_field_duty_assignments_date_order'
        ) THEN
            ALTER TABLE public.field_duty_assignments
            ADD CONSTRAINT chk_field_duty_assignments_date_order
            CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
            NOT VALID;
        END IF;
    END IF;
END $$;

-- ==============================================================================
-- ROLLBACK PROCEDURE:
-- To safely rollback this migration without touching records or audit trails:
--
-- DROP INDEX IF EXISTS public.uq_shift_requests_active_emp_date;
-- DROP INDEX IF EXISTS public.uq_leave_requests_active_exact_span;
-- ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS chk_leave_requests_date_order;
-- ALTER TABLE public.shift_requests DROP CONSTRAINT IF EXISTS chk_shift_requests_date_valid;
-- ALTER TABLE IF EXISTS public.field_assignments DROP CONSTRAINT IF EXISTS chk_field_assignments_date_order;
-- ==============================================================================

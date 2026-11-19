-- Migration 021: Timezone-Aware Overnight Attendance Working Hours & Overtime Trigger
-- Fixes negative working_hours when an overnight punch-out (e.g. 01:00 AM next day)
-- was anchored to the check-in calendar date, and prevents negative working_hours
-- on invalid reversed same-day timestamps.

CREATE OR REPLACE FUNCTION public.calculate_attendance_hours()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    raw_hours NUMERIC;
    overnight_hours NUMERIC;
BEGIN
    IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL THEN
        raw_hours := EXTRACT(EPOCH FROM (NEW.check_out - NEW.check_in)) / 3600.0;
        IF raw_hours < 0 THEN
            -- If check_out was anchored to the same Asia/Kolkata calendar date as check_in,
            -- check whether rolling check_out to the next calendar day (+1 day) is a valid overnight session (<= 18 hours).
            IF (NEW.check_out AT TIME ZONE 'Asia/Kolkata')::date = (NEW.check_in AT TIME ZONE 'Asia/Kolkata')::date THEN
                overnight_hours := EXTRACT(EPOCH FROM ((NEW.check_out + INTERVAL '1 day') - NEW.check_in)) / 3600.0;
                IF overnight_hours > 0 AND overnight_hours <= 18.0 THEN
                    NEW.check_out := NEW.check_out + INTERVAL '1 day';
                    raw_hours := overnight_hours;
                END IF;
            END IF;
        END IF;

        -- Never store negative working_hours
        IF raw_hours > 0 AND raw_hours <= 18.0 THEN
            NEW.working_hours := ROUND(raw_hours, 2);
            IF COALESCE(NEW.calculated_ot_hours, 0) <= 0 AND NEW.working_hours > 9.0 THEN
                NEW.calculated_ot_hours := ROUND(NEW.working_hours - 9.0, 2);
            END IF;
        ELSE
            NEW.working_hours := 0.00;
        END IF;
    ELSIF NEW.check_in IS NULL OR NEW.check_out IS NULL THEN
        NEW.working_hours := 0.00;
    END IF;
    RETURN NEW;
END;
$function$;

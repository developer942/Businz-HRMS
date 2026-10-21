CREATE OR REPLACE FUNCTION public.validate_request_reason_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    visible_reason TEXT;
    invisible_code INTEGER;
BEGIN
    IF NEW.reason IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Please enter a valid reason in words. Spaces or symbols alone are not allowed.';
    END IF;

    NEW.reason := btrim(NEW.reason);
    visible_reason := regexp_replace(NEW.reason, '[[:space:]]', '', 'g');
    FOREACH invisible_code IN ARRAY ARRAY[173, 847, 1564, 6158, 8203, 8204, 8205, 8206, 8207, 8234, 8235, 8236, 8237, 8238, 8288, 65279]
    LOOP
        visible_reason := replace(visible_reason, chr(invisible_code), '');
    END LOOP;

    IF visible_reason = '' OR (visible_reason !~ '[[:alpha:]]' AND visible_reason !~ '[ஃஅ-ஊஎ-ஐஒ-கங-சஜஞ-டண-தந-பம-ஹ]') THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Please enter a valid reason in words. Spaces or symbols alone are not allowed.';
    END IF;

    IF char_length(NEW.reason) > 500 THEN
        RAISE EXCEPTION USING ERRCODE = '22001', MESSAGE = 'Reason cannot exceed 500 characters.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_leave_request_reason ON public.leave_requests;
CREATE TRIGGER trg_validate_leave_request_reason
BEFORE INSERT OR UPDATE OF reason ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_request_reason_on_write();

DROP TRIGGER IF EXISTS trg_validate_shift_request_reason ON public.shift_requests;
CREATE TRIGGER trg_validate_shift_request_reason
BEFORE INSERT OR UPDATE OF reason ON public.shift_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_request_reason_on_write();

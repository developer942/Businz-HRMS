-- =============================================================================
-- 45-asset-audit-trail.sql  (BUSINZ HRMS)  -- NOT YET APPLIED TO PRODUCTION
-- Records every change to an asset's identity fields (serial number, tag, name)
-- and its assignment lifecycle (assign / return / reassign) in an append-only log.
-- Implemented as a database trigger so it captures changes regardless of which
-- client path (PostgREST from the browser, backend, psql) performed the write.
-- Idempotent: safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.asset_audit_logs (
  id               BIGSERIAL PRIMARY KEY,
  asset_id         UUID        NOT NULL,
  asset_tag        TEXT,
  action           TEXT        NOT NULL,          -- CREATED | SERIAL_CHANGED | ASSIGNED | RETURNED | REASSIGNED | DETAILS_CHANGED
  old_serial       TEXT,
  new_serial       TEXT,
  old_employee_id  UUID,
  new_employee_id  UUID,
  old_status       TEXT,
  new_status       TEXT,
  changed_columns  TEXT[]      NOT NULL DEFAULT '{}',
  db_role          TEXT        NOT NULL DEFAULT current_user,
  request_claims   JSONB,                          -- PostgREST JWT claims when available (who made the change)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_audit_asset ON public.asset_audit_logs (asset_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_asset_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cols    TEXT[] := '{}';
  act     TEXT;
  claims  JSONB;
BEGIN
  BEGIN
    claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    claims := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.asset_audit_logs(asset_id, asset_tag, action, new_serial, new_employee_id, new_status, request_claims)
    VALUES (NEW.id, NEW.asset_tag, 'CREATED', NEW.serial_number, NEW.assigned_employee_id, NEW.status::text, claims);
    RETURN NEW;
  END IF;

  IF NEW.serial_number        IS DISTINCT FROM OLD.serial_number        THEN cols := array_append(cols, 'serial_number'); END IF;
  IF NEW.asset_tag            IS DISTINCT FROM OLD.asset_tag            THEN cols := array_append(cols, 'asset_tag'); END IF;
  IF NEW.name                 IS DISTINCT FROM OLD.name                 THEN cols := array_append(cols, 'name'); END IF;
  IF NEW.category             IS DISTINCT FROM OLD.category             THEN cols := array_append(cols, 'category'); END IF;
  IF NEW.purchase_date        IS DISTINCT FROM OLD.purchase_date        THEN cols := array_append(cols, 'purchase_date'); END IF;
  IF NEW.purchase_cost        IS DISTINCT FROM OLD.purchase_cost        THEN cols := array_append(cols, 'purchase_cost'); END IF;
  IF NEW.warranty_expiry      IS DISTINCT FROM OLD.warranty_expiry      THEN cols := array_append(cols, 'warranty_expiry'); END IF;
  IF NEW.notes                IS DISTINCT FROM OLD.notes                THEN cols := array_append(cols, 'notes'); END IF;
  IF NEW.assigned_employee_id IS DISTINCT FROM OLD.assigned_employee_id THEN cols := array_append(cols, 'assigned_employee_id'); END IF;
  IF NEW.status               IS DISTINCT FROM OLD.status               THEN cols := array_append(cols, 'status'); END IF;

  IF array_length(cols, 1) IS NULL THEN
    RETURN NEW;  -- only updated_at changed
  END IF;

  IF 'serial_number' = ANY(cols) THEN
    act := 'SERIAL_CHANGED';
  ELSIF 'assigned_employee_id' = ANY(cols) THEN
    act := CASE
      WHEN OLD.assigned_employee_id IS NULL THEN 'ASSIGNED'
      WHEN NEW.assigned_employee_id IS NULL THEN 'RETURNED'
      ELSE 'REASSIGNED' END;
  ELSE
    act := 'DETAILS_CHANGED';
  END IF;

  INSERT INTO public.asset_audit_logs(asset_id, asset_tag, action, old_serial, new_serial,
                                      old_employee_id, new_employee_id, old_status, new_status,
                                      changed_columns, request_claims)
  VALUES (NEW.id, NEW.asset_tag, act, OLD.serial_number, NEW.serial_number,
          OLD.assigned_employee_id, NEW.assigned_employee_id, OLD.status::text, NEW.status::text,
          cols, claims);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_audit ON public.assets;
CREATE TRIGGER trg_asset_audit
  AFTER INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.fn_asset_audit();

-- Read access for the app roles; the log is append-only (no UPDATE/DELETE grants).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.asset_audit_logs FROM authenticated;
    GRANT SELECT ON public.asset_audit_logs TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.asset_audit_logs FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    REVOKE ALL ON public.asset_audit_logs FROM web_anon;
  END IF;
END $$;

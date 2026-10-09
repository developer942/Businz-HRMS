-- =====================================================================
-- 35-align-role-ids.sql
-- Aligns roles.id with the canonical role UUIDs used by the application
-- code (frontend + backend) and by the original Supabase data, and adds
-- the missing "ceo" role.
--
-- Safe to re-run (idempotent). The DO block is atomic.
-- =====================================================================

DO $$
DECLARE
  r        record;
  fk       record;
  fk_defs  text[] := ARRAY[]::text[];
  fk_tbls  text[] := ARRAY[]::text[];
  fk_names text[] := ARRAY[]::text[];
  i        int;
  canon    jsonb := jsonb_build_object(
    'super_admin',     'c4f29eb9-d1ae-4d1e-a7ff-15908b2afd59',
    'hr_admin',        '778f15fb-584e-4452-9768-eb305fd09966',
    'dept_manager',    'eba38dd1-c2c8-4ca9-9cb4-e64292100d09',
    'employee',        '965e3410-4ab8-4930-9740-89aa34216ac3',
    'finance_manager', 'd89d1984-d3ff-4d30-9f0e-3cda85b32e0a',
    'ceo',             '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6'
  );
  needs_remap boolean;
BEGIN
  IF to_regclass('public.roles') IS NULL THEN
    RAISE NOTICE 'roles table not found - skipping';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.roles ro
    WHERE canon ? ro.key AND ro.id::text <> canon->>ro.key
  ) INTO needs_remap;

  IF needs_remap THEN
    -- Remember and drop every FK that references roles(id)
    FOR fk IN
      SELECT c.conname, c.conrelid::regclass::text AS tbl, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'public.roles'::regclass
    LOOP
      fk_names := fk_names || fk.conname;
      fk_tbls  := fk_tbls  || fk.tbl;
      fk_defs  := fk_defs  || fk.def;
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
    END LOOP;

    FOR r IN
      SELECT ro.id AS old_id, (canon->>ro.key)::uuid AS new_id
      FROM public.roles ro
      WHERE canon ? ro.key AND ro.id::text <> canon->>ro.key
    LOOP
      FOR i IN 1 .. coalesce(array_length(fk_tbls, 1), 0) LOOP
        -- every FK to roles is a single role_id column in this schema
        EXECUTE format('UPDATE %s SET role_id = $1 WHERE role_id = $2', fk_tbls[i])
          USING r.new_id, r.old_id;
      END LOOP;
      UPDATE public.roles SET id = r.new_id WHERE id = r.old_id;
    END LOOP;

    -- Re-create the FKs exactly as they were
    FOR i IN 1 .. coalesce(array_length(fk_tbls, 1), 0) LOOP
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk_tbls[i], fk_names[i], fk_defs[i]);
    END LOOP;
  END IF;

  -- Missing CEO role (used by the CEO employee account)
  INSERT INTO public.roles (id, name, key)
  SELECT '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6'::uuid, 'CEO', 'ceo'
  WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE key = 'ceo' OR id = '42a8b0c3-22e5-40a0-bf78-2dd14475c6d6'::uuid);
END $$;

NOTIFY pgrst, 'reload schema';

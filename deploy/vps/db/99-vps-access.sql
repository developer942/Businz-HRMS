DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'storage')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public, storage TO web_anon, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO web_anon, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage TO web_anon, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO web_anon, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage TO web_anon, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO web_anon, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL PRIVILEGES ON TABLES TO web_anon, anon, authenticated;

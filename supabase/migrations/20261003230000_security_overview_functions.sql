-- Snapshot katalog keamanan untuk halaman admin. Hanya super_admin yang memanggil
-- lewat server function berizin; fungsi ini sendiri dibatasi authenticated dan
-- hanya mengembalikan angka, bukan isi tabel.

CREATE OR REPLACE FUNCTION public.security_catalog_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tables_total', (
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    ),
    'tables_with_rls', (
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ),
    'anon_write_grants', (
      SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public'
        AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
    ),
    'tables_without_policy', (
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
    )
  );
$$;
REVOKE ALL ON FUNCTION public.security_catalog_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_catalog_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.security_anon_functions()
RETURNS TABLE(fn text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.proname::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype <> 'pg_catalog.trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ORDER BY p.proname;
$$;
REVOKE ALL ON FUNCTION public.security_anon_functions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_anon_functions() TO authenticated;

CREATE OR REPLACE FUNCTION public.security_definer_missing_search_path()
RETURNS TABLE(fn text, args text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.proname::text, pg_get_function_identity_arguments(p.oid)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prorettype <> 'pg_catalog.trigger'::regtype
    AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  ORDER BY p.proname;
$$;
REVOKE ALL ON FUNCTION public.security_definer_missing_search_path() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_definer_missing_search_path() TO authenticated;

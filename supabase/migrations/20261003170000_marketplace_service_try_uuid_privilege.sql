-- Supabase memberi default privilege EXECUTE ke fungsi baru untuk anon/authenticated,
-- sehingga REVOKE dari PUBLIC saja tidak cukup. try_uuid adalah helper internal
-- policy storage; anon tidak perlu memanggilnya.
REVOKE EXECUTE ON FUNCTION public.try_uuid(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.try_uuid(text) TO authenticated;

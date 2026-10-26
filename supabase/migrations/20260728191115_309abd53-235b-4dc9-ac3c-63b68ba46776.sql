DO $$
DECLARE d text;
BEGIN
  FOR d IN
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('create_academic_order','quote_academic_order')
  LOOP
    EXECUTE replace(d, 'priority IN (''high'',''urgent'')', 'priority IN (''priority'',''express'')');
  END LOOP;
END $$;
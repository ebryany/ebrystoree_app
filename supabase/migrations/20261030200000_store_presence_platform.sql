-- Toko resmi (is_platform) tidak punya pemilik: anggap online saat ada admin aktif.
-- Rollback: jalankan ulang definisi touch_store_presence() dari 20261030190000_store_presence.sql.

CREATE OR REPLACE FUNCTION public.touch_store_presence()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(id) INTO v_ids FROM public.stores
   WHERE status = 'active'
     AND (owner_id = v_uid OR (is_platform AND public.is_admin(v_uid)));
  IF v_ids IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.store_presence (store_id, last_seen_at)
  SELECT unnest(v_ids), v_now
  ON CONFLICT (store_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    WHERE public.store_presence.last_seen_at < v_now - interval '20 seconds';
  RETURN v_now;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_store_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_store_presence() TO authenticated;

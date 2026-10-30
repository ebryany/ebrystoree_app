-- Status online toko: pemilik toko mengirim heartbeat lewat RPC touch_store_presence()
-- selama tab terbuka. Publik hanya membaca waktu terakhir aktif per toko.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.touch_store_presence();
--   DROP TABLE IF EXISTS public.store_presence;

CREATE TABLE IF NOT EXISTS public.store_presence (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_presence_select_public ON public.store_presence;
CREATE POLICY store_presence_select_public ON public.store_presence
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.store_presence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_presence TO anon, authenticated;
GRANT ALL ON public.store_presence TO service_role;

CREATE OR REPLACE FUNCTION public.touch_store_presence()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_store FROM public.stores
   WHERE owner_id = auth.uid() AND status = 'active'
   LIMIT 1;
  IF v_store IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.store_presence (store_id, last_seen_at) VALUES (v_store, v_now)
  ON CONFLICT (store_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    WHERE public.store_presence.last_seen_at < v_now - interval '20 seconds';
  RETURN v_now;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_store_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_store_presence() TO authenticated;

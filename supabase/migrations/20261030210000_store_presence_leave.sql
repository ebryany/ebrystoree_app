-- Presence toko v3: flag online eksplisit + RPC leave saat tab ditutup/diam.
-- Online = online AND last_seen_at dalam 3 menit (heartbeat yang mati tetap kedaluwarsa).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.leave_store_presence();
--   ALTER TABLE public.store_presence DROP COLUMN IF EXISTS online;
--   lalu jalankan ulang 20261030200000_store_presence_platform.sql

ALTER TABLE public.store_presence
  ADD COLUMN IF NOT EXISTS online boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.presence_store_ids(_uid uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_agg(id) FROM public.stores
   WHERE status = 'active'
     AND (owner_id = _uid OR (is_platform AND public.is_admin(_uid)));
$$;
REVOKE ALL ON FUNCTION public.presence_store_ids(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_store_presence()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_ids := public.presence_store_ids(v_uid);
  IF v_ids IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.store_presence (store_id, last_seen_at, online)
  SELECT unnest(v_ids), v_now, true
  ON CONFLICT (store_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, online = true
    WHERE NOT public.store_presence.online
       OR public.store_presence.last_seen_at < v_now - interval '20 seconds';
  RETURN v_now;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_store_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_store_presence() TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_store_presence()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_ids := public.presence_store_ids(v_uid);
  IF v_ids IS NULL THEN RETURN; END IF;
  UPDATE public.store_presence
     SET online = false, last_seen_at = now()
   WHERE store_id = ANY (v_ids) AND online;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_store_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_store_presence() TO authenticated;

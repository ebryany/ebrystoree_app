-- Realtime pesanan jasa seller tidak pernah berbunyi karena tabel jasa tidak
-- terdaftar di publication supabase_realtime. postgres_changes hanya mengirim
-- event untuk anggota publication, jadi subscribe klien sukses tanpa event apa
-- pun. Pola sama dengan perbaikan chat di 20261003131000_chat_realtime_publication.sql.
-- Idempoten: guard pg_publication_tables mencegah error "already member".

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'marketplace_service_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_service_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'marketplace_service_deliveries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_service_deliveries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'marketplace_service_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_service_events;
  END IF;
END;
$$;

-- Daftar/detail pesanan jasa milik toko memakai nama listing saat ini (ms.name).
-- Bila seller mengganti nama jasa, riwayat pesanan lama ikut berubah padahal
-- order_items sudah menyimpan name_snapshot. Ambil snapshot agar riwayat stabil.
CREATE OR REPLACE FUNCTION public.list_my_service_orders()
RETURNS TABLE (
  order_id uuid, order_number text, order_status text, total bigint, paid_at timestamptz,
  work_state text, complaint_open boolean, due_at timestamptz,
  revision_used integer, revision_limit integer,
  requirements_approved_at timestamptz, accepted_at timestamptz, service_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.order_id, o.order_number, o.status, agg.total, o.paid_at, m.work_state, m.complaint_open,
    m.due_at, m.revision_used, m.revision_limit, m.requirements_approved_at, m.accepted_at,
    COALESCE(snap.name_snapshot, ms.name)
  FROM public.marketplace_service_orders m
  JOIN public.orders o ON o.id = m.order_id
  JOIN public.marketplace_services ms ON ms.id = m.service_id
  LEFT JOIN LATERAL (
    SELECT oi.name_snapshot FROM public.order_items oi
    WHERE oi.order_id = m.order_id AND oi.item_type = 'marketplace_service'
    ORDER BY oi.id LIMIT 1
  ) snap ON true
  JOIN (SELECT oi.order_id, SUM(oi.total)::bigint AS total FROM public.order_items oi GROUP BY oi.order_id) agg
    ON agg.order_id = m.order_id
  WHERE m.store_id = public.my_store_id()
  ORDER BY o.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_service_order(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_name text;
BEGIN
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  SELECT COALESCE(
    (SELECT oi.name_snapshot FROM public.order_items oi
      WHERE oi.order_id = _order_id AND oi.item_type = 'marketplace_service'
      ORDER BY oi.id LIMIT 1),
    (SELECT ms.name FROM public.marketplace_service_orders m
      JOIN public.marketplace_services ms ON ms.id = m.service_id
      WHERE m.order_id = _order_id)
  ) INTO v_name;
  RETURN (
    SELECT jsonb_build_object(
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
        'total', agg.total, 'paid_at', o.paid_at, 'created_at', o.created_at),
      'contract', to_jsonb(m), 'service_name', v_name,
      'deliveries', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.version DESC), '[]'::jsonb)
        FROM public.marketplace_service_deliveries d WHERE d.order_id = m.order_id),
      'events', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id), '[]'::jsonb)
        FROM public.marketplace_service_events e WHERE e.order_id = m.order_id))
    FROM public.marketplace_service_orders m
    JOIN public.orders o ON o.id = m.order_id
    JOIN (SELECT oi.order_id, SUM(oi.total)::bigint AS total FROM public.order_items oi
      WHERE oi.order_id = _order_id GROUP BY oi.order_id) agg ON agg.order_id = m.order_id
    WHERE m.order_id = _order_id AND m.store_id = v_store);
END; $$;

REVOKE ALL ON FUNCTION public.list_my_service_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_service_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_service_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_service_order(uuid) TO authenticated;

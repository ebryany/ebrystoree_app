CREATE FUNCTION public.order_monitoring_rows(_store_id uuid DEFAULT NULL, _order_id uuid DEFAULT NULL)
RETURNS TABLE(order_id uuid, order_number text, order_status text, created_at timestamptz,
  paid_at timestamptz, receipt_status text, accepted_at timestamptz, queue text,
  waiting_since timestamptz, items jsonb, funds jsonb, refunds jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scoped AS (
    SELECT o.* FROM public.orders o
    WHERE o.order_type = 'digital_product' AND (_order_id IS NULL OR o.id = _order_id)
      AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id
        AND (_store_id IS NULL OR oi.store_id = _store_id))
  ), projected AS (
    SELECT o.id, o.order_number, o.status, o.created_at, o.paid_at,
      dr.status AS receipt_status, dr.accepted_at,
      COALESCE(delivery.items, '[]'::jsonb) AS items, delivery.ready,
      COALESCE(finance.funds, '[]'::jsonb) AS funds,
      COALESCE(refund.rows, '[]'::jsonb) AS refunds, refund.active, refund.since,
      EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id
        AND p.paid_at IS NOT NULL AND p.status IN ('paid','refund_requested')) AS paid
    FROM scoped o
    LEFT JOIN public.digital_order_receipts dr ON dr.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'name',i.name,
        'product_id',oi.product_id,'store_id',oi.store_id,'delivery_mode',i.delivery_mode,'ready',i.ready)
        ORDER BY i.item_id) FILTER (WHERE _store_id IS NULL OR oi.store_id = _store_id) AS items,
        bool_and(i.ready) AS ready
      FROM public.digital_receipt_items(o.id) i JOIN public.order_items oi ON oi.id = i.item_id
    ) delivery ON true
    LEFT JOIN LATERAL (
      SELECT bool_or(r.status IN ('requested','under_review','information_requested','approved','processing')) AS active,
        min(r.created_at) FILTER (WHERE r.status IN ('requested','under_review','information_requested','approved','processing')) AS since,
        jsonb_agg(jsonb_build_object('id',r.id,'number',r.refund_number,'status',r.status,
          'amount',CASE WHEN _store_id IS NULL THEN r.amount ELSE NULL END,'created_at',r.created_at,'processed_at',r.processed_at) ORDER BY r.created_at DESC, r.id) AS rows
      FROM public.refunds r WHERE r.order_id = o.id
    ) refund ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('store_id',s.store_id,'store_name',s.store_name,
        'item_total',s.total,'released_total',l.released,'refunded_total',l.refunded,
        'released_at',l.released_at,
        'held_receipt',CASE WHEN dr.status = 'pending' AND o.status IN ('paid','refund_requested','refund_processing')
          AND EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id AND p.paid_at IS NOT NULL
            AND p.status IN ('paid','refund_requested')) AND NOT l.has_sale THEN s.total ELSE 0 END,
        'refund_reserved',CASE WHEN refund.active THEN GREATEST(l.remaining,0) ELSE 0 END)
        ORDER BY s.store_id) AS funds
      FROM (
        SELECT oi.store_id, max(oi.store_name_snapshot) AS store_name, sum(oi.total)::bigint AS total
        FROM public.order_items oi WHERE oi.order_id = o.id AND oi.store_id IS NOT NULL
          AND (_store_id IS NULL OR oi.store_id = _store_id) GROUP BY oi.store_id
      ) s
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(sl.amount) FILTER (WHERE sl.direction = 'credit' AND sl.source_type = 'sale'),0)::bigint AS released,
          COALESCE(sum(sl.amount) FILTER (WHERE sl.direction = 'debit' AND sl.source_type = 'refund'),0)::bigint AS refunded,
          COALESCE(sum(CASE WHEN sl.direction = 'credit' AND sl.source_type = 'sale' THEN sl.amount
            WHEN sl.direction = 'debit' AND sl.source_type IN ('refund','reversal') THEN -sl.amount ELSE 0 END),0)::bigint AS remaining,
          count(*) FILTER (WHERE sl.direction = 'credit' AND sl.source_type = 'sale') > 0 AS has_sale,
          min(sl.created_at) FILTER (WHERE sl.direction = 'credit' AND sl.source_type = 'sale') AS released_at
        FROM public.seller_ledger sl WHERE sl.order_id = o.id AND sl.store_id = s.store_id
      ) l
    ) finance ON true
  )
  SELECT id, order_number, status, created_at, paid_at, receipt_status, accepted_at,
    CASE WHEN active THEN 'refund_active'
      WHEN paid AND status = 'paid' AND receipt_status = 'pending' THEN
        CASE WHEN ready IS TRUE THEN 'awaiting_receipt' ELSE 'delivery_blocked' END
      ELSE 'other' END,
    CASE WHEN active THEN since WHEN paid AND status = 'paid' AND receipt_status = 'pending' THEN paid_at ELSE NULL END,
    items, funds, refunds FROM projected;
$$;
REVOKE ALL ON FUNCTION public.order_monitoring_rows(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_order_monitoring(_order_id uuid, _scope text DEFAULT 'seller') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _scope IS NULL OR _scope NOT IN ('seller','admin') OR _order_id IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF _scope = 'admin' THEN
    IF public.has_permission(auth.uid(),'orders.view') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    SELECT id INTO v_store FROM public.stores WHERE owner_id = auth.uid();
    IF v_store IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  SELECT to_jsonb(r) INTO v_result FROM public.order_monitoring_rows(v_store,_order_id) r;
  IF v_result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN v_result || jsonb_build_object('observed_at',now());
END; $$;
REVOKE ALL ON FUNCTION public.get_order_monitoring(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_monitoring(uuid,text) TO authenticated;

CREATE FUNCTION public.list_order_monitoring(_scope text DEFAULT 'seller', _filter text DEFAULT 'actions', _page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _scope IS NULL OR _scope NOT IN ('seller','admin') OR _filter IS NULL OR
    _filter NOT IN ('all','actions','delivery_blocked','awaiting_receipt','refund_active') OR
    _page IS NULL OR _page < 1 OR _page > 100000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF _scope = 'admin' THEN
    IF public.has_permission(auth.uid(),'orders.view') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    SELECT id INTO v_store FROM public.stores WHERE owner_id = auth.uid();
    IF v_store IS NULL THEN RETURN jsonb_build_object('items','[]'::jsonb,'total',0,'counts','{}'::jsonb,'observed_at',now()); END IF;
  END IF;
  WITH rows AS MATERIALIZED (SELECT * FROM public.order_monitoring_rows(v_store,NULL)),
  filtered AS (SELECT * FROM rows WHERE _filter = 'all' OR queue = _filter OR (_filter = 'actions' AND queue <> 'other')),
  page AS (SELECT * FROM filtered ORDER BY waiting_since ASC NULLS LAST, created_at DESC, order_id
    LIMIT 15 OFFSET ((_page-1)*15))
  SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.waiting_since ASC NULLS LAST,p.created_at DESC,p.order_id) FROM page p),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'counts',jsonb_build_object(
      'delivery_blocked',(SELECT count(*) FROM rows WHERE queue='delivery_blocked'),
      'awaiting_receipt',(SELECT count(*) FROM rows WHERE queue='awaiting_receipt'),
      'refund_active',(SELECT count(*) FROM rows WHERE queue='refund_active')),'observed_at',now()) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.list_order_monitoring(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_order_monitoring(text,text,integer) TO authenticated;

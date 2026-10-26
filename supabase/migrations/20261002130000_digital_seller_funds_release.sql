CREATE OR REPLACE FUNCTION public.credit_seller_earnings(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; r record; v_key text; v_count int := 0; v_total bigint := 0;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.order_type = 'digital_product' THEN
    IF NOT EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = o.id) THEN
      IF o.status = 'completed' AND EXISTS (SELECT 1 FROM public.seller_ledger
        WHERE order_id = o.id AND direction = 'credit' AND source_type = 'sale') THEN
        RETURN jsonb_build_object('status','already_credited','legacy',true);
      END IF;
      RAISE EXCEPTION 'RECEIPT_REQUIRED';
    END IF;
    IF o.status <> 'completed' OR NOT EXISTS (SELECT 1 FROM public.digital_order_receipts
      WHERE order_id = o.id AND status = 'accepted' AND accepted_by = o.user_id AND accepted_at IS NOT NULL)
      THEN RAISE EXCEPTION 'RECEIPT_REQUIRED'; END IF;
  ELSIF o.status NOT IN ('paid','completed') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id AND status = 'paid')
    THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE order_id = o.id
    AND status IN ('requested','under_review','information_requested','approved','processing'))
    THEN RAISE EXCEPTION 'REFUND_ACTIVE'; END IF;
  FOR r IN SELECT oi.store_id, SUM(oi.total)::bigint AS gross FROM public.order_items oi
    WHERE oi.order_id = o.id AND oi.store_id IS NOT NULL GROUP BY oi.store_id
  LOOP
    IF r.gross <= 0 THEN CONTINUE; END IF;
    v_key := 'sale:' || o.id::text || ':' || r.store_id::text;
    INSERT INTO public.seller_ledger
      (store_id,direction,amount,gross_amount,platform_fee,source_type,order_id,reference,note,idempotency_key)
    VALUES (r.store_id,'credit',r.gross,r.gross,0,'sale',o.id,'ORDER:' || o.id::text,
      'Pendapatan penjualan dilepas',v_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; v_total := v_total + r.gross; END IF;
  END LOOP;
  RETURN jsonb_build_object('status',CASE WHEN v_count = 0 THEN 'already_credited' ELSE 'credited' END,
    'stores',v_count,'amount',v_total);
END; $$;
REVOKE ALL ON FUNCTION public.credit_seller_earnings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_type = 'digital_product' THEN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
      AND EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = NEW.id AND status = 'accepted') THEN
      PERFORM public.credit_seller_earnings(NEW.id);
    END IF;
  ELSIF NEW.status IN ('paid','completed') AND OLD.status IS DISTINCT FROM 'paid'
    AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.credit_seller_earnings(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.get_store_finances(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ledger bigint; v_held bigint; v_reserved bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF public.can_access_store(_store_id) IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END),0)::bigint
    INTO v_ledger FROM public.seller_ledger WHERE store_id = _store_id;
  SELECT COALESCE(SUM(oi.total),0)::bigint INTO v_held
    FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    JOIN public.digital_order_receipts dr ON dr.order_id = o.id AND dr.status = 'pending'
    WHERE oi.store_id = _store_id AND o.status IN ('paid','refund_requested','refund_processing')
      AND EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id AND p.paid_at IS NOT NULL
        AND p.status IN ('paid','refund_requested'))
      AND NOT EXISTS (SELECT 1 FROM public.seller_ledger sl WHERE sl.order_id = o.id
        AND sl.store_id = _store_id AND sl.direction = 'credit' AND sl.source_type = 'sale');
  -- ponytail: reserve the remaining released sale in full; partial-refund allocation needs owner policy.
  SELECT COALESCE(SUM(GREATEST(released.amount,0)),0)::bigint INTO v_reserved FROM (
    SELECT sl.order_id, SUM(CASE WHEN sl.direction = 'credit' AND sl.source_type = 'sale' THEN sl.amount
      WHEN sl.direction = 'debit' AND sl.source_type IN ('refund','reversal') THEN -sl.amount ELSE 0 END) AS amount
    FROM public.seller_ledger sl WHERE sl.store_id = _store_id AND sl.order_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.refunds rf WHERE rf.order_id = sl.order_id
        AND rf.status IN ('requested','under_review','information_requested','approved','processing'))
    GROUP BY sl.order_id
  ) released;
  RETURN jsonb_build_object('ledger_balance',v_ledger,'held_receipt',v_held,
    'refund_reserved',v_reserved,'available_balance',v_ledger-v_reserved,
    'released_total',(SELECT COALESCE(SUM(amount),0)::bigint FROM public.seller_ledger
      WHERE store_id = _store_id AND direction = 'credit' AND source_type = 'sale'),
    'released_trend',COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS date, SUM(amount)::bigint AS total
      FROM public.seller_ledger WHERE store_id = _store_id AND direction = 'credit' AND source_type = 'sale'
        AND created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') - interval '29 days') AT TIME ZONE 'UTC'
      GROUP BY (created_at AT TIME ZONE 'UTC')::date
    ) d),'[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.get_store_finances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_finances(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_balance(_store_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.get_store_finances(_store_id)->>'available_balance')::bigint;
$$;
REVOKE ALL ON FUNCTION public.get_store_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_refund(_refund_id uuid, _reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; o public.orders; v_order_id uuid; v_paid bigint; v_credit jsonb; s record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(),'refunds.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _reference IS NULL OR length(btrim(_reference)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status = 'completed' THEN RETURN jsonb_build_object('status','completed','duplicate',true); END IF;
  IF r.status NOT IN ('approved','processing') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  -- ponytail: seller refund processing supports full single-store orders; allocate partial/mixed-credit refunds before widening.
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id = o.id AND store_id IS NOT NULL) THEN
    IF r.amount <> o.total OR o.credit_used > 0 OR
      (SELECT count(DISTINCT store_id) FROM public.order_items WHERE order_id = o.id) > 1 OR
      EXISTS (SELECT 1 FROM public.seller_ledger WHERE order_id = o.id AND source_type = 'sale' AND platform_fee <> 0)
      THEN RAISE EXCEPTION 'REFUND_ALLOCATION_REQUIRED'; END IF;
  END IF;
  UPDATE public.refunds SET status = 'completed', processing_reference = _reference, processed_at = now() WHERE id = r.id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.refunds WHERE order_id = o.id AND status = 'completed';
  UPDATE public.payments SET status = CASE WHEN v_paid >= o.total THEN 'refunded' ELSE 'partially_refunded' END WHERE id = r.payment_id;
  UPDATE public.orders SET status = 'refunded' WHERE id = o.id;
  INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note)
    VALUES(o.id,o.status,'refunded',auth.uid(),'finance','Dana refund telah dikirim');
  UPDATE public.digital_entitlements SET revoked_at = now() WHERE order_id = o.id AND revoked_at IS NULL;
  FOR s IN SELECT store_id, SUM(CASE WHEN direction = 'credit' AND source_type = 'sale' THEN amount
      WHEN direction = 'debit' AND source_type IN ('refund','reversal') THEN -amount ELSE 0 END)::bigint AS remaining
    FROM public.seller_ledger WHERE order_id = o.id GROUP BY store_id
  LOOP
    IF s.remaining > 0 THEN
      INSERT INTO public.seller_ledger
        (store_id,direction,amount,gross_amount,platform_fee,source_type,source_id,order_id,reference,note,created_by,idempotency_key)
      VALUES(s.store_id,'debit',s.remaining,s.remaining,0,'refund',r.id,o.id,'REFUND:' || r.refund_number,
        'Debit refund ' || r.refund_number,auth.uid(),'refund:' || r.id::text || ':' || s.store_id::text)
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
  v_credit := public.credit_refund_to_balance(r.id);
  INSERT INTO public.notifications(recipient_id,type,title,message,related_type,related_id)
    VALUES(r.customer_id,'refund_completed','Refund selesai','Dana refund untuk ' || r.refund_number || ' telah dikirim.','refund',r.id);
  PERFORM public.write_audit_log('refund.process','refund',r.id,to_jsonb(r),
    jsonb_build_object('status','completed','credit',v_credit),_reference,NULL,NULL);
  RETURN jsonb_build_object('status','completed','credit',v_credit,'duplicate',false);
END; $$;
REVOKE ALL ON FUNCTION public.process_refund(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_refund(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; o public.orders; v_order_id uuid; v_new text; v_restore text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approve','reject','request_info') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF _decision = 'reject' THEN
    IF NOT public.has_permission(auth.uid(),'refunds.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(auth.uid(),'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status NOT IN ('requested','under_review','information_requested') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  v_new := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'information_requested' END;
  UPDATE public.refunds SET status = v_new,reviewed_by = auth.uid(),reviewed_at = now(),decision_note = _reason WHERE id = r.id;
  IF _decision = 'approve' THEN
    UPDATE public.orders SET status = 'refund_processing' WHERE id = o.id;
    INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note)
      VALUES(o.id,o.status,'refund_processing',auth.uid(),'finance','Refund disetujui, menunggu pengiriman dana');
  ELSIF _decision = 'reject' THEN
    IF EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = o.id) THEN
      SELECT CASE status WHEN 'pending' THEN 'paid' ELSE 'completed' END INTO v_restore
        FROM public.digital_order_receipts WHERE order_id = o.id;
    ELSE
      SELECT previous_status INTO v_restore FROM public.order_status_histories
        WHERE order_id = o.id AND new_status = 'refund_requested' ORDER BY created_at DESC LIMIT 1;
      v_restore := COALESCE(v_restore,'completed');
    END IF;
    UPDATE public.payments SET status = 'paid' WHERE id = r.payment_id AND status = 'refund_requested';
    UPDATE public.orders SET status = v_restore WHERE id = o.id AND status = 'refund_requested';
    INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note,internal_note)
      VALUES(o.id,o.status,v_restore,auth.uid(),'finance','Pengajuan refund ditolak',_reason);
  END IF;
  INSERT INTO public.notifications(recipient_id,type,title,message,related_type,related_id)
    VALUES(r.customer_id,'refund_' || v_new,'Status refund diperbarui',
      'Pengajuan refund ' || r.refund_number || ' kini berstatus ' || v_new || '.','refund',r.id);
  IF _decision <> 'request_info' THEN
    UPDATE public.admin_tasks SET status = 'completed',completed_at = now(),note = _reason
      WHERE source_type = 'refund' AND source_id = r.id AND status <> 'completed';
  END IF;
  PERFORM public.write_audit_log('refund.' || _decision,'refund',r.id,to_jsonb(r),jsonb_build_object('status',v_new),_reason,NULL,NULL);
  RETURN jsonb_build_object('status',v_new);
END; $$;
REVOKE ALL ON FUNCTION public.review_refund(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_stores(
  _status text DEFAULT 'all',
  _search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  logo_url text,
  status text,
  is_platform boolean,
  contact_phone text,
  contact_email text,
  verification_note text,
  suspended_reason text,
  reviewed_at timestamptz,
  created_at timestamptz,
  owner_id uuid,
  owner_name text,
  product_total bigint,
  product_published bigint,
  product_pending bigint,
  balance bigint,
  rating_average numeric,
  rating_total bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  SELECT s.id,
         s.name,
         s.slug,
         s.description,
         s.logo_url,
         s.status,
         s.is_platform,
         s.contact_phone,
         s.contact_email,
         s.verification_note,
         s.suspended_reason,
         s.reviewed_at,
         s.created_at,
         s.owner_id,
         p.full_name,
         COALESCE(prod.total, 0),
         COALESCE(prod.published, 0),
         COALESCE(prod.pending, 0),
         public.get_store_balance(s.id),
         COALESCE(rat.average, 0),
         COALESCE(rat.total, 0)
    FROM public.stores s
    LEFT JOIN public.profiles p ON p.id = s.owner_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE dp.status = 'published') AS published,
             COUNT(*) FILTER (WHERE dp.moderation_status = 'pending') AS pending
        FROM public.digital_products dp
       WHERE dp.store_id = s.id AND dp.deleted_at IS NULL
    ) prod ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(ROUND(AVG(pr.rating)::numeric, 2), 0) AS average, COUNT(*) AS total
        FROM public.product_reviews pr
       WHERE pr.store_id = s.id AND pr.is_visible = true
    ) rat ON true
   WHERE (_status = 'all' OR s.status = _status)
     AND (
       _search IS NULL OR btrim(_search) = ''
       OR s.name ILIKE '%' || btrim(_search) || '%'
       OR s.slug ILIKE '%' || btrim(_search) || '%'
     )
   ORDER BY
     -- Antrean yang butuh tindakan selalu di atas.
     CASE s.status WHEN 'pending' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
     s.created_at DESC
   LIMIT 200;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_stores(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_stores(text, text) TO authenticated;

-- 2) RINGKASAN SATU SELLER (untuk halaman drill-down) -------------------------
CREATE OR REPLACE FUNCTION public.admin_store_summary(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store public.stores;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = _store_id;
  IF v_store.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT jsonb_build_object(
    'store', jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'slug', v_store.slug,
      'description', v_store.description,
      'logo_url', v_store.logo_url,
      'status', v_store.status,
      'is_platform', v_store.is_platform,
      'contact_phone', v_store.contact_phone,
      'contact_email', v_store.contact_email,
      'verification_note', v_store.verification_note,
      'suspended_reason', v_store.suspended_reason,
      'reviewed_by', v_store.reviewed_by,
      'reviewed_at', v_store.reviewed_at,
      'created_at', v_store.created_at,
      'owner_id', v_store.owner_id
    ),
    'owner', (
      SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone)
        FROM public.profiles p WHERE p.id = v_store.owner_id
    ),
    'balance', public.get_store_balance(_store_id),
    'finances', public.get_store_finances(_store_id),
    'rating', (
      SELECT jsonb_build_object(
        'average', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
        'total', COUNT(*)
      ) FROM public.product_reviews
       WHERE store_id = _store_id AND is_visible = true
    ),
    'products', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'published', COUNT(*) FILTER (WHERE status = 'published'),
        'pending', COUNT(*) FILTER (WHERE moderation_status = 'pending'),
        'rejected', COUNT(*) FILTER (WHERE moderation_status = 'rejected'),
        'sold', COALESCE(SUM(sold_count), 0)
      ) FROM public.digital_products
       WHERE store_id = _store_id AND deleted_at IS NULL
    ),
    'orders', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'paid', COUNT(*) FILTER (WHERE o.status IN ('paid','completed')),
        'gross', COALESCE(SUM(oi.total), 0)
      )
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.store_id = _store_id
    )
  ) INTO v_result;

  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_store_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_summary(uuid) TO authenticated;


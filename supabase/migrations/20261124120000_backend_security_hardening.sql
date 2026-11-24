-- ============================================================================
-- Backend Security Hardening: Service Complaint Refund, Manual Top-Up RPCs,
-- Refund & Payment Anti Self-Approval, Payout Cancel Window, RLS & Grants
-- ============================================================================
-- Forward-only, backward-compatible migration addressing audit findings:
--   #1  Fix nonexistent columns in public.resolve_service_complaint
--   #3  Atomic SECURITY DEFINER RPCs submit_manual_topup_proof & review_manual_topup
--       + anti self-approval on verify_manual_payment
--   #5  Enforce feature_refund in SQL, fix refund amount for credit_used orders,
--       prevent duplicate active refunds, add anti self-approval on review/process_refund
--   #6  Restrict cancel_own_withdrawal to 'requested' only (prevent post-approve race)
--   #8  Drop direct INSERT RLS policy proofs_insert_own on manual_payment_proofs
--   #10 Align system_settings write RLS policy to settings.manage / super_admin
--   #11 Require active store in save_seller_bank_account
--   #12 Revoke direct table INSERT/UPDATE/DELETE grants on financial tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. #1 Fix resolve_service_complaint (refunds.customer_id, admin_tasks.completed_at)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_service_complaint(
  _order_id uuid,
  _decision text,
  _reason text,
  _refund_amount bigint DEFAULT NULL::bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_mso public.marketplace_service_orders%ROWTYPE;
  v_pay record;
  v_refund_id uuid;
  v_work text;
  v_amount bigint;
  v_max_refundable bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('resume', 'refund', 'partial_refund') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;
  IF _decision = 'partial_refund' AND NOT public.setting_bool('marketplace_partial_refund', false) THEN
    RAISE EXCEPTION 'PARTIAL_REFUND_DISABLED';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF _decision = 'resume' THEN
    IF NOT public.has_permission(v_user, 'orders.update') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user, 'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.user_id = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;

  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT v_mso.complaint_open THEN RAISE EXCEPTION 'NO_COMPLAINT'; END IF;
  IF v_mso.accepted_delivery_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ACCEPTED'; END IF;

  IF _decision = 'resume' THEN
    IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    v_work := v_mso.prior_work_state;
    IF v_work IS NULL OR v_work NOT IN ('awaiting_requirements', 'in_progress', 'delivered', 'revision_requested') THEN
      v_work := 'in_progress';
    END IF;
    UPDATE public.marketplace_service_orders
       SET complaint_open = false,
           work_state = v_work,
           updated_at = now()
     WHERE order_id = _order_id;
    INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
    VALUES (
      _order_id,
      'complaint_resumed',
      v_user,
      'admin',
      jsonb_build_object('reason', btrim(_reason), 'work_state', v_work)
    );
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (
      v_order.user_id,
      'service.complaint_resumed',
      'Komplain ditindaklanjuti',
      'Komplain pesanan ' || v_order.order_number || ' ditinjau admin. Pekerjaan dilanjutkan sesuai agreement.',
      'order',
      _order_id
    );
  ELSE
    IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.refunds
       WHERE order_id = _order_id
         AND status IN ('requested', 'under_review', 'information_requested', 'approved', 'processing')
    ) THEN
      RAISE EXCEPTION 'REFUND_ACTIVE';
    END IF;

    SELECT * INTO v_pay
      FROM public.payments
     WHERE order_id = _order_id AND status = 'paid'
     ORDER BY paid_at DESC
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;

    v_max_refundable := LEAST(
      v_order.total,
      GREATEST(COALESCE(v_pay.paid_amount, 0) + COALESCE(v_order.credit_used, 0), 0)
    );
    v_amount := CASE
      WHEN _decision = 'partial_refund' THEN COALESCE(_refund_amount, 0)
      ELSE v_max_refundable
    END;
    IF v_amount < 1 OR v_amount > v_max_refundable THEN
      RAISE EXCEPTION 'INVALID_REFUND_AMOUNT';
    END IF;

    INSERT INTO public.refunds(
      order_id, payment_id, customer_id, amount, reason, status, reviewed_by, reviewed_at, decision_note
    )
    VALUES (
      _order_id,
      v_pay.id,
      v_order.user_id,
      v_amount,
      'Keputusan admin atas komplain: ' || btrim(_reason),
      'approved',
      v_user,
      now(),
      btrim(_reason)
    )
    RETURNING id INTO v_refund_id;

    UPDATE public.orders
       SET status = 'refund_processing'
     WHERE id = _order_id;

    UPDATE public.marketplace_service_orders
       SET complaint_open = false,
           work_state = 'refunded',
           updated_at = now()
     WHERE order_id = _order_id;

    INSERT INTO public.order_status_histories(order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (_order_id, v_order.status, 'refund_processing', v_user, 'admin', 'Refund komplain disetujui, menunggu pengiriman dana.');

    INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
    VALUES (
      _order_id,
      'complaint_refund_approved',
      v_user,
      'admin',
      jsonb_build_object(
        'reason', btrim(_reason),
        'refund_id', v_refund_id,
        'amount', v_amount,
        'partial', _decision = 'partial_refund'
      )
    );
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (
      v_order.user_id,
      'service.complaint_refunded',
      'Refund komplain disetujui',
      'Komplain pesanan ' || v_order.order_number || ' disetujui untuk pengembalian dana.',
      'order',
      _order_id
    );
  END IF;

  UPDATE public.admin_tasks
     SET status = 'completed',
         completed_at = now(),
         note = btrim(_reason)
   WHERE task_type = 'review_service_complaint'
     AND source_type = 'order'
     AND source_id = _order_id
     AND status IN ('open', 'in_progress', 'blocked');

  INSERT INTO public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
  VALUES (
    v_user,
    'admin',
    'marketplace_service.complaint_' || _decision,
    'order',
    _order_id,
    jsonb_build_object('decision', _decision, 'refund_id', v_refund_id, 'amount', v_amount),
    btrim(_reason)
  );

  RETURN jsonb_build_object(
    'status', CASE WHEN _decision = 'resume' THEN 'resumed' ELSE 'refund_approved' END,
    'refund_id', v_refund_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_service_complaint(uuid, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_complaint(uuid, text, text, bigint) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. #3 Atomic Manual Top-Up RPCs (submit_manual_topup_proof & review_manual_topup)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_manual_topup_proof(
  _topup_id uuid,
  _file_path text,
  _sender_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  t public.credit_topups;
  v_object record;
  v_size bigint;
  v_mime text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO t FROM public.credit_topups WHERE id = _topup_id FOR UPDATE;
  IF NOT FOUND OR t.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF t.provider <> 'manual' OR t.status <> 'waiting_payment' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF t.expires_at IS NOT NULL AND t.expires_at <= now() THEN
    RAISE EXCEPTION 'PAYMENT_EXPIRED';
  END IF;
  IF t.proof_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROOF_ALREADY_SUBMITTED';
  END IF;

  IF _file_path IS NULL
    OR _file_path NOT LIKE v_user::text || '/topup-' || _topup_id::text || '/%'
    OR _file_path LIKE '%..%'
    OR _file_path LIKE '%\\%'
    OR _sender_name IS NULL
    OR length(btrim(_sender_name)) NOT BETWEEN 2 AND 100
  THEN
    RAISE EXCEPTION 'INVALID_PROOF';
  END IF;

  SELECT metadata INTO v_object
    FROM storage.objects
   WHERE bucket_id = 'payment-proofs' AND name = _file_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PROOF'; END IF;

  v_size := (v_object.metadata ->> 'size')::bigint;
  v_mime := v_object.metadata ->> 'mimetype';
  IF v_size IS NULL OR v_size NOT BETWEEN 1 AND 5242880
    OR v_mime IS NULL OR v_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    OR EXISTS (SELECT 1 FROM public.credit_topups WHERE proof_path = _file_path AND id <> _topup_id)
  THEN
    RAISE EXCEPTION 'INVALID_PROOF';
  END IF;

  UPDATE public.credit_topups
     SET proof_path = _file_path,
         proof_sender_name = btrim(_sender_name),
         proof_submitted_at = now()
   WHERE id = t.id;

  PERFORM public.write_audit_log(
    'topup.proof_submit',
    'credit_topups',
    t.id,
    NULL,
    jsonb_build_object('topup_number', t.topup_number, 'amount', t.amount, 'mime', v_mime, 'size', v_size),
    'Unggah bukti transfer isi saldo manual',
    NULL,
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'topup_id', t.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_manual_topup_proof(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_manual_topup_proof(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_manual_topup(
  _topup_id uuid,
  _decision text,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  t public.credit_topups;
  v_settled jsonb;
  v_clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;
  IF _decision = 'approve' THEN
    IF NOT public.has_permission(v_user, 'payments.verify') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user, 'payments.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;

  SELECT * INTO t FROM public.credit_topups WHERE id = _topup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF t.user_id = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;
  IF t.provider <> 'manual' OR t.status <> 'waiting_payment' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;

  IF _decision = 'reject' THEN
    UPDATE public.credit_topups
       SET status = 'cancelled',
           reviewed_by = v_user,
           reviewed_at = now(),
           review_note = v_clean_reason
     WHERE id = t.id;

    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (
      t.user_id,
      'payment.rejected',
      'Isi saldo ditolak',
      CASE
        WHEN v_clean_reason IS NOT NULL THEN 'Bukti transfer ditolak: ' || v_clean_reason
        ELSE 'Bukti transfer tidak dapat diverifikasi.'
      END,
      'credit_topups',
      t.id
    );

    PERFORM public.write_audit_log(
      'topup.reject',
      'credit_topups',
      t.id,
      jsonb_build_object('status', t.status),
      jsonb_build_object('status', 'cancelled', 'amount', t.amount, 'user_id', t.user_id),
      v_clean_reason,
      NULL,
      NULL
    );

    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  -- Approve path
  IF t.proof_submitted_at IS NULL OR t.proof_path IS NULL THEN
    RAISE EXCEPTION 'PROOF_REQUIRED';
  END IF;

  IF t.proof_path NOT LIKE t.user_id::text || '/topup-' || t.id::text || '/%'
    OR t.proof_path LIKE '%..%'
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects
       WHERE bucket_id = 'payment-proofs'
         AND name = t.proof_path
         AND (jsonb_extract_path_text(metadata, 'size'))::bigint BETWEEN 1 AND 5242880
         AND jsonb_extract_path_text(metadata, 'mimetype') IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    )
  THEN
    RAISE EXCEPTION 'INVALID_PROOF';
  END IF;

  UPDATE public.credit_topups
     SET reviewed_by = v_user,
         reviewed_at = now(),
         review_note = v_clean_reason
   WHERE id = t.id;

  v_settled := public.settle_credit_topup(t.id, 'manual', 'manual:' || v_user::text, t.amount);
  RETURN v_settled;
END;
$function$;

REVOKE ALL ON FUNCTION public.review_manual_topup(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_manual_topup(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. #3 Anti self-approval on verify_manual_payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_manual_payment(
  _payment_id uuid,
  _decision text,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof uuid; v_proof_row record;
  v_new_pay text; v_new_order text; v_role text; v_is_academic boolean; v_missing integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approved', 'rejected', 'reupload_requested') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;
  IF _decision = 'approved' THEN
    IF NOT public.has_permission(v_user, 'payments.verify') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user, 'payments.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_pay.user_id = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;
  IF v_pay.provider <> 'manual' OR v_pay.method <> 'dana' THEN RAISE EXCEPTION 'MANUAL_ONLY'; END IF;
  IF v_pay.status <> 'waiting_verification' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'payment_under_review' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT * INTO v_proof_row FROM public.manual_payment_proofs
    WHERE payment_id = _payment_id AND customer_id = v_pay.user_id AND status = 'submitted'
    ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_REQUIRED'; END IF;
  v_proof := v_proof_row.id;

  IF _decision = 'approved' THEN
    IF v_proof_row.amount_claimed IS DISTINCT FROM v_pay.expected_amount THEN RAISE EXCEPTION 'AMOUNT_MISMATCH'; END IF;
    IF v_proof_row.file_path NOT LIKE v_pay.user_id::text || '/%'
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects
         WHERE bucket_id = 'payment-proofs' AND name = v_proof_row.file_path
           AND (jsonb_extract_path_text(metadata, 'size'))::bigint BETWEEN 1 AND 5242880
           AND jsonb_extract_path_text(metadata, 'mimetype') IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      )
    THEN RAISE EXCEPTION 'INVALID_PROOF'; END IF;
  END IF;

  SELECT string_agg(role::text, ',') INTO v_role FROM public.user_roles WHERE user_id = v_user;
  SELECT EXISTS (
    SELECT 1 FROM public.service_order_details
     WHERE order_id = v_order.id AND academic_category_id IS NOT NULL
  ) INTO v_is_academic;

  IF _decision = 'approved' THEN
    v_new_pay := 'paid';
    UPDATE public.payments SET status = 'paid', paid_amount = expected_amount, paid_at = now() WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'approved' WHERE id = v_proof;
    UPDATE public.invoices SET status = 'paid', paid_at = now() WHERE order_id = v_order.id;
    INSERT INTO public.digital_entitlements (user_id, order_item_id, order_id, product_id, file_version, download_limit, valid_until)
    SELECT v_order.user_id, oi.id, v_order.id, oi.product_id, dp.version,
      COALESCE(dp.download_limit, 5), now() + (COALESCE(dp.validity_days, 365) || ' days')::interval
    FROM public.order_items oi JOIN public.digital_products dp ON dp.id = oi.product_id
    WHERE oi.order_id = v_order.id AND oi.item_type = 'digital_product'
    ON CONFLICT (order_item_id) DO NOTHING;
    v_missing := public.assign_unique_files_for_order(v_order.id);
    IF v_order.order_type = 'marketplace_service' THEN
      v_new_order := 'paid';
      UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;
      PERFORM public.activate_paid_marketplace_service(v_order.id);
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      SELECT s.owner_id, 'order.paid', 'Pembayaran jasa diterima',
        'Pesanan jasa ' || v_order.order_number || ' telah lunas. Setujui requirements pembeli sebelum mulai bekerja.', 'order', v_order.id
      FROM public.marketplace_service_orders m JOIN public.stores s ON s.id = m.store_id
      WHERE m.order_id = v_order.id;
    ELSIF v_order.order_type = 'digital_product' THEN
      v_new_order := 'paid';
      INSERT INTO public.digital_order_receipts(order_id) VALUES(v_order.id) ON CONFLICT (order_id) DO NOTHING;
      UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.paid',
        CASE WHEN v_missing > 0 THEN 'Pembayaran terverifikasi' ELSE 'Akses produk disiapkan' END,
        CASE WHEN v_missing > 0 THEN 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Berkas sedang disiapkan tim kami.'
          ELSE 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Periksa produk di pustaka Anda, lalu konfirmasikan penerimaan pada detail pesanan.' END, 'order', v_order.id);
    ELSIF v_is_academic THEN
      v_new_order := 'academic_review';
      UPDATE public.orders SET status = 'academic_review', paid_at = now() WHERE id = v_order.id;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('academic_scope_review', 'order', v_order.id, 'Periksa kebutuhan akademik ' || v_order.order_number,
        'Pesanan akademik sudah lunas dan menunggu pemeriksaan kebutuhan sebelum penugasan.', 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open', 'in_progress', 'blocked') DO NOTHING;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'academic.payment_verified', 'Pembayaran telah diverifikasi',
        'Kebutuhan tugas pada pesanan ' || v_order.order_number || ' sedang diperiksa oleh tim.', 'order', v_order.id);
    ELSE
      v_new_order := 'waiting_assignment';
      UPDATE public.orders SET status = 'waiting_assignment', paid_at = now() WHERE id = v_order.id;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('assign_operator', 'order', v_order.id, 'Tugaskan operator untuk ' || v_order.order_number,
        'Order jasa sudah lunas dan menunggu penugasan operator.', 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open', 'in_progress', 'blocked') DO NOTHING;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.paid', 'Pembayaran terverifikasi',
        'Order ' || v_order.order_number || ' menunggu penugasan operator.', 'order', v_order.id);
    END IF;
  ELSIF _decision = 'rejected' THEN
    v_new_pay := 'rejected'; v_new_order := 'awaiting_payment';
    UPDATE public.payments SET status = 'rejected' WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'rejected' WHERE id = v_proof;
    UPDATE public.orders SET status = 'awaiting_payment' WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'payment.rejected', 'Bukti pembayaran ditolak',
      'Bukti pembayaran order ' || v_order.order_number || ' ditolak: ' || _reason, 'order', v_order.id);
  ELSE
    v_new_pay := 'waiting_payment'; v_new_order := 'awaiting_payment';
    UPDATE public.payments SET status = 'waiting_payment' WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'rejected' WHERE id = v_proof;
    UPDATE public.orders SET status = 'awaiting_payment' WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'payment.reupload_requested', 'Unggah ulang bukti pembayaran',
      'Mohon unggah ulang bukti pembayaran order ' || v_order.order_number || ': ' || _reason, 'order', v_order.id);
  END IF;

  INSERT INTO public.payment_verifications (payment_id, proof_id, verifier_id, previous_status, new_status, decision, reason)
  VALUES (_payment_id, v_proof, v_user, v_pay.status, v_new_pay, _decision, _reason);
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
  VALUES (v_order.id, v_order.status, v_new_order, v_user, 'finance',
    CASE WHEN _decision = 'approved' THEN 'Pembayaran telah diverifikasi.' ELSE 'Pembayaran belum dapat diterima.' END, _reason);
  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
    WHERE task_type = 'verify_payment' AND source_type = 'payment' AND source_id = _payment_id AND status IN ('open', 'in_progress', 'blocked');
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_user, v_role, 'payment.' || _decision, 'payment', _payment_id,
    jsonb_build_object('status', v_pay.status), jsonb_build_object('status', v_new_pay), _reason);
  RETURN jsonb_build_object('payment_status', v_new_pay, 'order_status', v_new_order, 'stock_missing', v_missing);
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_manual_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. #5 Refund Hardening: feature_refund in SQL, credit_used amount,
--       duplicate active refund guard, anti self-approval on review & process
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_refund(_order_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order record;
  v_pay record;
  v_id uuid;
  v_window bigint;
  v_refund_amount bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF COALESCE((SELECT value FROM public.system_settings WHERE key = 'feature_refund'), 'true'::jsonb) = 'false'::jsonb THEN
    RAISE EXCEPTION 'FEATURE_DISABLED';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.marketplace_service_orders
     WHERE order_id = _order_id AND accepted_delivery_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'SERVICE_POST_ACCEPTANCE_REFUND_UNAVAILABLE';
  END IF;

  IF v_order.status NOT IN ('paid', 'waiting_assignment', 'assigned', 'queued', 'in_progress', 'waiting_customer_review', 'completed') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.refunds
     WHERE order_id = _order_id
       AND status IN ('requested', 'under_review', 'information_requested', 'approved', 'processing')
  ) THEN
    RAISE EXCEPTION 'REFUND_ACTIVE';
  END IF;

  v_window := public.setting_int('refund_window_days', 7);
  IF v_order.paid_at IS NULL OR v_order.paid_at < now() - (v_window || ' days')::interval THEN
    RAISE EXCEPTION 'REFUND_WINDOW_CLOSED';
  END IF;

  SELECT * INTO v_pay
    FROM public.payments
   WHERE order_id = _order_id AND status = 'paid'
   ORDER BY paid_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;

  v_refund_amount := LEAST(
    v_order.total,
    GREATEST(COALESCE(v_pay.paid_amount, 0) + COALESCE(v_order.credit_used, 0), 0)
  );
  IF v_refund_amount <= 0 THEN RAISE EXCEPTION 'INVALID_REFUND_AMOUNT'; END IF;

  INSERT INTO public.refunds (order_id, payment_id, customer_id, amount, reason)
  VALUES (_order_id, v_pay.id, v_user, v_refund_amount, btrim(_reason))
  RETURNING id INTO v_id;

  UPDATE public.orders SET status = 'refund_requested' WHERE id = _order_id;
  UPDATE public.payments SET status = 'refund_requested' WHERE id = v_pay.id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'refund_requested', v_user, 'customer', 'Pengajuan refund dikirim.');

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_refund', 'refund', v_id, 'Review refund order ' || v_order.order_number, btrim(_reason), 'high')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open', 'in_progress', 'blocked') DO NOTHING;

  PERFORM public.notify_payment_staff(
    'refund.requested',
    'Permintaan refund baru',
    'Order ' || v_order.order_number || ' mengajukan refund.',
    v_pay.id
  );

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
  VALUES (
    v_user,
    'customer',
    'refund.request',
    'refund',
    v_id,
    jsonb_build_object('amount', v_refund_amount, 'paid_amount', v_pay.paid_amount, 'credit_used', v_order.credit_used),
    btrim(_reason)
  );

  RETURN jsonb_build_object('refund_id', v_id, 'amount', v_refund_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_refund(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.refunds;
  o public.orders;
  v_order_id uuid;
  v_new text;
  v_restore text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approve', 'reject', 'request_info') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF _decision = 'reject' THEN
    IF NOT public.has_permission(auth.uid(), 'refunds.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(auth.uid(), 'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;

  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.customer_id = auth.uid() THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;
  IF r.status NOT IN ('requested', 'under_review', 'information_requested') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;

  v_new := CASE _decision
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'information_requested'
  END;

  UPDATE public.refunds
     SET status = v_new,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         decision_note = _reason
   WHERE id = r.id;

  IF _decision = 'approve' THEN
    UPDATE public.orders SET status = 'refund_processing' WHERE id = o.id;
    INSERT INTO public.order_status_histories(order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (o.id, o.status, 'refund_processing', auth.uid(), 'finance', 'Refund disetujui, menunggu pengiriman dana');
  ELSIF _decision = 'reject' THEN
    IF EXISTS (SELECT 1 FROM public.marketplace_service_orders WHERE order_id = o.id) THEN
      SELECT CASE WHEN prior_order_status IN ('paid', 'completed') THEN prior_order_status ELSE 'paid' END
        INTO v_restore
        FROM public.marketplace_service_orders
       WHERE order_id = o.id
         FOR UPDATE;
      UPDATE public.marketplace_service_orders
         SET complaint_open = false,
             work_state = CASE
               WHEN work_state = 'complaint_open' THEN
                 CASE
                   WHEN prior_work_state IN ('awaiting_requirements', 'in_progress', 'delivered', 'revision_requested')
                     THEN prior_work_state
                   ELSE 'in_progress'
                 END
               ELSE work_state
             END,
             updated_at = now()
       WHERE order_id = o.id;
    ELSIF EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = o.id) THEN
      SELECT CASE status WHEN 'pending' THEN 'paid' ELSE 'completed' END INTO v_restore
        FROM public.digital_order_receipts WHERE order_id = o.id;
    ELSE
      SELECT previous_status INTO v_restore FROM public.order_status_histories
       WHERE order_id = o.id AND new_status = 'refund_requested'
       ORDER BY created_at DESC LIMIT 1;
      v_restore := COALESCE(v_restore, 'completed');
    END IF;
    UPDATE public.payments SET status = 'paid' WHERE id = r.payment_id AND status = 'refund_requested';
    UPDATE public.orders SET status = v_restore WHERE id = o.id AND status = 'refund_requested';
    INSERT INTO public.order_status_histories(order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
    VALUES (o.id, o.status, v_restore, auth.uid(), 'finance', 'Pengajuan refund ditolak', _reason);
  END IF;

  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
  VALUES (
    r.customer_id,
    'refund_' || v_new,
    'Status refund diperbarui',
    'Pengajuan refund ' || r.refund_number || ' kini berstatus ' || v_new || '.',
    'refund',
    r.id
  );

  IF _decision <> 'request_info' THEN
    UPDATE public.admin_tasks
       SET status = 'completed', completed_at = now(), note = _reason
     WHERE source_type = 'refund' AND source_id = r.id AND status <> 'completed';
  END IF;

  PERFORM public.write_audit_log(
    'refund.' || _decision,
    'refund',
    r.id,
    to_jsonb(r),
    jsonb_build_object('status', v_new),
    _reason,
    NULL,
    NULL
  );

  RETURN jsonb_build_object('status', v_new);
END;
$function$;

REVOKE ALL ON FUNCTION public.review_refund(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_refund(_refund_id uuid, _reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.refunds;
  o public.orders;
  v_order_id uuid;
  v_paid bigint;
  v_credit jsonb;
  s record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'refunds.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _reference IS NULL OR length(btrim(_reference)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.customer_id = auth.uid() THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;
  IF r.status = 'completed' THEN RETURN jsonb_build_object('status', 'completed', 'duplicate', true); END IF;
  IF r.status NOT IN ('approved', 'processing') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id = o.id AND store_id IS NOT NULL) THEN
    IF r.amount <> o.total OR
      (SELECT count(DISTINCT store_id) FROM public.order_items WHERE order_id = o.id) > 1 OR
      EXISTS (SELECT 1 FROM public.seller_ledger WHERE order_id = o.id AND source_type = 'sale' AND platform_fee <> 0)
    THEN
      RAISE EXCEPTION 'REFUND_ALLOCATION_REQUIRED';
    END IF;
  END IF;

  UPDATE public.refunds
     SET status = 'completed', processing_reference = _reference, processed_at = now()
   WHERE id = r.id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.refunds
   WHERE order_id = o.id AND status = 'completed';

  UPDATE public.payments
     SET status = CASE WHEN v_paid >= o.total THEN 'refunded' ELSE 'partially_refunded' END
   WHERE id = r.payment_id;

  UPDATE public.orders SET status = 'refunded' WHERE id = o.id;
  UPDATE public.marketplace_service_orders
     SET complaint_open = false, work_state = 'refunded', updated_at = now()
   WHERE order_id = o.id;

  INSERT INTO public.order_status_histories(order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (o.id, o.status, 'refunded', auth.uid(), 'finance', 'Dana refund telah dikirim');

  UPDATE public.digital_entitlements
     SET revoked_at = now()
   WHERE order_id = o.id AND revoked_at IS NULL;

  FOR s IN
    SELECT store_id,
           SUM(
             CASE
               WHEN direction = 'credit' AND source_type = 'sale' THEN amount
               WHEN direction = 'debit' AND source_type IN ('refund', 'reversal') THEN -amount
               ELSE 0
             END
           )::bigint AS remaining
      FROM public.seller_ledger
     WHERE order_id = o.id
     GROUP BY store_id
  LOOP
    IF s.remaining > 0 THEN
      INSERT INTO public.seller_ledger (
        store_id, direction, amount, gross_amount, platform_fee, source_type, source_id,
        order_id, reference, note, created_by, idempotency_key
      )
      VALUES (
        s.store_id, 'debit', s.remaining, s.remaining, 0, 'refund', r.id,
        o.id, 'REFUND:' || r.refund_number, 'Debit refund ' || r.refund_number,
        auth.uid(), 'refund:' || r.id::text || ':' || s.store_id::text
      )
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
  END LOOP;

  v_credit := public.credit_refund_to_balance(r.id);

  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
  VALUES (
    r.customer_id,
    'refund_completed',
    'Refund selesai',
    'Dana refund untuk ' || r.refund_number || ' telah dikirim.',
    'refund',
    r.id
  );

  PERFORM public.write_audit_log(
    'refund.process',
    'refund',
    r.id,
    to_jsonb(r),
    jsonb_build_object('status', 'completed', 'credit', v_credit),
    _reference,
    NULL,
    NULL
  );

  RETURN jsonb_build_object('status', 'completed', 'credit', v_credit, 'duplicate', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.process_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. #6 & #11 Payout Hardening: cancel_own_withdrawal ('requested' only)
--             & save_seller_bank_account (active store required)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_own_withdrawal(_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_store uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.store_id <> v_store THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Hanya boleh dibatalkan seller saat masih 'requested'. Setelah 'approved',
  -- finance mungkin sedang memproses transfer bank manual sehingga pembatalan
  -- wajib melalui finance/rekonsiliasi.
  IF w.status <> 'requested' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = 'cancelled', updated_at = now()
   WHERE id = w.id;

  INSERT INTO public.seller_ledger
    (store_id, direction, amount, gross_amount, platform_fee, source_type, source_id,
     reference, note, created_by, idempotency_key)
  VALUES
    (v_store, 'credit', w.gross_amount, w.gross_amount, 0, 'reversal', w.id,
     'WDR:' || w.withdrawal_number, 'Pembatalan penarikan ' || w.withdrawal_number,
     v_user, 'payout:' || w.id::text || ':reversal');

  INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
  VALUES (w.id, 'cancelled', v_user, 'Dibatalkan seller; saldo bruto dikembalikan.');

  PERFORM public.notify_payout_staff('payout.cancelled', 'Penarikan dibatalkan seller',
    w.withdrawal_number || ' dibatalkan oleh seller.', w.id);
  PERFORM public.write_audit_log('payout.cancel', 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('status', 'cancelled'), NULL, NULL, NULL);

  RETURN jsonb_build_object('status', 'cancelled', 'restored', w.gross_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_own_withdrawal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_withdrawal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_seller_bank_account(
  _bank_name text,
  _account_number text,
  _account_holder_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_store uuid;
  v_store_status text;
  v_masked text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;

  SELECT status INTO v_store_status FROM public.stores WHERE id = v_store;
  IF v_store_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'STORE_INACTIVE'; END IF;

  IF _bank_name IS NULL OR length(btrim(_bank_name)) NOT BETWEEN 2 AND 60
    OR _account_number IS NULL OR regexp_replace(btrim(_account_number), '[ -]', '', 'g') !~ '^[0-9]{6,25}$'
    OR _account_holder_name IS NULL OR length(btrim(_account_holder_name)) NOT BETWEEN 2 AND 100
  THEN
    RAISE EXCEPTION 'INVALID_BANK_ACCOUNT';
  END IF;

  INSERT INTO public.seller_bank_accounts
    (store_id, bank_name, account_number, account_holder_name)
  VALUES
    (v_store, btrim(_bank_name), btrim(_account_number), btrim(_account_holder_name))
  ON CONFLICT (store_id) DO UPDATE
    SET bank_name = EXCLUDED.bank_name,
        account_number = EXCLUDED.account_number,
        account_holder_name = EXCLUDED.account_holder_name,
        updated_at = now();

  v_masked := '****' || right(regexp_replace(btrim(_account_number), '[ -]', '', 'g'), 4);
  PERFORM public.write_audit_log(
    'seller.bank_account.save',
    'seller_bank_account',
    v_store,
    NULL,
    jsonb_build_object(
      'store_id', v_store,
      'account_masked', v_masked,
      'bank_name', btrim(_bank_name),
      'holder', btrim(_account_holder_name)
    ),
    'Perubahan rekening pencairan seller',
    NULL,
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'account_masked', v_masked);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_seller_bank_account(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_seller_bank_account(text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. #8 Drop direct INSERT policy on manual_payment_proofs
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS proofs_insert_own ON public.manual_payment_proofs;

-- ----------------------------------------------------------------------------
-- 7. #10 Align system_settings write RLS policy to granular settings.manage
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS settings_write_admin ON public.system_settings;
CREATE POLICY settings_write_admin
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.manage')
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'settings.manage')
    OR public.is_super_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 8. #12 Defense-in-depth: REVOKE direct table write grants on financial tables
--    (All mutations run through SECURITY DEFINER RPCs or service_role)
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.manual_payment_proofs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_verifications FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_topups FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.seller_ledger FROM anon, authenticated;

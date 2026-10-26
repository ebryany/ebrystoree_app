-- ============================================================================
-- PERBAIKAN KEAMANAN H-1..H-4 (audit docs/security/00-security-audit-mgrcao-v3.md)
-- Rencana: docs/security/01-rencana-perbaikan-h1-h4-mgrcao-v3.md
--
-- H-1  update_admin_task: predikat otorisasi NULL-safe (assignee NULL + tanpa
--      permission tidak lagi lolos karena NOT (false OR NULL) = NULL).
-- H-2  digital_products: seller tidak bisa membuat/menaikkan barisnya sendiri ke
--      moderation_status='approved' lewat jalur API langsung (bypass allowlist
--      handler). Admin (RPC moderasi) dan service_role tidak terganggu.
-- H-3  apply_credit_to_order: advisory lock transaksi per-user sebelum baca saldo,
--      agar dua order konkuren tidak meng-overdraw saldo kredit.
-- H-4  cancel_own_order & job_expire_orders: kunci idempotensi reversal tunggal
--      per debit + kursor job memakai FOR UPDATE SKIP LOCKED.
--
-- Sifat: ADITIF (CREATE OR REPLACE + trigger baru; tidak ada perubahan schema).
-- Rollback: jalankan ulang definisi lama dari 20260728180436 (H-1),
--   20260930100005 (H-3), 20261001100001 (H-4), dan
--   DROP TRIGGER products_protect_moderation + DROP FUNCTION protect_moderation_fields (H-2).
-- ============================================================================

-- ============================
-- H-1: otorisasi task NULL-safe
-- ============================
CREATE OR REPLACE FUNCTION public.update_admin_task(_task_id uuid, _action text, _assignee uuid DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE t public.admin_tasks; v_status text; v_assignee uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _action NOT IN ('claim','assign','complete','cancel','reopen') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;

  SELECT * INTO t FROM public.admin_tasks WHERE id = _task_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF _action = 'assign' THEN
    IF NOT public.has_permission(auth.uid(), 'tasks.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSIF (public.has_permission(auth.uid(), 'tasks.update') OR t.assignee_id = auth.uid()) IS NOT TRUE THEN
    -- H-1: NULL-safe. Tanpa ini, t.assignee_id NULL + tanpa permission membuat
    -- (false OR NULL) = NULL dan blok IF tidak pernah raise.
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _action = 'complete' AND t.task_type = 'assign_operator' AND t.source_type = 'order' AND t.source_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.operator_assignments oa
       WHERE oa.order_id = t.source_id
         AND oa.status NOT IN ('cancelled','rejected')
    ) THEN
      RAISE EXCEPTION 'ASSIGNMENT_REQUIRED';
    END IF;
  END IF;

  v_status := t.status; v_assignee := t.assignee_id;

  IF _action = 'claim' THEN v_status := 'in_progress'; v_assignee := auth.uid();
  ELSIF _action = 'assign' THEN
    IF _assignee IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_status := 'in_progress'; v_assignee := _assignee;
  ELSIF _action = 'complete' THEN v_status := 'completed';
  ELSIF _action = 'cancel' THEN v_status := 'cancelled';
  ELSE v_status := 'open'; v_assignee := NULL;
  END IF;

  UPDATE public.admin_tasks
     SET status = v_status,
         assignee_id = v_assignee,
         note = COALESCE(_note, note),
         completed_at = CASE WHEN v_status = 'completed' THEN now() ELSE NULL END
   WHERE id = t.id;

  PERFORM public.write_audit_log('task.' || _action, 'admin_task', t.id, to_jsonb(t),
    jsonb_build_object('status', v_status, 'assignee_id', v_assignee), _note, NULL, NULL);

  RETURN jsonb_build_object('status', v_status);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.update_admin_task(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_task(uuid, text, uuid, text) TO authenticated;

-- ============================
-- H-2: kolom moderasi dilindungi di boundary DB
-- ============================
-- Trigger ini HANYA membatasi sesi user non-admin pada baris milik seller
-- (store_id IS NOT NULL). Jalur resmi yang tetap bekerja:
--   - review_product / admin via user-JWT  -> is_admin() = true -> lewati
--   - produk platform via service_role     -> auth.uid() NULL -> lewati
--   - submit_product_for_review (seller)   -> transisi ke 'pending' diizinkan
CREATE OR REPLACE FUNCTION public.protect_moderation_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Produk platform (store_id NULL) dikelola admin, bukan seller: tidak dibatasi.
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Seller tidak boleh lahir dengan moderation 'approved' (default kolom).
    NEW.moderation_status := 'pending';
    NEW.moderation_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSE
    -- Non-admin hanya boleh menurunkan status moderasi (pending/rejected),
    -- tidak pernah menaikkannya ke 'approved'.
    IF NEW.moderation_status = 'approved' AND OLD.moderation_status IS DISTINCT FROM 'approved' THEN
      NEW.moderation_status := OLD.moderation_status;
    END IF;
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
       AND NEW.moderation_status NOT IN ('pending','rejected') THEN
      NEW.moderation_status := OLD.moderation_status;
    END IF;
    -- Catatan reviewer hanya boleh berubah bila status moderasinya ikut berubah
    -- (menjaga semantik submit_product_for_review yang me-reset note).
    NEW.moderation_note := CASE WHEN NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
                                THEN NEW.moderation_note ELSE OLD.moderation_note END;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS products_protect_moderation ON public.digital_products;
CREATE TRIGGER products_protect_moderation
  BEFORE INSERT OR UPDATE ON public.digital_products
  FOR EACH ROW EXECUTE FUNCTION public.protect_moderation_fields();

-- ============================
-- H-3: serialisasi pemakaian saldo per user
-- ============================
CREATE OR REPLACE FUNCTION public.apply_credit_to_order(_order_id uuid, _max_credit bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  v_balance bigint;
  v_use bigint;
  v_key text;
  v_existing public.credit_ledger;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.user_id <> auth.uid() THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF o.credit_used > 0 THEN
    RETURN jsonb_build_object('credit_used', o.credit_used, 'amount_due', o.amount_due, 'duplicate', true);
  END IF;

  -- H-3: kunci transaksi per-user SEBELUM baca saldo. Bentuk dua-argumen dengan
  -- class 710003 terpisah dari keyspace hashtext() satu-argumen milik
  -- check_rate_limit, jadi tidak mungkin kolisi. Tanpa ini, dua order berbeda
  -- milik user yang sama membaca saldo bersamaan dan sama-sama berhasil debit.
  PERFORM pg_advisory_xact_lock(710003, hashtext(o.user_id::text));

  v_balance := public.get_credit_balance(o.user_id);
  v_use := LEAST(COALESCE(_max_credit, v_balance), v_balance, o.total);
  IF v_use <= 0 THEN
    RETURN jsonb_build_object('credit_used', 0, 'amount_due', o.total, 'duplicate', false);
  END IF;

  v_key := 'order:' || o.id::text;

  SELECT * INTO v_existing FROM public.credit_ledger WHERE idempotency_key = v_key;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.credit_ledger
      (user_id, direction, amount, source_type, source_id, reference, note, created_by, idempotency_key)
    VALUES
      (o.user_id, 'debit', v_use, 'adjustment', o.id, o.order_number,
       'Pemakaian saldo untuk pesanan ' || o.order_number, auth.uid(), v_key);
  END IF;

  UPDATE public.orders
     SET credit_used = v_use,
         amount_due = total - v_use
   WHERE id = o.id;

  -- Sesuaikan jumlah yang harus dibayar pada payment yang belum dibayar.
  UPDATE public.payments
     SET expected_amount = o.total - v_use
   WHERE order_id = o.id AND status IN ('waiting_payment','pending','draft');

  PERFORM public.write_audit_log('order.credit_apply', 'order', o.id, NULL,
    jsonb_build_object('credit_used', v_use, 'amount_due', o.total - v_use),
    'Pemakaian saldo Ebrystore', NULL, NULL);

  RETURN jsonb_build_object('credit_used', v_use, 'amount_due', o.total - v_use, 'duplicate', false);
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_credit_to_order(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_credit_to_order(uuid, bigint) TO authenticated;

-- ============================
-- H-4: satu kunci reversal untuk cancel & expire + lock baris di job
-- ============================
CREATE OR REPLACE FUNCTION public.cancel_own_order(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order record; v_reversal_key text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status NOT IN ('awaiting_payment','draft') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  -- H-4: kunci reversal SAMA dengan jalur expire, agar debit 'order:<id>'
  -- hanya pernah dibalikkan sekali oleh jalur mana pun.
  IF COALESCE(v_order.credit_used, 0) > 0 THEN
    v_reversal_key := 'reverse:order:' || _order_id::text;
    INSERT INTO public.credit_ledger
      (user_id, direction, amount, source_type, source_id, reference, note, created_by, idempotency_key)
    VALUES
      (v_user, 'credit', v_order.credit_used, 'reversal', _order_id, v_order.order_number,
       'Pengembalian saldo karena pembatalan pesanan ' || v_order.order_number, v_user, v_reversal_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancellation_reason = _reason WHERE id = _order_id;
  UPDATE public.payments SET status = 'cancelled' WHERE order_id = _order_id AND status IN ('pending','waiting_payment','rejected');
  UPDATE public.invoices SET status = 'cancelled' WHERE order_id = _order_id;
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'cancelled', v_user, 'customer', COALESCE(_reason,'Dibatalkan pelanggan.'));
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'order.cancelled', 'Pesanan dibatalkan', 'Pesanan ' || v_order.order_number || ' dibatalkan.', 'order', _order_id);
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
  VALUES (v_user, 'customer', 'order.cancel', 'order', _order_id,
          jsonb_build_object('status','cancelled','credit_reversed', COALESCE(v_order.credit_used,0)), _reason);
  RETURN jsonb_build_object('status', 'cancelled', 'credit_reversed', COALESCE(v_order.credit_used,0));
END;
$$;

CREATE OR REPLACE FUNCTION public.job_expire_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0; v_start timestamptz := now(); v_reversal_key text;
BEGIN
  -- H-4: FOR UPDATE SKIP LOCKED agar job tidak mengambil baris yang sedang
  -- diproses cancel manual (yang mengunci baris order yang sama), dan sebaliknya.
  FOR r IN
    SELECT id, order_number, user_id, status, COALESCE(credit_used, 0) AS credit_used
      FROM public.orders
     WHERE status IN ('draft','awaiting_payment')
       AND expired_at IS NOT NULL
       AND expired_at < now()
       LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    -- H-4: kunci reversal SAMA dengan jalur cancel manual.
    IF r.credit_used > 0 THEN
      v_reversal_key := 'reverse:order:' || r.id::text;
      INSERT INTO public.credit_ledger
        (user_id, direction, amount, source_type, source_id, reference, note, idempotency_key)
      VALUES
        (r.user_id, 'credit', r.credit_used, 'reversal', r.id, r.order_number,
         'Pengembalian saldo karena pesanan kedaluwarsa ' || r.order_number, v_reversal_key)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    UPDATE public.orders
       SET status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = COALESCE(cancellation_reason, 'Kedaluwarsa otomatis: batas waktu pembayaran terlewati.')
     WHERE id = r.id;

    UPDATE public.payments
       SET status = 'expired', failed_at = now()
     WHERE order_id = r.id AND status IN ('draft','pending','waiting_payment','rejected');

    UPDATE public.invoices SET status = 'cancelled' WHERE order_id = r.id AND status <> 'paid';

    UPDATE public.admin_tasks SET status = 'cancelled', note = 'Order kedaluwarsa otomatis'
     WHERE source_type = 'order' AND source_id = r.id AND status IN ('open','in_progress','blocked');

    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_type, public_note)
    VALUES (r.id, r.status, 'cancelled', 'system', 'Pesanan dibatalkan otomatis karena melewati batas waktu pembayaran.');

    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (r.user_id, 'order.expired', 'Pesanan kedaluwarsa',
            'Pesanan ' || r.order_number || ' dibatalkan otomatis karena belum dibayar sampai batas waktu.', 'order', r.id);

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, detail, started_at, finished_at)
  VALUES ('expire_orders', 'success', v_count, jsonb_build_object('expired_orders', v_count), v_start, now());

  RETURN jsonb_build_object('job', 'expire_orders', 'affected', v_count);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, error_message, started_at, finished_at)
  VALUES ('expire_orders', 'error', v_count, SQLERRM, v_start, now());
  RETURN jsonb_build_object('job', 'expire_orders', 'error', SQLERRM);
END; $$;

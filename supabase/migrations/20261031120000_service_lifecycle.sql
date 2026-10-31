-- ============================================================================
-- SIKLUS PESANAN JASA SELLER: batas respons, tolak kebutuhan, perpanjangan,
-- batal karena terlambat, terima otomatis, pengingat, dan komisi platform.
--
-- Aturan (disetujui owner 2026-10-31):
--   1. Seller wajib merespons kebutuhan maksimal `marketplace_service_response_hours`
--      (default 24 jam) sejak dibayar. Ditolak / tidak direspons -> refund penuh
--      otomatis ke saldo Ebrystore pembeli.
--   2. Setelah hasil dikirim, pembeli punya `marketplace_auto_release_hours`
--      (diset 72 jam) untuk meninjau. Lewat batas tanpa revisi/komplain dan
--      `marketplace_auto_release` aktif -> diterima otomatis, dana seller dilepas.
--      Pengingat ke pembeli di hari ke-1 dan ke-2.
--   3. Tenggat lewat & belum ada hasil -> pembeli boleh batal + refund ke saldo
--      tanpa admin. Seller boleh mengajukan perpanjangan (maks 2x, 1-14 hari);
--      berlaku hanya bila pembeli setuju.
--   4. Komisi platform jasa `marketplace_service_fee_bps` (default 0) dipotong
--      saat pendapatan dilepas ke seller.
--
-- Semua refund di sini terjadi SEBELUM penerimaan, jadi belum ada entri
-- seller_ledger 'sale' yang perlu didebit.
--
-- Rollback:
--   SELECT cron.unschedule('service_lifecycle');
--   DROP TRIGGER mso_lifecycle_timestamps ON marketplace_service_orders;
--   DROP TRIGGER orders_service_response_deadline ON orders;
--   DROP FUNCTION job_service_lifecycle(), _service_refund_to_balance(uuid,text,uuid,text),
--     _service_auto_accept(uuid), reject_service_requirements(uuid,text),
--     request_service_extension(uuid,integer,text), respond_service_extension(uuid,boolean),
--     cancel_overdue_service_order(uuid,text), trg_mso_lifecycle_timestamps(),
--     trg_orders_service_response_deadline(), setting_bool(text,boolean);
--   Kembalikan credit_seller_earnings & list_my_service_orders dari
--     20261003120000 / 20261003150000; kembalikan constraint actor_role events.
--   ALTER TABLE marketplace_service_orders DROP COLUMN seller_response_due_at,
--     review_due_at, reminder_count, extension_requested_days, extension_reason,
--     extension_requested_at, extension_count;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom & constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_service_orders
  ADD COLUMN IF NOT EXISTS seller_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extension_requested_days integer,
  ADD COLUMN IF NOT EXISTS extension_reason text,
  ADD COLUMN IF NOT EXISTS extension_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS extension_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.marketplace_service_orders
  DROP CONSTRAINT IF EXISTS marketplace_service_orders_extension_days_check;
ALTER TABLE public.marketplace_service_orders
  ADD CONSTRAINT marketplace_service_orders_extension_days_check
  CHECK (extension_requested_days IS NULL OR extension_requested_days BETWEEN 1 AND 14);

-- Aksi otomatis dicatat sebagai 'system' tanpa actor_id.
ALTER TABLE public.marketplace_service_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.marketplace_service_events
  DROP CONSTRAINT IF EXISTS marketplace_service_events_actor_role_check;
ALTER TABLE public.marketplace_service_events
  ADD CONSTRAINT marketplace_service_events_actor_role_check
  CHECK (actor_role = ANY (ARRAY['buyer','seller','admin','system']));

CREATE INDEX IF NOT EXISTS idx_mso_lifecycle_open
  ON public.marketplace_service_orders (work_state)
  WHERE work_state IN ('awaiting_requirements','in_progress','delivered') AND complaint_open = false;

-- ---------------------------------------------------------------------------
-- 2. Pengaturan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.setting_bool(_key text, _default boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::boolean FROM public.system_settings WHERE key = _key), _default);
$$;

INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('marketplace_service_response_hours', '24'::jsonb,
   'Batas waktu seller menyetujui/menolak kebutuhan pembeli sejak dibayar (jam). Lewat batas = refund otomatis.', true),
  ('marketplace_service_fee_bps', '0'::jsonb,
   'Komisi platform untuk pesanan jasa seller dalam basis poin (1000 = 10%). Dipotong saat dana dilepas ke seller.', true)
ON CONFLICT (key) DO NOTHING;

-- Terima otomatis disetujui owner: aktif, jendela tinjau 72 jam.
INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('marketplace_auto_release', 'true'::jsonb,
   'Bila aktif, hasil jasa diterima otomatis setelah jendela tinjau berakhir tanpa revisi/komplain.', true),
  ('marketplace_auto_release_hours', '72'::jsonb,
   'Jendela pembeli meninjau hasil jasa sebelum diterima otomatis (jam).', true)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Trigger tenggat
-- ---------------------------------------------------------------------------
-- Batas respons seller dimulai saat order jasa berstatus 'paid'.
CREATE OR REPLACE FUNCTION public.trg_orders_service_response_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_type = 'marketplace_service' AND NEW.status = 'paid'
     AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.marketplace_service_orders
       SET seller_response_due_at = now()
             + make_interval(hours => public.setting_int('marketplace_service_response_hours', 24)::int)
     WHERE order_id = NEW.id AND work_state = 'awaiting_requirements' AND seller_response_due_at IS NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_service_response_deadline ON public.orders;
CREATE TRIGGER orders_service_response_deadline
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_service_response_deadline();

-- Jendela tinjau & pengingat mengikuti perpindahan work_state.
CREATE OR REPLACE FUNCTION public.trg_mso_lifecycle_timestamps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hours int := public.setting_int('marketplace_auto_release_hours', 72)::int;
BEGIN
  IF NEW.work_state IS DISTINCT FROM OLD.work_state THEN
    NEW.reminder_count := 0;
    NEW.review_due_at := CASE WHEN NEW.work_state = 'delivered'
      THEN now() + make_interval(hours => v_hours) END;
    -- Perpanjangan yang belum dijawab gugur bila pekerjaan sudah pindah fase.
    IF NEW.work_state NOT IN ('in_progress','revision_requested') THEN
      NEW.extension_requested_days := NULL;
      NEW.extension_reason := NULL;
      NEW.extension_requested_at := NULL;
    END IF;
  ELSIF OLD.complaint_open AND NOT NEW.complaint_open AND NEW.work_state = 'delivered' THEN
    -- Komplain dilanjutkan admin: pembeli mendapat jendela tinjau baru.
    NEW.reminder_count := 0;
    NEW.review_due_at := now() + make_interval(hours => v_hours);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS mso_lifecycle_timestamps ON public.marketplace_service_orders;
CREATE TRIGGER mso_lifecycle_timestamps
  BEFORE UPDATE ON public.marketplace_service_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_mso_lifecycle_timestamps();

-- Backfill: pesanan aktif yang sudah ada mendapat batas penuh mulai sekarang.
UPDATE public.marketplace_service_orders m
   SET seller_response_due_at = now()
         + make_interval(hours => public.setting_int('marketplace_service_response_hours', 24)::int)
  FROM public.orders o
 WHERE o.id = m.order_id AND o.status = 'paid'
   AND m.work_state = 'awaiting_requirements' AND m.seller_response_due_at IS NULL;
UPDATE public.marketplace_service_orders
   SET review_due_at = now() + make_interval(hours => public.setting_int('marketplace_auto_release_hours', 72)::int)
 WHERE work_state = 'delivered' AND review_due_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Refund internal ke saldo (sebelum penerimaan)
-- ---------------------------------------------------------------------------
-- Internal: dipanggil hanya oleh RPC/job di file ini. Pemanggil wajib sudah
-- memvalidasi hak akses. Tidak memakai credit_refund_to_balance karena fungsi
-- itu mensyaratkan izin staf refunds.process.
CREATE OR REPLACE FUNCTION public._service_refund_to_balance(
  _order_id uuid, _reason text, _actor uuid, _actor_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE; m public.marketplace_service_orders%ROWTYPE;
  v_pay_id uuid; v_refund public.refunds%ROWTYPE; v_owner uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO m FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.status <> 'paid' OR m.accepted_delivery_id IS NOT NULL OR m.complaint_open
    THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE order_id = o.id
    AND status IN ('requested','under_review','information_requested','approved','processing'))
    THEN RAISE EXCEPTION 'REFUND_ACTIVE'; END IF;
  IF o.total <= 0 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT id INTO v_pay_id FROM public.payments WHERE order_id = o.id AND status = 'paid'
    ORDER BY paid_at DESC NULLS LAST LIMIT 1;

  -- Seluruh total (termasuk bagian yang dibayar dengan saldo) kembali ke saldo.
  INSERT INTO public.refunds (order_id, payment_id, customer_id, amount, reason, status,
      reviewed_by, reviewed_at, decision_note, processing_reference, processed_at)
    VALUES (o.id, v_pay_id, o.user_id, o.total, _reason, 'completed',
      _actor, now(), 'Refund otomatis pesanan jasa', 'SALDO:' || o.order_number, now())
    RETURNING * INTO v_refund;

  INSERT INTO public.credit_ledger
      (user_id, direction, amount, source_type, source_id, reference, note, created_by, idempotency_key)
    VALUES (o.user_id, 'credit', v_refund.amount, 'refund', v_refund.id, v_refund.refund_number,
      'Saldo dari refund ' || v_refund.refund_number, _actor, 'refund:' || v_refund.id::text)
    ON CONFLICT (idempotency_key) DO NOTHING;

  IF v_pay_id IS NOT NULL THEN
    UPDATE public.payments SET status = 'refunded' WHERE id = v_pay_id;
  END IF;
  UPDATE public.orders SET status = 'refunded', cancelled_at = now(),
      cancellation_reason = COALESCE(cancellation_reason, _reason)
    WHERE id = o.id;
  UPDATE public.marketplace_service_orders SET work_state = 'refunded', updated_at = now()
    WHERE order_id = o.id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (o.id, o.status, 'refunded', _actor,
      CASE _actor_role WHEN 'buyer' THEN 'customer' ELSE 'system' END,
      _reason || ' Dana ' || to_char(o.total, 'FM999G999G999') || ' masuk ke saldo Ebrystore.');
  INSERT INTO public.marketplace_service_events (order_id, event_type, actor_id, actor_role, payload)
    VALUES (o.id, 'refunded_to_balance', _actor, _actor_role,
      jsonb_build_object('reason', _reason, 'refund_id', v_refund.id, 'amount', o.total));

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (o.user_id, 'credit_received', 'Dana pesanan dikembalikan ke saldo',
      'Pesanan ' || o.order_number || ' dibatalkan. ' || _reason
        || ' Dana dikembalikan penuh ke saldo Ebrystore Anda.', 'order', o.id);
  SELECT owner_id INTO v_owner FROM public.stores WHERE id = m.store_id;
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_owner, 'service.refunded', 'Pesanan jasa dibatalkan',
        'Pesanan ' || o.order_number || ' dibatalkan dan dana dikembalikan ke pembeli. ' || _reason,
        'order', o.id);
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
    VALUES (_actor, _actor_role, 'service.refund_to_balance', 'order', o.id,
      jsonb_build_object('status', o.status, 'work_state', m.work_state),
      jsonb_build_object('status', 'refunded', 'refund_id', v_refund.id, 'amount', o.total), _reason);

  RETURN jsonb_build_object('status', 'refunded', 'refund_id', v_refund.id, 'amount', o.total);
END; $$;
REVOKE ALL ON FUNCTION public._service_refund_to_balance(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Seller menolak kebutuhan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_service_requirements(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_store public.stores%ROWTYPE; m public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  PERFORM 1 FROM public.orders WHERE id = _order_id FOR UPDATE;
  SELECT * INTO m FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR m.store_id <> v_store.id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.work_state <> 'awaiting_requirements' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  RETURN public._service_refund_to_balance(_order_id,
    'Seller menolak kebutuhan: ' || btrim(_reason) || '.', v_user, 'seller');
END; $$;

-- ---------------------------------------------------------------------------
-- 6. Perpanjangan tenggat (seller ajukan, pembeli putuskan)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_service_extension(_order_id uuid, _days integer, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_store public.stores%ROWTYPE;
  o public.orders%ROWTYPE; m public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _days IS NULL OR _days NOT BETWEEN 1 AND 14 THEN RAISE EXCEPTION 'INVALID_DAYS'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  SELECT * INTO m FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR m.store_id <> v_store.id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.status <> 'paid' OR m.complaint_open OR m.due_at IS NULL
    OR m.work_state NOT IN ('in_progress','revision_requested') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF m.extension_requested_at IS NOT NULL THEN RAISE EXCEPTION 'EXTENSION_PENDING'; END IF;
  IF m.extension_count >= 2 THEN RAISE EXCEPTION 'EXTENSION_LIMIT'; END IF;
  UPDATE public.marketplace_service_orders SET extension_requested_days = _days,
      extension_reason = btrim(_reason), extension_requested_at = now(), updated_at = now()
    WHERE order_id = _order_id;
  INSERT INTO public.marketplace_service_events (order_id, event_type, actor_id, actor_role, payload)
    VALUES (_order_id, 'extension_requested', v_user, 'seller',
      jsonb_build_object('days', _days, 'reason', btrim(_reason)));
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (o.user_id, 'service.extension_requested', 'Seller meminta perpanjangan',
      'Seller meminta tambahan ' || _days || ' hari untuk pesanan ' || o.order_number
        || ': ' || btrim(_reason) || ' Setujui atau tolak di halaman pesanan.', 'order', _order_id);
  RETURN jsonb_build_object('status', 'extension_requested', 'days', _days);
END; $$;

CREATE OR REPLACE FUNCTION public.respond_service_extension(_order_id uuid, _approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); o public.orders%ROWTYPE; m public.marketplace_service_orders%ROWTYPE;
  v_due timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _approve IS NULL THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR o.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO m FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.extension_requested_at IS NULL THEN RAISE EXCEPTION 'NO_EXTENSION'; END IF;
  IF o.status <> 'paid' OR m.complaint_open THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  -- Perpanjangan dihitung dari tenggat lama, atau dari sekarang bila sudah lewat.
  v_due := CASE WHEN _approve
    THEN GREATEST(m.due_at, now()) + make_interval(days => m.extension_requested_days)
    ELSE m.due_at END;
  UPDATE public.marketplace_service_orders SET due_at = v_due,
      extension_count = extension_count + CASE WHEN _approve THEN 1 ELSE 0 END,
      extension_requested_days = NULL, extension_reason = NULL, extension_requested_at = NULL,
      reminder_count = CASE WHEN _approve THEN 0 ELSE reminder_count END, updated_at = now()
    WHERE order_id = _order_id;
  INSERT INTO public.marketplace_service_events (order_id, event_type, actor_id, actor_role, payload)
    VALUES (_order_id, CASE WHEN _approve THEN 'extension_approved' ELSE 'extension_rejected' END,
      v_user, 'buyer', jsonb_build_object('days', m.extension_requested_days, 'due_at', v_due));
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    SELECT s.owner_id, 'service.extension_' || CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      CASE WHEN _approve THEN 'Perpanjangan disetujui' ELSE 'Perpanjangan ditolak' END,
      'Pembeli ' || CASE WHEN _approve THEN 'menyetujui' ELSE 'menolak' END
        || ' perpanjangan pesanan ' || o.order_number || '. Tenggat: '
        || to_char(v_due AT TIME ZONE 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB.', 'order', _order_id
    FROM public.stores s WHERE s.id = m.store_id;
  RETURN jsonb_build_object('status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, 'due_at', v_due);
END; $$;

-- ---------------------------------------------------------------------------
-- 7. Pembeli membatalkan pesanan yang melewati tenggat tanpa hasil
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_overdue_service_order(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); o public.orders%ROWTYPE; m public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR o.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO m FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.work_state <> 'in_progress' OR m.latest_delivery_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF m.due_at IS NULL OR m.due_at > now() THEN RAISE EXCEPTION 'NOT_OVERDUE'; END IF;
  RETURN public._service_refund_to_balance(_order_id,
    'Pembeli membatalkan karena tenggat terlewati tanpa hasil'
      || CASE WHEN length(btrim(COALESCE(_reason, ''))) > 0 THEN ': ' || btrim(_reason) ELSE '' END || '.',
    v_user, 'buyer');
END; $$;

-- ---------------------------------------------------------------------------
-- 8. Terima otomatis (internal, dipanggil job)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._service_auto_accept(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; m public.marketplace_service_orders%ROWTYPE;
  d public.marketplace_service_deliveries%ROWTYPE; v_credit jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  SELECT * INTO m FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'paid' OR m.work_state <> 'delivered' OR m.complaint_open
    OR m.accepted_delivery_id IS NOT NULL OR m.latest_delivery_id IS NULL
    OR m.review_due_at IS NULL OR m.review_due_at > now() THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;
  SELECT * INTO d FROM public.marketplace_service_deliveries WHERE id = m.latest_delivery_id;
  UPDATE public.marketplace_service_orders SET accepted_delivery_id = d.id, accepted_at = now(),
      work_state = 'accepted', updated_at = now() WHERE order_id = _order_id;
  UPDATE public.orders SET status = 'completed', completed_at = now() WHERE id = _order_id;
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_type, public_note)
    VALUES (_order_id, 'paid', 'completed', 'system',
      'Hasil versi ' || d.version || ' diterima otomatis karena jendela tinjau berakhir tanpa revisi atau komplain.');
  INSERT INTO public.marketplace_service_events (order_id, event_type, actor_role, delivery_id, payload)
    VALUES (_order_id, 'auto_accepted', 'system', d.id, jsonb_build_object('version', d.version));
  v_credit := public.credit_seller_earnings(_order_id);
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (o.user_id, 'service.auto_accepted', 'Hasil diterima otomatis',
      'Jendela tinjau pesanan ' || o.order_number || ' berakhir. Hasil versi ' || d.version
        || ' dianggap diterima.', 'order', _order_id);
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    SELECT s.owner_id, 'service.accepted', 'Hasil diterima otomatis',
      'Pesanan ' || o.order_number || ' diterima otomatis. Pendapatan dilepas ke saldo toko.', 'order', _order_id
    FROM public.stores s WHERE s.id = m.store_id;
  RETURN jsonb_build_object('status', 'accepted', 'credit', v_credit);
END; $$;
REVOKE ALL ON FUNCTION public._service_auto_accept(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Komisi platform pada pelepasan dana jasa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_seller_earnings(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; r record; v_key text; v_count int := 0; v_total bigint := 0;
  v_fee_bps bigint := 0; v_fee bigint;
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
  ELSIF o.order_type = 'marketplace_service' THEN
    IF NOT EXISTS (SELECT 1 FROM public.marketplace_service_orders
      WHERE order_id = o.id AND accepted_delivery_id IS NOT NULL AND accepted_at IS NOT NULL
        AND work_state = 'accepted' AND complaint_open = false)
      THEN RAISE EXCEPTION 'ACCEPTANCE_REQUIRED'; END IF;
    v_fee_bps := LEAST(GREATEST(public.setting_int('marketplace_service_fee_bps', 0), 0), 5000);
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
    -- Pembulatan ke bawah: komisi tidak pernah melebihi persentase yang diumumkan.
    v_fee := LEAST((r.gross * v_fee_bps) / 10000, r.gross - 1);
    v_key := 'sale:' || o.id::text || ':' || r.store_id::text;
    INSERT INTO public.seller_ledger
      (store_id,direction,amount,gross_amount,platform_fee,source_type,order_id,reference,note,idempotency_key)
    VALUES (r.store_id,'credit',r.gross - v_fee,r.gross,v_fee,'sale',o.id,'ORDER:' || o.id::text,
      CASE WHEN v_fee > 0 THEN 'Pendapatan penjualan dilepas (komisi platform dipotong)'
        ELSE 'Pendapatan penjualan dilepas' END, v_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; v_total := v_total + r.gross - v_fee; END IF;
  END LOOP;
  RETURN jsonb_build_object('status',CASE WHEN v_count = 0 THEN 'already_credited' ELSE 'credited' END,
    'stores',v_count,'amount',v_total);
END; $$;

-- ---------------------------------------------------------------------------
-- 10. Daftar pesanan seller: sertakan batas respons, jendela tinjau, perpanjangan
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_my_service_orders();
CREATE FUNCTION public.list_my_service_orders()
RETURNS TABLE(order_id uuid, order_number text, order_status text, total bigint,
  paid_at timestamptz, work_state text, complaint_open boolean, due_at timestamptz,
  revision_used integer, revision_limit integer, requirements_approved_at timestamptz,
  accepted_at timestamptz, service_name text, seller_response_due_at timestamptz,
  review_due_at timestamptz, extension_requested_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.order_id, o.order_number, o.status, agg.total, o.paid_at, m.work_state, m.complaint_open,
    m.due_at, m.revision_used, m.revision_limit, m.requirements_approved_at, m.accepted_at,
    COALESCE(snap.name_snapshot, ms.name), m.seller_response_due_at, m.review_due_at,
    m.extension_requested_days
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

-- ---------------------------------------------------------------------------
-- 11. Job berkala
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_service_lifecycle()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_start timestamptz := now();
  v_refunded int := 0; v_accepted int := 0; v_reminded int := 0; v_failed int := 0;
  v_auto boolean := public.setting_bool('marketplace_auto_release', false);
BEGIN
  -- a) Seller tidak merespons kebutuhan sampai batas -> refund penuh ke saldo.
  FOR r IN SELECT m.order_id FROM public.marketplace_service_orders m
      JOIN public.orders o ON o.id = m.order_id
     WHERE m.work_state = 'awaiting_requirements' AND NOT m.complaint_open AND o.status = 'paid'
       AND m.seller_response_due_at IS NOT NULL AND m.seller_response_due_at < now()
     LIMIT 100
  LOOP
    BEGIN
      PERFORM public._service_refund_to_balance(r.order_id,
        'Seller tidak merespons kebutuhan sampai batas waktu.', NULL, 'system');
      v_refunded := v_refunded + 1;
    EXCEPTION WHEN OTHERS THEN v_failed := v_failed + 1;
    END;
  END LOOP;

  -- b) Jendela tinjau berakhir -> terima otomatis.
  IF v_auto THEN
    FOR r IN SELECT m.order_id FROM public.marketplace_service_orders m
        JOIN public.orders o ON o.id = m.order_id
       WHERE m.work_state = 'delivered' AND NOT m.complaint_open AND o.status = 'paid'
         AND m.review_due_at IS NOT NULL AND m.review_due_at < now()
       LIMIT 100
    LOOP
      BEGIN
        IF (public._service_auto_accept(r.order_id)->>'status') = 'accepted' THEN
          v_accepted := v_accepted + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_failed := v_failed + 1;
      END;
    END LOOP;
  END IF;

  -- c) Pengingat seller: sisa < 6 jam untuk merespons kebutuhan (sekali).
  FOR r IN UPDATE public.marketplace_service_orders m SET reminder_count = 1
      FROM public.orders o
     WHERE o.id = m.order_id AND o.status = 'paid' AND m.work_state = 'awaiting_requirements'
       AND NOT m.complaint_open AND m.reminder_count = 0
       AND m.seller_response_due_at BETWEEN now() AND now() + interval '6 hours'
     RETURNING m.order_id, m.store_id, o.order_number, m.seller_response_due_at
  LOOP
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      SELECT s.owner_id, 'service.response_reminder', 'Segera respons pesanan jasa',
        'Kebutuhan pesanan ' || r.order_number || ' belum disetujui. Bila tidak direspons sampai '
          || to_char(r.seller_response_due_at AT TIME ZONE 'Asia/Jakarta', 'DD-MM HH24:MI')
          || ' WIB, pesanan dibatalkan dan dana dikembalikan ke pembeli.', 'order', r.order_id
      FROM public.stores s WHERE s.id = r.store_id;
    v_reminded := v_reminded + 1;
  END LOOP;

  -- d) Pengingat pembeli saat hasil menunggu ditinjau: sisa <= 48 jam lalu <= 24 jam.
  IF v_auto THEN
    FOR r IN UPDATE public.marketplace_service_orders m
        SET reminder_count = CASE WHEN m.review_due_at <= now() + interval '24 hours' THEN 2 ELSE 1 END
        FROM public.orders o
       WHERE o.id = m.order_id AND o.status = 'paid' AND m.work_state = 'delivered'
         AND NOT m.complaint_open AND m.review_due_at > now()
         AND ((m.reminder_count = 0 AND m.review_due_at <= now() + interval '48 hours')
           OR (m.reminder_count < 2 AND m.review_due_at <= now() + interval '24 hours'))
       RETURNING m.order_id, o.user_id, o.order_number, m.review_due_at
    LOOP
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
        VALUES (r.user_id, 'service.review_reminder', 'Tinjau hasil pesanan jasa',
          'Hasil pesanan ' || r.order_number || ' menunggu tinjauan Anda. Bila tidak ada revisi atau komplain sampai '
            || to_char(r.review_due_at AT TIME ZONE 'Asia/Jakarta', 'DD-MM HH24:MI')
            || ' WIB, hasil diterima otomatis.', 'order', r.order_id);
      v_reminded := v_reminded + 1;
    END LOOP;
  END IF;

  -- e) Tenggat lewat tanpa hasil: beri tahu pembeli (opsi batal) dan seller, sekali.
  FOR r IN UPDATE public.marketplace_service_orders m SET reminder_count = 1
      FROM public.orders o
     WHERE o.id = m.order_id AND o.status = 'paid' AND m.work_state = 'in_progress'
       AND NOT m.complaint_open AND m.reminder_count = 0 AND m.latest_delivery_id IS NULL
       AND m.due_at IS NOT NULL AND m.due_at < now()
     RETURNING m.order_id, m.store_id, o.user_id, o.order_number
  LOOP
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (r.user_id, 'service.overdue', 'Tenggat pesanan jasa terlewati',
        'Seller belum mengirim hasil pesanan ' || r.order_number
          || '. Anda bisa menunggu atau membatalkan dengan refund penuh ke saldo.', 'order', r.order_id);
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      SELECT s.owner_id, 'service.overdue', 'Tenggat terlewati',
        'Pesanan ' || r.order_number || ' melewati tenggat. Kirim hasil atau ajukan perpanjangan; pembeli kini dapat membatalkan.',
        'order', r.order_id
      FROM public.stores s WHERE s.id = r.store_id;
    v_reminded := v_reminded + 1;
  END LOOP;

  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, detail, started_at, finished_at)
    VALUES ('service_lifecycle', 'success', v_refunded + v_accepted + v_reminded,
      jsonb_build_object('refunded', v_refunded, 'auto_accepted', v_accepted,
        'reminded', v_reminded, 'failed', v_failed), v_start, now());
  RETURN jsonb_build_object('job', 'service_lifecycle', 'refunded', v_refunded,
    'auto_accepted', v_accepted, 'reminded', v_reminded, 'failed', v_failed);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, error_message, started_at, finished_at)
    VALUES ('service_lifecycle', 'error', 0, SQLERRM, v_start, now());
  RETURN jsonb_build_object('job', 'service_lifecycle', 'error', SQLERRM);
END; $$;

-- ---------------------------------------------------------------------------
-- 12. Hak akses & jadwal
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reject_service_requirements(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_service_extension(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_service_extension(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_overdue_service_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_service_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_service_requirements(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_service_extension(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_service_extension(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_overdue_service_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_service_orders() TO authenticated;

REVOKE ALL ON FUNCTION public.job_service_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_service_lifecycle() TO service_role;
REVOKE ALL ON FUNCTION public.trg_mso_lifecycle_timestamps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_orders_service_response_deadline() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE j bigint;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'service_lifecycle' LOOP
    PERFORM cron.unschedule(j);
  END LOOP;
END $$;
SELECT cron.schedule('service_lifecycle', '*/15 * * * *', $job$SELECT public.job_service_lifecycle()$job$);

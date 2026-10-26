CREATE SEQUENCE IF NOT EXISTS public.po_number_seq;

CREATE OR REPLACE FUNCTION public.next_po_number()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'PO-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.po_number_seq')::text, 5, '0');
$$;

CREATE TABLE public.custom_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE DEFAULT public.next_po_number(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category_id uuid REFERENCES public.categories(id),
  reference_url text,
  budget_estimate bigint,
  deadline_at timestamptz,
  status text NOT NULL DEFAULT 'submitted',
  quoted_total bigint,
  dp_percent integer NOT NULL DEFAULT 50,
  dp_amount bigint,
  quote_note text,
  quoted_by uuid,
  quoted_at timestamptz,
  result_note text,
  result_url text,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_orders_status_check CHECK (status IN ('submitted','quoted','quote_rejected','dp_waiting','in_progress','delivered','completed','cancelled')),
  CONSTRAINT custom_orders_dp_percent_check CHECK (dp_percent BETWEEN 10 AND 100)
);

CREATE INDEX idx_custom_orders_user ON public.custom_orders(user_id, created_at DESC);
CREATE INDEX idx_custom_orders_status ON public.custom_orders(status, created_at DESC);

GRANT SELECT, INSERT ON public.custom_orders TO authenticated;
GRANT UPDATE ON public.custom_orders TO authenticated;
GRANT ALL ON public.custom_orders TO service_role;
ALTER TABLE public.custom_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_select_own_or_staff" ON public.custom_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "po_insert_own" ON public.custom_orders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'submitted' AND quoted_total IS NULL);
CREATE POLICY "po_update_staff" ON public.custom_orders FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.po_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_role text NOT NULL DEFAULT 'customer',
  body text NOT NULL,
  attachment_path text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_messages_sender_role_check CHECK (sender_role IN ('customer','staff','system'))
);

CREATE INDEX idx_po_messages_request ON public.po_messages(request_id, created_at);

GRANT SELECT, INSERT ON public.po_messages TO authenticated;
GRANT ALL ON public.po_messages TO service_role;
ALTER TABLE public.po_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_msg_select" ON public.po_messages FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.custom_orders c WHERE c.id = request_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "po_msg_insert" ON public.po_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND is_system = false AND (
      (sender_role = 'staff' AND public.is_staff(auth.uid()))
      OR (sender_role = 'customer' AND EXISTS (
        SELECT 1 FROM public.custom_orders c WHERE c.id = request_id AND c.user_id = auth.uid()
      ))
    )
  );

CREATE TABLE public.po_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage text NOT NULL,
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  method text NOT NULL DEFAULT 'manual_transfer',
  proof_path text,
  sender_name text,
  note text,
  reject_reason text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_payments_stage_check CHECK (stage IN ('dp','final')),
  CONSTRAINT po_payments_status_check CHECK (status IN ('pending','submitted','verified','rejected')),
  CONSTRAINT po_payments_unique_stage UNIQUE (request_id, stage)
);

GRANT SELECT ON public.po_payments TO authenticated;
GRANT ALL ON public.po_payments TO service_role;
ALTER TABLE public.po_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_pay_select" ON public.po_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TRIGGER trg_custom_orders_updated_at BEFORE UPDATE ON public.custom_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_po_payments_updated_at BEFORE UPDATE ON public.po_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- bump last_message_at on new chat message
CREATE OR REPLACE FUNCTION public.trg_po_touch_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.custom_orders SET last_message_at = now() WHERE id = NEW.request_id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_po_touch_request() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_po_messages_touch AFTER INSERT ON public.po_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_touch_request();

-- staff sends a quote
CREATE OR REPLACE FUNCTION public.po_submit_quote(_request_id uuid, _total bigint, _dp_percent integer, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _req public.custom_orders; _dp bigint;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Tidak punya izin'; END IF;
  SELECT * INTO _req FROM public.custom_orders WHERE id = _request_id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'Permintaan tidak ditemukan'; END IF;
  IF _req.status NOT IN ('submitted','quoted','quote_rejected') THEN RAISE EXCEPTION 'Status tidak bisa diberi penawaran'; END IF;
  IF _total <= 0 THEN RAISE EXCEPTION 'Total harus lebih dari 0'; END IF;
  IF _dp_percent < 10 OR _dp_percent > 100 THEN RAISE EXCEPTION 'DP harus 10-100 persen'; END IF;
  _dp := GREATEST(1, (_total * _dp_percent) / 100);

  UPDATE public.custom_orders
    SET quoted_total = _total, dp_percent = _dp_percent, dp_amount = _dp,
        quote_note = _note, quoted_by = auth.uid(), quoted_at = now(), status = 'quoted'
    WHERE id = _request_id;

  INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
  VALUES (_request_id, auth.uid(), 'system',
    'Penawaran dikirim: total Rp' || _total::text || ', DP ' || _dp_percent::text || '% (Rp' || _dp::text || ').' ||
    COALESCE(' Catatan: ' || _note, ''), true);

  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
  VALUES (_req.user_id, 'po_quote', 'Penawaran PO siap',
    'Permintaan ' || _req.request_number || ' sudah mendapat penawaran harga.', 'custom_order', _request_id);

  PERFORM public.write_audit_log('po.quote', 'custom_order', _request_id, NULL,
    jsonb_build_object('total', _total, 'dp_percent', _dp_percent), _note, NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'dp_amount', _dp);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_submit_quote(uuid, bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_submit_quote(uuid, bigint, integer, text) TO authenticated;

-- customer accepts or rejects quote
CREATE OR REPLACE FUNCTION public.po_respond_quote(_request_id uuid, _accept boolean, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _req public.custom_orders; _payment_id uuid;
BEGIN
  SELECT * INTO _req FROM public.custom_orders WHERE id = _request_id FOR UPDATE;
  IF _req.id IS NULL OR _req.user_id <> auth.uid() THEN RAISE EXCEPTION 'Permintaan tidak ditemukan'; END IF;
  IF _req.status <> 'quoted' THEN RAISE EXCEPTION 'Tidak ada penawaran aktif'; END IF;

  IF NOT _accept THEN
    UPDATE public.custom_orders SET status = 'quote_rejected' WHERE id = _request_id;
    INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
    VALUES (_request_id, auth.uid(), 'system', 'Pelanggan menolak penawaran.' || COALESCE(' Alasan: ' || _note, ''), true);
    RETURN jsonb_build_object('ok', true, 'status', 'quote_rejected');
  END IF;

  UPDATE public.custom_orders SET status = 'dp_waiting' WHERE id = _request_id;

  INSERT INTO public.po_payments(request_id, user_id, stage, amount, status)
  VALUES (_request_id, _req.user_id, 'dp', _req.dp_amount, 'pending')
  ON CONFLICT (request_id, stage) DO UPDATE SET amount = EXCLUDED.amount, status = 'pending', proof_path = NULL, reject_reason = NULL
  RETURNING id INTO _payment_id;

  INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
  VALUES (_request_id, auth.uid(), 'system', 'Pelanggan menyetujui penawaran. Menunggu pembayaran DP Rp' || _req.dp_amount::text || '.', true);

  RETURN jsonb_build_object('ok', true, 'status', 'dp_waiting', 'payment_id', _payment_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_respond_quote(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_respond_quote(uuid, boolean, text) TO authenticated;

-- customer submits transfer proof
CREATE OR REPLACE FUNCTION public.po_submit_payment_proof(_payment_id uuid, _file_path text, _sender_name text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _pay public.po_payments; _req public.custom_orders;
BEGIN
  SELECT * INTO _pay FROM public.po_payments WHERE id = _payment_id FOR UPDATE;
  IF _pay.id IS NULL OR _pay.user_id <> auth.uid() THEN RAISE EXCEPTION 'Tagihan tidak ditemukan'; END IF;
  IF _pay.status = 'verified' THEN RAISE EXCEPTION 'Pembayaran sudah diverifikasi'; END IF;
  IF _file_path IS NULL OR length(_file_path) < 3 THEN RAISE EXCEPTION 'Bukti transfer wajib diunggah'; END IF;

  UPDATE public.po_payments
    SET proof_path = _file_path, sender_name = _sender_name, note = _note, status = 'submitted', reject_reason = NULL
    WHERE id = _payment_id;

  SELECT * INTO _req FROM public.custom_orders WHERE id = _pay.request_id;
  INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
  VALUES (_pay.request_id, auth.uid(), 'system',
    'Bukti pembayaran ' || CASE WHEN _pay.stage = 'dp' THEN 'DP' ELSE 'pelunasan' END || ' dikirim, menunggu verifikasi.', true);

  PERFORM public.notify_payment_staff('po_payment_proof', 'Bukti pembayaran PO',
    'Permintaan ' || _req.request_number || ' mengirim bukti ' || _pay.stage || '.', _pay.request_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_submit_payment_proof(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_submit_payment_proof(uuid, text, text, text) TO authenticated;

-- staff verifies a PO payment
CREATE OR REPLACE FUNCTION public.po_verify_payment(_payment_id uuid, _decision text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _pay public.po_payments; _req public.custom_orders;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Tidak punya izin'; END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Keputusan tidak valid'; END IF;
  SELECT * INTO _pay FROM public.po_payments WHERE id = _payment_id FOR UPDATE;
  IF _pay.id IS NULL THEN RAISE EXCEPTION 'Tagihan tidak ditemukan'; END IF;
  SELECT * INTO _req FROM public.custom_orders WHERE id = _pay.request_id FOR UPDATE;

  IF _decision = 'reject' THEN
    UPDATE public.po_payments SET status = 'rejected', reject_reason = _reason, verified_by = auth.uid(), verified_at = now()
      WHERE id = _payment_id;
    INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
    VALUES (_pay.request_id, auth.uid(), 'system', 'Bukti pembayaran ditolak.' || COALESCE(' Alasan: ' || _reason, ''), true);
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (_req.user_id, 'po_payment', 'Pembayaran PO ditolak',
      'Silakan unggah ulang bukti untuk ' || _req.request_number || '.', 'custom_order', _req.id);
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  UPDATE public.po_payments SET status = 'verified', verified_by = auth.uid(), verified_at = now(), reject_reason = NULL
    WHERE id = _payment_id;

  IF _pay.stage = 'dp' THEN
    UPDATE public.custom_orders SET status = 'in_progress' WHERE id = _req.id;
    INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
    VALUES (_req.id, auth.uid(), 'system', 'DP terverifikasi. Pengerjaan dimulai.', true);
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (_req.user_id, 'po_payment', 'DP terverifikasi',
      'Pengerjaan ' || _req.request_number || ' dimulai.', 'custom_order', _req.id);
  ELSE
    UPDATE public.custom_orders SET status = 'completed', completed_at = now() WHERE id = _req.id;
    INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
    VALUES (_req.id, auth.uid(), 'system', 'Pelunasan terverifikasi. Pesanan selesai.', true);
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (_req.user_id, 'po_payment', 'Pesanan PO selesai',
      _req.request_number || ' sudah lunas dan selesai.', 'custom_order', _req.id);
  END IF;

  PERFORM public.write_audit_log('po.payment_verify', 'custom_order', _req.id, NULL,
    jsonb_build_object('stage', _pay.stage, 'amount', _pay.amount), _reason, NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'status', 'verified');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_verify_payment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_verify_payment(uuid, text, text) TO authenticated;

-- staff marks the work delivered and opens final payment
CREATE OR REPLACE FUNCTION public.po_deliver(_request_id uuid, _note text DEFAULT NULL, _result_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _req public.custom_orders; _remaining bigint; _payment_id uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Tidak punya izin'; END IF;
  SELECT * INTO _req FROM public.custom_orders WHERE id = _request_id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'Permintaan tidak ditemukan'; END IF;
  IF _req.status <> 'in_progress' THEN RAISE EXCEPTION 'Status harus sedang dikerjakan'; END IF;

  _remaining := GREATEST(0, COALESCE(_req.quoted_total,0) - COALESCE(_req.dp_amount,0));
  UPDATE public.custom_orders
    SET status = CASE WHEN _remaining = 0 THEN 'completed' ELSE 'delivered' END,
        result_note = _note, result_url = _result_url, delivered_at = now(),
        completed_at = CASE WHEN _remaining = 0 THEN now() ELSE NULL END
    WHERE id = _request_id;

  IF _remaining > 0 THEN
    INSERT INTO public.po_payments(request_id, user_id, stage, amount, status)
    VALUES (_request_id, _req.user_id, 'final', _remaining, 'pending')
    ON CONFLICT (request_id, stage) DO UPDATE SET amount = EXCLUDED.amount
    RETURNING id INTO _payment_id;
  END IF;

  INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
  VALUES (_request_id, auth.uid(), 'system',
    'Hasil pekerjaan dikirim.' || COALESCE(' Catatan: ' || _note, '') ||
    CASE WHEN _remaining > 0 THEN ' Sisa pelunasan Rp' || _remaining::text || '.' ELSE '' END, true);

  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
  VALUES (_req.user_id, 'po_delivery', 'Hasil PO tersedia',
    'Cek hasil untuk ' || _req.request_number || '.', 'custom_order', _request_id);

  RETURN jsonb_build_object('ok', true, 'remaining', _remaining, 'payment_id', _payment_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_deliver(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_deliver(uuid, text, text) TO authenticated;

-- cancel a PO request (owner before DP verified, or staff anytime)
CREATE OR REPLACE FUNCTION public.po_cancel_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _req public.custom_orders; _staff boolean;
BEGIN
  _staff := public.is_staff(auth.uid());
  SELECT * INTO _req FROM public.custom_orders WHERE id = _request_id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'Permintaan tidak ditemukan'; END IF;
  IF NOT _staff AND _req.user_id <> auth.uid() THEN RAISE EXCEPTION 'Tidak punya izin'; END IF;
  IF NOT _staff AND _req.status NOT IN ('submitted','quoted','quote_rejected','dp_waiting') THEN
    RAISE EXCEPTION 'Pesanan sudah berjalan, hubungi admin lewat chat';
  END IF;
  IF _req.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Permintaan sudah selesai'; END IF;

  UPDATE public.custom_orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = _reason WHERE id = _request_id;
  INSERT INTO public.po_messages(request_id, sender_id, sender_role, body, is_system)
  VALUES (_request_id, auth.uid(), 'system', 'Permintaan dibatalkan.' || COALESCE(' Alasan: ' || _reason, ''), true);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_cancel_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_cancel_request(uuid, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.po_messages;
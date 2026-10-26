-- Read state dan pratinjau chat (framework realtime chat A-01).
-- Menyimpan kapan tiap peserta terakhir membaca thread agar badge unread,
-- pembatas "pesan baru", dan centang dibaca bisa dihitung tanpa tabel history.
-- Preview pesan terakhir menghindari query per-thread di list.

ALTER TABLE public.product_inquiries
  ADD COLUMN IF NOT EXISTS customer_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_body text,
  ADD COLUMN IF NOT EXISTS last_message_role text
    CHECK (last_message_role IS NULL OR last_message_role IN ('customer','staff','seller','system'));

-- Backfill preview dari pesan terakhir tiap thread.
UPDATE public.product_inquiries i
   SET last_message_body = m.body,
       last_message_role = m.sender_role
  FROM (
    SELECT DISTINCT ON (inquiry_id) inquiry_id, body, sender_role
      FROM public.product_inquiry_messages
     ORDER BY inquiry_id, created_at DESC
  ) m
 WHERE m.inquiry_id = i.id;

-- Backfill read timestamp ke now() agar pengguna existing tidak dibanjiri badge
-- unread palsu setelah deploy; read state berjalan maju sejak titik ini.
UPDATE public.product_inquiries
   SET customer_read_at = COALESCE(customer_read_at, now()),
       merchant_read_at = COALESCE(merchant_read_at, now());

CREATE OR REPLACE FUNCTION public.touch_product_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_inquiries
     SET last_message_at = now(),
         updated_at = now(),
         last_message_body = NEW.body,
         last_message_role = NEW.sender_role,
         status = CASE WHEN status = 'closed' THEN status
                       WHEN NEW.sender_role IN ('staff', 'seller') THEN 'answered'
                       ELSE 'open' END
   WHERE id = NEW.inquiry_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_product_inquiry() FROM PUBLIC, anon, authenticated;

-- Pembacaan sisi merchant lewat RPC karena seller bukan pemilik baris thread.
-- Pembeli tetap boleh direct UPDATE via RLS owner; RPC melayani ketiganya.
CREATE FUNCTION public.mark_inquiry_read(_inquiry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inquiry public.product_inquiries%ROWTYPE;
  v_store uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_inquiry FROM public.product_inquiries WHERE id = _inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_inquiry.user_id = v_user THEN
    UPDATE public.product_inquiries SET customer_read_at = now() WHERE id = _inquiry_id;
    RETURN jsonb_build_object('role', 'customer');
  END IF;
  v_store := public.my_store_id();
  IF v_inquiry.store_id IS NOT NULL AND v_store IS NOT NULL AND v_inquiry.store_id = v_store THEN
    UPDATE public.product_inquiries SET merchant_read_at = now() WHERE id = _inquiry_id;
    RETURN jsonb_build_object('role', 'seller');
  END IF;
  IF public.is_staff(v_user) THEN
    UPDATE public.product_inquiries SET merchant_read_at = now() WHERE id = _inquiry_id;
    RETURN jsonb_build_object('role', 'staff');
  END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END;
$$;

-- Jumlah pesan belum dibaca per thread untuk sudut pandang pemanggil
-- (pembeli pemilik, seller toko, atau staff).
CREATE FUNCTION public.unread_inquiry_counts()
RETURNS TABLE (inquiry_id uuid, unread bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id,
    (SELECT COUNT(*)
       FROM public.product_inquiry_messages m
      WHERE m.inquiry_id = i.id
        AND m.created_at > COALESCE(
              CASE WHEN i.user_id = auth.uid() THEN i.customer_read_at ELSE i.merchant_read_at END,
              to_timestamp(0))
        AND CASE WHEN i.user_id = auth.uid()
                 THEN m.sender_role <> 'customer'
                 ELSE m.sender_role = 'customer' END)
  FROM public.product_inquiries i
  WHERE i.user_id = auth.uid()
     OR (i.store_id IS NOT NULL AND i.store_id = public.my_store_id())
     OR public.is_staff(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.mark_inquiry_read(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unread_inquiry_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unread_inquiry_counts() TO authenticated;

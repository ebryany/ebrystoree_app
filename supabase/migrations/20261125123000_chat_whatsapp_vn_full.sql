-- ============================================================================
-- Upgrade Chat WhatsApp-Style + Voice Note (VN) + Reply/Quote + Reaksi +
-- Edit/Soft-Delete Aman Audit + Album Foto + Kartu Produk/Jasa.
--
-- Sifat: 100% ADITIF & IDEMPOTEN.
-- - Semua kolom baru nullable atau punya DEFAULT aman untuk pesan lama.
-- - Tidak membuka UPDATE/DELETE langsung pada product_inquiry_messages bagi
--   authenticated; seluruh mutasi (reaksi, edit, soft-delete, mark-unread)
--   melewati RPC SECURITY DEFINER dengan cek peserta thread & audit trail.
-- - Rollback aman: kolom/constraint/RPC bersifat aditif dan backward-compatible.
-- ============================================================================

-- 1. Kolom tambahan pada product_inquiry_messages
ALTER TABLE public.product_inquiry_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid
    REFERENCES public.product_inquiry_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_body text;

CREATE INDEX IF NOT EXISTS idx_product_inquiry_messages_reply_to
  ON public.product_inquiry_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- 2. Perluas jenis lampiran yang diperbolehkan pada CHECK constraint
ALTER TABLE public.product_inquiry_messages
  DROP CONSTRAINT IF EXISTS product_inquiry_messages_attachment_kind;

ALTER TABLE public.product_inquiry_messages
  ADD CONSTRAINT product_inquiry_messages_attachment_kind CHECK (
    attachment IS NULL
    OR attachment->>'kind' IN ('image', 'file', 'location', 'audio', 'gallery', 'product', 'service')
  );

-- 3. Perluas MIME yang diizinkan pada bucket privat chat-attachments untuk Voice Note (VN)
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'image/jpeg', 'image/png', 'image/webp', 'image/gif',
     'application/pdf', 'application/zip', 'text/plain',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
     'audio/aac', 'audio/x-m4a', 'audio/wav'
   ]
 WHERE id = 'chat-attachments';

-- 4. Perbarui trigger pratinjau pesan terakhir untuk semua jenis lampiran baru
CREATE OR REPLACE FUNCTION public.touch_product_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_preview text := NULLIF(btrim(NEW.body), '');
  v_dur integer;
  v_count integer;
BEGIN
  IF v_preview IS NULL AND NEW.attachment IS NOT NULL THEN
    CASE NEW.attachment->>'kind'
      WHEN 'image' THEN
        v_preview := 'Foto';
      WHEN 'gallery' THEN
        v_count := COALESCE(jsonb_array_length(NEW.attachment->'items'), 2);
        v_preview := 'Album foto (' || v_count || ')';
      WHEN 'audio' THEN
        v_dur := COALESCE(NULLIF(NEW.attachment->>'durationSec', '')::integer, 0);
        IF v_dur > 0 THEN
          v_preview := 'Pesan suara (' || (v_dur / 60) || ':' || lpad((v_dur % 60)::text, 2, '0') || ')';
        ELSE
          v_preview := 'Pesan suara';
        END IF;
      WHEN 'location' THEN
        v_preview := 'Lokasi';
      WHEN 'product' THEN
        v_preview := 'Produk: ' || COALESCE(NEW.attachment->>'name', 'Produk digital');
      WHEN 'service' THEN
        v_preview := 'Jasa: ' || COALESCE(NEW.attachment->>'name', 'Jasa seller');
      ELSE
        v_preview := 'Dokumen: ' || COALESCE(NEW.attachment->>'name', 'File');
    END CASE;
  END IF;

  UPDATE public.product_inquiries
     SET last_message_at = now(),
         updated_at = now(),
         last_message_body = COALESCE(v_preview, NEW.body),
         last_message_role = NEW.sender_role,
         status = CASE WHEN status = 'closed' THEN status
                       WHEN NEW.sender_role IN ('staff', 'seller') THEN 'answered'
                       ELSE 'open' END
   WHERE id = NEW.inquiry_id;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.touch_product_inquiry() FROM PUBLIC, anon, authenticated;

-- 5. Helper otorisasi peserta thread internal
CREATE OR REPLACE FUNCTION public._is_inquiry_participant(_inquiry_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inq public.product_inquiries%ROWTYPE;
  v_store uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_inq FROM public.product_inquiries WHERE id = _inquiry_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_inq.user_id = _user_id THEN RETURN true; END IF;
  v_store := public.my_store_id();
  IF v_inq.store_id IS NOT NULL AND v_store IS NOT NULL AND v_inq.store_id = v_store THEN
    RETURN true;
  END IF;
  IF public.is_staff(_user_id) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._is_inquiry_participant(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 6. RPC Toggle Reaksi Emoji (hanya peserta thread, allowlist 6 emoji)
CREATE OR REPLACE FUNCTION public.toggle_inquiry_message_reaction(
  _message_id uuid,
  _emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_msg public.product_inquiry_messages%ROWTYPE;
  v_reactions jsonb;
  v_users jsonb;
  v_user_text text;
  v_next_users jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _emoji NOT IN ('👍', '❤️', '😂', '😮', '🙏', '🔥') THEN
    RAISE EXCEPTION 'INVALID_EMOJI';
  END IF;

  SELECT * INTO v_msg
    FROM public.product_inquiry_messages
   WHERE id = _message_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_msg.deleted_at IS NOT NULL OR v_msg.is_system THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF NOT public._is_inquiry_participant(v_msg.inquiry_id, v_user) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_user_text := v_user::text;
  v_reactions := COALESCE(v_msg.reactions, '{}'::jsonb);
  v_users := COALESCE(v_reactions -> _emoji, '[]'::jsonb);

  IF v_users ? v_user_text THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO v_next_users
      FROM jsonb_array_elements_text(v_users) AS elem
     WHERE elem <> v_user_text;
  ELSE
    v_next_users := v_users || to_jsonb(v_user_text);
  END IF;

  IF jsonb_array_length(v_next_users) = 0 THEN
    v_reactions := v_reactions - _emoji;
  ELSE
    v_reactions := jsonb_set(v_reactions, ARRAY[_emoji], v_next_users, true);
  END IF;

  UPDATE public.product_inquiry_messages
     SET reactions = v_reactions
   WHERE id = _message_id;

  RETURN v_reactions;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_inquiry_message_reaction(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_inquiry_message_reaction(uuid, text) TO authenticated;

-- 7. RPC Edit Pesan (hanya pengirim asli, batas 15 menit, simpan original_body untuk audit)
CREATE OR REPLACE FUNCTION public.edit_inquiry_message(
  _message_id uuid,
  _body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_msg public.product_inquiry_messages%ROWTYPE;
  v_inq public.product_inquiries%ROWTYPE;
  v_clean text := btrim(COALESCE(_body, ''));
  v_latest_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF length(v_clean) < 1 OR length(v_clean) > 2000 THEN
    RAISE EXCEPTION 'INVALID_BODY';
  END IF;

  SELECT * INTO v_msg
    FROM public.product_inquiry_messages
   WHERE id = _message_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_msg.sender_id <> v_user THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_msg.deleted_at IS NOT NULL OR v_msg.is_system THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF now() - v_msg.created_at > interval '15 minutes' THEN
    RAISE EXCEPTION 'EDIT_WINDOW_EXPIRED';
  END IF;

  SELECT * INTO v_inq FROM public.product_inquiries WHERE id = v_msg.inquiry_id;
  IF v_inq.status = 'closed' THEN RAISE EXCEPTION 'THREAD_CLOSED'; END IF;

  UPDATE public.product_inquiry_messages
     SET original_body = COALESCE(original_body, body),
         body = v_clean,
         edited_at = now()
   WHERE id = _message_id;

  SELECT id INTO v_latest_id
    FROM public.product_inquiry_messages
   WHERE inquiry_id = v_msg.inquiry_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_latest_id = _message_id THEN
    UPDATE public.product_inquiries
       SET last_message_body = v_clean,
           updated_at = now()
     WHERE id = v_msg.inquiry_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'edited_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.edit_inquiry_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_inquiry_message(uuid, text) TO authenticated;

-- 8. RPC Soft-Delete Pesan (simpan original_body untuk audit sengketa, kosongkan tampilan publik)
CREATE OR REPLACE FUNCTION public.soft_delete_inquiry_message(_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_msg public.product_inquiry_messages%ROWTYPE;
  v_latest_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_msg
    FROM public.product_inquiry_messages
   WHERE id = _message_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_msg.sender_id <> v_user AND NOT public.is_staff(v_user) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_msg.is_system THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_msg.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted_at', v_msg.deleted_at);
  END IF;

  UPDATE public.product_inquiry_messages
     SET original_body = COALESCE(original_body, body),
         body = '',
         attachment = NULL,
         reactions = '{}'::jsonb,
         deleted_at = now()
   WHERE id = _message_id;

  SELECT id INTO v_latest_id
    FROM public.product_inquiry_messages
   WHERE inquiry_id = v_msg.inquiry_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_latest_id = _message_id THEN
    UPDATE public.product_inquiries
       SET last_message_body = 'Pesan ini dihapus',
           updated_at = now()
     WHERE id = v_msg.inquiry_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_inquiry_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_inquiry_message(uuid) TO authenticated;

-- 9. RPC Mark Unread (memundurkan read stamp peserta tepat sebelum pesan terakhir lawan bicara)
CREATE OR REPLACE FUNCTION public.mark_inquiry_unread(_inquiry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inquiry public.product_inquiries%ROWTYPE;
  v_store uuid;
  v_target_ts timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_inquiry FROM public.product_inquiries WHERE id = _inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_inquiry.user_id = v_user THEN
    SELECT MAX(created_at) - interval '1 millisecond'
      INTO v_target_ts
      FROM public.product_inquiry_messages
     WHERE inquiry_id = _inquiry_id AND sender_role <> 'customer';
    UPDATE public.product_inquiries
       SET customer_read_at = COALESCE(v_target_ts, to_timestamp(0))
     WHERE id = _inquiry_id;
    RETURN jsonb_build_object('role', 'customer');
  END IF;

  v_store := public.my_store_id();
  IF v_inquiry.store_id IS NOT NULL AND v_store IS NOT NULL AND v_inquiry.store_id = v_store THEN
    SELECT MAX(created_at) - interval '1 millisecond'
      INTO v_target_ts
      FROM public.product_inquiry_messages
     WHERE inquiry_id = _inquiry_id AND sender_role = 'customer';
    UPDATE public.product_inquiries
       SET merchant_read_at = COALESCE(v_target_ts, to_timestamp(0))
     WHERE id = _inquiry_id;
    RETURN jsonb_build_object('role', 'seller');
  END IF;

  IF public.is_staff(v_user) THEN
    SELECT MAX(created_at) - interval '1 millisecond'
      INTO v_target_ts
      FROM public.product_inquiry_messages
     WHERE inquiry_id = _inquiry_id AND sender_role = 'customer';
    UPDATE public.product_inquiries
       SET merchant_read_at = COALESCE(v_target_ts, to_timestamp(0))
     WHERE id = _inquiry_id;
    RETURN jsonb_build_object('role', 'staff');
  END IF;

  RAISE EXCEPTION 'FORBIDDEN';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_inquiry_unread(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_unread(uuid) TO authenticated;

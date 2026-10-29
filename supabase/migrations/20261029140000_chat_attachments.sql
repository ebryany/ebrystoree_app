-- ============================================================================
-- Lampiran chat produk: foto, file, dan lokasi.
--
-- Sifat: ADITIF. Kolom nullable baru + bucket privat baru. Pesan lama tidak
-- berubah. Akses file hanya lewat signed URL yang dibuat server setelah
-- memastikan pemanggil peserta thread (RLS product_inquiry_messages).
--
-- attachment (jsonb), salah satu bentuk:
--   {"kind":"image","path":"<inquiry>/<uuid>.jpg","name":"...","mime":"image/jpeg","size":123}
--   {"kind":"file","path":"<inquiry>/<uuid>.pdf","name":"...","mime":"application/pdf","size":123}
--   {"kind":"location","lat":-6.2,"lng":106.8}
-- ============================================================================

ALTER TABLE public.product_inquiry_messages
  ADD COLUMN IF NOT EXISTS attachment jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_inquiry_messages_attachment_kind'
  ) THEN
    ALTER TABLE public.product_inquiry_messages
      ADD CONSTRAINT product_inquiry_messages_attachment_kind CHECK (
        attachment IS NULL
        OR attachment->>'kind' IN ('image', 'file', 'location')
      );
  END IF;
END $$;

-- Bucket privat: tidak ada policy storage untuk authenticated/anon, sehingga
-- unggah & unduh hanya bisa lewat signed URL dari service role di server.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/zip', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Preview di daftar chat untuk pesan tanpa teks.
CREATE OR REPLACE FUNCTION public.touch_product_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_preview text := NULLIF(btrim(NEW.body), '');
BEGIN
  IF v_preview IS NULL AND NEW.attachment IS NOT NULL THEN
    v_preview := CASE NEW.attachment->>'kind'
      WHEN 'image' THEN '📷 Foto'
      WHEN 'location' THEN '📍 Lokasi'
      ELSE '📎 ' || COALESCE(NEW.attachment->>'name', 'File')
    END;
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

-- ============================================================================
-- RATE LIMITING (FASE 0 #3)
--
-- Masalah (A-03): tidak ada rate limiting di mana pun. Login, chat, QRIS,
--   webhook, dan ingest publik semuanya tanpa batas → rawan spam/abuse.
--
-- Desain (anti-slop, berbasis database — bukan angka palsu):
--   - Tabel rate_limit_hits mencatat setiap percobaan (bucket + window).
--   - RPC check_rate_limit() memeriksa & mencatat secara ATOMIK
--     (advisory lock per kunci, sehingga aman saat bersamaan).
--   - Pembersihan otomatis: baris kedaluwarsa dihapus saat pemanggilan.
--   - Default kebijakan ditentukan pemanggil (limit per window detik).
--
-- Lingkungan: LOKAL / Supabase baru saja. JANGAN production tanpa persetujuan.
-- Rollback: DROP FUNCTION check_rate_limit; DROP TABLE rate_limit_hits.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON public.rate_limit_hits (bucket, subject, created_at DESC);

-- Hanya service_role/RPC yang menyentuh; klien tidak punya akses langsung.
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Tanpa policy untuk authenticated/anon → tertutup total.

-- Periksa & catat satu percobaan. Mengembalikan apakah masih diizinkan.
-- _limit  : jumlah maksimum percobaan dalam window
-- _window : panjang window dalam detik
CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text, _subject text, _limit integer, _window_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
  v_now timestamptz := now();
  v_cutoff timestamptz;
BEGIN
  IF _bucket IS NULL OR _subject IS NULL OR _limit <= 0 OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT';
  END IF;

  v_cutoff := v_now - (_window_seconds || ' seconds')::interval;

  -- Kunci per bucket+subject agar pemeriksaan bersifat atomik saat bersamaan.
  PERFORM pg_advisory_xact_lock(hashtext(_bucket || ':' || _subject));

  -- Bersihkan baris lama untuk kunci ini (pembersihan oportunistik).
  DELETE FROM public.rate_limit_hits
   WHERE bucket = _bucket AND subject = _subject AND created_at < v_cutoff;

  SELECT count(*) INTO v_count
    FROM public.rate_limit_hits
   WHERE bucket = _bucket AND subject = _subject AND created_at >= v_cutoff;

  IF v_count >= _limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', _limit,
      'retry_after', _window_seconds
    );
  END IF;

  INSERT INTO public.rate_limit_hits (bucket, subject) VALUES (_bucket, _subject);

  RETURN jsonb_build_object('allowed', true, 'count', v_count + 1, 'limit', _limit, 'retry_after', 0);
END; $$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

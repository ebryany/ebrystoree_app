-- ============================================================================
-- PERBAIKAN ATRIBUSI: hubungkan event ke pengguna yang login
--
-- MASALAH YANG DITEMUKAN SAAT UJI:
-- Atribusi versi pertama mencari "sesi terakhir sebelum order dibuat" TANPA
-- mengetahui siapa yang memesan. Akibatnya order dicocokkan ke sesi acak milik
-- orang lain yang kebetulan aktif sebelumnya. Itu bukan atribusi, itu tebakan
-- yang kebetulan terlihat seperti angka.
--
-- PERBAIKAN:
-- Tambahkan kolom user_id pada analytics_events, diisi HANYA ketika permintaan
-- membawa sesi login yang sah (diverifikasi server, bukan dikirim klien).
-- Atribusi lalu menghubungkan: kampanye pertama yang dilihat pengguna itu,
-- sebelum ordernya dibuat.
--
-- PRIVASI:
-- - user_id hanya terisi untuk pengguna yang login; pengunjung anonim tetap
--   hanya punya hash sesi harian.
-- - Tidak ada data pribadi baru yang dikumpulkan; user_id sudah tersimpan di
--   tabel orders. Yang berubah: kunjungan pengguna login bisa dihubungkan ke
--   akunnya, dan itu memang syarat atribusi yang benar.
--
-- Rollback: DROP FUNCTION campaign_attribution(integer);
--           ALTER TABLE analytics_events DROP COLUMN user_id;
--           (lalu pasang ulang versi sebelumnya bila perlu)
-- ============================================================================

ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS idx_analytics_events_user
  ON public.analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Atribusi versi benar: berbasis pengguna, bukan tebakan sesi.
--
-- Untuk setiap order: ambil kampanye (utm_source) dari kunjungan PERTAMA
-- pengguna itu dalam 30 hari sebelum order. Bila tidak ada kunjungan ber-UTM,
-- sumbernya 'langsung' (ada kunjungan) atau 'tidak terlacak' (tidak ada).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_attribution(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH periode AS (
    SELECT now() - (_days || ' days')::interval AS sejak
  ),
  order_sumber AS (
    SELECT o.id AS order_id,
           o.total,
           COALESCE(
             (
               -- Kampanye pertama yang dilihat pengguna ini sebelum order.
               SELECT COALESCE(NULLIF(e.utm_source, ''), NULLIF(e.referrer_host, ''))
                 FROM public.analytics_events e
                WHERE e.user_id = o.user_id
                  AND e.is_bot = false
                  AND e.created_at BETWEEN o.created_at - interval '30 days' AND o.created_at
                  AND (COALESCE(e.utm_source, '') <> '' OR COALESCE(e.referrer_host, '') <> '')
                ORDER BY e.created_at ASC
                LIMIT 1
             ),
             -- Tidak ada kunjungan ber-UTM: apakah pengguna ini pernah hadir?
             CASE WHEN EXISTS (
               SELECT 1 FROM public.analytics_events e2
                WHERE e2.user_id = o.user_id
                  AND e2.created_at BETWEEN o.created_at - interval '30 days' AND o.created_at
             ) THEN 'langsung' ELSE 'tidak terlacak' END
           ) AS sumber
      FROM public.orders o, periode p
     WHERE o.created_at >= p.sejak
       AND o.status IN ('paid','completed')
  )
  SELECT jsonb_build_object(
    'periode_hari', _days,
    'total_order', (SELECT count(*) FROM order_sumber),
    'total_nilai', (SELECT COALESCE(SUM(total),0) FROM order_sumber),
    'terlacak', (SELECT count(*) FROM order_sumber WHERE sumber NOT IN ('tidak terlacak')),
    'per_sumber', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('sumber', sumber, 'order', n, 'nilai', nilai) ORDER BY nilai DESC), '[]'::jsonb)
      FROM (SELECT sumber, count(*) n, SUM(total) nilai FROM order_sumber GROUP BY sumber) t
    ),
    'batas_metode', 'Atribusi memakai kampanye pertama yang dilihat pengguna login sebelum order. Order dari pengunjung yang tidak pernah login tidak dapat dilacak. Angka ini undercount.'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.campaign_attribution(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_attribution(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Performa kampanye juga dihitung dari pengguna, bukan hanya jumlah event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_campaigns()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'channel', c.channel, 'status', c.status,
    'utm_source', c.utm_source, 'utm_medium', c.utm_medium, 'utm_campaign', c.utm_campaign,
    'starts_at', c.starts_at, 'ends_at', c.ends_at,
    'kunjungan', COALESCE((
      SELECT count(*) FROM public.analytics_events e
       WHERE e.utm_campaign = c.utm_campaign AND e.utm_source = c.utm_source
         AND e.is_bot = false AND e.event_type = 'page_view'
    ), 0),
    'pengunjung', COALESCE((
      SELECT count(DISTINCT e.session_hash) FROM public.analytics_events e
       WHERE e.utm_campaign = c.utm_campaign AND e.utm_source = c.utm_source AND e.is_bot = false
    ), 0),
    'order', COALESCE((
      SELECT count(DISTINCT o.id) FROM public.orders o
       WHERE o.status IN ('paid','completed')
         AND o.user_id IN (
           SELECT DISTINCT e.user_id FROM public.analytics_events e
            WHERE e.utm_campaign = c.utm_campaign AND e.utm_source = c.utm_source
              AND e.user_id IS NOT NULL
              AND e.created_at <= o.created_at
         )
    ), 0)
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.campaigns c;
$$;

REVOKE EXECUTE ON FUNCTION public.list_campaigns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campaigns() TO authenticated;

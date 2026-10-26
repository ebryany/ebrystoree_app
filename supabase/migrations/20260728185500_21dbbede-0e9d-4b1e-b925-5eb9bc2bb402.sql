-- M6: penanda data uji (aditif, nullable-safe)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.digital_products ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_test_data ON public.orders (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_services_is_test_data ON public.services (is_test_data) WHERE is_test_data = true;

-- M1: seed kategori akademik (idempotent lewat slug unik per kind)
INSERT INTO public.categories (name, slug, kind, description, is_active, sort_order)
VALUES
  ('Tugas Harian', 'tugas-harian', 'service', 'Pendampingan tugas rutin perkuliahan.', true, 1),
  ('Makalah', 'makalah', 'service', 'Penyusunan struktur, outline, dan review makalah.', true, 2),
  ('Presentasi', 'presentasi', 'service', 'Penyusunan slide, speaker note, dan alur presentasi.', true, 3),
  ('Proposal', 'proposal', 'service', 'Pendampingan proposal penelitian dengan quality review wajib.', true, 4),
  ('Laporan Praktikum', 'laporan-praktikum', 'service', 'Pendampingan laporan praktikum dan pembahasan hasil.', true, 5),
  ('Analisis Data', 'analisis-data', 'service', 'Pendampingan pengolahan dan interpretasi data.', true, 6),
  ('Pemrograman Akademik', 'pemrograman-akademik', 'service', 'Pendampingan tugas pemrograman beserta walkthrough kode.', true, 7),
  ('Review Tulisan', 'review-tulisan', 'service', 'Review struktur, argumen, dan kejelasan tulisan.', true, 8),
  ('Formatting', 'formatting', 'service', 'Perapian format sesuai pedoman kampus.', true, 9),
  ('Sitasi dan Referensi', 'sitasi-dan-referensi', 'service', 'Perapian sitasi dan daftar pustaka sesuai gaya sitasi.', true, 10),
  ('Revisi Dosen', 'revisi-dosen', 'service', 'Pendampingan menindaklanjuti catatan revisi dosen.', true, 11),
  ('Persiapan Sidang', 'persiapan-sidang', 'service', 'Latihan dan penyiapan materi sidang.', true, 12),
  ('Pendampingan Skripsi', 'pendampingan-skripsi', 'service', 'Pendampingan skripsi per bab dengan quality review wajib.', true, 13)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      kind = EXCLUDED.kind,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
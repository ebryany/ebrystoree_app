-- Batas storage untuk bucket yang sebelumnya menerima tipe apa pun.
--
-- Temuan audit: product-files tanpa batas ukuran DAN tanpa batas MIME; job-results
-- dan academic-order-attachments membatasi ukuran tetapi menerima tipe apa pun.
-- Berkas HTML/SVG yang diunggah lalu disajikan dapat menjadi vektor XSS tersimpan.
--
-- Daftar MIME disusun dari format yang benar-benar dipakai produk: dokumen kantor,
-- PDF, arsip, gambar raster, teks, dan video untuk hasil pekerjaan. SVG dan HTML
-- sengaja TIDAK ada di daftar mana pun.

DO $$
DECLARE
  manifest record;
  actual storage.buckets%ROWTYPE;
BEGIN
  FOR manifest IN
    SELECT * FROM (VALUES
      -- Berkas produk digital: dokumen, arsip, gambar raster, teks. Tanpa batas ukuran
      -- sebelumnya; kini 100 MB agar produk besar tetap muat tetapi terbatas.
      ('product-files', 104857600::bigint, ARRAY[
        'application/pdf','application/zip','application/x-zip-compressed',
        'text/plain','text/csv',
        'image/jpeg','image/png','image/webp','image/avif','image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/json','application/octet-stream'
      ]::text[]),
      -- Hasil pekerjaan operator: dokumen dan gambar hasil.
      ('job-results', 41943040::bigint, ARRAY[
        'application/pdf','application/zip','text/plain',
        'image/jpeg','image/png','image/webp','image/avif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]::text[]),
      -- Lampiran tugas akademik dari pembeli.
      ('academic-order-attachments', 20971520::bigint, ARRAY[
        'application/pdf','application/zip','text/plain',
        'image/jpeg','image/png','image/webp','image/avif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]::text[])
    ) AS m(id, file_size_limit, allowed_mime_types)
  LOOP
    -- Jangan timpa konfigurasi yang sudah lebih ketat; hanya isi yang kosong.
    UPDATE storage.buckets b
       SET file_size_limit = COALESCE(b.file_size_limit, manifest.file_size_limit),
           allowed_mime_types = COALESCE(b.allowed_mime_types, manifest.allowed_mime_types)
     WHERE b.id = manifest.id;

    SELECT * INTO STRICT actual FROM storage.buckets WHERE id = manifest.id FOR UPDATE;
    IF actual.file_size_limit IS NULL OR actual.allowed_mime_types IS NULL THEN
      RAISE EXCEPTION 'BUCKET_LIMIT_MISSING: %', manifest.id;
    END IF;
    IF 'image/svg+xml' = ANY (actual.allowed_mime_types)
      OR 'text/html' = ANY (actual.allowed_mime_types)
      OR 'application/xhtml+xml' = ANY (actual.allowed_mime_types) THEN
      RAISE EXCEPTION 'UNSAFE_MIME_ALLOWED: %', manifest.id;
    END IF;
  END LOOP;
END;
$$;

-- Penjaga menyeluruh: tidak ada bucket yang boleh menerima SVG/HTML, dan tidak ada
-- bucket tanpa batas ukuran. Dijalankan sekali di sini supaya kondisi awal terjamin.
DO $$
DECLARE bad record;
BEGIN
  FOR bad IN
    SELECT id FROM storage.buckets
     WHERE file_size_limit IS NULL
        OR allowed_mime_types IS NULL
        OR allowed_mime_types && ARRAY['image/svg+xml','text/html','application/xhtml+xml']
  LOOP
    RAISE EXCEPTION 'BUCKET_MANIFEST_UNSAFE: %', bad.id;
  END LOOP;
END;
$$;

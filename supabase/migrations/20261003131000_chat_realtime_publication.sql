-- Akar perbaikan "chat tidak realtime": postgres_changes Supabase hanya mengirim
-- event untuk tabel yang terdaftar di publication supabase_realtime. Tabel chat
-- inquiry dan digital_products tidak pernah terdaftar, sehingga subscribe klien
-- sukses tetapi tidak pernah ada event: pesan masuk baru tampil setelah refresh
-- dan read stamp tidak menyebar live. PO custom (po_messages) terdaftar, itulah
-- mengapa chat PO berjalan realtime.
-- Idempoten: guard pg_publication_tables mencegah error "already member".

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_inquiries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_inquiries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_inquiry_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_inquiry_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'digital_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.digital_products;
  END IF;
END;
$$;

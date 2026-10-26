-- bukti pembayaran: path = <user_id>/<file>
CREATE POLICY "proof_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "proof_select_own_folder" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "proof_select_staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.has_permission(auth.uid(), 'payments.view'));

-- berkas produk digital: hanya admin katalog yang mengelola, unduhan lewat signed URL server
CREATE POLICY "product_files_manage_admin" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'product-files' AND public.has_permission(auth.uid(), 'products.update'))
  WITH CHECK (bucket_id = 'product-files' AND public.has_permission(auth.uid(), 'products.update'));
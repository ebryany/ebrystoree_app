CREATE POLICY "academic_attach_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'academic-order-attachments'
              AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "academic_attach_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'academic-order-attachments'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR public.has_permission(auth.uid(), 'orders.view')));

CREATE POLICY "academic_attach_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'academic-order-attachments'
         AND (storage.foldername(name))[1] = auth.uid()::text);
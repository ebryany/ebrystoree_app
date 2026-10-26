
CREATE POLICY "catalog images staff insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'catalog-images' AND public.is_staff(auth.uid()));

CREATE POLICY "catalog images staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'catalog-images' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'catalog-images' AND public.is_staff(auth.uid()));

CREATE POLICY "catalog images staff delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'catalog-images' AND public.is_staff(auth.uid()));

CREATE POLICY "catalog images staff select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'catalog-images' AND public.is_staff(auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.digital_product_files TO authenticated;

CREATE POLICY "Catalog admin can insert product files"
ON public.digital_product_files
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'products.update'));

CREATE POLICY "Catalog admin can update unassigned product files"
ON public.digital_product_files
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), 'products.update') AND assigned_entitlement_id IS NULL)
WITH CHECK (public.has_permission(auth.uid(), 'products.update') AND assigned_entitlement_id IS NULL);

CREATE POLICY "Catalog admin can delete unassigned product files"
ON public.digital_product_files
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), 'products.delete') AND assigned_entitlement_id IS NULL);
REVOKE ALL ON FUNCTION public.trg_product_files_stock() FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.digital_product_files TO authenticated;

CREATE POLICY "Staff can view product files"
ON public.digital_product_files
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Buyers can view their assigned file"
ON public.digital_product_files
FOR SELECT
TO authenticated
USING (
  assigned_entitlement_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.digital_entitlements e
    WHERE e.id = digital_product_files.assigned_entitlement_id
      AND e.user_id = auth.uid()
  )
);
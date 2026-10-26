CREATE OR REPLACE FUNCTION public.next_po_number()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'PO-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.po_number_seq')::text, 5, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_po_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_po_number() TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.po_number_seq TO authenticated, service_role;
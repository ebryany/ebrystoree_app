-- 1) Server-side order RPC must require an authenticated session
REVOKE ALL ON FUNCTION public.create_service_order(uuid, uuid, uuid[], jsonb, text, text, text) FROM PUBLIC, anon;

-- 2) Entitlements: read-only for signed-in users, writes only via SECURITY DEFINER flows
REVOKE ALL ON TABLE public.digital_entitlements FROM anon;
REVOKE ALL ON TABLE public.digital_entitlements FROM authenticated;
GRANT SELECT ON TABLE public.digital_entitlements TO authenticated;
GRANT ALL ON TABLE public.digital_entitlements TO service_role;

-- 3) Digital product files: no direct API access; served only through consume_download / admin service role
REVOKE ALL ON TABLE public.digital_product_files FROM anon;
REVOKE ALL ON TABLE public.digital_product_files FROM authenticated;
GRANT ALL ON TABLE public.digital_product_files TO service_role;

-- 4) Manual payment proofs: customers may insert and read (per RLS), never update or delete
REVOKE ALL ON TABLE public.manual_payment_proofs FROM anon;
REVOKE ALL ON TABLE public.manual_payment_proofs FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.manual_payment_proofs TO authenticated;
GRANT ALL ON TABLE public.manual_payment_proofs TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid[], text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid[], text, text) TO authenticated;
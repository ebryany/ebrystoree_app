INSERT INTO public.permissions (key, group_name, description, is_transactional)
VALUES ('notifications.broadcast', 'Notifikasi', 'Mengirim pengumuman/notifikasi ke pengguna', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r::public.app_role, 'notifications.broadcast'
FROM unnest(ARRAY['admin','super_admin','support']) AS r
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  _title text,
  _message text,
  _audience text DEFAULT 'all',
  _role text DEFAULT NULL,
  _user_ids uuid[] DEFAULT NULL,
  _type text DEFAULT 'announcement',
  _link text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _count int := 0;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF NOT (public.has_permission(_actor, 'notifications.broadcast') OR public.is_super_admin(_actor)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF btrim(coalesce(_title,'')) = '' OR btrim(coalesce(_message,'')) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF _audience = 'all' THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type)
    SELECT p.id, coalesce(_type,'announcement'), _title, _message, coalesce(_link,'announcement')
    FROM public.profiles p;
  ELSIF _audience = 'role' THEN
    IF _role IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type)
    SELECT DISTINCT ur.user_id, coalesce(_type,'announcement'), _title, _message, coalesce(_link,'announcement')
    FROM public.user_roles ur
    WHERE ur.role = _role::public.app_role;
  ELSIF _audience = 'users' THEN
    IF _user_ids IS NULL OR array_length(_user_ids,1) IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type)
    SELECT p.id, coalesce(_type,'announcement'), _title, _message, coalesce(_link,'announcement')
    FROM public.profiles p
    WHERE p.id = ANY(_user_ids);
  ELSE
    RAISE EXCEPTION 'INVALID_AUDIENCE';
  END IF;

  GET DIAGNOSTICS _count = ROW_COUNT;

  PERFORM public.write_audit_log(
    'notification.broadcast_sent',
    'notification',
    NULL,
    NULL,
    jsonb_build_object('title', _title, 'audience', _audience, 'role', _role, 'recipients', _count, 'type', coalesce(_type,'announcement')),
    NULL, NULL, NULL
  );

  RETURN jsonb_build_object('ok', true, 'recipients', _count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid[], text, text) TO authenticated;
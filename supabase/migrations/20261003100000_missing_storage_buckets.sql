DO $$
DECLARE
  expected record;
  actual storage.buckets%ROWTYPE;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('avatars', 2097152::bigint, ARRAY['image/jpeg','image/png','image/webp','image/avif']::text[]),
      ('academic-order-attachments', 20971520::bigint, NULL::text[]),
      ('job-results', 41943040::bigint, NULL::text[])
    ) AS manifest(id, file_size_limit, allowed_mime_types)
  LOOP
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (expected.id, expected.id, false, expected.file_size_limit, expected.allowed_mime_types)
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO STRICT actual FROM storage.buckets WHERE id = expected.id FOR UPDATE;
    IF actual.name IS DISTINCT FROM expected.id
      OR actual.public IS DISTINCT FROM false
      OR actual.file_size_limit IS DISTINCT FROM expected.file_size_limit
      OR (actual.allowed_mime_types IS NULL) IS DISTINCT FROM (expected.allowed_mime_types IS NULL)
      OR (SELECT array_agg(mime ORDER BY mime) FROM unnest(actual.allowed_mime_types) AS mime)
        IS DISTINCT FROM
        (SELECT array_agg(mime ORDER BY mime) FROM unnest(expected.allowed_mime_types) AS mime)
    THEN
      RAISE EXCEPTION 'STORAGE_BUCKET_MANIFEST_CONFLICT: %', expected.id;
    END IF;
  END LOOP;
END;
$$;

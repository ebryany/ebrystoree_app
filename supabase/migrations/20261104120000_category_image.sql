-- Gambar ikon kategori (PNG/JPEG/WEBP) yang diunggah admin ke bucket catalog-images.
-- NULL = pakai ikon bawaan (categories.icon / tebakan dari nama).
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_image_url_format,
  ADD CONSTRAINT categories_image_url_format CHECK (
    image_url IS NULL
    OR (
      length(image_url) <= 300
      AND image_url ~ '^/api/public/catalog-image/categories/[A-Za-z0-9._-]+$'
    )
  );

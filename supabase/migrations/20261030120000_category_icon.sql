-- Ikon & warna kategori yang bisa diatur admin. NULL = ditebak dari nama di frontend.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS tone text;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_icon_format,
  ADD CONSTRAINT categories_icon_format CHECK (icon IS NULL OR icon ~ '^[a-z0-9-]{1,40}$'),
  DROP CONSTRAINT IF EXISTS categories_tone_valid,
  ADD CONSTRAINT categories_tone_valid
    CHECK (tone IS NULL OR tone IN ('teal', 'green', 'blue', 'amber', 'red', 'brand'));

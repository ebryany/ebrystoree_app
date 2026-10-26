-- Tambah nilai enum 'seller' TERPISAH dari pemakaiannya.
-- PostgreSQL melarang memakai nilai enum baru dalam transaksi yang sama dengan
-- ALTER TYPE ADD VALUE (SQLSTATE 55P04), sehingga dipisah ke migrasi tersendiri.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seller';

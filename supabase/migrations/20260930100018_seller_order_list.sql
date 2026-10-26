-- ============================================================================
-- MARKETPLACE — Daftar Pesanan Seller (RPC aman)
--
-- Masalah nyata (ditemukan saat verifikasi UI):
--   Seller bisa membaca `order_items` miliknya (policy 20260930100014), TETAPI
--   TIDAK bisa membaca tabel `orders`. Akibatnya join `orders(...)` dari server
--   function mengembalikan null → nomor order jatuh ke UUID dan status hilang.
--
-- Kenapa TIDAK menambah policy SELECT pada `orders`:
--   RLS tidak bisa membatasi kolom. Policy apa pun yang membuka baris `orders`
--   untuk seller ikut membocorkan PII pembeli (user_id, customer_note,
--   internal_note). Seller hanya butuh nomor order, status, dan waktu.
--
-- Solusi: RPC SECURITY DEFINER yang HANYA mengembalikan kolom aman, dan
--         scope-nya dikunci ke my_store_id() (seller tidak bisa memilih toko lain).
--
-- Sifat: ADITIF. Rollback: drop function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_my_store_orders(_filter text DEFAULT 'all')
RETURNS TABLE (
  item_id uuid,
  order_id uuid,
  order_number text,
  order_status text,
  item_name text,
  unit_price bigint,
  quantity integer,
  total bigint,
  created_at timestamptz,
  paid_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.id,
         o.id,
         o.order_number,
         o.status,
         oi.name_snapshot,
         oi.unit_price,
         oi.quantity,
         oi.total,
         oi.created_at,
         o.paid_at
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.store_id IS NOT NULL
     AND oi.store_id = public.my_store_id()
     AND (
       _filter = 'all'
       OR (_filter = 'paid' AND o.status IN ('paid', 'completed'))
       OR (_filter = 'pending' AND o.status IN ('awaiting_payment', 'payment_under_review'))
     )
   ORDER BY oi.created_at DESC
   LIMIT 100;
$$;

REVOKE EXECUTE ON FUNCTION public.list_my_store_orders(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_store_orders(text) TO authenticated;

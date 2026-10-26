# 15 — Audit Security

Status: **PARTIALLY_VERIFIED (70%)**

## Kuat

- Role disimpan terpisah di `user_roles` + `has_role`/`has_permission` SECURITY DEFINER.
- Permission granular (31+ key) dengan `assertPermission` pada seluruh mutasi admin.
- RLS aktif pada seluruh tabel transaksi; `authenticated` tidak punya UPDATE/DELETE
  pada `orders`, `payments`, `invoices`, `refunds`, `entitlements`.
- Mutasi transaksional hanya lewat SECURITY DEFINER RPC dengan guard status.
- `digital_product_files` tanpa akses Data API sama sekali; bucket privat.
- Audit log tertulis pada seluruh mutasi sensitif (23 baris nyata).
- Harga & total dihitung ulang di server; input divalidasi Zod.
- Tiga putaran hardening sebelumnya (revoke EXECUTE dari `anon`/`PUBLIC`).

## Gap

| Temuan | Severity | Catatan |
|---|---|---|
| Tidak ada test IDOR otomatis (customer A → order B, dsb.) | HIGH | seluruh klaim isolasi berstatus NOT_TESTED |
| Tidak ada rate limit pada `submit_payment_proof`, `request_refund`, login | MEDIUM | risiko abuse |
| Validasi upload bukti bayar (mime/size) hanya di client | MEDIUM | server tidak memverifikasi ukuran/tipe file nyata |
| Tidak ada verifikasi signature webhook | N/A sekarang | menjadi kritis begitu QRIS aktif |
| Gate `_authenticated` bersifat client-side | LOW | data tetap dilindungi RLS |
| Realtime authorization | N/A | realtime tidak aktif |
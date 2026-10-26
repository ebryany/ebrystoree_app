# 08 — Audit Realtime

Status keseluruhan: **NOT_IMPLEMENTED**

## Bukti

1. `pg_publication_tables` untuk `supabase_realtime` = **0 tabel**.
2. Pencarian `.channel(` / `postgres_changes` / `removeChannel` di `src/` = **0 hasil**.
3. Tidak ada `refetchInterval` di seluruh kode → tidak ada polling.
4. Satu-satunya mekanisme pembaruan: `queryClient.invalidateQueries(...)` setelah
   mutasi lokal (33 pemakaian, 14 file) dan `invalidateQueries()` global pada
   perubahan auth (`src/routes/__root.tsx:143`).

## Matriks halaman

| Halaman | Data | Mekanisme | Subscription | Fallback | Status |
|---|---|---|---|---|---|
| Dashboard customer | ringkasan order | invalidate lokal | tidak ada | reload manual | MANUAL_REFRESH |
| Detail pesanan customer | order + timeline | invalidate setelah aksi sendiri | tidak ada | reload manual | MANUAL_REFRESH |
| Notifikasi customer | daftar notifikasi | invalidate setelah mark-read | tidak ada | reload manual | MANUAL_REFRESH |
| Admin orders/payments/refunds/tasks | list & detail | invalidate setelah mutasi sendiri | tidak ada | reload manual | MANUAL_REFRESH |
| Operator | — | — | — | — | NOT_IMPLEMENTED |

## Workflow yang gagal gate realtime

| Skenario | Hasil |
|---|---|
| Admin verifikasi payment → dashboard customer berubah tanpa reload | GAGAL (butuh reload manual di sisi customer) |
| Admin assign operator → operator menerima task | GAGAL (modul tidak ada) |
| Operator update progress → admin/customer melihat | GAGAL (modul tidak ada) |
| Event backend → unread count berubah otomatis | GAGAL |
| Admin update refund → customer melihat status baru | GAGAL (butuh reload) |

Istilah yang tepat untuk kondisi saat ini: **MANUAL_REFRESH**, bukan realtime dan
bukan near-realtime.
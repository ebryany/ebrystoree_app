# 07 — Audit Timeline

Status: **PARTIALLY_VERIFIED**

## Sumber data

Satu sumber: tabel `order_status_histories` (kolom `previous_status`, `new_status`,
`actor_id`, `actor_type`, `public_note`, `internal_note`, `metadata`, `created_at`).
Dibaca customer lewat `getMyOrder` dan admin lewat `getOrderDetail` → **sumber sama**,
tidak ada timeline hard-coded di komponen `src/components/ebry/timeline.tsx`
(komponen murni presentasi).

## Penulis event yang terbukti

| Event | Menulis history | Bukti |
|---|---|---|
| Order dibuat | YA | 2 baris |
| Bukti bayar diunggah | YA | ada |
| Payment diverifikasi | YA | ada |
| Order dibatalkan | YA (kode) | NOT_TESTED |
| Refund direview/diproses | YA (kode) | NOT_TESTED |
| Operator ditugaskan | TIDAK | modul tidak ada |
| Progress diperbarui | TIDAK | modul tidak ada |
| Hasil dikirim | TIDAK | modul tidak ada |
| Revisi diminta | TIDAK | modul tidak ada |

## Visibilitas catatan internal

Diverifikasi pada `src/lib/orders.functions.ts:216-219`: `getMyOrder` hanya memilih
`previous_status, new_status, public_note, actor_type, created_at` — `internal_note`
dan `orders.internal_note` **tidak** diproyeksikan ke customer. Status: VERIFIED
pada level server function. Catatan sisa (severity LOW): belum ada test yang
mengunci perilaku ini terhadap regresi, dan proteksi kolom di level RLS untuk akses
langsung Data API belum diuji.

Ordering: `created_at ASC/DESC` konsisten; tidak ditemukan duplikasi pada 6 baris
yang ada.
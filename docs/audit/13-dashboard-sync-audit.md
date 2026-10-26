# 13 — Audit Dashboard Synchronization

Status: **PARTIALLY_VERIFIED**

| Data | Customer | Admin | Operator | Source | Konsisten |
|---|---|---|---|---|---|
| Order status | `getMyOrder` | `getOrderDetail` | — | `orders` | YA (sumber sama) |
| Payment status | `getMyOrder` | `getPaymentDetail` | — | `payments` | YA |
| Timeline | `public_note` saja | + `internal_note` | — | `order_status_histories` | YA |
| Invoice | ada | ada | — | `invoices` | YA |
| Entitlement | ada | — | — | `digital_entitlements` | Admin tidak punya tampilan |
| Progress / operator / hasil / revisi | — | — | — | tidak ada | TIDAK ADA |
| Refund | ada | ada | — | `refunds` | YA (belum ada data uji) |
| Notifikasi | ada | — | — | `notifications` | Admin tidak punya inbox |

## Uji sinkronisasi

| Kondisi | Hasil |
|---|---|
| Setelah mutasi di tab yang sama | KONSISTEN (invalidateQueries) |
| Setelah refresh manual | KONSISTEN (semua data dari DB, tidak ada state lokal palsu) |
| Logout–login | KONSISTEN (`invalidateQueries()` global di `__root.tsx`) |
| Browser kedua / aktor berbeda tanpa reload | **TIDAK SINKRON** — butuh reload manual |
| Reconnect subscription | N/A — tidak ada subscription |

Kesimpulan: konsistensi *data* baik karena satu sumber kebenaran di database;
konsistensi *tampilan lintas aktor* buruk karena tidak ada realtime.
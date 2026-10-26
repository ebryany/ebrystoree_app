# 12 — Audit Refund & Dispute

Refund: **BACKEND_ONLY / NOT_TESTED (45%)** · Dispute: **NOT_IMPLEMENTED (0%)**

## Refund

| Aspek | Status | Catatan |
|---|---|---|
| Eligibility & window 7 hari | BACKEND_ONLY | `request_refund` cek `paid_at > now() - refund_window_days` |
| Duplicate refund | **GAP** | tidak ada cek refund aktif yang sudah ada untuk order sama |
| Refund parsial | SCHEMA_ONLY | `amount` selalu diisi `paid_amount` penuh; UI tidak menyediakan input nominal parsial — **melanggar keputusan Owner "refund parsial"** |
| Approval / rejection | BACKEND + UI | `review_refund`, `/admin/refunds/$id` |
| Processing → completed | BACKEND + UI | `process_refund` |
| Update payment & order | BACKEND | `refunded` / `partially_refunded` |
| Task & notifikasi & timeline & audit log | BACKEND | ada di dalam RPC |
| Refund lewat provider | NOT_IMPLEMENTED | manual, hanya `processing_reference` teks |
| Eksekusi nyata | **0 baris** di tabel `refunds` | NOT_TESTED |

## Dispute / komplain

Tidak ada tabel `complaints`/`disputes`, tidak ada eskalasi, tidak ada order freeze,
tidak ada penghentian auto-completion (auto-completion sendiri belum ada).
Status order `disputed` tersedia di CHECK constraint tetapi tidak ada jalur kode
yang dapat mencapainya → SCHEMA_ONLY.
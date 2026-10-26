# 21 — Final Evidence Index

| # | Klaim | Metode | Bukti |
|---|---|---|---|
| E-01 | 34 route file, tidak ada route operator/API | `find src/routes` | `00`, `01` |
| E-02 | 61 server function, 13 RPC dipakai | `rg "createServerFn"`, `rg "rpc("` | `03` |
| E-03 | Realtime tidak aktif | `select count(*) from pg_publication_tables where pubname='supabase_realtime'` → **0** | `08` |
| E-04 | Tidak ada subscription/polling di kode | `rg ".channel(|postgres_changes|refetchInterval"` → 0 | `08` |
| E-05 | Tidak ada email provider | `rg -i "resend|smtp|nodemailer"` → 0 | `09` |
| E-06 | Produk digital tak dapat diunduh | `digital_product_files`=0, `download_logs`=0 | `10` |
| E-07 | Operator fulfillment kosong | `operator_assignments`=0 baris, 0 referensi kode | `11` |
| E-08 | Refund belum pernah dijalankan | `refunds`=0 baris | `12` |
| E-09 | Refund selalu penuh | `request_refund` memakai `v_pay.paid_amount` | `12` |
| E-10 | `internal_note` tidak bocor ke customer | `src/lib/orders.functions.ts:216-219` | `07` |
| E-11 | Test suite: 1 file, 8 test, lulus | `bunx vitest run` | `16` |
| E-12 | Transisi status hanya dijaga di RPC | `pg_constraint` hanya CHECK nilai, tanpa trigger | `02`, `06` |
| E-13 | Data transaksi nyata sangat kecil | orders=2, payments=2, histories=6, notifications=13, tasks=3, entitlements=1, audits=23 | `02` |
| E-14 | Tidak ada webhook/cron | `src/routes/api` tidak ada | `17` |

Seluruh angka diambil langsung dari codebase dan database pada 2026-07-28,
bukan dari dokumen spesifikasi.
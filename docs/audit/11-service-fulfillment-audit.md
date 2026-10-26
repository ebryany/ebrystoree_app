# 11 — Audit Service Fulfillment & Operator

Status: **NOT_IMPLEMENTED (15%)**

| Tahap | Customer | Admin | Operator | Database | Task | Notification | Timeline |
|---|---|---|---|---|---|---|---|
| Detail layanan & paket | ADA | ADA (CRUD) | — | ADA | — | — | — |
| Checkout + requirements | ADA | — | — | `service_order_details` | — | ADA | ADA |
| Upload lampiran kebutuhan | TIDAK | — | — | tidak ada bucket | — | — | — |
| Pembayaran & verifikasi | ADA | ADA | — | ADA | ADA | ADA | ADA |
| Waiting assignment | tampil | tampil | — | status ada | task `assign_operator` dibuat | ADA | ADA |
| Assign operator | — | **TIDAK ADA** | — | `operator_assignments` kosong | — | — | — |
| Operator terima task | — | — | **TIDAK ADA** | — | — | — | — |
| Mulai kerja | — | — | TIDAK ADA | — | — | — | — |
| Update progress | TIDAK | TIDAK | TIDAK | tidak ada tabel `job_progress` | — | — | — |
| Kirim hasil | TIDAK | TIDAK | TIDAK | tidak ada tabel hasil | — | — | — |
| Review customer / revisi | TIDAK | TIDAK | TIDAK | tidak ada tabel `revisions` | — | — | — |
| Penyelesaian order | TIDAK | TIDAK | TIDAK | — | — | — | — |
| SLA / deadline / overdue | TIDAK | TIDAK | TIDAK | kolom `deadline_at` ada | tidak ada job | — | — |

## Kesimpulan

Order jasa yang sudah dibayar **mandek permanen** di `waiting_assignment`. Ini
adalah gap terbesar dari sisi bobot (12% area) dan menjadi blocker utama menuju
MVP produksi (GAP-01).
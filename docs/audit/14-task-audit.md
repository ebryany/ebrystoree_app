# 14 — Audit Task Operasional

Status: **PARTIALLY_VERIFIED (70%)**

| Aspek | Status | Bukti |
|---|---|---|
| Task source & type | VERIFIED | `verify_payment`, `assign_operator`, `review_refund` |
| Source ID + dedup | VERIFIED | unique partial index `(task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked')` + `ON CONFLICT DO NOTHING` |
| Assignee / claim / assign | VERIFIED (kode) | `update_admin_task` |
| Priority & status | VERIFIED | CHECK constraint |
| Auto-close | VERIFIED | `verify_manual_payment` & `review_refund` menutup task terkait |
| Due date / overdue | SCHEMA_ONLY | `due_at` tidak pernah diisi; tidak ada job overdue |
| History task | NOT_IMPLEMENTED | hanya audit log umum, tanpa tabel histori task |
| Task dari revisi / progress / SLA | NOT_IMPLEMENTED | modul sumbernya belum ada |

Data nyata: 3 task. Uji yang sudah terjadi: bukti bayar → task dibuat; verifikasi →
task tertutup; order jasa lunas → task `assign_operator` dibuat (dan tetap terbuka
karena tidak ada modul assignment).
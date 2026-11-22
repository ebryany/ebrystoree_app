# Security Event & Alert Schema

Skema tabel keamanan pada migrasi `supabase/migrations/20261122100000_security_monitoring_center.sql`.

## 1. `public.security_events`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid PK` | Primary key UUID |
| `created_at` | `timestamptz` | Waktu pertama kejadian |
| `last_seen_at` | `timestamptz` | Waktu terakhir kejadian (terupdate saat deduplikasi) |
| `event_type` | `text` | Jenis event (`forbidden_admin_access`, `forbidden_permission_access`, `privilege_escalation_attempt`, `invalid_webhook_signature`, `invalid_internal_job_token`, `ownership_violation_attempt`, `rate_limit_exceeded`, dll.) |
| `severity` | `text CHECK` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `category` | `text CHECK` | `access_denial`, `suspicious_activity`, `security_violation` |
| `actor_user_id`, `actor_role`, `actor_email_masked` | `uuid`, `text`, `text` | Identitas aktor tersamarkan (jika login) |
| `ip_address`, `user_agent` | `text` | IP dari Cloudflare (`cf-connecting-ip`) & UA tersanitasi |
| `http_method`, `endpoint`, `route_template`, `action_name` | `text` | Detail target API/rute |
| `target_resource_type`, `target_resource_id` | `text` | Resource yang dicoba diakses |
| `status_code`, `reason_code` | `integer`, `text` | Kode HTTP (`401`, `403`, `429`) & kode alasan |
| `request_id`, `source_system` | `text` | Request Reference ID (`ebry-...`) & sumber (`server_fn`, `webhook`, `internal_job`, `mcp`, `route_guard`) |
| `occurrence_count`, `dedup_key` | `integer`, `text` | Jumlah kemunculan teragregasi & kunci deduplikasi 5 menit |
| `sanitized_metadata` | `jsonb` | Metadata non-rahasia |
| `detection_status`, `assigned_to`, `resolved_by`, `resolved_at`, `resolution_note` | Workflow investigasi | Status: `NEW`, `INVESTIGATING`, `ACKNOWLEDGED`, `RESOLVED`, `FALSE_POSITIVE` |

## 2. `public.security_event_histories`
Audit trail perubahan status investigasi (`event_id` FK -> `security_events.id`, `actor_id`, `actor_role`, `previous_status`, `new_status`, `note`, `created_at`).

## 3. `public.security_alerts`
Menyimpan alert hasil korelasi threshold (`rule_code`, `title`, `description`, `severity`, `status`, `source_ip`, `actor_user_id`, `target_endpoint`, `trigger_count`, `sample_event_ids uuid[]`, `dedup_key`, `resolved_by`, `resolved_at`, `resolution_note`).

## 4. Kebijakan Retensi
Fungsi `public.cleanup_old_security_events(_retention_days integer DEFAULT 90)` menghapus event berstatus `RESOLVED`, `FALSE_POSITIVE`, `ACKNOWLEDGED` atau severity `LOW`/`MEDIUM` yang lebih tua dari batas retensi (minimal 7 hari).

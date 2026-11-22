# Security Alert Rules & Thresholds

Aturan korelasi otomatis yang dievaluasi secara atomik di database melalui `public.record_security_event()` dan `public.upsert_security_alert()` (`supabase/migrations/20261122100000_security_monitoring_center.sql`).

| Rule Code | Kondisi Trigger | Window | Severity | Cooldown / Deduplikasi |
|---|---|---|---|---|
| `PRIVILEGE_ESCALATION_ATTEMPT` | `event_type` berupa `privilege_escalation_attempt` atau `dangerous_setting_tamper` (>= 1 kejadian) | Seketika (1x) | **CRITICAL** | 15 menit per `(rule_code + IP/actor)` |
| `WEBHOOK_SIGNATURE_TAMPERING` | Akumulasi `invalid_webhook_signature` atau `invalid_internal_job_token` >= **3 kali** dari IP atau endpoint sama | 10 menit | **CRITICAL** | 15 menit; menghitung `trigger_count` & melampirkan hingga 10 `sample_event_ids` |
| `BRUTE_FORCE_ADMIN_PROBE` | Akumulasi `unauthenticated_sensitive_access`, `forbidden_admin_access`, atau `forbidden_permission_access` >= **5 kali** dari aktor/IP sama | 5 menit | **HIGH** | 15 menit |
| `IDOR_ENUMERATION_BURST` | Akumulasi `ownership_violation_attempt` >= **8 kali** dari aktor/IP sama | 5 menit | **HIGH** | 15 menit |
| `RATE_LIMIT_ABUSE_SPIKE` | Akumulasi `rate_limit_exceeded` >= **5 kali** dari aktor/IP sama | 10 menit | **MEDIUM** | 15 menit |

## Lifecycle Status Alert
`OPEN` -> `INVESTIGATING` / `ACKNOWLEDGED` -> `RESOLVED` / `FALSE_POSITIVE` (dieksekusi melalui `updateSecurityAlertStatus` dengan audit log penuh di `audit_logs`).

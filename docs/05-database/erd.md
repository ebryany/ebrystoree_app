# ERD & Data Dictionary (ringkas)

## Relasi Utama
```text
users 1—1 customer_profiles
users 1—1 operator_profiles 1—* operator_skills, operator_availability
users *—* roles (user_roles) ; roles *—* permissions (role_permissions)
categories 1—* digital_products 1—* digital_product_files
categories 1—* services 1—* service_packages, service_addons
users 1—* orders 1—* order_items
orders 1—1 service_order_details
orders 1—* order_status_histories, attachments, invoices, payments, refunds,
          complaints, reviews, operator_assignments
operator_assignments 1—* work_progress_updates, result_files, revisions
payments 1—* payment_attempts, payment_webhook_events,
            manual_payment_proofs 1—* payment_verifications
order_items 1—* digital_entitlements 1—* download_logs
coupons 1—* coupon_usages
notifications 1—* notification_deliveries
audit_logs (polymorphic: entity_type, entity_id)
```

## Konvensi Kolom
- PK `id uuid default gen_random_uuid()`.
- `created_at`, `updated_at timestamptz not null default now()`.
- Soft delete `deleted_at timestamptz` pada katalog dan konten, bukan pada order/payment (data keuangan tidak dihapus).
- Uang disimpan `bigint` dalam satuan rupiah penuh (tanpa desimal) untuk menghindari galat floating point; kolom `currency text default 'IDR'`.
- Status: `text` + `CHECK` (lihat ADR-003).

## Tabel Kunci
| Tabel | Tujuan | Kolom penting | Constraint/Index |
|---|---|---|---|
| orders | Header pesanan | order_number, user_id, type, status, subtotal, discount, admin_fee, total | unique(order_number); idx(user_id,status); idx(created_at) |
| order_items | Snapshot item | itemable_type, itemable_id, name_snapshot, unit_price, qty, config_json | idx(order_id) |
| payments | Upaya pembayaran | order_id, provider, method, status, amount, currency, provider_ref, expires_at, paid_at | unique(provider,provider_ref); idx(status,expires_at) |
| payment_webhook_events | Anti-duplikasi | provider, provider_event_id, payload_json, signature_valid, processed_at | unique(provider,provider_event_id) |
| manual_payment_proofs | Bukti transfer | payment_id, file_path, sender_name, amount_claimed, note, status | idx(payment_id) |
| payment_verifications | Jejak verifikasi | proof_id, verifier_id, result, reason, verified_at | idx(proof_id) |
| digital_entitlements | Hak unduh | user_id, order_item_id, product_id, download_limit(5), download_count, expires_at | unique(order_item_id); idx(user_id) |
| download_logs | Jejak unduh | entitlement_id, user_id, ip, user_agent, downloaded_at | idx(entitlement_id) |
| operator_assignments | Penugasan | order_id, operator_id, status, assigned_at, deadline_at, released_at | idx(operator_id,status) |
| work_progress_updates | Timeline | assignment_id, percent, note, actor_id, attachments | idx(assignment_id) |
| refunds | Refund | order_id, payment_id, amount, reason, status, approved_by, processed_at | check(amount>0); idx(order_id) |
| audit_logs | Audit | actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, ip, trace_id | idx(entity_type,entity_id); idx(created_at) |

## Retensi & Data Sensitif
- Bukti pembayaran & lampiran pelanggan: bucket privat, retensi 24 bulan lalu ditinjau.
- `download_logs` menyimpan IP — dicantumkan di kebijakan privasi, retensi 12 bulan.
- Tidak ada tabel yang menyimpan data kartu; QRIS ditangani sepenuhnya oleh provider.

## Grant & RLS
Setiap tabel `public` yang dibuat wajib disertai `GRANT` eksplisit dan `ENABLE ROW LEVEL SECURITY` dalam migrasi yang sama. Role disimpan pada tabel `user_roles` terpisah dan diperiksa lewat fungsi `has_role()` security-definer — tidak pernah pada tabel profil.
# Transaction ERD Awal (Slice 2)

```text
profiles(users) 1—* orders 1—* order_items
orders 1—1 service_order_details
orders 1—* order_status_histories
orders 1—1 invoices
orders 1—* payments 1—* payment_events
payments 1—* manual_payment_proofs 1—* payment_verifications
order_items 1—* digital_entitlements 1—* download_logs
orders 1—* operator_assignments (operator → profiles)
orders 1—* refunds (payment_id → payments)
admin_tasks (source_type, source_id polymorphic; unique aktif)
notifications (recipient_id → profiles; related_type, related_id)
audit_logs (sudah ada, polymorphic)
```

## Konvensi

- PK `uuid default gen_random_uuid()`; `created_at`/`updated_at timestamptz not null default now()`.
- Uang `bigint` rupiah penuh, `currency text default 'IDR'`.
- Status `text` + `CHECK` sesuai state machine.
- Tanpa soft delete pada data keuangan.
- Setiap tabel: `GRANT` eksplisit → `ENABLE ROW LEVEL SECURITY` → policy, dalam migrasi yang sama.

## Tabel & Kolom Kunci

| Tabel | Kolom penting | Constraint/Index |
|---|---|---|
| orders | order_number, user_id, order_type(digital_product\|service), status, currency, subtotal, discount_total, admin_fee, total, customer_note, internal_note, cancellation_reason, expired_at, paid_at, completed_at, cancelled_at | unique(order_number); idx(user_id,status); idx(status,expired_at); idx(created_at) |
| order_items | order_id, item_type, product_id, service_id, package_id, name_snapshot, sku_snapshot, unit_price, quantity, discount, total, metadata | idx(order_id); check(quantity>0) |
| service_order_details | order_id, package_snapshot, addons_snapshot, requirements, estimated_days, revision_allowance, customer_deadline, internal_deadline, requirements_complete | unique(order_id) |
| invoices | invoice_number, order_id, customer_snapshot, billing_info, subtotal, discount, admin_fee, total, status, issued_at, due_at, paid_at | unique(invoice_number); unique(order_id) |
| payments | payment_number, order_id, provider, method, status, currency, expected_amount, paid_amount, external_transaction_id, idempotency_key, payment_url, expired_at, paid_at, failed_at | unique(payment_number); unique(idempotency_key); unique(provider, external_transaction_id); idx(status,expired_at) |
| payment_events | provider, external_event_id, payment_id, event_type, signature_valid, payload_hash, processing_status, processed_at, error | unique(provider, external_event_id) |
| manual_payment_proofs | payment_id, customer_id, file_path, original_filename, mime_type, size_bytes, customer_note, status, submitted_at | idx(payment_id) |
| payment_verifications | payment_id, proof_id, verifier_id, previous_status, new_status, decision, reason, verified_at | idx(payment_id) |
| order_status_histories | order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note, metadata | idx(order_id, created_at) |
| digital_entitlements | user_id, order_item_id, product_id, file_version, download_limit, download_count, valid_from, valid_until, revoked_at | unique(order_item_id); idx(user_id) |
| download_logs | entitlement_id, user_id, ip, user_agent, downloaded_at | idx(entitlement_id) |
| operator_assignments | order_id, operator_id, assigned_by, status, assigned_at, accepted_at, started_at, completed_at, deadline_at, internal_note | unique aktif per order (partial unique where status active); idx(operator_id,status) |
| refunds | refund_number, order_id, payment_id, customer_id, amount, reason, status, requested_at, reviewed_by, reviewed_at, decision_note, processed_at | unique(refund_number); partial unique refund aktif per order; check(amount>0) |
| admin_tasks | task_number, task_type, source_type, source_id, title, description, priority, status, assignee_id, created_by, due_at, completed_at | unique(task_type, source_type, source_id) where status aktif; idx(status,priority) |
| notifications | recipient_id, type, title, message, related_type, related_id, read_at | idx(recipient_id, read_at) |

## Ringkasan RLS

- Customer: SELECT baris miliknya (`user_id = auth.uid()`), INSERT proof untuk payment miliknya, SELECT entitlement/notifikasi miliknya.
- Operator: SELECT order yang ada assignment aktif miliknya.
- Staff: lewat `has_permission()` untuk `orders.view`, `payments.view`, `refunds.view`, `tasks.view`.
- Tulisan sensitif (verifikasi, assignment, refund, status) hanya lewat server function ber-`assertPermission`, bukan langsung dari klien.

## Rencana Migrasi (bertahap)

| # | Migrasi | Isi |
|---|---|---|
| M1 | permission tambahan | `orders.create`, `orders.cancel`, `payments.reconcile`, `refunds.reject`, `refunds.process`, `tasks.assign` + mapping role |
| M2 | core order | orders, order_items, service_order_details, invoices, order_status_histories + generator nomor |
| M3 | payment | payments, payment_events, manual_payment_proofs, payment_verifications |
| M4 | fulfillment | digital_entitlements, download_logs, operator_assignments |
| M5 | ops | admin_tasks, notifications, refunds |
| M6 | settings transaksi | key `system_settings` baru (prefix nomor, expiry order/payment, refund window, batas upload) |

Setiap migrasi disertai catatan rollback (`DROP` berurutan terbalik) di dokumen schema.
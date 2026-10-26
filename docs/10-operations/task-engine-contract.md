# Kontrak Konseptual Task Engine (OD-04) — Persiapan Slice 2

Keputusan Owner: task operasional dijalankan lewat **domain event + background job terjadwal**, bukan trigger database.

## 1. Prinsip

1. Trigger database hanya untuk integritas data (timestamp, validasi, proteksi kolom) — tidak untuk logika bisnis task.
2. Setiap perubahan status domain memancarkan **domain event** yang disimpan sebagai baris di outbox (`domain_events`).
3. Worker terjadwal membaca outbox, menerapkan aturan, lalu membuat/menutup task di `admin_tasks`.
4. Semua pemrosesan **idempotent** melalui `dedupe_key` unik.

## 2. Kontrak event

```ts
type DomainEvent = {
  id: string;              // uuid
  name: string;            // "payment.submitted" | "order.paid" | "job.overdue" | ...
  occurred_at: string;     // ISO
  entity_type: string;     // "payments" | "orders" | "service_jobs"
  entity_id: string;
  payload: Record<string, unknown>;
  dedupe_key: string;      // unik: `${name}:${entity_id}:${bucket}`
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
};
```

## 3. Kontrak task

```ts
type AdminTask = {
  id: string;
  type: "verify_manual_payment" | "assign_operator" | "review_refund" | "resolve_complaint" | "sla_breach";
  title: string;
  entity_type: string;
  entity_id: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "done" | "cancelled";
  required_permission: string;   // dicek ulang lewat assertPermission()
  assignee_id: string | null;
  due_at: string | null;
  dedupe_key: string;            // UNIQUE → mencegah task ganda
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
};
```

## 4. Aturan pemetaan event → task (draf Slice 2)

| Event | Task | Prioritas | Permission | Penutup otomatis |
|---|---|---|---|---|
| `payment.submitted` (manual DANA) | `verify_manual_payment` | high | `payments.verify` | `payment.verified` / `payment.rejected` |
| `order.paid` (order jasa) | `assign_operator` | normal | `orders.assign` | `order.assigned` |
| `refund.requested` | `review_refund` | high | `refunds.approve` | `refund.approved` / `refund.rejected` |
| `complaint.opened` | `resolve_complaint` | normal | `complaints.manage` | `complaint.resolved` |
| `job.sla_at_risk` (job terjadwal) | `sla_breach` | urgent | `orders.update` | `job.delivered` |

## 5. Penjadwalan & keandalan

- Worker dipanggil endpoint terjadwal `POST /api/public/jobs/task-engine` dengan verifikasi secret header; bukan endpoint terbuka.
- Interval sasaran: 1 menit untuk outbox, 5 menit untuk pemindaian SLA.
- Retry dengan backoff, maksimum 5 percobaan, lalu event ditandai gagal dan memunculkan task `sla_breach` internal.
- Setiap pembuatan/penutupan task menulis `audit_logs` melalui `write_audit_log()`.
- Semua mutasi task tetap melewati `assertPermission()` di server function; tidak ada jalur langsung dari klien.

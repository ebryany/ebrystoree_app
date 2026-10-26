# 03 — Server Function & RPC Map

## Server function (61 deklarasi)

| File | Jumlah | Proteksi | Status |
|---|---:|---|---|
| `catalog.functions.ts` | 4 | anon publishable, read-only | PARTIALLY_VERIFIED |
| `admin.functions.ts` | 30 | `requireSupabaseAuth` + `assertPermission` + Zod | PARTIALLY_VERIFIED |
| `admin-transaction.functions.ts` | 15 | idem | PARTIALLY_VERIFIED |
| `orders.functions.ts` | 14 | `requireSupabaseAuth`, scoping by RLS | PARTIALLY_VERIFIED |

## RPC yang dipakai (13)

| RPC | Pemanggil | Idempotency | Status |
|---|---|---|---|
| `create_digital_order` | `createDigitalOrder` | ya (`idempotency_key`) | VERIFIED (2 order nyata) |
| `create_service_order` | `createServiceOrder` | ya | VERIFIED |
| `submit_payment_proof` | `submitPaymentProof` | tidak (dibatasi `reupload_count`) | PARTIALLY_VERIFIED |
| `verify_manual_payment` | `verifyPayment` | guard status | VERIFIED (PAY-20260729-000001) |
| `cancel_own_order` | `cancelMyOrder` | guard status | NOT_TESTED |
| `request_refund` | `requestMyRefund` | tidak ada cek duplikat refund | NOT_TESTED |
| `review_refund` / `process_refund` | admin | guard status | NOT_TESTED |
| `update_admin_task` | admin | guard permission | PARTIALLY_VERIFIED |
| `consume_download` | `downloadEntitlement` | menambah counter | BROKEN (tidak ada file aktif) |
| `write_audit_log`, `get_my_permissions`, `sync_my_profile_email` | lintas modul | — | VERIFIED |

## RPC/fungsi yang belum ada (blocker fulfillment)

`assign_operator`, `accept_assignment`, `start_work`, `update_progress`,
`submit_result`, `request_revision`, `approve_result`, `complete_order`,
`expire_orders` (job), `escalate_dispute`.

## Transaction boundary

Seluruh mutasi transaksional berada di dalam satu fungsi PL/pgSQL (implisit satu
transaksi) dengan `FOR UPDATE` pada baris kunci → **desain benar**. Yang kurang
adalah cakupan: tahap fulfillment belum punya fungsi apa pun.
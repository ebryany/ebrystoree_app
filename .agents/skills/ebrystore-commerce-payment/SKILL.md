---
name: ebrystore-commerce-payment
description: Designs, implements, and verifies EBRYSTORE commerce flows including cart, checkout, orders, payment callbacks, webhook idempotency, refunds, and digital fulfillment where implemented.
---

# EBRYSTORE Commerce & Payment Engineering

## Mandat
Jaga kebenaran alur commerce dan finansial. Terapkan hanya pada fitur yang ditemukan/diminta. Jangan menganggap provider atau status integrasi historis masih aktif.

## Discovery
Petakan price source, cart, checkout, order creation, payment request, provider adapter, webhook, order state machine, fulfillment, digital entitlement, refund, ledger, reconciliation. Catat provider aktual dari kode/config tanpa membuka credential. Konteks pemilik tentang SumoPod QRIS/ShopeePay adalah historis sampai diverifikasi.

## Invariants
- Harga/total dihitung dan diverifikasi di server.
- Client tidak menetapkan payment success atau order ownership.
- Payment event diverifikasi sesuai mekanisme provider.
- Webhook aman terhadap duplicate/replay dan memiliki idempotency.
- Status order/payment mengikuti transisi sah.
- Payment success dan fulfillment success adalah status berbeda.
- Produk digital diberikan setelah syarat fulfillment terpenuhi.
- Refund/saldo/ledger hanya berubah melalui operasi berotorisasi dan tercatat.
- Retry/concurrency tidak menggandakan order, payment, entitlement, atau ledger.

## State design
Jangan mengarang enum status. Temukan status aktual dan petakan current state, event, preconditions, actor/source, next state, side effects, idempotency key, failure/retry behavior. Tolak transisi ilegal pada server.

## Testing
Gunakan sandbox/mock dan data sintetis. Uji valid payment, invalid signature, amount mismatch, unknown reference, expired/cancelled/failed, duplicate webhook, replay, concurrent callback, provider timeout, fulfillment retry, unauthorized refund, ownership mismatch.

Jangan membuat transaksi nyata untuk pengujian atau memanggil production webhook tanpa izin.

## Output
Sequence/state diagram, invariants, contract, perubahan, test evidence, reconciliation gaps, dan risiko.

---
name: ebrystore-system-design
description: Designs EBRYSTORE requirements, domain boundaries, current and target architecture, data flows, API contracts, threat boundaries, and architecture decisions based on repository evidence.
---

# EBRYSTORE System Design & Architecture

## Mandat
Rancang/tinjau arsitektur berdasarkan kebutuhan yang dinyatakan dan repository terverifikasi. Bedakan AS-IS (implementasi ditemukan), TO-BE (usulan), dan DECISION NEEDED (keputusan pemilik).

## Tahapan
1. Jalankan codebase discovery bila stack/struktur belum dipahami.
2. Rumuskan problem, aktor, user journeys, business rules, functional/non-functional requirements, constraints, acceptance criteria.
3. Identifikasi domain/ownership boundary: customer, seller, admin, catalog, store, cart, order, payment, fulfillment, entitlement, notification, financial records hanya bila ada/dibutuhkan.
4. Petakan frontend, backend, database, storage, provider, infrastructure.
5. Evaluasi pola yang sudah ada dan modular monolith terlebih dahulu. Jangan memaksakan microservices, CQRS, event sourcing, queue, cache, atau orchestration tanpa kebutuhan terukur.
6. Buat C4/sequence/ERD/state diagram bila membantu.
7. Catat keputusan besar dalam ADR: context, options, decision, rationale, trade-offs, risks, status.
8. Review coupling, trust boundaries, ownership, failure modes, migration cost, observability, operability.

## Prinsip
Existing contracts dan backward compatibility adalah constraint utama. Tentukan sumber kebenaran harga, status order/payment, dan entitlement. Definisikan transaksi, idempotency, concurrency, retry, compensation bila relevan. Sertakan authorization dan data isolation sejak desain. Hindari abstraksi/teknologi demi tren.

## Output
Scope/assumptions; AS-IS dengan bukti; TO-BE berlabel proposal; component responsibilities/dependencies; data flow; data model/API changes; security/reliability; ADR; migration/rollout/rollback; open decisions.

Jangan mengubah kode/database hanya karena rancangan dibuat. Implementasi memerlukan mandat terpisah.

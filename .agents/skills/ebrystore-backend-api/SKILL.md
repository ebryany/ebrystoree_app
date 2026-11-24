---
name: ebrystore-backend-api
description: Builds and reviews EBRYSTORE backend services, server functions, API endpoints, business logic, validation, authorization, error contracts, and external integration boundaries.
---

# EBRYSTORE Backend & API Engineering

## Mandat
Jaga backend benar secara fungsional, aman, konsisten, dan kompatibel dengan client/database yang ada.

## Discovery
Periksa API/server functions, middleware, services, validators, auth helpers, data access patterns, error conventions, and tests. Ikuti kontrak aktual; jangan menciptakan endpoint/framework.

## Untuk setiap operasi
Identifikasi caller, tujuan bisnis, authentication, authorization/ownership, request schema/runtime validation, business rules, database writes/transactions, response/error contract, side effects, retries, idempotency, concurrency, dan logging aman.

## Aturan
- Jangan percaya user ID, seller ID, role, price, discount, ownership, payment status, atau permission dari client.
- Ambil identitas dari session/token yang diverifikasi server.
- Periksa ownership untuk setiap objek privat.
- Batasi field yang boleh diubah; hindari mass assignment.
- Validasi di server meski frontend sudah memvalidasi.
- Gunakan parameterized queries atau data access layer aman.
- Terapkan rate/request-size limits pada endpoint yang perlu.
- Jangan membocorkan stack trace, SQL, credential, atau data internal.
- Gunakan idempotency/transactions untuk operasi sensitif bila perlu.

Pertahankan API contract dan backward compatibility. Untuk perubahan breaking, dokumentasikan consumer, rollout, dan migration plan.

## Verifikasi
Uji valid/invalid, unauthenticated, wrong-role, wrong-owner, duplicate, concurrent, not-found, dan provider failure sesuai risiko.

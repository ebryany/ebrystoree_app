---
name: ebrystore-qa-engineering
description: Plans and executes risk-based QA for EBRYSTORE including functional, unit, integration, API, E2E, security regression, database integrity, accessibility, and release verification.
---

# EBRYSTORE Quality Engineering & QA

## Mandat
Buktikan implementasi memenuhi requirement dan tidak merusak alur yang bekerja. QA bukan sekadar menjalankan test command.

## Strategy
Temukan test framework, scripts, fixtures, CI, test data, environment. Buat requirement-to-test traceability. Prioritaskan authentication, authorization, customer/seller isolation, order, payment, fulfillment, data integrity, admin settings, dan core user journeys jika ada.

Pilih unit, integration, API/contract, component, E2E, property-based, accessibility, atau performance test berdasarkan risiko. Hindari duplicate, flaky, weak, dan tautological assertions.

## Test case
Nyatakan requirement, preconditions, actor/role, input, action, expected result, data side effects, negative/edge case. Untuk marketplace, gunakan data sintetis Customer A/B dan Seller A/B.

## Execution
Gunakan local/staging. Periksa efek samping sebelum test. Jangan memakai data pelanggan nyata. Jangan destructive test di production. Jangan mengubah application code hanya agar test lulus atau menghapus test gagal tanpa analisis. Catat command, environment, count, pass/fail/skip, dan output tanpa secret.

## Release gate
- READY: semua gate kritis yang disepakati memiliki bukti.
- READY WITH ACCEPTED RISKS: risiko tersisa disetujui.
- NOT READY: defect kritis/high belum ditangani.
- BLOCKED: bukti/environment tidak tersedia.

Jangan mengklaim coverage atau browser compatibility tanpa output. Pisahkan NOT RUN dan BLOCKED dari PASS.

## Output
Test plan, traceability, execution summary, defect register, regression result, unverified areas, release recommendation.

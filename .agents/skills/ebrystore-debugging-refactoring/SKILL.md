---
name: ebrystore-debugging-refactoring
description: Investigates EBRYSTORE bugs and refactoring requests by reproducing symptoms, tracing execution, proving root cause, applying minimal changes, and running regression tests.
---

# EBRYSTORE Debugging & Refactoring

## Debugging workflow
`OBSERVE → REPRODUCE → TRACE → ISOLATE → DIAGNOSE → FIX → VERIFY`

1. Catat expected vs actual.
2. Kumpulkan repro steps, environment, log, stack trace, request/response, perubahan terbaru.
3. Telusuri UI → API/server → business logic → database/provider sesuai kasus.
4. Buat hipotesis yang dapat diuji dan urutkan berdasarkan bukti.
5. Buktikan root cause sebelum menyebutnya penyebab.
6. Terapkan patch terkecil.
7. Tambahkan regression test yang gagal sebelum fix bila memungkinkan dan lulus setelah fix.
8. Periksa caller, data, auth, API contract, dan modul terkait.

## Refactoring
Identifikasi behavior publik yang harus tetap sama. Periksa tests/callers sebelum memindahkan simbol. Pisahkan refactor dari feature change kecuali diminta. Jangan mengganti framework, state management, database, atau arsitektur tanpa alasan. Ukur baseline jika mengklaim peningkatan performa. Hindari cleanup unrelated.

## Output
Pisahkan symptom observed, facts/evidence, hypotheses, verified root cause, patch, tests executed, residual risks. Jika tidak dapat direproduksi, jangan mengklaim root cause diketahui.

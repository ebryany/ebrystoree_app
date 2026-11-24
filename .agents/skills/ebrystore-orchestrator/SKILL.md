---
name: ebrystore-orchestrator
description: Coordinates full engineering work for EBRYSTORE and routes architecture, frontend, backend, database, security, commerce, QA, performance, and DevOps tasks to relevant specialist skills.
---

# EBRYSTORE Engineering Orchestrator

## Mandat
Koordinasikan pekerjaan engineering EBRYSTORE berdasarkan tujuan bisnis, repository aktual, batas perubahan, risiko, dan bukti. Gunakan Bahasa Indonesia.

## Full Engineering Team
Pertimbangkan peran berikut:
- Principal/Lead Software Engineer: scope, trade-off, koordinasi, kualitas.
- Product/Requirements Engineer: user journey, business rules, acceptance criteria.
- System Architect: domain boundary, dependency, kontrak, data flow.
- Frontend Engineer: UI, routing, state, SSR, accessibility.
- Backend/API Engineer: server logic, API, validation, authorization.
- Database Engineer: schema, query, RLS, constraints, migrations.
- Application Security Engineer: threat surface, authn/authz, secrets, abuse cases.
- Commerce/Payment Engineer: cart, order, payment, webhook, fulfillment, ledger bila ada.
- QA/SDET: test design, automation, regression, evidence.
- Performance/Reliability Engineer: measurement, bottleneck, resilience.
- DevOps/SRE: build, environment, CI/CD, observability, rollback.
- Independent Reviewer: menilai patch, test, security, dan regresi secara kritis.

Full Engineering berarti semua disiplin dipertimbangkan. Peran yang terdampak harus dilibatkan; peran tidak relevan tidak perlu melakukan pekerjaan seremonial. Untuk perubahan besar/lintas domain, minta review lintas peran dan independent review.

## Skill routing
| Permintaan | Skill utama | Pendamping sesuai dampak |
|---|---|---|
| Memahami repository | `ebrystore-codebase-discovery` | orchestrator |
| Requirement/user journey/business rules | `ebrystore-product-requirements` | system design, frontend/backend sesuai dampak |
| Arsitektur/system design | `ebrystore-system-design` | discovery, security, database |
| UI/frontend | `ebrystore-frontend-engineering` | backend, QA |
| API/business logic | `ebrystore-backend-api` | database, security, QA |
| Schema/SQL/RLS | `ebrystore-database-engineering` | backend, security, QA |
| Security audit/fix | `ebrystore-security-engineering` | backend, database, commerce, QA |
| Cart/checkout/payment | `ebrystore-commerce-payment` | backend, database, security, QA |
| Test/regression/release gate | `ebrystore-qa-engineering` | domain skill terkait |
| Bug/refactor | `ebrystore-debugging-refactoring` | domain skill, QA |
| Performance/reliability | `ebrystore-performance-reliability` | frontend/backend/database, QA |
| Build/CI/CD/release | `ebrystore-devops-release` | security, QA |

## Workflow
1. Classify: jenis tugas, mode, risiko, domain.
2. Discover: periksa repository, perubahan lokal, stack, tests, bukti relevan.
3. Define: tujuan, in-scope, out-of-scope, acceptance criteria, invariants.
4. Impact map: telusuri UI → API/server → business logic → database → integrasi → operasi bila relevan.
5. Plan: pilih skill spesialis dan urutan kerja.
6. Execute: patch minimal sesuai mandat.
7. Verify: jalankan tes relevan; jangan klaim tes yang tidak dijalankan.
8. Review: cek keamanan, kompatibilitas, integritas data, regresi.
9. Report: file, alasan, bukti, status, risiko, keputusan yang diperlukan.

## Mode
- DISCOVERY ONLY: baca/petakan tanpa perubahan.
- AUDIT ONLY: temuan dan bukti tanpa patch.
- DESIGN: rancangan/ADR tanpa implementasi.
- IMPLEMENT: perubahan sesuai acceptance criteria.
- FIX: reproduksi, root cause, patch minimal, regression test.
- RELEASE: validasi build/test dan rencana rilis; deployment hanya jika diminta dan disetujui.

Jika mode tidak jelas, ikuti batasan eksplisit paling ketat. Jangan mengubah audit menjadi implementasi.

## Pengendalian
Periksa `git status` sebelum perubahan bila tersedia. Jangan menimpa perubahan pengguna. Jangan rewrite/upgrade massal tanpa bukti. Jangan migrasi production, deploy, commit/push, hapus data, rotasi secret, atau ubah infrastruktur penting tanpa persetujuan. Gunakan data sintetis dan local/staging.

## Laporan
Ringkasan/mode; fakta yang diperiksa; role terlibat dan alasan; rencana/perubahan; file berubah; tes PASS/FAIL/NOT RUN/BLOCKED; risiko/unknown; approval yang diperlukan.

Jangan tampilkan chain-of-thought. Sajikan keputusan, alasan inti, dan bukti.

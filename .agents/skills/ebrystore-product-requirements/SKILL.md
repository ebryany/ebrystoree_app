---
name: ebrystore-product-requirements
description: Clarifies EBRYSTORE product goals, user journeys, business rules, functional requirements, acceptance criteria, and scope before implementation.
---

# EBRYSTORE Product & Requirements Engineering

## Mandat
Menerjemahkan kebutuhan pemilik dan masalah pengguna menjadi requirement yang jelas, dapat diuji, dan tidak bertentangan dengan perilaku bisnis EBRYSTORE. Jangan mengasumsikan fitur tersedia hanya karena umum pada marketplace.

## Discovery
- Identifikasi stakeholder dan aktor yang benar-benar ada: guest, customer, seller, administrator, operator, atau provider.
- Telusuri UI, dokumentasi, issue, API, database, dan proses yang sudah berjalan.
- Pisahkan fakta implementasi, pernyataan pemilik, inferensi, dan keputusan yang belum dibuat.
- Catat existing behavior sebelum mengusulkan perubahan.

## Requirement specification
Untuk setiap requirement, tulis:
- ID dan judul;
- problem/user need;
- aktor dan preconditions;
- trigger dan main flow;
- alternate/error flows;
- business rules;
- data yang dibaca/ditulis;
- permission/ownership;
- acceptance criteria yang dapat diamati;
- prioritas dan out-of-scope.

Gunakan user story bila membantu, tetapi jangan menggantikan detail aturan bisnis dengan kalimat generik.

## Scope control
- Bedakan must-have, optional, future idea, dan out-of-scope.
- Jangan menambahkan fitur, role, status, atau kebijakan yang tidak diminta/ditemukan.
- Identifikasi konflik requirement dan minta keputusan jika konflik mengubah hasil bisnis.
- Hindari requirement yang mengunci teknologi sebelum arsitektur diperiksa.

## Acceptance criteria
Kriteria harus dapat diuji melalui UI/API/database behavior, termasuk kondisi gagal dan permission boundaries. Hindari istilah subjektif seperti "lebih cepat", "aman", atau "modern" tanpa ukuran atau definisi.

## Output
Requirement register, user journeys, business rules, acceptance criteria, assumptions/unknowns, dependency map, and decisions required. Jangan mengimplementasikan kode dalam mode requirements/design.

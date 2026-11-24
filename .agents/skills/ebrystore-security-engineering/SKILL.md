---
name: ebrystore-security-engineering
description: Assesses and remediates EBRYSTORE application security gaps including authentication, authorization, IDOR/BOLA, injection, secrets, SSR, database policies, file access, and business logic vulnerabilities.
---

# EBRYSTORE Security Engineering

## Mandat
Temukan dan perbaiki kerentanan yang terbukti. Gunakan defensive security dan hanya uji aset/lingkungan yang diizinkan.

## Threat discovery
Petakan assets (akun, data customer/seller, order, payment, entitlement, admin settings, secrets), actors, trust boundaries, entry points, dan abuse cases.

## Area prioritas
1. Authentication/session: token, cookies, recovery, verification, invalidation.
2. Authorization: RBAC/permissions, ownership, IDOR/BOLA, privilege escalation.
3. Database: RLS, grants, SECURITY DEFINER, service role, storage access.
4. Input/output: SQL injection, XSS, CSRF, SSRF, path traversal, mass assignment, open redirect.
5. Frontend/SSR: secret exposure, unsafe HTML, sensitive serialized data, server/client boundary.
6. API: missing authz, excessive data exposure, rate limits, validation, error disclosure.
7. Commerce: price/order manipulation, webhook forgery/replay, duplicate processing, unauthorized fulfillment/refund.
8. File handling: content validation, size, visibility, ownership, signed URL lifecycle.
9. Admin/seller: privilege boundaries, settings, audit trail, cross-seller isolation.
10. Supply chain/infrastructure: dependency advisories, secret handling, CORS, security headers, CI, exposed management endpoints.

## Validasi temuan
Setiap finding harus memiliki lokasi/simbol/route/policy, bukti alur, precondition, reproduksi aman local/staging, dampak, severity dengan alasan, mitigasi, dan regression test. Bedakan CONFIRMED, SUSPECTED, NOT VERIFIED, BLOCKED. Jangan mengarang CVE/CWE.

## Remediation
Jika diminta memperbaiki: reproduce safely → root cause → minimal patch → preserve authorized access → negative security test → regression test → independent review. Jika audit-only, jangan mengubah file.

## Guardrails
Jangan brute force, DoS, menguji pihak ketiga tanpa izin, atau menyerang production. Jangan mencetak secret. Jangan merotasi credential atau mengubah IAM/firewall/DNS/production tanpa persetujuan. Scanner bersih bukan bukti aplikasi aman.

# API Remediation Plan & Execution Summary

Rencana remediasi 5 tahap yang telah disetujui dan dijalankan terhadap Ebrystore:

1. **Tahap 1 — Hardening Lapisan Database (`20261122100000_security_monitoring_center.sql`):**
   - Menutup celah privilege escalation `super_admin` di trigger `protect_role_changes()`.
   - Mengganti write policy permisif pada `permissions` dan `role_permissions` + trigger `protect_role_permissions_changes()`.
   - Mendaftarkan 6 permission grup `Keamanan` dan membuat tabel `security_events`, `security_event_histories`, dan `security_alerts`.
2. **Tahap 2 — Pipeline Deteksi Event & Perbaikan Server Functions:**
   - Membuat `src/lib/security-event.server.ts` (`generateRequestId`, `sanitizeSecurityMetadata`, `recordSecurityEvent`).
   - Memasang logging pada `authz.server.ts`, `rate-limit.server.ts`, webhooks pembayaran (`shopeepay`, `sumopod`), jobs internal, dan integrasi `jiofarm`.
   - Memperketat `email-admin.functions.ts`, `growth.functions.ts`, `growth-actions.functions.ts`, `campaigns.functions.ts`, `seo-audit.functions.ts`, `inquiries.functions.ts`, `po.functions.ts`, `catalog-api.server.ts`, dan MCP `manage-user-role.ts`.
3. **Tahap 3 — Security Error Pages (401/403/404/429) & Eliminasi Info Leak:**
   - Membuat `src/components/security-error-page.tsx`, memperbarui `src/lib/error-page.ts`, `src/server.ts` (`X-Request-Id`), `src/routes/__root.tsx`, `src/components/admin/admin-ui.tsx`, `src/routes/_authenticated/admin/route.tsx`, `src/routes/see/_dashboard/route.tsx`, serta dialog toast admin.
4. **Tahap 4 — Admin Security Monitoring Center:**
   - Mengembangkan `src/lib/security.functions.ts` dan `src/routes/_authenticated/admin/settings.security.tsx` dengan KPI real-time, filter, Detail Drawer (`Sheet`), workflow investigasi, Security Alerts, dan Postur Database.
5. **Tahap 5 — Verifikasi Otomatis & Dokumentasi:**
   - Menulis `src/lib/__tests__/api-security-monitoring.test.ts`, menjalankan `tsc --noEmit`, `vitest run`, dan `npm run build` produksi.

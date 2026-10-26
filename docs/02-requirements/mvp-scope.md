# MVP Scope & Non-Scope

## In Scope
| Modul | Cakupan |
|---|---|
| Auth | Register, login, logout, forgot/reset password, sesi |
| RBAC | 6 role + permission granular, dicek di server |
| Katalog | Produk digital, kategori, layanan, paket, add-on |
| Checkout | Direct checkout, kalkulasi server-side, kupon dasar |
| Payment | Adapter QRIS (provider TBD) + manual dengan verifikasi finance |
| Webhook | Endpoint publik, signature verification, idempotency, event log |
| Digital delivery | Entitlement, signed URL, kuota 5/365 hari, download log |
| Jasa | Penugasan manual, progres, lampiran, hasil, revisi |
| Aftersales | Komplain, pembatalan, refund parsial + approval |
| Notifikasi | In-app + email, matrix event |
| Dashboard | Customer, Admin, Operator, Finance, Support |
| Audit & Laporan | Audit log, laporan penjualan/order/pembayaran/operator/refund |
| Ops | Migration, backup, health check, monitoring dasar |

## Out of Scope (Post-MVP)
Multi-vendor marketplace, mobile native, escrow, multi-currency, crypto, affiliate bertingkat, AI recommendation, dynamic pricing ML, loyalty kompleks, integrasi akuntansi enterprise, multi-region, white-label, franchise, microservices.

## Post-MVP Roadmap (usulan)
1. Kanal WhatsApp/Telegram + template notifikasi lanjutan.
2. Auto-assignment operator berbasis skill & workload dengan override admin.
3. Payout & komisi operator.
4. Rekonsiliasi terjadwal + laporan keuangan lanjutan.
5. Multi-gateway aktif bersamaan (fallback otomatis).
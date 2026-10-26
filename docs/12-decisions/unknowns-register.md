# Unknowns Register & Decision Log

## Unknowns (tersisa)
| ID | Keputusan | Dampak | Rekomendasi | Pemilik | Status |
|---|---|---|---|---|---|
| U-12 | SLA per kategori jasa | Deadline & alert keterlambatan | Diisi per paket layanan saat Owner membuat katalog | Owner | OPEN (tidak memblokir) |
| U-13 | Nama pemilik akun DANA | Ditampilkan pada instruksi pembayaran | Diisi Owner di Pengaturan Sistem | Owner | OPEN |
| U-14 | Kredensial sandbox Midtrans | Integrasi gateway nyata | Diminta saat modul gateway dibangun | Owner | OPEN |

## Decision Log
| Tanggal | ID | Keputusan | Pemutus |
|---|---|---|---|
| 2026-07-28 | Stack | TanStack Start + Lovable Cloud | Owner |
| 2026-07-28 | U-02 | Direct checkout, tanpa cart penuh di MVP | Owner |
| 2026-07-28 | U-03 | Refund parsial dengan approval admin | Owner |
| 2026-07-28 | U-08 | Entitlement 5 unduhan, 365 hari | Owner |
| 2026-07-28 | U-01 | Payment gateway: Midtrans (via adapter) | Owner |
| 2026-07-28 | U-04 | Jumlah revisi gratis ditentukan per paket layanan | Owner |
| 2026-07-28 | U-05 | Komisi operator: tracking saja di MVP, tanpa payout | Owner |
| 2026-07-28 | U-06 | WhatsApp/Telegram: post-MVP; MVP in-app + email | Owner |
| 2026-07-28 | U-07 | Verifikasi email opsional di MVP | Owner |
| 2026-07-28 | U-09 | Biaya admin dibebankan ke customer, ditampilkan transparan | Owner |
| 2026-07-28 | U-10 | Pembayaran manual hanya DANA 087782462607 | Owner |
| 2026-07-28 | U-11 | Batas ukuran file produk 100 MB | Owner |

## Status Blokir
Tidak ada keputusan yang memblokir Fase Core Development. Integrasi Midtrans nyata tetap berstatus `PARTIALLY_VERIFIED` sampai kredensial sandbox tersedia (U-14) dan seluruh Payment Gate lulus dengan evidence.
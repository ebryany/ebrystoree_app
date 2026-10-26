# Product Brief — Ebrystore

Status: SPECIFICATION_IN_PROGRESS

## Problem Statement
Penjualan produk digital dan jasa joki saat ini dijalankan manual melalui chat: pencatatan order tersebar, verifikasi transfer lambat, pengiriman file dilakukan tangan, dan pelanggan terus bertanya status pengerjaan. Tidak ada audit trail, tidak ada laporan, dan risiko salah kirim atau salah catat tinggi.

## Solusi
Ebrystore: satu platform dengan checkout server-side, pembayaran QRIS gateway + manual terverifikasi, pengiriman produk digital otomatis lewat entitlement dan signed URL, serta siklus pengerjaan jasa yang transparan (penugasan operator, progres, hasil, revisi).

## Business Model
Single-vendor. Pendapatan dari (a) marjin produk digital, (b) tarif paket jasa + add-on. Biaya admin per transaksi bersifat konfigurasi sistem.

## Stakeholder
| Stakeholder | Kepentingan |
|---|---|
| Owner/Founder | Pendapatan, kebijakan, keputusan release |
| Customer | Kecepatan, kejelasan status, keamanan pembayaran |
| Operator | Tugas jelas, deadline, alat upload hasil |
| Finance | Verifikasi pembayaran cepat & akurat |
| Customer Support | Penyelesaian komplain |
| Admin | Operasional harian, penugasan |

## Keputusan Owner yang Sudah Final
| ID | Keputusan | Nilai |
|---|---|---|
| U-02 | Checkout | Direct checkout (tanpa cart penuh) di MVP |
| U-03 | Refund | Parsial + approval admin |
| U-08 | Entitlement | 5 unduhan, masa aktif 365 hari |
| Stack | Runtime | TanStack Start + Lovable Cloud |

## Masih Terbuka
| ID | Keputusan | Status |
|---|---|---|
| U-01 | Payment gateway QRIS | OWNER_ACTION_REQUIRED |
| U-04 | Jumlah revisi gratis | OPEN (default: per paket) |
| U-05 | Komisi operator | OPEN (default: tracking saja) |
| U-06 | Kanal WhatsApp | OPEN (default: post-MVP) |
| U-07 | Verifikasi email | OPEN (default: opsional) |
| U-09 | Biaya admin | OPEN (default: dibebankan, transparan) |
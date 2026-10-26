# Kebijakan Pembayaran Manual

## Kanal Tunggal
| Field | Nilai |
|---|---|
| Metode | DANA (e-wallet) |
| Nomor tujuan | 087782462607 |
| Nama pemilik | *diisi Owner di Pengaturan Sistem (U-13)* |
| Mata uang | IDR |

Nomor tujuan disimpan sebagai **pengaturan sistem** (`system_settings`), bukan hard-code di komponen, sehingga Owner dapat mengubahnya tanpa rilis ulang.

## Aturan
- BR-60: Nominal transfer harus sama persis dengan total order. Selisih apa pun membuat bukti berstatus `needs_review`, bukan otomatis diterima.
- BR-61: Batas waktu pembayaran manual 24 jam sejak order dibuat; lewat itu payment menjadi `expired`.
- BR-62: Bukti transfer wajib berupa gambar (JPG/PNG/WEBP) atau PDF, maksimal 5 MB, disimpan di bucket privat.
- BR-63: Finance dapat menyetujui, menolak (wajib alasan), atau meminta upload ulang. Setiap keputusan menulis `payment_verifications` dan `audit_logs`.
- BR-64: Customer boleh mengunggah ulang maksimal 3 kali per payment.
- BR-65: Nomor DANA tidak pernah ditampilkan kepada guest — hanya pada halaman instruksi pembayaran milik order yang bersangkutan.

## Keputusan Owner Lain yang Difinalkan
| ID | Keputusan |
|---|---|
| U-01 | Gateway QRIS: Midtrans, diimplementasikan lewat Payment Provider Adapter |
| U-04 | Jumlah revisi gratis ditentukan per paket layanan |
| U-05 | Komisi operator hanya dicatat (tracking), tanpa payout di MVP |
| U-06 | Notifikasi MVP: in-app + email; WhatsApp post-MVP |
| U-07 | Verifikasi email opsional |
| U-09 | Biaya admin dibebankan ke customer dan ditampilkan sebagai baris terpisah |
| U-11 | Batas ukuran file produk digital 100 MB |
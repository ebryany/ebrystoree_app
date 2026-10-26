# User Stories & Acceptance Criteria (MVP)

Format: `US-<domain>-<n>`. AC ditulis Given/When/Then dan menjadi dasar test case.

## Auth
**US-AUTH-01** — Sebagai guest saya ingin mendaftar agar dapat memesan.
- AC1: Given email belum terdaftar, When submit form valid, Then akun dibuat dengan role `customer` dan sesi aktif.
- AC2: Given email sudah terdaftar, Then tampil error tanpa membocorkan keberadaan akun secara detail.
- AC3: Password disimpan sebagai hash; tidak pernah muncul di log.

**US-AUTH-02** — Sebagai user saya ingin reset password.
- AC1: Permintaan reset selalu merespons sukses generik (anti user-enumeration).
- AC2: Token reset sekali pakai dan kedaluwarsa.

## Katalog
**US-CAT-01** — Sebagai guest saya ingin melihat katalog produk digital dan layanan.
- AC1: Hanya item berstatus `published` yang tampil bagi guest.
- AC2: Tersedia loading, empty, dan error state.
- AC3: Detail item menampilkan harga final termasuk diskon aktif.

## Checkout & Order
**US-ORD-01** — Sebagai customer saya ingin melakukan checkout.
- AC1: Total dihitung ulang di server; nilai total dari klien diabaikan.
- AC2: Order dibuat dengan status `awaiting_payment` dan nomor order unik.
- AC3: Order jasa wajib menyimpan requirement, catatan, dan lampiran pelanggan.

**US-ORD-02** — Sebagai customer saya hanya boleh melihat order saya sendiri.
- AC1: Akses order milik user lain mengembalikan 404/403, bukan data.

## Payment
**US-PAY-01** — Sebagai customer saya ingin membayar via QRIS.
- AC1: Payment dibuat lewat adapter; instruksi/QR ditampilkan dengan waktu kedaluwarsa.
- AC2: Status pembayaran hanya berubah dari sumber server (webhook/polling), bukan dari klien.

**US-PAY-02** — Sebagai sistem saya harus memproses webhook dengan aman.
- AC1: Signature invalid → 401, tidak ada perubahan data.
- AC2: Event duplikat → diproses sekali; side effect tidak berulang.
- AC3: Nominal/currency tidak cocok → status `needs_review`, bukan `paid`.

**US-PAY-03** — Sebagai customer saya ingin membayar manual dan mengunggah bukti.
- AC1: Upload bukti mengubah status ke `awaiting_manual_verification`.
- AC2: Finance dapat approve, reject, atau minta upload ulang; setiap aksi tercatat di histori verifikasi.

## Produk Digital
**US-DIG-01** — Sebagai customer saya ingin mengunduh produk yang saya beli.
- AC1: Entitlement dibuat hanya setelah payment `paid`.
- AC2: Link unduhan adalah signed URL berdurasi pendek, bukan URL publik permanen.
- AC3: Kuota 5 unduhan dan masa aktif 365 hari ditegakkan di server.
- AC4: User tanpa entitlement mendapat 403 dan percobaan dicatat.

## Jasa
**US-SRV-01** — Sebagai admin saya ingin menugaskan order ke operator.
- AC1: Penugasan hanya untuk order berstatus `paid` atau setelahnya.
- AC2: Perubahan tercatat di `order_status_histories` dan `audit_logs`.

**US-SRV-02** — Sebagai operator saya ingin memperbarui progres.
- AC1: Operator hanya dapat mengubah order yang ditugaskan kepadanya.
- AC2: Setiap update menyimpan persentase, catatan, aktor, dan waktu.

**US-SRV-03** — Sebagai customer saya ingin meminta revisi.
- AC1: Revisi hanya dapat diajukan pada status `awaiting_customer_review`.
- AC2: Jumlah revisi dibatasi sesuai paket; kelebihan ditolak dengan pesan jelas.

## Refund
**US-REF-01** — Sebagai customer saya ingin mengajukan refund.
- AC1: Pengajuan menyimpan alasan dan bukti pendukung.
- AC2: Refund parsial memerlukan approval admin dan nominal ≤ jumlah dibayar.
- AC3: Refund selesai tidak dapat kembali ke `paid` tanpa entri koreksi teraudit.
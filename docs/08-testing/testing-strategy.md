# Testing Strategy & Critical Test Cases

## Piramida
- **Unit:** kalkulasi harga, state machine, kuota entitlement, kuota revisi, mapping status adapter.
- **Integration:** server function + database (RLS aktif) untuk order, payment, penugasan, refund.
- **Contract:** adapter payment terhadap payload sandbox provider.
- **E2E (Playwright):** alur beli produk digital, alur pesan jasa sampai selesai, alur pembayaran manual.
- **Security:** authorization negatif untuk setiap endpoint sensitif.

## Test Case Kritis
| ID | Skenario | Expected |
|---|---|---|
| TC-01 | Customer beli produk digital lalu mengunduh | Entitlement terbit, unduhan berhasil, log tercatat |
| TC-02 | User lain mencoba mengunduh produk itu | 403, tidak ada log unduhan sukses |
| TC-03 | Webhook sukses dikirim dua kali | Payment `paid` sekali, satu entitlement, satu notifikasi |
| TC-04 | Webhook dengan signature salah | 401, tidak ada perubahan data |
| TC-05 | Nominal webhook tidak sesuai | Status `needs_review`, order tidak menjadi paid |
| TC-06 | Pembayaran kedaluwarsa | Payment `expired`, order dapat membuat payment baru |
| TC-07 | Bukti manual disetujui | Payment `paid`, histori verifikasi tercatat |
| TC-08 | Bukti manual ditolak lalu upload ulang | Status berpindah benar, kedua percobaan tersimpan |
| TC-09 | Admin menugaskan operator | Assignment aktif, notifikasi terkirim, audit tercatat |
| TC-10 | Operator lain mencoba update progres | 403 |
| TC-11 | Customer minta revisi melebihi kuota | Ditolak dengan pesan kuota |
| TC-12 | Customer menyetujui hasil | Order `completed`, permintaan ulasan terkirim |
| TC-13 | Refund parsial disetujui admin | Nominal ≤ dibayar, status `completed`, entitlement dicabut bila digital |
| TC-14 | Customer membuka order user lain | 404/403 |
| TC-15 | Upload tipe file terlarang / melebihi batas | Ditolak sebelum disimpan |
| TC-16 | Provider payment down saat createPayment | Error ramah + order tetap `awaiting_payment`, dapat diulang |
| TC-17 | Dua webhook bersamaan (concurrency) | Satu transaksi menang, tidak ada duplikasi side effect |
| TC-18 | Notifikasi gagal | Transaksi bisnis tetap sukses, delivery ditandai gagal dan di-retry |
| TC-19 | Order melewati deadline | Muncul di dashboard order terlambat, alert terkirim |
| TC-20 | Signed URL kedaluwarsa dipakai ulang | Ditolak |

## Traceability
Setiap requirement dipetakan: `Requirement → User Story → AC → Implementasi → Test Case → Hasil → Evidence` di `docs/08-testing/traceability-matrix.md` (diisi saat implementasi). Requirement tanpa test case tidak boleh dinyatakan selesai.
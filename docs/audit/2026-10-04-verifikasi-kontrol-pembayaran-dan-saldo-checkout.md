# Verifikasi: Kontrol Metode Pembayaran + Saldo di Checkout

Tanggal: 2026-10-04 · Status: **SELESAI — VERIFIED**

---

## 1. Masalah yang ditemukan (riset)

### M-1: Saklar metode pembayaran di admin tidak berfungsi

Ada **tiga nama setting berbeda** untuk QRIS, dan **dua di antaranya tidak ada di database**:

| Setting | Ada di DB | Dibaca kode | Muncul di UI admin |
|---|---|---|---|
| `qris_payment_active` | ❌ tidak ada | ✅ | ✅ (tapi tak berpengaruh) |
| `feature_qris` | ❌ tidak ada | ✅ | ✅ (tapi tak berpengaruh) |
| `qris_enabled` | ✅ ada | ❌ tidak dibaca | ❌ tidak terdaftar |
| `feature_manual_payment` | ❌ tidak ada | ✅ | ❌ tidak terdaftar |
| `manual_payment_active` | ✅ ada | ✅ | ✅ |

Akibatnya kode membaca `undefined`, dan `undefined !== false` bernilai **true** → QRIS
selalu dianggap aktif. **Saklar admin tidak berpengaruh sama sekali.**

### M-2: Saldo tidak bisa dipakai saat checkout

`applyCreditToOrder` hanya dipakai di halaman **detail pesanan**. Kedua halaman
checkout (`checkout/produk/$slug`, `checkout/jasa/$id`) tidak menyentuh saldo.

### M-3 (baru, ditemukan saat pengujian): order nyangkut bila saldo menutup penuh

Bila saldo menutup seluruh tagihan (`amount_due = 0`), order tetap `awaiting_payment`
dengan payment `expected_amount = 0`. Pembeli tidak punya cara menyelesaikannya:
QRIS tidak masuk akal untuk tagihan nol, transfer manual juga tidak. Order menggantung.

---

## 2. Perbaikan

| # | Perbaikan | File |
|---|---|---|
| 1 | Helper `loadPaymentMethods()` — satu sumber kebenaran; nama kanonik menang | `src/lib/transaction.server.ts` |
| 2 | `qris_enabled` didaftarkan sebagai saklar kanonik di registry admin | `src/lib/website-settings.ts` |
| 3 | `orders.functions.ts` memakai helper, mengembalikan `manualAvailable` juga | `src/lib/orders.functions.ts` |
| 4 | Halaman pesanan: logika metode mengikuti saklar; pesan jujur bila tidak ada metode | `dashboard.pesanan.$id.tsx` |
| 5 | Komponen `CreditUseOption` (opsi pakai saldo) | `src/components/checkout/credit-use-option.tsx` |
| 6 | Checkout produk digital: opsi saldo + penerapan setelah order dibuat | `checkout.produk.$slug.tsx` |
| 7 | Checkout jasa: opsi saldo + penerapan setelah order dibuat | `checkout.jasa.$id.tsx` |
| 8 | **Auto-lunas**: saldo menutup penuh → order langsung `paid` via jalur settle resmi | migrasi `20261004170000_credit_autopay.sql` |
| 9 | Keamanan: `owner_id` tidak lagi dikirim ke halaman toko publik; diganti `isOwner` dari server | `seller.functions.ts`, `toko.$slug.tsx` |

### Aturan saklar (dokumentasi perilaku)

Nama kanonik yang berlaku bila ada; alias hanya cadangan bila kanonik belum ada.
Ini mencegah keadaan "kanonik false tapi alias true" yang membuat saklar tampak rusak.

- **QRIS** aktif bila: `qris_enabled` true **DAN** kredensial SumoPod tersedia
- **Manual** aktif bila: `manual_payment_active` true **DAN** nomor + pemilik terisi

---

## 3. Bukti pengujian database

### 3.1 Saldo di kedua jenis order (`.zcode/audit-credit-checkout.sql`)

| Skenario | Hasil |
|---|---|
| Saldo uji 10.000 | terpasang |
| Order digital, total 3.500 | saldo dipakai 3.500 → tagihan **0** |
| Order jasa, total 12.500 | saldo dipakai 6.500 → sisa tagihan 6.000 |
| Saldo akhir | 10.000 → **0** (tepat, tidak bocor) |

### 3.2 Auto-lunas saat tagihan nol (`.zcode/credit-full-verify.sql`)

| Uji | Hasil |
|---|---|
| Saldo menutup penuh | order `paid`, payment `paid`, **entitlement terbit (1)** |
| Panggilan ulang | `duplicate: true` — tidak dobel |
| Saldo sebagian (batas 1.000) | order tetap `awaiting_payment`, sisa tagihan benar |

**Sebelum perbaikan:** order tetap `awaiting_payment` dengan `expected_amount 0` (nyangkut).
**Sesudah:** langsung `paid` + entitlement terbit.

### 3.3 Guard pembayaran tetap utuh (tidak ada regresi)

| Uji | Hasil |
|---|---|
| Underpay pada payment fresh | ditolak `AMOUNT_MISMATCH` |
| Overpay | diterima (kebijakan wajar) |
| Settle berulang | `already_settled` |

---

## 4. Test & build

| Cek | Hasil |
|---|---|
| `payment-method-flags.test.ts` (baru) | **6/6 lulus** |
| `public-storefront.test.tsx` | **12/12 lulus** (mock diperbaiki: `createMiddleware`, `createServerFn`) |
| `store-page-public.test.ts` | **lulus** (kebocoran `owner_id` diperbaiki) |
| `npm run test:unit` | 426 lulus / 437; 11 gagal = **baseline lama** `marketplace-home.test.tsx` |
| `npx tsc --noEmit` | 7 error tersisa, semuanya pra-ada (`po-thread.tsx`, `route-fallback.test.tsx`) |
| `npx eslint` file terubah | 0 error |
| `npm run build` | sukses |

---

## 5. Catatan jujur

1. **Uji bayar sungguhan ke SumoPod belum dilakukan** — kredensial tidak ada di `.env`
   lokal. Yang terverifikasi: seluruh logika internal (helper saklar, penerapan saldo,
   auto-lunas) dan jalur simulasi di database.
2. **Kegagalan 11 test** di `marketplace-home.test.tsx` sudah ada **sebelum** pekerjaan
   ini (baseline yang sama sejak awal sesi) dan tidak bertambah.
3. **Alias lama tetap ada** (`qris_payment_active`, `feature_qris`, `feature_manual_payment`)
   untuk kompatibilitas. Nilainya kini **tidak lagi menentukan** selama saklar kanonik
   ada. Bila nanti dibersihkan, pastikan tidak ada kode lain yang membacanya.
4. **Auto-lunas memakai jalur `settle_gateway_payment`** dengan provider `credit` —
   bukan jalur baru, sehingga entitlement/invoice/notifikasi/audit tetap konsisten
   dengan pembayaran biasa.

## 6. Rollback

- Kode: revert file pada tabel bagian 2.
- DB: kembalikan `apply_credit_to_order` ke versi `20260930100005_order_credit_usage.sql`.
- Tanpa data produksi yang terpengaruh (semua uji berjalan dalam `ROLLBACK`).

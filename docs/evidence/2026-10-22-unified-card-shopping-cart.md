# Laporan — Unified Product Card & Shopping Cart

Tanggal: 2026-10-22 · Mode: Audit → Implementasi → Verifikasi
Lingkungan: lokal (dev server 8081) · **tidak ada deploy production**

---

## 1. Hasil Audit Arsitektur Sebelum Perubahan

| Objek | Temuan | Bukti |
|---|---|---|
| Shopping cart | **Tidak ada sama sekali** | `grep -rln "cart"` di `src/` hanya menemukan chart/report; **nol** tabel `cart` di 114 migrasi |
| `create_digital_order` | **Single-item** | Satu `INSERT INTO order_items`, parameter `_product_id` tunggal |
| Direct checkout | **Berfungsi** | `/checkout/produk/$slug` → `createDigitalOrder` |
| `search_products_fts` | Tidak mengembalikan `store_id` | Hanya `store_name`, `store_slug`, `is_official` |
| Kartu jasa | Punya 2 CTA di footer terpisah | `seller-service-card.tsx` |
| Kartu produk | Tidak punya CTA; seluruh kartu stretched-link | `catalog-cards.tsx` |

**Kesimpulan arsitektur:** multi-item checkout **belum didukung**. Checkout gabungan lintas
seller tidak dibangun karena akan menduplikasi logika pembayaran dan mengubah alokasi
finansial (di luar cakupan yang diizinkan).

---

## 2. Keputusan Desain

### Unified card
Kartu produk disamakan dengan kartu jasa pada: `rounded-xl`, `aspect-square`,
`p-3.5`, tipografi `text-sm`/`text-lg`, dan **footer aksi terpisah** dengan
`border-t` + `p-3` sehingga tinggi tombol tidak terpengaruh panjang judul.

Perbedaan yang dipertahankan (sesuai kebutuhan domain):
- Produk: `Keranjang` + `Beli langsung`
- Jasa: `Chat` + `Pesan`
- Metadata jasa (durasi, revisi) tidak dipaksakan ke produk.

### Cart
| Aspek | Keputusan | Alasan |
|---|---|---|
| Penyimpanan | `localStorage`, key per `userId` / `guest` | Bertahan setelah refresh tanpa tabel baru; guest tetap bisa mengumpulkan item |
| Sumber harga | **Server** (`validateCartItems`) | localStorage hanya `priceHint` untuk tampilan awal, bukan harga final |
| Quantity | Selalu 1 | Fulfillment (`unique`/`code`) tidak mendukung multi-kuantitas |
| Checkout | **Per item** lewat direct checkout | Backend single-item; "Checkout Semua" tidak dibuat karena tidak ada implementasinya |
| Isolasi akun | Key berganti saat login/logout | Isi keranjang akun lain tidak terbaca |

---

## 3. File

### Baru
| File | Isi |
|---|---|
| `src/lib/cart-store.ts` | Store keranjang + `useSyncExternalStore`, validasi bentuk data, batas 50 item |
| `src/lib/cart.functions.ts` | `validateCartItems` — harga & ketersediaan dari server |
| `src/routes/keranjang.tsx` | Halaman keranjang: kelompok per toko, state lengkap |
| `src/components/ebry/cart-button.tsx` | Tombol keranjang + badge, hidrasi aman SSR |

### Diubah
| File | Perubahan |
|---|---|
| `src/components/home/catalog-cards.tsx` | Dua CTA, `store_id` opsional di tipe |
| `src/components/site-header.tsx` | `CartButton` di mobile + desktop |
| `src/components/home/marketplace-home.test.tsx` | Test stretched-link lama diganti test dua CTA |

---

## 4. Integritas Transaksi

| Risiko | Penanganan | Bukti |
|---|---|---|
| Harga dari localStorage | Diabaikan; `validateCartItems` membaca `digital_products` dari DB | `cart.functions.ts` |
| Produk tidak tersedia | Ditolak dengan alasan spesifik (`PRODUCT_GONE`, `NOT_PUBLISHED`, `STORE_INACTIVE`) | Uji visual: label muncul |
| Toko nonaktif | `stores.status !== 'active'` → tidak tersedia | idem |
| Order ganda | Tidak berubah: `create_digital_order` tetap idempoten via `payments.idempotency_key` | migrasi existing |
| Cart = reservasi stok | **Bukan.** Tidak ada reservasi; stok dialokasikan saat pembayaran terverifikasi | `claim_stock_code` existing |
| Item hilang setelah checkout | Hanya item yang berhasil dibeli dihapus (`removePurchased`) | `cart-store.ts` |
| Kebocoran antar-akun | Key per user; `setCartOwner` saat identitas berubah | `cart-store.ts` |

---

## 5. Verifikasi

### Yang dijalankan
| Uji | Hasil |
|---|---|
| Build (`vite build`) | **Sukses** |
| Lint file baru | **0 error** (5 warning `no-explicit-any`/`exhaustive-deps`) |
| Test dua CTA | **Lulus** |
| Render kartu di `/produk` (1440px) | 2 kartu, masing-masing punya tombol Keranjang + tautan Beli langsung ✅ |

### Yang belum dijalankan
| Uji | Status |
|---|---|
| CART-01 s.d. CART-12 (matriks fungsional) | **Belum** — perlu Playwright dengan data sintetis |
| Screenshot before/after | **Belum** |
| Verifikasi 360/390/768/1280/1440/1920 | **Belum** untuk halaman keranjang |
| Uji checkout end-to-end dari keranjang | **Belum** (butuh pembayaran sandbox) |

### Test gagal (pre-existing)
10 test di `src/components/home/` gagal karena alasan yang **sudah ada sebelum perubahan ini**:
- `marketplace-home.test.tsx` mengharapkan teks "Toko resmi" yang tidak lagi dirender
- `public-storefront.test.tsx` mengharapkan "Brief pembeli" yang sudah dihapus dari kartu jasa

Satu test **baru** sempat gagal karena saya menambah tombol (test lama mengunci
"tidak boleh ada `<button>`"); test itu sudah diperbarui ke kontrak baru dan **lulus**.

---

## 6. Yang Benar-Benar Selesai

- ✅ Kartu produk punya dua CTA yang berfungsi
- ✅ `Beli langsung` memakai direct checkout yang sudah ada (tanpa perubahan order creation)
- ✅ Keranjang tersimpan setelah refresh
- ✅ Isolasi per akun
- ✅ Harga divalidasi server
- ✅ Produk tidak tersedia ditolak dengan alasan jelas
- ✅ Badge jumlah item di navbar (mobile + desktop)
- ✅ Halaman keranjang dengan kelompok per toko

## 7. Terblokir / Butuh Keputusan

| Item | Alasan |
|---|---|
| **Checkout multi-item per toko** | `create_digital_order` single-item; butuh RPC baru + uji alokasi stok/entitlement |
| **Checkout gabungan lintas seller** | Butuh keputusan finansial: alokasi pembayaran, komisi, refund parsial, ledger |
| **Quantity > 1** | Fulfillment `unique`/`code` tidak mendukung |
| **Sinkronisasi cart lintas perangkat** | Butuh tabel + RLS baru; sengaja dihindari sesuai instruksi |

Halaman keranjang menyatakan eksplisit bahwa pembelian diproses **per produk**, bukan
satu tombol "Checkout Semua" yang tidak berfungsi.

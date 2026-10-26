# Rencana: Redesain Dashboard Desktop (Marketplace Style)

Tanggal: 2026-09-30 · Fokus: **DESKTOP SAJA (lg: 1024px+)**
Aturan mutlak: **mobile harus byte-for-byte tidak berubah**.

---

## 1. Pemahaman Maksud Anda

Membuat dashboard user Ebrystore di **desktop** terasa seperti **dashboard marketplace sungguhan** (referensi: Shopee Seller Center), dengan:
- Header horizontal di atas
- **Sidebar navigasi permanen di kiri** ← ini yang belum ada
- Area konten luas di kanan
- Identitas visual **Ebrystore** (bukan warna Shopee)
- Bersih, profesional, hindari AI-slop (card berlebihan, gradient, shadow besar, ikon dekoratif)

**Mobile tidak disentuh sama sekali.**

---

## 2. Pemetaan Menu → Route Nyata

| Menu diminta | Route Ebrystore | Status |
|---|---|---|
| Dashboard | `/dashboard` | ✅ |
| Profil Saya | `/dashboard/pengaturan` | ✅ |
| Produk Digital | `/dashboard/produk-saya` | ✅ |
| Pesanan | `/dashboard/pesanan` | ✅ |
| Pelanggan | — | ❌ tidak ada |
| Pembayaran | — | ⚠️ hanya di dalam detail pesanan |
| Promo/Voucher | — | ❌ tidak ada |
| Notifikasi | `/dashboard/notifikasi` | ✅ |
| Pengaturan | `/dashboard/pengaturan` | ✅ |

**Penting:** Ebrystore = dashboard **pembeli** (customer). Shopee Seller Center = dashboard **penjual**. Jadi "Pelanggan" & "Promo/Voucher" secara konsep **tidak berlaku** untuk pembeli.

**Adaptasi yang saya usulkan** (menu nyata Ebrystore):
1. **Dashboard** → `/dashboard`
2. **Pesanan** → `/dashboard/pesanan`
3. **Produk Saya** → `/dashboard/produk-saya`
4. **PO Custom** → `/dashboard/po`
5. **Chat Produk** → `/dashboard/chat`
6. **Notifikasi** → `/dashboard/notifikasi` (badge unread)
7. **Profil Saya** → `/dashboard/pengaturan`
8. **Pengaturan** → `/dashboard/pengaturan` (tab berbeda) — *atau digabung ke Profil*

---

## 3. Struktur Layout Desktop

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (SiteHeader — sudah putih+glow)                      │
│  [E] Ebrystore      Produk  Layanan  Artikel      🔔  👤     │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  SIDEBAR     │   KONTEN UTAMA                              │
│  (kiri,      │   (luas, max-w-7xl)                          │
│   sticky)    │                                              │
│              │   ┌────────────────────────────────────┐    │
│  ▸ Dashboard │   │ Halo, Admin 👋                     │    │
│  ▸ Pesanan   │   │ Ringkasan akunmu                   │    │
│  ▸ Produk    │   │ [0 aktif] [0 bayar] [0 produk]     │    │
│  ▸ PO Custom │   │                                    │    │
│  ▸ Chat      │   │ Mau ke mana?  (grid ikon)          │    │
│  ▸ Notifikasi│   │ Pesanan terakhir                   │    │
│  ───────────  │   │ Aktivitas terbaru                  │    │
│  ▸ Profil    │   └────────────────────────────────────┘    │
│  ▸ Pengaturan│                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
   ← 240px →         ← flex-1 (luas) →
```

**Tanpa bottom navigation di desktop.**

---

## 4. Spesifikasi Teknis

### Sidebar
| Aspek | Nilai |
|---|---|
| Lebar | 240px (konsisten dengan admin route) |
| Posisi | `sticky top-24` (di bawah header 64px + jarak) |
| Muncul | `hidden lg:block` — **hanya desktop** |
| Item | Ikon 18px + label 14px, padding `px-3 py-2`, radius `md` |
| Aktif | `bg-surface-selected text-foreground font-semibold` |
| Grup | "Menu" (Dashboard), "Aktivitas" (Pesanan/Produk/PO/Chat), "Akun" (Notifikasi/Profil/Pengaturan) |
| Badge | Unread count di Notifikasi |

### Content
| Aspek | Nilai |
|---|---|
| Lebar | `flex-1`, konten `max-w-5xl` (biar tidak terlalu lebar di 1920px) |
| Grid | Shell: `lg:grid-cols-[240px_minmax(0,1fr)]` |
| Background | `bg-surface` (netral, pemisah dari sidebar) |

### Mobile (TIDAK BERUBAH)
- `BottomNavigation` tetap `md:hidden`
- Tab strip mobile tetap
- Semua kelas mobile dipertahankan
- Sidebar hanya `hidden lg:block` → **tidak muncul sama sekali di mobile**

---

## 5. Cara Aman "Jangan Sentuh Mobile"

Strategi saya:
1. Sidebar dibungkus `hidden lg:block` → **elemen ini tidak dirender di mobile** (tidak ada di DOM mobile)
2. Layout grid `lg:grid-cols-[...]` → mobile tetap 1 kolom (default)
3. **Tidak mengubah** `BottomNavigation`, `SiteHeader`, atau kelas mobile yang ada
4. Setelah selesai, saya bandingkan **height & DOM signature** mobile dengan baseline → harus **identik**

---

## 6. Halaman Profil Desktop

Halaman `/dashboard/pengaturan` di desktop akan menampilkan:
- **Kartu profil** (kiri): foto profil besar + tombol ganti/hapus
- **Form akun** (kanan): username, nama lengkap, email, nomor telepon, nama toko
- **Tombol**: Edit (toggle mode) + Simpan
- Layout 2 kolom desktop yang rapi ala marketplace

⚠️ **Catatan:** field "username" & "nama toko" **belum ada** di database. Saya perlu tanya apakah:
- (a) hanya tampilkan yang sudah ada (nama, email, telepon) — tanpa ubah backend
- (b) tambah field baru (perlu perubahan database)

---

## 7. Keputusan yang Saya Butuhkan

1. **Menu "Pelanggan" & "Promo/Voucher"** — tidak ada di Ebrystore (ini dashboard pembeli). Ganti dengan menu nyata (Produk Saya, PO Custom, Chat)?
2. **Field "username" & "nama toko"** — tambah ke database, atau pakai yang ada saja?
3. **Menu "Profil" & "Pengaturan"** — dua menu terpisah (2 halaman) atau satu halaman dengan tab?

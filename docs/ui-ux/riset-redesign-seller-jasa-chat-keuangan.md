# Riset & Kesimpulan — Redesain 4 Halaman Seller Dashboard

Tanggal: 2026-10-03 · Konteks: Ebrystore seller dashboard (produk digital + jasa)

> **Catatan metode:** Riset berbasis analisis langsung kode yang sedang berjalan + pola desain dashboard SaaS/marketplace modern (Fiverr Seller, Tokopedia Seller Center, Shopee Seller, Stripe Dashboard, Linear). Semua rekomendasi dipetakan ke komponen dan data yang sudah ada di codebase.

---

## 1. Halaman Target & Benchmark Internal

### 1.1 Benchmark: `seller.pesanan.tsx` (sudah redesign ✅)

Halaman pesanan produk digital sudah memenuhi standar modern:

| Fitur | Implementasi |
|---|---|
| Animated pill tabs | `motion.span layoutId` sliding indicator |
| Kartu pesanan | `SellerOrderCard` dengan `motion.article`, expand/collapse |
| Skeleton loading | 3 pulsing card placeholders saat `isPending` |
| Empty state kontekstual | Pesan berbeda per tab, dashed border |
| Count badges | `CountUp` animated number di setiap tab |
| Pagination footer | Total + halaman + tombol Sebelumnya/Berikutnya |
| Realtime refresh | `useRealtimeRefresh` subscribe notifikasi |
| Accessibility | `role="tablist"`, `aria-selected`, `aria-label`, `sr-only` |

### 1.2 Empat halaman yang perlu redesain

| Halaman | File | Kondisi |
|---|---|---|
| `/seller/jasa` | `marketplace-service-catalog.tsx` (384 baris) | ⛔ Paling tertinggal |
| `/seller/jasa-pesanan` | `seller.jasa-pesanan.tsx` (345 baris) | ⛔ Tertinggal |
| `/seller/chat` | `seller.chat.index.tsx` (124 baris) | ⚠️ Cukup, perlu penyeragaman |
| `/seller/keuangan` | `seller.keuangan.tsx` (131 baris) | ⚠️ Cukup, perlu KPI + filter |

---

## 2. Analisis Gap Per Halaman

### 2.1 `/seller/jasa` — Draft Jasa (marketplace-service-catalog.tsx)

**Kondisi saat ini:**
- `<ul>` + `<li>` daftar flat, tidak ada kartu terpisah per item
- Status ditampilkan sebagai teks biasa (`marketplaceServiceStatusLabels[listing.status]`)
- Tidak ada `StatusPill` — padahal komponen ini sudah ada dan maps ke status jasa
- Loading: `<p>Memuat katalog jasa toko…</p>` — teks polos tanpa skeleton
- Error: `<p>` + tombol Muat ulang — tidak pakai `ErrorState`
- Empty: `<p>Belum ada jasa…</p>` — tidak pakai `EmptyState`
- Form inline: `ServiceDraftForm` muncul di tempat tombol "Buat draft jasa" — tidak ada modal/sheet
- Pagination: tombol Sebelumnya/Berikutnya tanpa info total halaman yang jelas
- Tidak ada `motion` animasi sama sekali
- Tidak ada filter/tab per status (draft, submitted, approved, rejected, archived)
- `<details>` + `<summary>` untuk lihat agreement — fungsional tapi visual kurang
- Catatan moderator ditampilkan sebagai teks biasa tanpa highlight

**Gap kritis:**
1. Tidak ada visual hierarchy — semua item terlihat sama pentingnya
2. Tidak ada status visual (warna/ikon) — seller sulit scan status cepat
3. Form muncul inline menggantikan tombol — confusing UX flow
4. Tidak ada skeleton loading — terasa lambat/broken saat fetch

### 2.2 `/seller/jasa-pesanan` — Pesanan Jasa (seller.jasa-pesanan.tsx)

**Kondisi saat ini:**
- `<ul>` + `<li>` daftar flat, mirip halaman jasa
- Expand/collapse dengan state `expanded` — hanya 1 item bisa terbuka
- Status ditampilkan sebagai teks: `ORDER_STATUS_LABEL[row.order_status]` dan `marketplaceServiceWorkStateLabels[row.work_state]`
- Detail pesanan di-fetch terpisah via `getSellerServiceOrder` — bagus
- `SellerOrderDetail` menampilkan agreement, revision counter, delivery list
- `DeliveryForm` dengan radio link/note — fungsional tapi visual minimal
- Loading/error/empty semua teks polos tanpa komponen shared
- Tidak ada tab filter (awaiting_requirements, in_progress, revision_requested, delivered, completed)
- Tidak ada motion animasi
- Tidak ada indikator urgensi (deadline approaching, complaint active)
- Complaint indicator: teks `" · komplain aktif"` — seharusnya warning card

**Gap kritis:**
1. Tidak ada prioritas visual — pesanan yang butuh tindakan (approve requirements, kirim hasil) terlihat sama dengan yang sudah selesai
2. Deadline (`due_at`) ditampilkan sebagai teks biasa — seharusnya ada urgency indicator
3. Complaint active hanya teks — seharusnya `ActionRequiredCard` style warning
4. Delivery history (`detail.deliveries`) ditampilkan sebagai `<li>` teks — tidak ada timeline visual

### 2.3 `/seller/chat` — Chat Pelanggan (seller.chat.index.tsx)

**Kondisi saat ini (relatif baik):**
- Sudah pakai `EmptyState`, `ErrorState`, `StatusPill`, `ChatListItemContent`
- Sudah pakai `useRealtimeRefresh` untuk live update
- Unread badge dari `listInquiryUnreadCounts` — berfungsi
- Filter status dengan `Select` dropdown
- Item chat menggunakan kartu rounded-xl dengan hover effect

**Yang kurang:**
1. Filter menggunakan `Select` dropdown, bukan pill tabs — inkonsisten dengan `seller.pesanan.tsx`
2. Tidak ada skeleton loading — langsung `AdminLoading` (spinner generik)
3. Tidak ada motion animasi saat list berubah
4. Tidak ada unread count per status di filter tabs
5. Tidak ada search/pencarian chat
6. Tidak ada count badge di filter options

### 2.4 `/seller/keuangan` — Saldo & Pendapatan (seller.keuangan.tsx)

**Kondisi saat ini (moderate):**
- Kartu saldo sudah ada: `Wallet` icon + angka besar + held/reserved amounts
- List mutasi menggunakan `BankListRow` — sudah banking-style
- `useRealtimeRefresh` untuk live update
- `InlineEmpty` untuk mutasi kosong

**Yang kurang:**
1. Tidak ada KPI cards (total pendapatan bulan ini, jumlah transaksi, rata-rata per order)
2. Tidak ada filter periode (bulan ini, 7 hari, 30 hari, custom)
3. Tidak ada pagination untuk mutasi — semua dimuat sekaligus
4. Loading menggunakan `AdminLoading` bukan skeleton cards
5. Tidak ada grafik/chart pendapatan sederhana
6. Held amount dan reserved amount tidak ada penjelasan kontekstual (tooltip/info)
7. Tidak ada animasi masuk untuk kartu saldo

---

## 3. Pola Desain yang Harus Diterapkan

Berdasarkan benchmark `seller.pesanan.tsx` dan design direction Ebrystore, setiap halaman harus memiliki:

### 3.1 Struktur Wajib (dari benchmark)

```
┌───────────────────────────────────────────┐
│ HEADER                                    │
│ Judul halaman (text-lg font-bold)         │
│ Deskripsi (text-sm text-muted-foreground) │
│ [Tombol aksi utama]              [Reload] │
├───────────────────────────────────────────┤
│ PILL TABS (scroll horizontal mobile)      │
│ [Tab A (count)] [Tab B (count)] [Semua]   │
│ ← motion.span layoutId sliding indicator  │
├───────────────────────────────────────────┤
│ Tab hint (text-xs text-muted-foreground)  │
├───────────────────────────────────────────┤
│ CONTENT AREA                              │
│ ┌── Loading: CardSkeleton (3 pulsing) ──┐ │
│ ├── Error: ErrorState (destructive)    ──┤ │
│ ├── Empty: EmptyState (dashed border)  ──┤ │
│ └── Data: AnimatePresence + cards      ──┘ │
├───────────────────────────────────────────┤
│ PAGINATION FOOTER                         │
│ "X items · Halaman Y dari Z"   [◀] [▶]  │
└───────────────────────────────────────────┘
```

### 3.2 Komponen Shared yang Sudah Tersedia

| Komponen | File | Gunakan untuk |
|---|---|---|
| `EmptyState` | `ebry/states.tsx` | Daftar kosong (icon + title + desc + action) |
| `ErrorState` | `ebry/states.tsx` | Error fetch (destructive, retry button) |
| `CardSkeleton` | `ebry/states.tsx` | Loading placeholder (pulsing cards) |
| `StatusPill` | `ebry/status.tsx` | Badge status (auto-tone dari string) |
| `BankListRow` | `ebry/cards.tsx` | List item banking-style (icon + title + value) |
| `InlineEmpty` | `ebry/cards.tsx` | Empty state ringkas sebaris |
| `SegmentedFilter` | `ebry/cards.tsx` | Pill tabs filter (sudah ada, belum animated) |
| `ActionRequiredCard` | `ebry/cards.tsx` | Warning card "perlu tindakan" |
| `StatTile` | `ebry/cards.tsx` | KPI stat card (icon + value + label) |

### 3.3 Library Motion yang Harus Dipakai

```typescript
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
```

- `motion.article` untuk card items (fade + slide)
- `motion.span layoutId` untuk sliding tab indicator
- `AnimatePresence mode="popLayout"` untuk list transitions
- `useReducedMotion()` untuk accessibility — skip animasi jika user prefer

### 3.4 Status Mapping Jasa

Status jasa (`marketplace_services.status`) perlu ditambahkan ke `StatusPill` tone mapping:

| Status | Label | Tone |
|---|---|---|
| `draft` | Draft | waiting |
| `submitted` | Menunggu moderasi | progress |
| `approved` | Disetujui | success |
| `rejected` | Ditolak | danger |
| `archived` | Diarsipkan | neutral |

Status work state pesanan jasa (`marketplace_service_orders.work_state`):

| Work State | Label | Tone |
|---|---|---|
| `awaiting_requirements` | Menunggu data pembeli | waiting |
| `in_progress` | Sedang dikerjakan | progress |
| `revision_requested` | Revisi diminta | warning |
| `delivered` | Hasil terkirim | info |
| `completed` | Selesai | success |
| `cancelled` | Dibatalkan | danger |

---

## 4. Rekomendasi Redesain Per Halaman

### 4.1 `/seller/jasa` — Draft Jasa

**Tabs yang diusulkan:**
- Semua draft (count)
- Menunggu moderasi (count — status: submitted)
- Disetujui (count — status: approved)
- Ditolak (count — status: rejected)

**Perubahan arsitektur:**
1. Setiap listing → `motion.article` card terpisah (bukan `<li>` dalam `<ul>`)
2. `StatusPill` di header card — scan cepat
3. `CardSkeleton` saat loading
4. `EmptyState` dengan ikon `FileText` dan aksi "Buat draft jasa"
5. `ErrorState` dengan retry
6. Catatan moderator → `ActionRequiredCard` style (warning banner di dalam card)
7. Agreement → tetap collapsible tapi dengan visual yang lebih baik (border-left accent)
8. Form → pindah ke section terpisah atau dialog/sheet (bukan inline replace)
9. Animated tabs + count badges seperti pesanan
10. Pagination footer dengan total/halaman

**Komponen baru yang diperlukan:**
- `ServiceDraftCard` — kartu jasa draft (mirip `SellerOrderCard`)

### 4.2 `/seller/jasa-pesanan` — Pesanan Jasa

**Tabs yang diusulkan:**
- Perlu tindakan (count — awaiting_requirements + in_progress awal)
- Sedang dikerjakan (count — in_progress)
- Revisi (count — revision_requested)
- Semua (total)

**Perubahan arsitektur:**
1. Setiap pesanan → `motion.article` card dengan `StatusPill` di header
2. Deadline urgency: jika `due_at` < 24 jam → border-warning, teks "Tenggat besok!"
3. Complaint active → `ActionRequiredCard` di dalam card
4. Delivery history → mini timeline vertical (dot + line)
5. `DeliveryForm` → card terpisah di dalam detail (bukan form mentah)
6. Revision counter → badge visual `2/3 revisi`
7. `CardSkeleton` + `EmptyState` + `ErrorState`
8. Animated tabs + count badges
9. `useReducedMotion` untuk accessibility

**Komponen baru yang diperlukan:**
- `ServiceOrderCard` — kartu pesanan jasa (mirip `SellerOrderCard`)

### 4.3 `/seller/chat` — Chat Pelanggan

**Perubahan (minimal — halaman ini sudah cukup baik):**
1. Ganti `Select` dropdown → pill tabs animated (konsisten dengan halaman lain)
2. Tambah unread count per tab: `Terbuka (3)`, `Dijawab (1)`, `Ditutup`
3. `CardSkeleton` saat loading (ganti `AdminLoading`)
4. `AnimatePresence` untuk list items
5. Tambah search input di atas filter (optional, low priority)

### 4.4 `/seller/keuangan` — Saldo & Pendapatan

**Perubahan:**
1. KPI row di atas kartu saldo: 3 `StatTile` (Pendapatan bulan ini, Jumlah transaksi, Rata-rata per pesanan)
2. Kartu saldo → animasi masuk (`motion.section`)
3. Filter periode: pill tabs (7 hari, 30 hari, Bulan ini, Semua)
4. `CardSkeleton` saat loading (ganti `AdminLoading`)
5. Pagination untuk mutasi jika > 20 item
6. Info tooltip untuk held/reserved amounts (ikon `Info` kecil)
7. `AnimatePresence` untuk list mutasi

---

## 5. Hierarki Prioritas Implementasi

| Prioritas | Halaman | Alasan |
|---|---|---|
| 1 | `/seller/jasa` | Paling tertinggal, core feature jasa marketplace |
| 2 | `/seller/jasa-pesanan` | Terkait langsung, seller perlu manage pesanan jasa |
| 3 | `/seller/keuangan` | KPI cards menambah value signifikan |
| 4 | `/seller/chat` | Sudah cukup baik, hanya penyeragaman |

---

## 6. Constraint & Scope

- **Zero backend changes** — semua data sudah tersedia dari server functions yang ada
- **Pakai komponen shared** — `StatusPill`, `EmptyState`, `ErrorState`, `CardSkeleton`, `BankListRow`, `StatTile`, `ActionRequiredCard`
- **Konsisten dengan benchmark** — `seller.pesanan.tsx` adalah standar
- **Mobile-first** — pill tabs scroll horizontal, kartu full-width, min-h-11 touch targets
- **Accessibility** — `useReducedMotion`, `aria-*`, `role`, focus-visible rings
- **Design direction** — Friendly · Fast · Simple · Trustworthy · Mobile-First · Transaction-Focused
- **Tidak menambah dependency baru** — semua library sudah terinstall (motion/react, lucide-react, shadcn/ui)

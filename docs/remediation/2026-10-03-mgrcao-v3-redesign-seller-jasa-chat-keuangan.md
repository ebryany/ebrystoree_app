# MGRCAO V3: Redesain UI/UX 4 Halaman Seller Dashboard

Tanggal: 2026-10-03. Dasar: [riset redesign seller](../ui-ux/riset-redesign-seller-jasa-chat-keuangan.md). Benchmark internal: `seller.pesanan.tsx` (sudah redesain).

## M: Mindset

Ini perubahan murni frontend. Tidak mengubah backend, server function, database, atau API contract. Semua data yang dibutuhkan sudah tersedia dari server function existing. Gunakan komponen shared yang sudah ada (`StatusPill`, `EmptyState`, `ErrorState`, `CardSkeleton`, `BankListRow`, `StatTile`, `ActionRequiredCard`). Standar kualitas = `seller.pesanan.tsx`. Setiap halaman harus konsisten: animated pill tabs, motion cards, skeleton loading, contextual empty states, accessibility attributes. Mobile-first, touch-friendly (min-h-11), scrollable horizontal tabs.

## G: Goals

1. Keempat halaman seller (`/seller/jasa`, `/seller/jasa-pesanan`, `/seller/chat`, `/seller/keuangan`) memiliki kualitas UI/UX setara `seller.pesanan.tsx`.
2. Seller dapat scan status cepat lewat `StatusPill` berwarna di setiap item.
3. Loading/error/empty state menggunakan komponen shared, bukan teks polos.
4. Setiap halaman yang memiliki daftar filterable menggunakan animated pill tabs (bukan Select dropdown).
5. Animasi smooth dengan `motion/react`, respectful terhadap `prefers-reduced-motion`.
6. Seller segera melihat item yang perlu tindakan — visual hierarchy jelas.

## R: Role

Anda adalah senior frontend engineer spesialis UI/UX dashboard marketplace. Anda paham pola desain Fiverr Seller, Tokopedia Seller Center, Shopee Seller, Stripe Dashboard, dan Linear. Anda mengerjakan sendiri tanpa menjalankan agent, server, atau browser-use. Semua perubahan dalam satu scope. Inspeksi source sebelum edit. Anda menulis kode yang konsisten dengan codebase existing — match naming convention, import style, dan komponen yang sudah ada.

## C: Context

### Benchmark `seller.pesanan.tsx`

Halaman pesanan produk digital sudah memiliki pola lengkap:
- Animated pill tabs (`motion.span layoutId="seller-pesanan-tab"`)
- `SellerOrderCard` dengan `motion.article` (fade+slide, staggered delay)
- 3 skeleton placeholder cards saat `isPending`
- Empty state dashed border dengan hint per tab
- `CountUp` animated count badges
- Pagination footer (total + halaman)
- `useRealtimeRefresh` pada notifikasi seller
- `useReducedMotion()` accessibility
- `AnimatePresence mode="popLayout"`

### Komponen shared tersedia

| Komponen | Lokasi |
|---|---|
| `EmptyState` | `src/components/ebry/states.tsx` |
| `ErrorState` | `src/components/ebry/states.tsx` |
| `CardSkeleton` | `src/components/ebry/states.tsx` |
| `StatusPill` | `src/components/ebry/status.tsx` |
| `BankListRow` | `src/components/ebry/cards.tsx` |
| `StatTile` | `src/components/ebry/cards.tsx` |
| `InlineEmpty` | `src/components/ebry/cards.tsx` |
| `ActionRequiredCard` | `src/components/ebry/cards.tsx` |

### Status tone mapping

`StatusPill` auto-maps melalui `statusTone()` di `status.tsx`. Status jasa dan work state yang perlu dikenali:
- `draft`, `submitted` → sudah di-handle (`waiting`/`progress` groups di WAITING/PROGRESS arrays)
- `approved` → ada di SUCCESS
- `rejected` → ada di DANGER
- `archived` → fallback `neutral`
- `awaiting_requirements` → perlu tambah ke WAITING
- `in_progress` → sudah ada di PROGRESS
- `revision_requested` → perlu tambah ke WAITING
- `delivered` → sudah ada di SUCCESS

Tambahkan `awaiting_requirements` dan `revision_requested` ke array WAITING di `status.tsx`.

### Design direction

Friendly · Fast · Simple · Trustworthy · Mobile-First · Transaction-Focused. Satu design system; kepadatan yang berbeda.

### Allowlist

- `src/components/seller/marketplace-service-catalog.tsx` — refactor total
- `src/routes/_authenticated/seller.jasa-pesanan.tsx` — refactor total
- `src/routes/_authenticated/seller.chat.index.tsx` — perubahan moderat
- `src/routes/_authenticated/seller.keuangan.tsx` — perubahan moderat
- `src/components/ebry/status.tsx` — tambah status tones
- `src/components/ebry/states.tsx` — minor jika perlu
- `src/routes/_authenticated/seller.jasa.tsx` — buat route wrapper jika diperlukan
- Dokumen riset dan framework di `docs/`.

Tidak mengubah: server functions, database, migrations, lib/marketplace-service.ts types, routes lain, seller.pesanan.tsx, seller-order-card.tsx, sidebar, atau dependency.

## A: Actions

### A1: Status Tone Update (`status.tsx`)

Tambahkan ke array WAITING:
```
"awaiting_requirements", "revision_requested"
```

Ini membuat `StatusPill` otomatis menampilkan tone kuning (waiting) untuk kedua status tersebut.

### A2: `/seller/jasa` — Draft Jasa (prioritas 1)

Refactor `marketplace-service-catalog.tsx`:

1. **Header**: Judul `text-lg font-bold` + deskripsi + tombol "Buat draft" (primary) + tombol "Muat ulang" (outline).
2. **Tabs**: Animated pill tabs dengan `motion.span layoutId="seller-jasa-tab"`:
   - "Semua" (total count)
   - "Menunggu moderasi" (count status=submitted)
   - "Disetujui" (count status=approved)
   - "Ditolak/Draft" (count status=draft+rejected)
   Tab hint contextual di bawah.
3. **Card per listing**: `motion.article` card terpisah (bukan `<li>` dalam `<ul>` monolith):
   - Header: nama jasa (font-semibold) + `StatusPill` (status)
   - Body: harga + durasi + revisi (tabular-nums)
   - Catatan moderator: `border-l-2 border-warning bg-warning/5 px-3 py-2` jika ada
   - Agreement: collapsible section dengan visual `ChevronDown` rotation
   - Footer: tombol aksi (Edit, Ajukan moderasi, Arsipkan) berdasarkan status
4. **Loading**: `CardSkeleton rows={3}`
5. **Error**: `ErrorState onRetry={refetch}`
6. **Empty**: `EmptyState icon={FileText} title="Belum ada jasa" description="..." action={<Button>Buat draft pertama</Button>}`
7. **Pagination**: Footer dengan total/halaman + tombol navigasi
8. **Form**: `ServiceDraftForm` tetap inline tapi dalam card terpisah (bukan replace tombol), dengan transisi `AnimatePresence`
9. **Motion**: `AnimatePresence mode="popLayout"`, staggered entry `delay: index * 0.04`, `useReducedMotion`
10. **Realtime**: Pertahankan `useRealtimeRefresh` existing

### A3: `/seller/jasa-pesanan` — Pesanan Jasa (prioritas 2)

Refactor `seller.jasa-pesanan.tsx`:

1. **Header**: Judul + deskripsi + link ke Draft Jasa + tombol Muat ulang
2. **Tabs**: Animated pill tabs dengan `motion.span layoutId="seller-jasa-pesanan-tab"`:
   - "Perlu tindakan" (count: awaiting_requirements yang belum approve)
   - "Dikerjakan" (count: in_progress)
   - "Revisi" (count: revision_requested)
   - "Semua" (total)
3. **Card per pesanan**: `motion.article` card:
   - Header: nama jasa (font-semibold) + `StatusPill` (work_state)
   - Meta: nomor order + total + tanggal
   - Urgency: jika `due_at` mendekati (< 24 jam) → border-warning + teks deadline
   - Complaint: `ActionRequiredCard` mini jika `complaint_open`
   - Revision counter: badge `"2/3 revisi"`
   - Expand/collapse detail dengan motion animation
4. **Detail panel (expanded)**:
   - Agreement section
   - Approve requirements button (jika `canStart`)
   - DeliveryForm (jika `canDeliver`)
   - Delivery history: mini timeline (ikon + version + tanggal)
5. **Loading/Error/Empty**: Shared components
6. **Motion**: Sama dengan A2
7. **Realtime**: Pertahankan existing

### A4: `/seller/chat` — Chat Pelanggan (prioritas 4)

Perubahan moderat di `seller.chat.index.tsx`:

1. Ganti `Select` dropdown → animated pill tabs:
   - "Semua" + "Terbuka (count)" + "Dijawab (count)" + "Ditutup (count)"
   - Unread count dari `unreadQ.data` aggregated per status
2. Ganti `AdminLoading` → `CardSkeleton`
3. Tambah `AnimatePresence` pada list items
4. Tambah `useReducedMotion`
5. Pertahankan `ChatListItemContent`, `StatusPill`, `EmptyState`, `ErrorState` yang sudah ada

### A5: `/seller/keuangan` — Saldo & Pendapatan (prioritas 3)

Perubahan moderat di `seller.keuangan.tsx`:

1. **KPI row** (atas): Jika data summary tersedia dari `listSellerLedger`, tampilkan 2-3 `StatTile`:
   - Total pendapatan (sum credit)
   - Jumlah transaksi (count items)
   - (opsional) saldo ditahan
   Jika data tidak tersedia, skip — tidak menambah server function baru.
2. **Kartu saldo**: Tambah `motion.section` entry animation. Tambah info icon (ℹ️) kecil di samping "Ditahan" dan "Cadangan refund" untuk penjelasan.
3. **Filter periode**: Pill tabs jika API mendukung filter. Jika `listSellerLedger` tidak menerima parameter periode, skip — tidak menambah server function.
4. **Loading**: Ganti `AdminLoading` → skeleton (kartu saldo skeleton + list skeleton)
5. **Error**: Pakai `ErrorState`
6. **List mutasi**: Tambah `AnimatePresence`, pertahankan `BankListRow`
7. **Pagination**: Jika items > 20, tambah pagination footer

### A6: Build & Verify

1. Pastikan TypeScript compile tanpa error baru (baseline error count boleh sama)
2. Pastikan lint pass
3. Test existing tetap pass (292 tests)
4. Visual check: buka setiap halaman di browser, verifikasi loading → data → empty → error states

### Acceptance checks

| ID | Kasus | Hasil wajib |
|---|---|---|
| T-01 | `/seller/jasa` loading | CardSkeleton 3 pulsing cards |
| T-02 | `/seller/jasa` empty | EmptyState dengan ikon + CTA "Buat draft" |
| T-03 | `/seller/jasa` data | Cards dengan StatusPill, animated entry |
| T-04 | `/seller/jasa` tabs | Animated sliding indicator, counts |
| T-05 | `/seller/jasa` moderator note | Warning banner di card |
| T-06 | `/seller/jasa` form | Inline card dengan AnimatePresence |
| T-07 | `/seller/jasa-pesanan` loading | CardSkeleton |
| T-08 | `/seller/jasa-pesanan` data | Cards dengan StatusPill + work_state |
| T-09 | `/seller/jasa-pesanan` deadline urgent | Border warning + teks |
| T-10 | `/seller/jasa-pesanan` complaint | ActionRequiredCard style |
| T-11 | `/seller/jasa-pesanan` delivery history | Visual timeline |
| T-12 | `/seller/chat` filter | Pill tabs bukan Select |
| T-13 | `/seller/chat` loading | CardSkeleton bukan AdminLoading |
| T-14 | `/seller/keuangan` loading | Skeleton cards |
| T-15 | `/seller/keuangan` saldo | Motion entry animation |
| T-16 | Semua halaman `prefers-reduced-motion` | Animasi di-skip |
| T-17 | Semua halaman mobile | Tabs scroll horizontal, touch targets min-h-11 |
| T-18 | TypeScript build | Tidak ada error baru |
| T-19 | Existing tests | 292 tests pass |

## O: Outputs

- Empat halaman seller redesigned sesuai benchmark `seller.pesanan.tsx`.
- `StatusPill` tone mapping updated untuk status jasa/work_state.
- Komponen shared digunakan secara konsisten (zero custom loading/error/empty).
- Semua animasi respect `prefers-reduced-motion`.
- Zero perubahan backend, zero dependency baru.
- Rollback: revert 4 file halaman + 1 baris di `status.tsx`. Tidak ada efek samping.

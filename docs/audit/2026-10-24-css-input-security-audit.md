# Ebrystore CSS Architecture & Input Security Audit

Tanggal: 24 Oktober 2026 · Mode: **read-only** · Stack: TanStack Start + React 19 + Tailwind v4 + Radix + Supabase

---

## A. Executive Summary

**CSS:** Arsitektur sehat. `@theme inline` memetakan token semantik dengan benar (oklch konsisten), tidak ada variabel menggantung, `!important` hanya 7 lokasi dengan alasan terdokumentasi. `cn()` (twMerge+clsx) dipakai menyeluruh. Tidak ditemukan konflik cascade yang membuktikan bug visual. Layout: **0 horizontal overflow** di PDP, katalog, keranjang, beranda pada 320–1920px (terverifikasi browser).

**Input security:** Fondasi kuat. Dari 239 server functions, 168 punya Zod validator — dan mayoritas tanpa validator adalah fn GET tanpa parameter. 223 pemakaian `requireSupabaseAuth`. Trust boundary transaksi benar: harga dihitung RPC server, cart hanya kirim UUID, nominal bukti bayar diverifikasi `AMOUNT_MISMATCH` saat settlement, idempotency key di-enforce database. XSS: satu-satunya `dangerouslySetInnerHTML` adalah chart config internal (bukan user data), tes khusus menguncinya.

**Kesimpulan:** tidak ada celah keamanan transaksi yang terbukti. Temuan terbesar justru di konsistensi UX kecil (redirect param salah nama) dan a11y form di luar PDP.

---

## B. CSS Findings Matrix

| ID | Severity | Komponen | Lokasi | Masalah | Root cause | Bukti | Fix proposal | Risiko regresi |
|---|---|---|---|---|---|---|---|---|
| CSS-001 | Low | Button | `styles.css:413` | `rounded-control` butuh `!important` | Konflik `rounded-md` di layer yang sama; urutan utility tidak pasti | Komentar di source menjelaskan | Alternatif: hapus `rounded-md` dari base Button, jadikan varian | Rendah — sentuh semua Button |
| CSS-002 | Low | Sidebar skeleton | `ui/sidebar.tsx:643` | `Math.random()` di render → hydration mismatch potensial | Width random dihitung saat render, server ≠ client | Kode; skeleton tidak terlihat di PDP/katalog | Pindah ke `useEffect` state atau deterministik per index | Rendah — hanya Skeleton |
| CSS-003 | Low | 37 file tsx | tersebar | Template literal className tanpa `cn()` | Pola lama sebelum twMerge; tidak terbukti menimbulkan konflik aktual | grep `className={\`` tanpa cn | Standarisasi bertahap ke `cn()` saat menyentuh file | Sangat rendah |
| CSS-004 | Info | 3 Tabs | admin routes | `defaultValue` dinamis (`canViewServices ? …`) | Bukan bug — Tabs memang uncontrolled; konsisten | Kode | Tidak perlu | — |

**Positive verification:** semua var `--*` yang dipakai di tsx terdefinisi (yang tampak "undefined" seperti `--bg`, `--spread` didefinisikan inline via `style={{"--bg": …}}` di shimmer-button — pola sah). Grid pattern 54px dipakai konsisten di 2 tempat dari sumber sama.

## C. Layout Findings (Audit B, browser-verified)

| ID | Severity | Halaman | Bukti | Status |
|---|---|---|---|---|
| LAY-001 | ✅ None | PDP 320–1920 | 9/9 viewport `scrollWidth ≤ innerWidth` | Bersih |
| LAY-002 | ✅ None | Katalog/Keranjang/Beranda | 3×3 viewport | Bersih |
| LAY-003 | ✅ None | Console PDP | 0 error/warning | Bersih |

## D. Input Security Findings Matrix

| ID | Input | Data flow | Trust boundary | Temuan | Bukti | Impact | Rekomendasi | Status |
|---|---|---|---|---|---|---|---|---|
| INPUT-SEC-001 | Checkout | client → `create_digital_order` RPC | Server RPC hitung harga dari DB, client hanya kirim `product_id`+qty+idem key | **Aman** — tidak ada harga dari client | Migrasi `…d5dbeb52.sql` baris 45–47 | — | Pertahankan | ✅ Verified |
| INPUT-SEC-002 | Cart | localStorage → `validateCartItems` | Server kirim ulang harga/status; localStorage hanya petunjuk | **Aman** — hanya `productIds: uuid[].max(50)` diterima | `cart.functions.ts:9-11` | — | Pertahankan | ✅ Verified |
| INPUT-SEC-003 | Bukti bayar | `amountClaimed` client | RPC menyimpan klaim; **settlement** membandingkan `amount_claimed ≠ expected_amount → AMOUNT_MISMATCH` | **Aman** — klaim tidak pernah dipakai tanpa cek | `…receipt.sql:150`, `…dispatch.sql:122` | — | Pertahankan | ✅ Verified |
| INPUT-SEC-004 | Bukti bayar (file) | signed upload URL | Path dibentuk server `${userId}/${paymentId}/${uuid}`, mime di-whitelist, size ≤ batas | **Aman** | `orders.functions.ts:360-372` | — | Pertahankan | ✅ Verified |
| INPUT-SEC-005 | Review | rating/title/body | Zod `int 1-5`, `max 120/1000`; eligibility via `getMyReviewState` + RPC | **Aman** | `reviews.functions.ts:116-127` | — | Pertahankan | ✅ Verified |
| INPUT-SEC-006 | Redirect | `?next=` di `/auth` | `validateSearch`: harus mulai `/`, tolak `//` | **Aman** — open redirect tertutup | `auth.tsx:34` | — | Pertahankan | ✅ Verified |
| INPUT-SEC-007 | Inquiry dialog | `search: { redirect: "/produk" }` | — | **BUG:** param `redirect` tidak dikenali `validateSearch` (hanya `next`) → return path hilang | `inquiry-dialog.tsx:73` vs `auth.tsx:30-37` | UX: guest kehilangan konteks setelah login | Ganti ke `next: "/produk"` | ✅ Verified |
| INPUT-SEC-008 | 71 server fn tanpa `.validator` | beragam | 223 pemakaian `requireSupabaseAuth` | **Sebagian besar fn GET tanpa param** (mis. `getSecurityOverview`) — bukan celah; fn POST tanpa validator: perlu inventaris lanjutan | grep inventory (239 fn / 168 validator) | Rendah | Audit lanjutan per-fn saat refactor | ⚠️ Partially verified |
| INPUT-SEC-009 | XSS | deskripsi produk/review/chat | React escaping default; **satu** `dangerouslySetInnerHTML` di `ui/chart.tsx` (config chart internal, bukan user data); tes `upload-integrity` mengunci | **Aman** | `chart.tsx:73`, tes | — | Pertahankan | ✅ Verified |
| INPUT-SEC-010 | CSS injection | `style={{}}` dinamis | Satu kasus: `growth/primitives.tsx:166` `width: %` dari data numerik → tidak bisa menyisipkan CSS | **Aman** — nilai numerik coerced | Kode | — | — | ✅ Verified |
| INPUT-SEC-011 | Rate limit | semua fn mutasi | fail-closed finansial (batch sebelumnya) + `enforceRateLimit` di inquiry/chat | **Aman** | `rate-limit.server.ts` | — | — | ✅ Verified |

## E. Accessibility Findings (Audit H)

| ID | Severity | Lokasi | Temuan | Bukti |
|---|---|---|---|---|
| A11Y-001 | ✅ Good | PDP inquiry dialog | `Label htmlFor="inquiry-body"` terpasang; Radix focus management | browser: dialog guest = redirect (bening); source label ada |
| A11Y-002 | ✅ Good | Review form (pasca-perbaikan PDP) | label eksplisit + id, `aria-label` per bintang (`radiogroup`, `${i} bintang`) | `rating.tsx:50-57` |
| A11Y-003 | Medium | **22 <label> di seluruh app vs 171 pemakaian Input/Textarea** | Mayoritas form mengandalkan placeholder/aria implisit; butuh sweep per halaman | grep |
| A11Y-004 | Low | Login/registrasi | sudah pakai label + error text (dicek visual sebelumnya) | browser |

## F. Shared Component Impact Map

| Komponen | Dipakai di | Risiko jika diubah |
|---|---|---|
| `Button` | semua route | tinggi — `rounded-control !important` terkait |
| `MarketplaceProductCard` | beranda, katalog, toko, PDP tidak | sedang — varian `home` vs `default` + `linkStore` |
| `CatalogFilters` | katalog, layanan | sedang |
| `Input/Textarea/Label` | semua form | tinggi — kaitan A11Y-003 |
| `StickyActionBar` | PDP, checkout | rendah |
| `SectionError/Empty/Skeleton` | semua section katalog | rendah |

## G. Remediation Roadmap

**P0 (nyata, kecil):**
1. INPUT-SEC-007 — `inquiry-dialog.tsx:73`: `redirect` → `next` (1 baris).

**P1:**
2. A11Y-003 — sweep label form per halaman (prioritas: checkout, seller onboarding, admin forms).
3. CSS-002 — `Math.random()` skeleton → deterministik.
4. INPUT-SEC-008 — inventaris 71 fn tanpa validator; tambahkan validator untuk POST yang memakai data.

**P2:**
5. CSS-003 — standarisasi `cn()` bertahap.
6. CSS-001 — evaluasi hapus `rounded-md` dari Button base agar `!important` bisa dilepas.

---

## H. Verification Status Summary

| Status | Jumlah |
|---|---|
| ✅ Verified (aman/bersih) | 10 temuan |
| ⚠️ Partially verified | 1 (71 fn tanpa validator) |
| 🐞 Issues found | 1 (redirect param) |
| Blocked | 0 |

**Metode:** grep inventaris + pembacaan migrasi SQL + browser nyata (9 viewport PDP, 3 halaman × 3 viewport, console sweep, dialog a11y). Tidak ada kode yang diubah selama audit.

**Batasan:** tabel/laporan admin tidak diuji interaktif penuh (butuh akun admin); Playwright E2E form tidak dijalankan; uji negative payload hanya statis (baca kode), bukan fuzzing live terhadap produksi.

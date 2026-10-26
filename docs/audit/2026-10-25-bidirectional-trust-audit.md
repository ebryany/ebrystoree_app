# Ebrystore Bidirectional Trust & Browser Data Exposure Security Audit

Tanggal: 25 Oktober 2026 · Mode: **read-only** · Fokus: exposure arah balik (response → browser), SSR payload, cache isolation, entitlement file digital.

Metode: pembacaan source + migrasi SQL, inspeksi SSR payload nyata (`localhost:8081`), uji REST sebagai anon ke tabel/RPC privat. Tidak ada kode atau data yang diubah.

---

## 1. Executive Summary

Model zero-trust Ebrystore **berlaku di kedua arah** pada jalur yang saya uji:

- **Backend tidak percaya frontend** — sudah terbukti kuat di audit sebelumnya dan terkonfirmasi ulang: harga/nominal/ownership semuanya dihitung server.
- **Frontend tidak menelanjangi backend** — SSR payload ke anon bersih: hanya data publik, asset-id gambar, dan email support publik. Tanpa secret, tanpa catatan internal, tanpa data user lain.

Tidak ditemukan P0 (kebocoran terbukti). Satu temuan P1 nyata: **SSR response tidak mengirim `Cache-Control`**, sehingga halaman berisi data user bergantung pada perilaku default CDN. Beberapa P2 berupa over-proyeksi kecil.

---

## 2. Trust Boundary Map (ringkas)

```
Browser ──JSON──▶ Server Function ──Zod──▶ RPC (SECURITY DEFINER) ──▶ RLS/Grant ──▶ Postgres
   ▲                │ auth: requireSupabaseAuth      │ auth: auth.uid() + has_permission
   │                ▼                                 ▼
   └── React ──── SSR payload ◀── serialized response ◀── (proyeksi eksplisit)
```

Kelas data: PUBLIC (katalog, toko, harga) · AUTHORIZED PRIVATE (order milik sendiri, entitlement) · RESTRICTED (ledger, task admin) · SERVER-ONLY SECRET (`SUPABASE_SERVICE_ROLE_KEY` — hanya di `client.server.ts`, bukan bundle client).

---

## 3. Jalur kritis: Product → Cart → Checkout → Payment → Entitlement

| Tahap | Client mengirim | Server memutuskan | Verdict |
|---|---|---|---|
| Cart | `productIds: uuid[].max(50)` | harga/status/stok dikirim ulang server | ✅ |
| Checkout | `product_id`, `qty`, idem key | RPC `create_digital_order`: harga dari DB, duplikat via idem key | ✅ |
| Bukti bayar | `amount_claimed` (klaim) | disimpan sebagai klaim; settlement bandingkan `expected_amount` → `AMOUNT_MISMATCH` | ✅ |
| **Download** | `entitlementId: uuid` | RPC `consume_download`: `user_id = auth.uid()`, tolak `REVOKED/EXPIRED/LIMIT_REACHED`, catat `download_logs`, baru lepas `storage_path` → signed URL 5 menit | ✅ |
| Notifikasi | — | `eq("user_id", userId)` di query | ✅ |

**Entitlement adalah temuan positif utama audit ini**: kuota unduh dan masa akses ditegakkan di database, bukan di UI. Signed URL short-lived; file berbayar tidak pernah dikirim di response katalog.

## 4. Browser-Visible Sensitive Data Matrix (SSR PDP ke anon, diuji nyata)

| Item terlihat di payload | Klasifikasi | Diisyaratkan UI | Risiko |
|---|---|---|---|
| Nama/harga/deskripsi produk | PUBLIC | Ya | — |
| UUID toko & produk | PUBLIC | Ya (routing, img src) | — |
| UUID asset gambar branding (`/api/public/catalog-image/...`) | PUBLIC | Ya (preload) | — |
| `halo@ebrystore.id` | PUBLIC (support) | Ya | — |
| Marker stream TanStack (`$R`, `$_TSR`) | mekanisme SSR | Ya | — |
| Secret/service key | **tidak ada** | — | ✅ |
| `storage_path` / stock code / catatan moderasi | **tidak ada** | — | ✅ |
| Email user lain / saldo orang lain | **tidak ada** | — | ✅ |

## 5. Temuan

### TRUST-001 — P1 · SSR tanpa `Cache-Control`
- **Endpoint:** semua route SSR (diverifikasi: header PDP hanya CSP dst., tanpa `cache-control`).
- **Root cause:** `applySecurityHeaders` di `src/server.ts` menyetel CSP/HSTS/dst. tapi tidak `Cache-Control`.
- **Bukti:** `curl -D -` pada `localhost:8081/produk` — tidak ada `cache-control`.
- **Dampak:** platform CDN (Cloudflare/Lovable) boleh menyimpan HTML sesuai default. Halaman auth-only (dashboard/order) yang kebetulan ter-cache bisa menampilkan data user lain kepada hit berikutnya. Probabilitas rendah (umumnya CDN tidak menyimpan HTML tanpa instruksi), tapi konsekuensinya cross-user.
- **Fix minimal:** di `applySecurityHeaders`, untuk `text/html` selalu set `Cache-Control: private, no-store` (atau `public, max-age=0, must-revalidate` untuk route publik).
- **Status:** ✅ Verified (header hilang terbukti; perilaku CDN spesifik belum bisa diuji dari sini → itu bagian "not verified").

### TRUST-002 — P2 · `select("*")` di admin order detail
- **Endpoint:** `getOrderDetail` (`admin-transaction.functions.ts`) — 15 tabel `select("*")`.
- **Mitigasi eksisting:** dibungkus `guard(context, "orders.view")` → `assertPermission`; RLS `orders_select_staff` juga berlaku.
- **Risiko sisa:** perubahan schema di masa depan otomatis menambah field ke response admin tanpa review; bukan kebocoran hari ini.
- **Fix minimal:** proyeksikan kolom eksplisit bertahap saat file disentuh.
- **Status:** ✅ Verified aman dengan catatan.

### TRUST-003 — P2 · Entitlement list mengirim join tanpa proyeksi batin
- `listMyProducts` mengembalikan `digital_products(name, thumbnail_url, slug, delivery_mode)` — sudah sempit, **aman**. Dicatat sebagai contoh pola yang benar (bukan temuan).

### TRUST-004 — Info · RLS ganda terkonfirmasi dari migrasi
- `orders_select_own (user_id = auth.uid())` + `orders_select_staff (has_permission)`.
- `entitlements_select_own` + staff.
- Uji nyata anon: `orders/entitlements/seller_ledger` → **401/42501**; `rpc consume_download` & `create_digital_order` → `permission denied for function`.
- Status: ✅ Verified (level anon). Uji authenticated cross-user memakai baseline audit 23 Okt (sudah lolos) — tidak diulang karena `_sess.json` tak lagi tersedia.

### TRUST-005 — P2 · Cache isolation login ganda
- Logout: `cancelQueries()` → `queryClient.clear()` → `signOut()` (site-header, dashboard, admin route). Query key menyertakan `user?.id` untuk data per-user (mis. review state). Tidak ada `persistQueryClient` ke storage.
- Skenario A logout → B login: cache A terhapus sebelum sesi berganti. **✅ Verified dari kode**; simulasi dua-akun live belum dijalankan (butuh dua sesi).

### TRUST-006 — Info · Session di localStorage
- Supabase menyimpan sesi di localStorage (via `previewAuthStorage` pada preview). Ini konsekuensi arsitektur Supabase client-side dan **bukan** kebocoran: token hanya milik user itu. Pendampingan yang tepat adalah yang sudah ada (CSP ketat, tanpa `eval`, XSS surface minim — `dangerouslySetInnerHTML` hanya chart config internal).

## 6. Frontend response handling (arah balik)

- Tidak ada parsing Zod ganda di client untuk setiap komponen — **proporsional** untuk stack ini, karena response dibentuk oleh server function sendiri (bukan API pihak ketiga).
- Rendering aman: deskripsi/review/chat dirender sebagai teks (`whitespace-pre-line`), bukan HTML. Tidak ada jalur markdown/richtext ke HTML.
- URL dinamis (`Link to=/toko/$slug`, dsb.) berasal dari kolom slug DB, bukan input bebas; tidak ada `window.open` ke URL user kecuali hasil server (`result.url` dari checkout/pembayaran provider).
- `formatRupiah`/`Number()` defensif di kartu harga (NaN/Infinity sudah ditangani — teruji oleh test harga invalid yang lulus).

## 7. Root Cause Matrix (temuan saja)

| ID | Root cause | Kelas |
|---|---|---|
| TRUST-001 | Security header middleware tidak menyertakan cache directive | Kebijakan header |
| TRUST-002 | Pola `select(*)` mengikuti schema dinamis | Kontrak response |
| TRUST-005 | (positif) clear-cache terpusat di 5 titik | — |

## 8. Remediation Roadmap (menunggu persetujuan)

**P1**
1. TRUST-001: tambah `Cache-Control: private, no-store` untuk HTML auth-only, dan `public, max-age=0, must-revalidate` untuk HTML publik — satu lokasi (`applySecurityHeaders`).

**P2**
2. TRUST-002: proyeksi eksplisit bertahap di `admin-transaction.functions.ts`.
3. TRUST-005: tambahkan satu test unit yang mengunci "clear dipanggil sebelum signOut" agar pola tidak hilang saat refactor.

**P0:** tidak ada.

## 9. Regression Test Plan (usulan)
1. Header: assert `cache-control` ada di response HTML (unit, server.ts).
2. Anon matrix: 401 pada orders/entitlements/ledger/rpc (sudah ada gaya test di `security-*`).
3. Entitlement: consume dua kali melewati limit → `LIMIT_REACHED` (RPC test).
4. Logout: `queryClient.clear()` dieksekusi sebelum `signOut` (unit mock).

## 10. Belum diverifikasi
- Perilaku cache CDN aktual Lovable/Cloudflare pada HTML tanpa `Cache-Control` (butuh akses dashboard CDN).
- Simulasi live dua akun bergantian di satu browser (butuh dua kredensial sesi).
- Uji authenticated seller/admin ulang (menggunakan baseline audit 23 Okt 2026; sesi uji tidak lagi tersedia).
- Signed URL Supabase di luar masa 5 menit (perilaku provider).

## 11. Referensi
OWASP API Security Top 10 (API3:2019 Over-exposure, API5 Broken Function Level Auth) · OWASP Web Security Testing Guide 4.2 (4.1.1, 4.2.4 caching) · Dokumentasi TanStack Start (server functions, hydration) · Supabase (RLS, signed URL, auth storage).

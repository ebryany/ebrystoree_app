# Security Error Page Specification

Spesifikasi UX & keamanan halaman error keamanan Ebrystore untuk navigasi HTML dan respons JSON API.

## 1. Status Code Mapping
- **`401 Unauthorized` — Sesi Diperlukan:** Ditampilkan saat mengakses halaman/endpoint terautentikasi tanpa sesi valid. Aksi utama: `Masuk ke Akun` (hanya menerima `returnTo` internal yang lolos `safeInternalPath` anti-open-redirect), `Kembali ke Beranda`, `Pusat Bantuan`.
- **`403 Forbidden` — Akses Dibatasi:** Ditampilkan saat user terautentikasi tidak berhak membuka halaman/resource (`/admin/*`, `/see/*`, `ForbiddenState`). Aksi utama: `Kembali ke Beranda` / `Kembali ke Akun Saya`, `Pusat Bantuan`.
- **`404 Not Found` — Halaman Tidak Ditemukan:** Digunakan pada `NotFoundComponent` di `src/routes/__root.tsx`. Mencegah konfirmasi keberadaan endpoint sensitif internal.
- **`429 Too Many Requests` — Terlalu Banyak Permintaan:** Ditampilkan saat batas frekuensi permintaan terlampaui.
- **`500 Internal Server Error` — Kendala Sementara:** Halaman fallback SSR/server (`src/lib/error-page.ts`).

## 2. Kebijakan Zero Information Leakage
- **Dilarang keras** menampilkan nama internal permission (`admin.dashboard.view`, `settings.manage`, dll.), stack trace, query SQL, environment variable, atau pesan error internal database ke DOM/HTML atau JSON publik.
- Seluruh input dinamis pada `renderErrorPage()` disanitasi melalui `escapeHtml()`.

## 3. Request Reference ID & Konten Wajib
- Setiap respons server memuat header HTTP `X-Request-Id: ebry-<timestamp36>-<hex8>`.
- Halaman error menampilkan **Kode Referensi (`requestId`)** dan **Waktu Kejadian** beserta tombol salin (`aria-label="Salin kode referensi"`) agar pengguna sah dapat melaporkan insiden ke admin tanpa membocorkan konteks internal.
- Permintaan ke `/api/*`, `/mcp`, atau `/_serverFn` tidak pernah menerima HTML stack trace, melainkan JSON terstruktur `{ ok: false, error: { code, message, requestId, status } }`.

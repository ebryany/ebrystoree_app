export type ErrorPageOptions = {
  status?: 401 | 403 | 404 | 429 | 500;
  title?: string;
  description?: string;
  requestId?: string;
};

const DEFAULTS: Record<401 | 403 | 404 | 429 | 500, { title: string; description: string }> = {
  401: {
    title: "Sesi Diperlukan untuk Melanjutkan",
    description: "Silakan masuk terlebih dahulu ke akun Ebrystore Anda untuk mengakses halaman ini.",
  },
  403: {
    title: "Akses ke Halaman Ini Dibatasi",
    description: "Akun Anda belum memiliki hak akses untuk membuka halaman atau resource ini.",
  },
  404: {
    title: "Halaman tidak ditemukan",
    description: "Tautan yang Anda buka mungkin keliru atau halaman sudah tidak tersedia.",
  },
  429: {
    title: "Terlalu Banyak Permintaan",
    description: "Silakan tunggu beberapa saat sebelum mencoba mengakses layanan kembali.",
  },
  500: {
    title: "Halaman belum dapat dimuat",
    description: "Muat ulang halaman untuk mencoba lagi, atau kembali ke beranda.",
  },
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderErrorPage(options: ErrorPageOptions = {}): string {
  const status = options.status ?? 500;
  const fallback = DEFAULTS[status];
  const title = escapeHtml(options.title ?? fallback.title);
  const description = escapeHtml(options.description ?? fallback.description);
  const requestId = options.requestId ? escapeHtml(options.requestId) : null;
  const timestamp = escapeHtml(new Date().toISOString());

  if (status === 404) {
    const visualHeading = options.title ? escapeHtml(options.title) : "Halaman tidak ditemukan.";
    const visualDescription = options.description
      ? escapeHtml(options.description)
      : "Halaman yang Anda cari tidak tersedia atau tautan yang Anda masukkan keliru.";

    return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>${title} | Ebrystore</title>
    <meta name="robots" content="noindex" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font: 16px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f8; color: #161e2e; display: flex; flex-direction: column; min-height: 100vh; margin: 0; }
      .visually-hidden:where(:not(:focus-within, :active)) { position: absolute !important; clip-path: inset(50%) !important; overflow: hidden !important; width: 1px !important; height: 1px !important; margin: -1px !important; padding: 0 !important; border: 0 !important; white-space: nowrap !important; }
      .nav { background: #ffffff; border-bottom: 1px solid #e2e8f0; }
      .nav-inner { max-width: 72rem; margin: 0 auto; padding: 0 1.25rem; min-height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .brand { font-size: 1.0625rem; font-weight: 800; color: #161e2e; text-decoration: none; letter-spacing: -0.02em; }
      .nav-links { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; font-size: 0.875rem; font-weight: 500; }
      .nav-links a { color: #475569; text-decoration: none; padding: 0.375rem 0.25rem; }
      .nav-links a:hover { color: #161e2e; }
      main { flex: 1; display: grid; place-items: center; padding: 3rem 1.5rem; }
      .wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5rem; max-width: 48rem; width: 100%; }
      @media (min-width: 768px) { .wrap { flex-direction: row; gap: 4rem; } }
      .art { width: min(17.5rem, 72vw); height: auto; flex-shrink: 0; color: #111827; }
      .copy { max-width: 22rem; text-align: left; }
      h1 { margin: 0; font-size: clamp(3rem, 6vw, 4rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1; color: #161e2e; }
      h2 { margin: 0.75rem 0 0; font-size: 1.375rem; font-weight: 700; line-height: 1.3; color: #161e2e; }
      p { margin: 0.625rem 0 0; font-size: 0.96875rem; line-height: 1.55; color: #525d68; }
      .back-link { margin-top: 1.25rem; display: inline-flex; align-items: center; gap: 0.25rem; min-height: 44px; font-size: 0.9375rem; font-weight: 600; color: #2563eb; text-decoration: none; }
      .back-link:hover { text-decoration: underline; color: #1d4ed8; }
      .back-link:focus-visible, .nav a:focus-visible, .foot a:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; border-radius: 0.25rem; }
      .ref { margin-top: 1rem; font-size: 0.75rem; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .foot { background: #ffffff; border-top: 1px solid #e2e8f0; padding: 1.25rem; font-size: 0.8125rem; color: #64748b; }
      .foot-inner { max-width: 72rem; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
      .foot a { color: #475569; text-decoration: none; }
      .foot a:hover { color: #161e2e; text-decoration: underline; }
    </style>
  </head>
  <body>
    <header class="nav">
      <div class="nav-inner">
        <a class="brand" href="/">Ebrystore</a>
        <nav class="nav-links" aria-label="Navigasi utama">
          <a href="/produk">Produk</a>
          <a href="/layanan">Layanan</a>
          <a href="/artikel">Artikel</a>
          <a href="/bantuan">Bantuan</a>
        </nav>
      </div>
    </header>
    <main>
      <div class="wrap">
        <span class="visually-hidden">404 · Ebrystore Security</span>
        <svg class="art" viewBox="0 0 320 250" fill="none" aria-hidden="true" focusable="false">
          <path d="M 38 222 C 36 211 44 202 53 204 C 55 191 66 185 74 193 C 80 183 92 185 96 197 L 96 222 Z" fill="currentColor" />
          <path d="M 212 190 C 222 179 238 183 242 196 C 252 193 263 201 262 213 C 266 215 268 219 266 222 L 212 222 Z" fill="currentColor" />
          <path d="M 24 222 L 95 222 M 248 222 L 274 222 M 282 222 L 288 222 M 297 222 L 310 222" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
          <path d="M 164 221 L 252 219 C 261 219 266 221 264 224 C 260 227 246 228 224 228 L 164 226 Z" fill="currentColor" />
          <path d="M 73 64 Q 80 73 86 81 M 64 95 L 78 96 M 62 120 Q 72 114 82 109" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
          <path d="M 122 28 Q 160 27 198 30 L 196 42 Q 158 41 120 41 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 120 41 L 196 42 L 168 79 Q 130 78 93 77 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 196 42 L 218 75 L 168 79 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 195 45 L 213 72 L 193 62 L 173 75 Z" fill="currentColor" />
          <path d="M 93 77 Q 130 78 168 79 L 168 87 Q 130 86 91 85 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 168 79 L 218 75 L 220 83 L 168 87 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 91 85 Q 130 86 168 87 L 166 221 Q 128 222 92 221 Q 91 153 91 85 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 168 87 L 220 83 L 215 220 L 166 221 Z" fill="#ffffff" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 128 60 C 128 70 154 74 157 60 L 156 56 L 129 56 Z" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
          <ellipse cx="143" cy="56" rx="14.5" ry="13.5" fill="#ffffff" stroke="currentColor" stroke-width="3.5" />
          <path d="M 104 114 Q 129 113 153 113 Q 154 136 154 158 Q 129 159 104 158 Q 104 136 104 114 Z" fill="#ffffff" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
          <path d="M 114 129 L 120 135 M 120 129 L 114 135 M 138 127 L 144 133 M 144 127 L 138 133" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" />
          <path d="M 112 149 Q 115.5 144 119 148 T 126 148 T 133 148 T 140 148 L 145 147" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 104 176 L 142 176 M 104 190 L 131 190" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" />
          <path d="M 203 151 Q 202 180 201 206" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" />
        </svg>
        <div class="copy">
          <h1><span class="visually-hidden">Error </span>404</h1>
          <h2>${visualHeading}</h2>
          <p>${visualDescription}</p>
          <a class="back-link" href="/">Kembali ke beranda <span aria-hidden="true">&#8250;</span></a>
          ${requestId ? `<div class="ref">Kode Referensi: ${requestId} · ${timestamp}</div>` : ""}
        </div>
      </div>
    </main>
    <footer class="foot">
      <div class="foot-inner">
        <span>Ebrystore — Marketplace Produk Digital & Jasa</span>
        <nav class="nav-links" aria-label="Tautan bantuan">
          <a href="/">Beranda</a>
          <a href="/bantuan">Pusat Bantuan</a>
        </nav>
      </div>
    </footer>
  </body>
</html>`;
  }

  const primaryAction =
    status === 401
      ? `<a class="primary" href="/auth">Masuk ke Akun</a>`
      : status === 403
        ? `<a class="primary" href="/">Kembali ke Beranda</a>`
        : `<button type="button" class="primary" onclick="location.reload()">Muat ulang halaman</button>`;

  const secondaryAction =
    status === 403
      ? `<a class="secondary" href="/bantuan">Pusat Bantuan</a>`
      : `<a class="secondary" href="/">Kembali ke beranda</a>`;

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>${title} | Ebrystore</title>
    <meta name="robots" content="noindex" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7f8; color: #0f172a; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 30rem; width: 100%; background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 2rem; text-align: center; box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.08); }
      .badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.75rem; border-radius: 9999px; background: #f1f5f9; border: 1px solid #e2e8f0; font-size: 0.75rem; font-weight: 600; color: #334155; }
      h1 { font-size: 1.25rem; margin: 1rem 0 0.5rem; color: #0f172a; }
      p { color: #475569; margin: 0 0 1.25rem; font-size: 0.9375rem; }
      .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 0.75rem 1rem; margin: 0 0 1.5rem; text-align: left; font-size: 0.75rem; color: #475569; }
      .meta code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #0f172a; word-break: break-all; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0.5rem 1rem; border-radius: 0.5rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      a:focus-visible, button:focus-visible { outline: 2px solid #0f8f86; outline-offset: 3px; }
      .primary { background: #0f172a; color: #fff; }
      .secondary { background: #fff; color: #0f172a; border-color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">${status} · Ebrystore Security</div>
      <div role="alert">
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      <div class="meta">
        ${requestId ? `<div>Kode Referensi: <code>${requestId}</code></div>` : ""}
        <div>Waktu: <code>${timestamp}</code></div>
      </div>
      <div class="actions">
        ${primaryAction}
        ${secondaryAction}
      </div>
    </main>
  </body>
</html>`;
}

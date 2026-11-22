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

  const primaryAction =
    status === 401
      ? `<a class="primary" href="/auth">Masuk ke Akun</a>`
      : status === 403 || status === 404
        ? `<a class="primary" href="/">Kembali ke Beranda</a>`
        : `<button type="button" class="primary" onclick="location.reload()">Muat ulang halaman</button>`;

  const secondaryAction =
    status === 403 || status === 404
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

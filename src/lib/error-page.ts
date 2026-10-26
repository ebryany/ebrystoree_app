export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Halaman belum dapat dimuat | Ebrystore</title>
    <meta name="robots" content="noindex" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      a:focus-visible, button:focus-visible { outline: 2px solid #111; outline-offset: 3px; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #111; }
    </style>
  </head>
  <body>
    <main class="card">
      <div role="alert">
        <h1>Halaman belum dapat dimuat</h1>
        <p>Muat ulang halaman untuk mencoba lagi, atau kembali ke beranda.</p>
      </div>
      <div class="actions">
        <button type="button" class="primary" onclick="location.reload()">Muat ulang halaman</button>
        <a class="secondary" href="/">Kembali ke beranda</a>
      </div>
    </main>
  </body>
</html>`;
}

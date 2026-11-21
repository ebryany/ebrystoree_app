/**
 * Mock Supabase PostgREST/RPC terisolasi untuk load testing lokal.
 *
 * Tujuan:
 * - Menjaga database Supabase produksi 100% aman dari beban load test.
 * - Mensimulasikan latensi jaringan + eksekusi query realistis (default 15ms).
 * - Menghitung total query DB, peak concurrent DB requests, dan distribusi per tabel/RPC.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || "54329");
const DB_LATENCY_MS = Number(process.env.MOCK_DB_LATENCY_MS || "15");

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const CAT_PROD_ID = "22222222-2222-4222-8222-222222222222";
const CAT_SVC_ID = "33333333-3333-4333-8333-333333333333";

const PRODUCTS = Array.from({ length: 12 }, (_, i) => ({
  id: `44444444-4444-4444-8444-4444444444${String(i).padStart(2, "0")}`,
  name: i === 0 ? "ChatGPT Plus 1 Bulan" : `Produk Digital Contoh ${i + 1}`,
  slug: i === 0 ? "chatgpt-plus-1-bulan" : `produk-digital-${i + 1}`,
  short_description: "Akses instan produk digital terverifikasi untuk kebutuhan kerja dan studi.",
  description: "Deskripsi lengkap produk digital pengujian performa.",
  thumbnail_url: null,
  price: 45000 + i * 5000,
  discount_price: i % 2 === 0 ? 39000 + i * 5000 : null,
  sold_count: 15 + i * 3,
  delivery_mode: "shared",
  code_kind: null,
  available_stock: 50,
  usage_notes: null,
  version: "1.0",
  download_limit: 5,
  validity_days: 30,
  category_id: CAT_PROD_ID,
  store_id: STORE_ID,
  stores: { name: "Ebrystore Official", slug: "ebrystore-official", logo_url: null, is_platform: true },
  categories: { name: "Akun AI Premium", slug: "akun-ai-premium" },
  product_variants: [],
  store_name: "Ebrystore Official",
  store_slug: "ebrystore-official",
  is_official: true,
  rank: 1,
}));

const CATEGORIES_PROD = [
  { id: CAT_PROD_ID, name: "Akun AI Premium", slug: "akun-ai-premium", icon: "bot", tone: "green", image_url: null },
  { id: "22222222-2222-4222-8222-222222222223", name: "Template", slug: "template", icon: "palette", tone: "red", image_url: null },
];

const CATEGORIES_SVC = [
  { id: CAT_SVC_ID, name: "Pemrograman Akademik", slug: "pemrograman-akademik", icon: "code", tone: "green", image_url: null },
  { id: "33333333-3333-4333-8333-333333333334", name: "Presentasi", slug: "presentasi", icon: "presentation", tone: "amber", image_url: null },
];

const MARKETPLACE_SERVICES = Array.from({ length: 6 }, (_, i) => ({
  id: `55555555-5555-4555-8555-5555555555${String(i).padStart(2, "0")}`,
  name: `Jasa Digital Profesional ${i + 1}`,
  price: 120000 + i * 25000,
  agreement: {
    scope: "Pengerjaan sesuai brief tertulis",
    exclusions: "Biaya domain & hosting eksternal",
    deliverable: "File final siap pakai",
    requirements: "Brief dan referensi utama",
    durationDays: 3,
    revisionLimit: 2,
  },
  media: [],
  store: { id: STORE_ID, name: "Ebrystore Official", slug: "ebrystore-official", logo_url: null },
  category: { name: "Pemrograman Akademik", slug: "pemrograman-akademik" },
}));

const PLATFORM_SERVICES = [
  {
    id: "66666666-6666-4666-8666-666666666601",
    name: "Pendampingan Proyek IT",
    slug: "pendampingan-proyek-it",
    short_description: "Pendampingan teknis terstruktur bersama tim.",
    thumbnail_url: null,
    category: { slug: "pemrograman-akademik", name: "Pemrograman Akademik" },
    service_packages: [
      { id: "77777777-7777-4777-8777-777777777701", name: "Reguler", price: 150000, estimated_days: 3, free_revisions: 2, is_active: true },
    ],
  },
];

const SETTINGS = [
  { key: "store_name", value: "Ebrystore", updated_at: "2026-11-21T00:00:00Z" },
  { key: "site_maintenance_mode", value: false, updated_at: "2026-11-21T00:00:00Z" },
  { key: "storefront_show_products", value: true, updated_at: "2026-11-21T00:00:00Z" },
  { key: "storefront_show_services", value: true, updated_at: "2026-11-21T00:00:00Z" },
];

const STORE_PRESENCE = [
  { store_id: STORE_ID, last_seen_at: new Date().toISOString(), online: true, stores: { is_platform: true } },
];

const REVIEWS = [
  { store_id: STORE_ID, rating: 5 },
  { store_id: STORE_ID, rating: 5 },
  { store_id: STORE_ID, rating: 4 },
];

const STORE_ROW = {
  id: STORE_ID,
  name: "Ebrystore Official",
  slug: "ebrystore-official",
  is_platform: true,
  logo_url: null,
  created_at: "2026-01-01T00:00:00Z",
};

const stats = {
  totalQueries: 0,
  inFlight: 0,
  peakInFlight: 0,
  byEndpoint: Object.create(null),
};

function resetStats() {
  stats.totalQueries = 0;
  stats.inFlight = 0;
  stats.peakInFlight = 0;
  for (const k of Object.keys(stats.byEndpoint)) delete stats.byEndpoint[k];
}

function respondJson(res, payload, { status = 200, count, single = false } = {}) {
  const body = JSON.stringify(payload);
  const headers = {
    "content-type": "application/json; charset=utf-8",
  };
  if (count !== undefined) {
    headers["content-range"] = `0-${Math.max(0, (Array.isArray(payload) ? payload.length : 1) - 1)}/${count}`;
  }
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === "/__metrics") {
    return respondJson(res, stats);
  }
  if (path === "/__reset") {
    resetStats();
    return respondJson(res, { ok: true });
  }

  // Consume request body if any
  req.resume();

  stats.totalQueries += 1;
  stats.inFlight += 1;
  if (stats.inFlight > stats.peakInFlight) stats.peakInFlight = stats.inFlight;
  const key = path.replace(/^\/rest\/v1\//, "");
  stats.byEndpoint[key] = (stats.byEndpoint[key] || 0) + 1;

  const isSingle = (req.headers.accept || "").includes("application/vnd.pgrst.object+json");

  const finish = () => {
    stats.inFlight = Math.max(0, stats.inFlight - 1);

    if (path === "/rest/v1/system_settings") {
      return respondJson(res, SETTINGS);
    }
    if (path === "/rest/v1/categories") {
      const kind = url.searchParams.get("kind") || "";
      if (kind.includes("service")) return respondJson(res, CATEGORIES_SVC);
      return respondJson(res, CATEGORIES_PROD);
    }
    if (path === "/rest/v1/digital_products") {
      if (isSingle) return respondJson(res, PRODUCTS[0]);
      if (url.searchParams.has("slug")) return respondJson(res, [PRODUCTS[0]], { count: 1 });
      return respondJson(res, PRODUCTS, { count: PRODUCTS.length });
    }
    if (path === "/rest/v1/marketplace_services") {
      if (isSingle) return respondJson(res, MARKETPLACE_SERVICES[0]);
      if (url.searchParams.has("id")) return respondJson(res, [MARKETPLACE_SERVICES[0]], { count: 1 });
      return respondJson(res, MARKETPLACE_SERVICES, { count: MARKETPLACE_SERVICES.length });
    }
    if (path === "/rest/v1/services") {
      if (isSingle) return respondJson(res, PLATFORM_SERVICES[0]);
      if (url.searchParams.has("slug")) return respondJson(res, [PLATFORM_SERVICES[0]], { count: 1 });
      return respondJson(res, PLATFORM_SERVICES, { count: PLATFORM_SERVICES.length });
    }
    if (path === "/rest/v1/store_presence") {
      if (isSingle) return respondJson(res, STORE_PRESENCE[0]);
      if (url.searchParams.has("store_id")) return respondJson(res, [STORE_PRESENCE[0]]);
      return respondJson(res, STORE_PRESENCE);
    }
    if (path === "/rest/v1/product_reviews") {
      return respondJson(res, REVIEWS);
    }
    if (path === "/rest/v1/stores") {
      if (isSingle) return respondJson(res, STORE_ROW);
      return respondJson(res, [STORE_ROW]);
    }
    if (path === "/rest/v1/analytics_events") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end("[]");
      return;
    }
    if (path === "/rest/v1/rpc/search_products_fts") {
      return respondJson(res, PRODUCTS);
    }
    if (path === "/rest/v1/rpc/check_rate_limit") {
      return respondJson(res, { allowed: true, remaining: 59 });
    }
    if (path === "/rest/v1/rpc/record_article_view") {
      return respondJson(res, null);
    }
    return respondJson(res, isSingle ? null : []);
  };

  if (DB_LATENCY_MS > 0) {
    setTimeout(finish, DB_LATENCY_MS);
  } else {
    finish();
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.maxConnections = 10_000;

server.listen(PORT, "127.0.0.1", 4096, () => {
  console.log(`MOCK_SUPABASE_READY http://127.0.0.1:${PORT} latency=${DB_LATENCY_MS}ms`);
});

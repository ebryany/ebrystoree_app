import http from "k6/http";
import { check, group, sleep } from "k6";
import {
  BASE_URL,
  CATEGORY_SLUG,
  PRODUCT_SLUG,
  SEARCH_TERMS,
  TEST_AUTH_TOKEN,
  THINK_SCALE,
  pick,
} from "./config.js";

function think(minSec, maxSec) {
  if (THINK_SCALE <= 0) return;
  const span = maxSec - minSec;
  const pause = (minSec + Math.random() * span) * THINK_SCALE;
  if (pause > 0.05) sleep(pause);
}

const HTML_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Encoding": "gzip",
};

const JSON_HEADERS = {
  Accept: "application/json",
  "Accept-Encoding": "gzip",
};

/**
 * Perjalanan pengguna realistis di marketplace EBRYSTORE:
 * - 45% Browser storefront (beranda -> kategori -> detail produk)
 * - 25% Pencarian produk & katalog jasa
 * - 15% Pembeli lanjut ke halaman auth / checkout shell (tanpa transaksi nyata)
 * - 15% Pengecekan kesehatan & endpoint publik/analitik
 */
export function runMarketplaceJourney() {
  const roll = Math.random();

  if (roll < 0.45) {
    group("01_browse_storefront", () => {
      const home = http.get(`${BASE_URL}/`, {
        headers: HTML_HEADERS,
        tags: { route: "home" },
      });
      check(home, {
        "home status 200": (r) => r.status === 200,
        "home has brand": (r) => r.body && r.body.includes("Ebrystore"),
      });
      think(1.5, 3.5);

      const cat = http.get(`${BASE_URL}/produk?kategori=${encodeURIComponent(CATEGORY_SLUG)}`, {
        headers: HTML_HEADERS,
        tags: { route: "category" },
      });
      check(cat, { "category status 200": (r) => r.status === 200 });
      think(1.0, 2.5);

      const pdp = http.get(`${BASE_URL}/produk/${encodeURIComponent(PRODUCT_SLUG)}`, {
        headers: HTML_HEADERS,
        tags: { route: "product_detail" },
      });
      check(pdp, { "product detail status 200": (r) => r.status === 200 });
      think(1.5, 3.0);
    });
    return;
  }

  if (roll < 0.70) {
    group("02_search_and_services", () => {
      const term = pick(SEARCH_TERMS, __VU, __ITER);
      const search = http.get(`${BASE_URL}/produk?q=${encodeURIComponent(term)}`, {
        headers: HTML_HEADERS,
        tags: { route: "search" },
      });
      check(search, { "search status 200": (r) => r.status === 200 });
      think(1.0, 2.5);

      const services = http.get(`${BASE_URL}/layanan`, {
        headers: HTML_HEADERS,
        tags: { route: "services" },
      });
      check(services, { "services status 200": (r) => r.status === 200 });
      think(1.0, 2.5);
    });
    return;
  }

  if (roll < 0.85) {
    group("03_auth_checkout_account_shell", () => {
      const authPage = http.get(`${BASE_URL}/auth`, {
        headers: HTML_HEADERS,
        tags: { route: "auth" },
      });
      check(authPage, { "auth page 200": (r) => r.status === 200 });
      think(0.8, 2.0);

      const headers = TEST_AUTH_TOKEN
        ? { ...HTML_HEADERS, Authorization: `Bearer ${TEST_AUTH_TOKEN}` }
        : HTML_HEADERS;

      const checkout = http.get(
        `${BASE_URL}/checkout/produk/${encodeURIComponent(PRODUCT_SLUG)}`,
        { headers, tags: { route: "checkout_shell" } },
      );
      check(checkout, { "checkout shell 200": (r) => r.status === 200 });
      think(0.8, 2.0);

      const orders = http.get(`${BASE_URL}/dashboard/pesanan`, {
        headers,
        tags: { route: "account_orders_shell" },
      });
      check(orders, { "account shell 200": (r) => r.status === 200 });
      think(1.0, 2.0);
    });
    return;
  }

  group("04_public_api_and_health", () => {
    const health = http.get(`${BASE_URL}/api/health`, {
      headers: JSON_HEADERS,
      tags: { route: "health" },
    });
    check(health, { "health 200": (r) => r.status === 200 });

    const analytics = http.post(
      `${BASE_URL}/api/public/analytics/track`,
      JSON.stringify({ event: "page_view", path: "/" }),
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) EbrystoreLoadTest",
        },
        tags: { route: "analytics_track" },
      },
    );
    check(analytics, { "analytics 204": (r) => r.status === 204 });
    think(1.0, 2.0);
  });
}

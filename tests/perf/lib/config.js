export const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:3099").replace(/\/+$/, "");
export const PRODUCT_SLUG = __ENV.PRODUCT_SLUG || "chatgpt-plus-1-bulan";
export const CATEGORY_SLUG = __ENV.CATEGORY_SLUG || "akun-ai-premium";
export const SEARCH_TERMS = ["chatgpt", "template", "office", "canva", "makalah"];

/**
 * Skala think-time (default 1.0 = perilaku manusia realistis 2-6 detik antar aksi).
 * Di lingkungan terisolasi bisa diset THINK_SCALE=0.25 untuk simulasi beban lebih padat.
 */
export const THINK_SCALE = Number(__ENV.THINK_SCALE || "1");

/** Header opsional untuk skenario terautentikasi di lingkungan staging/test. */
export const TEST_AUTH_TOKEN = __ENV.TEST_AUTH_TOKEN || "";

export const DEFAULT_THRESHOLDS = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<800", "p(99)<1500"],
  checks: ["rate>0.99"],
};

export function pick(arr, vu, iter) {
  return arr[(vu + iter) % arr.length];
}

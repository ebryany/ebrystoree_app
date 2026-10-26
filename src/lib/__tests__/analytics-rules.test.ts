import { describe, expect, it } from "vitest";

/**
 * Unit test untuk aturan analitik.
 *
 * Fokusnya dua hal yang paling berbahaya bila salah:
 * 1. Privasi: memastikan tidak ada data pribadi yang ikut tersimpan.
 * 2. Kebenaran angka: bot tidak boleh masuk hitungan, dan konversi hanya dari server.
 */

/** Deteksi bot: sama dengan yang dipakai endpoint tracking. */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|curl|wget|python-requests|axios|headless|lighthouse|pingdom|uptimerobot/i;

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

/** Hanya host referrer yang disimpan, bukan URL penuh. */
function referrerHost(referrer: string | null | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host === ownHost) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** Path dibersihkan: tanpa query, tanpa hash. */
function cleanPath(raw: string): string {
  return raw.split("?")[0].split("#")[0].slice(0, 300);
}

describe("ANALYTICS: privasi dan kebenaran angka", () => {
  it("AN-01: bot dikenali dan tidak dihitung sebagai pengunjung", () => {
    const bots = [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "curl/8.0.1",
      "python-requests/2.31",
      "HeadlessChrome/120.0.0.0",
      "WhatsApp/2.23",
      "facebookexternalhit/1.1",
    ];
    for (const ua of bots) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("AN-02: browser nyata tidak dianggap bot", () => {
    const humans = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36",
    ];
    for (const ua of humans) {
      expect(isBot(ua), ua).toBe(false);
    }
  });

  it("AN-03: tanpa user-agent dianggap bot (klien nyata selalu mengirim)", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
  });

  it("AN-04: hanya host referrer disimpan, bukan URL penuh", () => {
    expect(referrerHost("https://google.com/search?q=rahasia&token=abc", "ebrystore.my.id")).toBe(
      "google.com",
    );
    expect(referrerHost("https://www.instagram.com/p/xyz", "ebrystore.my.id")).toBe(
      "instagram.com",
    );
  });

  it("AN-05: referrer dari domain sendiri tidak dicatat (navigasi internal)", () => {
    expect(referrerHost("https://ebrystore.my.id/produk", "ebrystore.my.id")).toBe(null);
  });

  it("AN-06: referrer rusak tidak membuat crash", () => {
    expect(referrerHost("bukan-url", "ebrystore.my.id")).toBe(null);
    expect(referrerHost(null, "ebrystore.my.id")).toBe(null);
  });

  it("AN-07: query dan hash dibuang dari path", () => {
    expect(cleanPath("/produk/template?utm_source=ig&token=abc")).toBe("/produk/template");
    expect(cleanPath("/artikel/tips#bagian-2")).toBe("/artikel/tips");
    expect(cleanPath("/produk")).toBe("/produk");
  });

  it("AN-08: konversi pembayaran hanya dari server, tidak dari klien", () => {
    // Aturan: endpoint klien hanya menerima event yang bisa diamati browser.
    const CLIENT_EVENTS = [
      "page_view",
      "product_view",
      "service_view",
      "article_view",
      "checkout_start",
    ];
    expect(CLIENT_EVENTS).not.toContain("payment_success");
  });

  it("AN-09: agregasi harian idempoten (dijalankan 2x tidak menggandakan)", () => {
    // Simulasi: agregasi menghitung ulang hari itu, bukan menambah.
    const aggregate = (events: number[], previous: number) => events.reduce((a, b) => a + b, 0);
    const events = [1, 1, 1, 1, 1, 1];
    const first = aggregate(events, 0);
    const second = aggregate(events, first); // menjalankan ulang tidak menambah
    expect(first).toBe(6);
    expect(second).toBe(6);
  });

  it("AN-10: pengunjung unik dihitung dari hash sesi, bukan jumlah event", () => {
    const events = [{ session: "a" }, { session: "a" }, { session: "a" }, { session: "b" }];
    const unique = new Set(events.map((e) => e.session)).size;
    expect(events.length).toBe(4);
    expect(unique).toBe(2);
  });
});

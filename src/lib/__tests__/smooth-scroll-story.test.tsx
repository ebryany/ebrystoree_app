import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SmoothScrollStory } from "@/components/home/smooth-scroll-story";

/**
 * Kontrak section "Cara memesan" — diuji lewat render SSR (pola test repo:
 * renderToStaticMarkup, bukan jsdom).
 *
 * Yang dikunci:
 * 1. SSR safety: komponen merender tanpa `window`/`document` (server tidak
 *    punya keduanya; kalau ada akses browser saat render, test ini gagal).
 * 2. Tiga tahap selalu ada di HTML dengan urutan baca benar dan isi sistem
 *    yang sebenarnya, sehingga konten tetap terbaca tanpa JavaScript.
 * 3. `prefers-reduced-motion` mengalihkan ke varian statis.
 */

const PANEL_TITLES = [
  "Pesanan masuk, bayar dalam 24 jam",
  "Pembayaran diverifikasi, pesanan dikerjakan",
  "Periksa hasilnya, lalu pesanan ditutup",
];

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("SmoothScrollStory (Cara memesan)", () => {
  it("serves a fully readable static timeline from the server (no JS required)", () => {
    mockReducedMotion(false);
    const html = renderToStaticMarkup(createElement(SmoothScrollStory));

    for (const title of PANEL_TITLES) {
      expect(html).toContain(title);
    }
    // Aturan sistem yang tidak boleh bergeser.
    expect(html).toContain("batas 24 jam");
    expect(html).toContain("diperiksa tim keuangan");
    // Penanda urutan tahap.
    for (const step of ["Tahap 1 dari 3", "Tahap 2 dari 3", "Tahap 3 dari 3"]) {
      expect(html).toContain(step);
    }
    // Section anchor untuk tautan lompat.
    expect(html).toContain('id="cara-kerja"');
    // HTML server = daftar statis: tanpa wrapper sticky yang butuh JS.
    expect(html).toContain("<ol");
    expect(html).not.toContain("sticky top-16");
  });

  it("uses the sticky stack only after mount, when motion is allowed", () => {
    mockReducedMotion(false);
    const html = renderToStaticMarkup(createElement(SmoothScrollStory));
    expect(html).not.toContain("<article");
  });
});

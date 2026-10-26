import { describe, expect, it } from "vitest";

import { auditHtml } from "../seo-audit.server";

/**
 * Unit test aturan audit SEO on-page.
 *
 * Fungsi `auditHtml` sengaja murni (tidak menyentuh jaringan/database), sehingga
 * bisa diuji langsung. Test ini memakai HTML contoh sebagai INPUT UJI, bukan
 * sebagai data yang ditampilkan di dashboard.
 */

/** Bangun HTML lengkap dengan bagian yang bisa diganti. */
function page(parts: {
  title?: string;
  description?: string;
  h1?: string;
  h1Count?: number;
  canonical?: string;
  robots?: string;
  imgs?: string[];
  ld?: string[];
}): string {
  const {
    title = "Panduan Lengkap Membeli Produk Digital di Ebrystore",
    description =
      "Pelajari cara memilih produk digital yang tepat, membandingkan harga antar toko, dan menyelesaikan pembayaran dengan aman di Ebrystore.",
    h1 = "Panduan membeli produk digital",
    h1Count = 1,
    canonical = "https://ebrystore.my.id/produk",
    robots,
    imgs = ['<img src="/a.png" alt="Contoh produk">'],
    ld = ['<script type="application/ld+json">{"@type":"Product"}</script>'],
  } = parts;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${robots ? `<meta name="robots" content="${robots}">` : ""}
  ${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
  ${ld.join("\n")}
</head>
<body>
  ${Array.from({ length: h1Count }, () => `<h1>${h1}</h1>`).join("\n")}
  ${imgs.join("\n")}
</body>
</html>`;
}

describe("SEO: aturan audit on-page", () => {
  it("SEO-01: halaman sehat tidak menghasilkan masalah", () => {
    const issues = auditHtml("/produk", page({}));
    expect(issues).toHaveLength(0);
  });

  it("SEO-02: title hilang terdeteksi sebagai error", () => {
    const issues = auditHtml("/produk", page({ title: "" }));
    expect(issues.some((i) => i.code === "title_missing" && i.severity === "error")).toBe(true);
  });

  it("SEO-03: title terlalu pendek dan terlalu panjang sama-sama terdeteksi", () => {
    const short = auditHtml("/a", page({ title: "Pendek" }));
    expect(short.some((i) => i.code === "title_too_short")).toBe(true);

    const long = auditHtml("/b", page({ title: "Judul yang sangat panjang ".repeat(4) }));
    expect(long.some((i) => i.code === "title_too_long")).toBe(true);
  });

  it("SEO-04: description hilang terdeteksi", () => {
    const issues = auditHtml("/produk", page({ description: "" }));
    expect(issues.some((i) => i.code === "description_missing")).toBe(true);
  });

  it("SEO-05: H1 hilang dan H1 ganda terdeteksi", () => {
    const none = auditHtml("/a", page({ h1Count: 0 }));
    expect(none.some((i) => i.code === "h1_missing")).toBe(true);

    const many = auditHtml("/b", page({ h1Count: 3 }));
    const issue = many.find((i) => i.code === "h1_multiple");
    expect(issue).toBeTruthy();
    expect(issue?.detail).toContain("3");
  });

  it("SEO-06: canonical menunjuk halaman lain diperingatkan", () => {
    const issues = auditHtml("/produk/a", page({ canonical: "https://ebrystore.my.id/produk/b" }));
    expect(issues.some((i) => i.code === "canonical_other_page")).toBe(true);
  });

  it("SEO-07: noindex terdeteksi sebagai error", () => {
    const issues = auditHtml("/produk", page({ robots: "noindex, nofollow" }));
    expect(issues.some((i) => i.code === "robots_noindex" && i.severity === "error")).toBe(true);
  });

  it("SEO-08: gambar tanpa alt dihitung jumlahnya", () => {
    const issues = auditHtml(
      "/produk",
      page({ imgs: ['<img src="/a.png">', '<img src="/b.png">', '<img src="/c.png" alt="ok">'] }),
    );
    const issue = issues.find((i) => i.code === "img_alt_missing");
    expect(issue).toBeTruthy();
    expect(issue?.detail).toContain("2");
  });

  it("SEO-09: structured data rusak terdeteksi, yang valid tidak", () => {
    const broken = auditHtml("/a", page({ ld: ['<script type="application/ld+json">{rusak}</script>'] }));
    expect(broken.some((i) => i.code === "structured_data_invalid")).toBe(true);

    const valid = auditHtml(
      "/b",
      page({ ld: ['<script type="application/ld+json">{"@type":"WebSite"}</script>'] }),
    );
    expect(valid.some((i) => i.code === "structured_data_invalid")).toBe(false);
  });

  it("SEO-10: canonical ke halaman sendiri tidak dianggap masalah", () => {
    const issues = auditHtml(
      "/produk",
      page({ canonical: "https://ebrystore.my.id/produk" }),
    );
    expect(issues.some((i) => i.code === "canonical_other_page")).toBe(false);
  });

  it("SEO-11: kode masalah bersifat stabil (bisa dihitung lintas waktu)", () => {
    // Kode yang dipakai dashboard untuk menghitung tren harus tidak berubah-ubah.
    const issues = auditHtml("/x", page({ title: "", h1Count: 0, canonical: "" }));
    const codes = issues.map((i) => i.code).sort();
    expect(codes).toContain("title_missing");
    expect(codes).toContain("h1_missing");
    expect(codes).toContain("canonical_missing");
    // Setiap kode harus huruf kecil dengan garis bawah; angka diizinkan
    // (mis. h1_missing) karena menyebut elemen HTML secara spesifik.
    for (const code of codes) {
      expect(code).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

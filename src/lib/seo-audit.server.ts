/**
 * Server-only: pemeriksa SEO on-page.
 *
 * Cara kerja: ambil HTML halaman nyata lewat HTTP, lalu periksa aturan on-page.
 * Tidak memakai API eksternal (tidak butuh Search Console), sehingga bisa
 * dijalankan kapan saja tanpa biaya.
 *
 * Aturan yang diperiksa dan alasannya:
 * - title: ada, 30-60 karakter, tidak duplikat antar halaman. Title adalah
 *   faktor on-page paling berpengaruh pada hasil pencarian.
 * - description: ada, 70-160 karakter, tidak duplikat. Bukan faktor peringkat,
 *   tapi menentukan apakah orang mengklik.
 * - H1: tepat satu. Lebih dari satu membingungkan mesin dan pembaca.
 * - alt gambar: gambar konten harus punya alt. Gambar dekoratif boleh kosong.
 * - canonical: ada, menunjuk ke dirinya sendiri. Mencegah duplikasi.
 * - robots meta: tidak memblokir halaman yang seharusnya diindeks.
 * - structured data: JSON-LD yang valid (bukan teks yang tampak seperti JSON).
 */

export type SeoIssue = {
  code: string;
  severity: "error" | "warning" | "info";
  detail: string;
};

export type PageAudit = {
  urlPath: string;
  issues: SeoIssue[];
};

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

/** Ambil teks dalam tag pertama yang cocok. */
function firstMatch(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m?.[1]?.trim() ?? null;
}

/** Hitung semua kecocokan (untuk H1 dan alt). */
function allMatches(html: string, pattern: RegExp): string[] {
  return Array.from(html.matchAll(pattern)).map((m) => (m[1] ?? "").trim());
}

/** Buang tag HTML untuk mengukur panjang teks yang benar-benar terbaca. */
function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Ekstrak atribut dari sebuah tag. */
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  return tag.match(re)?.[1]?.trim() ?? null;
}

/**
 * Periksa satu halaman HTML terhadap aturan on-page.
 *
 * Fungsi ini murni: tidak menyentuh jaringan atau database, sehingga bisa
 * diuji tanpa server. Pengambilan HTML dilakukan pemanggil.
 */
export function auditHtml(urlPath: string, html: string): SeoIssue[] {
  const issues: SeoIssue[] = [];

  // --- Title ---
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = title ? stripTags(title) : "";
  if (!titleText) {
    issues.push({
      code: "title_missing",
      severity: "error",
      detail: "Halaman tidak punya <title>.",
    });
  } else if (titleText.length < TITLE_MIN) {
    issues.push({
      code: "title_too_short",
      severity: "warning",
      detail: `Title ${titleText.length} karakter, disarankan minimal ${TITLE_MIN}.`,
    });
  } else if (titleText.length > TITLE_MAX) {
    issues.push({
      code: "title_too_long",
      severity: "warning",
      detail: `Title ${titleText.length} karakter, disarankan maksimal ${TITLE_MAX}.`,
    });
  }

  // --- Meta description ---
  const metaTags = Array.from(html.matchAll(/<meta\b[^>]*>/gi)).map((m) => m[0]);
  const descTag = metaTags.find((tag) => (attr(tag, "name") ?? "").toLowerCase() === "description");
  const desc = descTag ? (attr(descTag, "content") ?? "") : "";
  if (!desc) {
    issues.push({
      code: "description_missing",
      severity: "warning",
      detail: "Tidak ada meta description; mesin pencari akan menyusun cuplikan sendiri.",
    });
  } else if (desc.length < DESC_MIN) {
    issues.push({
      code: "description_too_short",
      severity: "info",
      detail: `Description ${desc.length} karakter, disarankan minimal ${DESC_MIN}.`,
    });
  } else if (desc.length > DESC_MAX) {
    issues.push({
      code: "description_too_long",
      severity: "info",
      detail: `Description ${desc.length} karakter, disarankan maksimal ${DESC_MAX}.`,
    });
  }

  // --- H1 ---
  const h1s = allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).filter(
    (v) => stripTags(v).length > 0,
  );
  if (h1s.length === 0) {
    issues.push({ code: "h1_missing", severity: "warning", detail: "Tidak ada H1 di halaman." });
  } else if (h1s.length > 1) {
    issues.push({
      code: "h1_multiple",
      severity: "warning",
      detail: `Ada ${h1s.length} H1; sebaiknya tepat satu.`,
    });
  }

  // --- Canonical ---
  const linkTags = Array.from(html.matchAll(/<link\b[^>]*>/gi)).map((m) => m[0]);
  const canonicalTag = linkTags.find(
    (tag) => (attr(tag, "rel") ?? "").toLowerCase() === "canonical",
  );
  const canonical = canonicalTag ? attr(canonicalTag, "href") : null;
  if (!canonical) {
    issues.push({
      code: "canonical_missing",
      severity: "info",
      detail: "Tidak ada canonical; berisiko dianggap duplikat.",
    });
  } else if (canonical !== urlPath && !canonical.endsWith(urlPath)) {
    issues.push({
      code: "canonical_other_page",
      severity: "warning",
      detail: `Canonical menunjuk ke halaman lain: ${canonical.slice(0, 120)}`,
    });
  }

  // --- Robots meta ---
  const robotsTag = metaTags.find((tag) => (attr(tag, "name") ?? "").toLowerCase() === "robots");
  const robots = (robotsTag ? (attr(robotsTag, "content") ?? "") : "").toLowerCase();
  if (robots.includes("noindex")) {
    issues.push({
      code: "robots_noindex",
      severity: "error",
      detail: "Halaman ditandai noindex, jadi tidak akan muncul di pencarian.",
    });
  }

  // --- Gambar tanpa alt (hanya gambar konten, bukan dekoratif) ---
  const imgTags = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  const imagesWithoutAlt = imgTags.filter((tag) => attr(tag, "alt") === null);
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      code: "img_alt_missing",
      severity: "warning",
      detail: `${imagesWithoutAlt.length} gambar tanpa atribut alt.`,
    });
  }

  // --- Structured data ---
  const ldBlocks = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ).map((m) => m[1]);
  for (const [index, block] of ldBlocks.entries()) {
    try {
      JSON.parse(block);
    } catch {
      issues.push({
        code: "structured_data_invalid",
        severity: "warning",
        detail: `Blok JSON-LD ke-${index + 1} bukan JSON yang valid.`,
      });
    }
  }

  return issues;
}

/**
 * Jalankan audit untuk daftar halaman.
 *
 * Halaman diambil dari sitemap supaya yang diperiksa benar-benar halaman yang
 * dipublikasikan, bukan daftar tebakan. Kegagalan satu halaman tidak
 * menggagalkan keseluruhan audit.
 */
export async function runSeoAudit(
  baseUrl: string,
  paths: string[],
): Promise<{ checked: number; failed: number; totalIssues: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let checked = 0;
  let failed = 0;
  let totalIssues = 0;

  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        headers: {
          // UA jelas supaya tidak diblokir, dan supaya audit tidak tercatat
          // sebagai pengunjung di analitik (endpoint tracking menyaring bot).
          "User-Agent": "EbrystoreSeoAudit/1.0",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        await supabaseAdmin.rpc("record_seo_audit", {
          _url_path: path,
          _issues: [
            {
              code: "page_unreachable",
              severity: "error",
              detail: `Halaman merespons ${res.status}.`,
            },
          ],
        });
        failed += 1;
        continue;
      }
      const html = await res.text();
      const issues = auditHtml(path, html);
      await supabaseAdmin.rpc("record_seo_audit", { _url_path: path, _issues: issues });
      checked += 1;
      totalIssues += issues.length;
    } catch (err) {
      // Satu halaman gagal (timeout, DNS) tidak menghentikan audit keseluruhan.
      await supabaseAdmin.rpc("record_seo_audit", {
        _url_path: path,
        _issues: [
          {
            code: "page_unreachable",
            severity: "error",
            detail: (err as Error).message.slice(0, 200),
          },
        ],
      });
      failed += 1;
    }
  }

  return { checked, failed, totalIssues };
}

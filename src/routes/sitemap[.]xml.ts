import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { createPublicClient } from "@/lib/supabase-public.server";

const BASE_URL = "https://ebrystore.my.id";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/produk", changefreq: "daily", priority: "0.9" },
  { path: "/layanan", changefreq: "daily", priority: "0.9" },
  { path: "/artikel", changefreq: "weekly", priority: "0.8" },
  { path: "/bantuan", changefreq: "monthly", priority: "0.5" },
  { path: "/syarat-ketentuan", changefreq: "yearly", priority: "0.3" },
  { path: "/kebijakan-privasi", changefreq: "yearly", priority: "0.3" },
  { path: "/kebijakan-refund", changefreq: "yearly", priority: "0.3" },
];

async function dynamicEntries(): Promise<SitemapEntry[]> {
  try {
    const supabase = createPublicClient() as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => Promise<{ data: { slug: string }[] | null }>;
        };
      };
    };
    const [products, services, articles] = await Promise.all([
      supabase.from("digital_products").select("slug").eq("status", "published"),
      supabase.from("services").select("slug").eq("status", "published"),
      supabase.from("articles").select("slug").eq("status", "published"),
    ]);

    const map = (rows: { slug: string }[] | null, prefix: string, priority: string): SitemapEntry[] =>
      (rows ?? [])
        .filter((row) => Boolean(row.slug))
        .map((row) => ({ path: `${prefix}/${row.slug}`, changefreq: "weekly" as const, priority }));

    return [
      ...map(products.data as { slug: string }[] | null, "/produk", "0.8"),
      ...map(services.data as { slug: string }[] | null, "/layanan", "0.8"),
      ...map(articles.data as { slug: string }[] | null, "/artikel", "0.7"),
    ];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [...STATIC_ENTRIES, ...(await dynamicEntries())];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

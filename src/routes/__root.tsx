import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { useInlineToastActive } from "@/components/ebry/inline-toasts";
import { getPublicWebsiteSettings } from "@/lib/website-settings.functions";
import { MaintenanceGate } from "@/components/maintenance-gate";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { ogImageUrl, SITE_ORIGIN } from "@/lib/seo-url";
import { useStorePresenceHeartbeat } from "@/hooks/use-store-presence-heartbeat";

/** Origin Supabase dari environment — hindari hardcode saat pindah project. */
const supabaseOrigin = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();

function NotFoundComponent() {
  return (
    <main
      lang="id"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-12"
    >
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-bold text-foreground">404</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tautan mungkin keliru atau halaman sudah tidak tersedia.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  console.error(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return <RouteError />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getPublicWebsiteSettings(),
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead([...matches, match]);
    const s: Record<string, any> = (loaderData as any)?.values ?? {};
    const title = String(
      s.seo_default_title ?? "Ebrystore — Produk Digital & Pendampingan Akademik",
    );
    const description = String(
      s.seo_default_description ??
        "Beli produk digital yang langsung terkirim dan pesan bantuan tugas kuliah dengan progres terpantau.",
    );
    const ogTitle = String(s.seo_og_title || title);
    const ogDescription = String(s.seo_og_description || description);
    // Gambar pratinjau link harus URL absolut yang bisa diunduh crawler WhatsApp.
    const ogImage = ogImageUrl(
      String(s.seo_og_image || s.site_og_image_url || s.site_square_logo_url || s.site_logo_url || ""),
    );
    const verification = [
      { name: "google-site-verification", content: "5V5oY0ERtp1nkZTxzinF-GwbMZwJAj3fSTiYPUwaCIg" },
      s.seo_google_verification
        ? { name: "google-site-verification", content: String(s.seo_google_verification) }
        : null,
      s.seo_bing_verification
        ? { name: "msvalidate.01", content: String(s.seo_bing_verification) }
        : null,
    ].filter(Boolean) as { name: string; content: string }[];

    // Canonical: sumber kebenaran adalah setting admin. Bila kosong, tag tidak
    // dirender sama sekali (lebih aman daripada menunjuk domain lama). Path
    // diambil dari match agar tiap halaman punya canonical sendiri.
    const canonicalBase = String(s.seo_canonical_base || SITE_ORIGIN).replace(/\/+$/, "");
    // Path halaman yang sedang dibuka ada di match terdalam, bukan di match root ("/").
    const leaf = (matches[matches.length - 1] ?? match) as { pathname?: string };
    const canonicalPath = String(leaf?.pathname ?? "").replace(/\/+$/, "");
    const canonicalHref = canonicalBase
      ? `${canonicalBase}${canonicalPath === "/" ? "" : canonicalPath}`
      : undefined;

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title },
        { name: "description", content: description },
        { name: "author", content: String(s.site_business_name ?? "Ebrystore") },
        ...(s.seo_robots === "noindex" ? [{ name: "robots", content: "noindex, nofollow" }] : []),
        ...(Array.isArray(s.seo_keywords) && s.seo_keywords.length
          ? [{ name: "keywords", content: s.seo_keywords.join(", ") }]
          : []),
        ...verification,
        { property: "og:title", content: ogTitle },
        { property: "og:description", content: ogDescription },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: String(s.site_business_name || "Ebrystore") },
        { property: "og:locale", content: "id_ID" },
        ...(canonicalHref ? [{ property: "og:url", content: canonicalHref }] : []),
        { name: "twitter:card", content: String(s.seo_twitter_card ?? "summary_large_image") },
        { name: "twitter:title", content: ogTitle },
        { name: "twitter:description", content: ogDescription },
        ...(ogImage
          ? [
              { property: "og:image", content: ogImage },
              { name: "twitter:image", content: ogImage },
            ]
          : []),
        ...(failureHead?.meta ?? []),
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: String(s.site_favicon_url || "/favicon.ico") },
        ...(canonicalHref ? [{ rel: "canonical", href: canonicalHref }] : []),
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        ...(supabaseOrigin
          ? [
              { rel: "preconnect", href: supabaseOrigin, crossOrigin: "anonymous" as const },
              { rel: "dns-prefetch", href: supabaseOrigin },
            ]
          : []),
        {
          rel: "preload",
          as: "style",
          href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const settings = Route.useLoaderData();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const inlineToasts = useInlineToastActive();
  useStorePresenceHeartbeat();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  // Analitik: catat satu page_view per perpindahan halaman. Dijalankan di root
  // supaya berlaku untuk semua halaman tanpa menambah kode di setiap route.
  // Halaman yang punya makna khusus (produk, jasa, artikel, checkout) mengirim
  // event tambahan sendiri dari komponennya.
  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("page_view", pathname),
    );
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <MaintenanceGate settings={(settings as any)?.values ?? {}}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </MaintenanceGate>
      {/* richColors sengaja dilepas: permukaan frosted netral + ikon semantik
          diatur terpusat di components/ui/sonner.tsx untuk semua toast. */}
      {/* Disembunyikan saat header dashboard terlihat: notifikasi tampil
          menempel di bawah header (components/ebry/inline-toasts.tsx). */}
      {inlineToasts ? null : <Toaster position="top-center" />}
    </QueryClientProvider>
  );
}

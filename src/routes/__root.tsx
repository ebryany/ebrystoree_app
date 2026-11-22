import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
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
import { NavProgress } from "@/components/ebry/nav-progress";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { SecurityErrorView } from "@/components/security-error-page";
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
  return <SecurityErrorView status={404} />;
}

function ErrorComponent({ error }: { error: unknown }) {
  console.error(error);
  useEffect(() => {
    reportLovableError(error instanceof Error ? error : new Error(String(error)), {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  return <RouteError />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getPublicWebsiteSettings(),
  // Pengaturan publik jarang berubah: jangan ambil ulang di setiap pindah halaman.
  staleTime: 5 * 60_000,
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead([...matches, match]);
    const s: Record<string, any> = (loaderData as any)?.values ?? {};
    const baseTitle = String(
      s.seo_default_title ?? "Ebrystore — Produk Digital & Pendampingan Akademik",
    );
    const titleTemplate = typeof s.seo_title_template === "string" ? s.seo_title_template.trim() : "";
    const title = titleTemplate.includes("{title}")
      ? titleTemplate.replace("{title}", baseTitle)
      : baseTitle;
    const description = String(
      s.seo_default_description ??
        "Beli produk digital yang langsung terkirim dan pesan bantuan tugas kuliah dengan progres terpantau.",
    );
    const ogTitle = String(s.seo_og_title || title);
    const ogDescription = String(s.seo_og_description || description);
    // Gambar pratinjau link harus URL absolut yang bisa diunduh crawler WhatsApp.
    const ogImage = ogImageUrl(
      String(
        s.seo_og_image || s.site_og_image_url || s.site_square_logo_url || s.site_logo_url || "",
      ),
    );
    const googleVerification = String(
      s.seo_google_verification || "5V5oY0ERtp1nkZTxzinF-GwbMZwJAj3fSTiYPUwaCIg",
    );
    const verification = [
      { name: "google-site-verification", content: googleVerification },
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
  const settings = Route.useLoaderData();
  const s = ((settings as any)?.values ?? {}) as Record<string, any>;
  const lang = s.site_language === "en" ? "en" : "id";
  return (
    <html lang={lang}>
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

  const settingsValues = ((settings as any)?.values ?? {}) as Record<string, any>;
  const customAccent =
    typeof settingsValues.site_accent_color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(settingsValues.site_accent_color) &&
    settingsValues.site_accent_color.toLowerCase() !== "#0f8f86"
      ? settingsValues.site_accent_color
      : undefined;

  return (
    <QueryClientProvider client={queryClient}>
      <div
        style={
          customAccent
            ? ({ "--accent": customAccent, "--ring": customAccent } as React.CSSProperties)
            : undefined
        }
      >
        <NavProgress />
        <MaintenanceGate settings={settingsValues}>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </MaintenanceGate>
        {/* richColors sengaja dilepas: permukaan frosted netral + ikon semantik
            diatur terpusat di components/ui/sonner.tsx untuk semua toast. */}
        {/* Disembunyikan saat header dashboard terlihat: notifikasi tampil
            menempel di bawah header (components/ebry/inline-toasts.tsx). */}
        {inlineToasts ? null : <Toaster position="top-center" />}
      </div>
    </QueryClientProvider>
  );
}

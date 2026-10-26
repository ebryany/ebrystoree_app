import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  search: {} as Record<string, string>,
  pathname: "/produk",
  pages: [{ items: [] as Record<string, unknown>[], error: null as string | null, total: 1 }],
  categories: {
    items: [{ id: "category-1", slug: "template", name: "Template" }],
    error: null as string | null,
  },
  hasNextPage: false,
  nextError: false,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => state.search }),
  stripSearchParams: () => vi.fn(),
  useNavigate: () => vi.fn(),
  useRouterState: () => state.pathname,
  Link: ({
    to,
    params,
    search,
    children,
    activeProps: _active,
    ...props
  }: {
    to: string;
    params?: { slug?: string; id?: string };
    search?: Record<string, string>;
    children?: ReactNode;
    activeProps?: unknown;
  }) =>
    createElement(
      "a",
      {
        ...props,
        href:
          to.replace("$slug", params?.slug ?? "").replace("$id", params?.id ?? "") +
          (search ? `?${new URLSearchParams(search)}` : ""),
      },
      children,
    ),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  infiniteQueryOptions: (options: unknown) => options,
  useQuery: () => ({ data: null }),
  useQueryClient: () => ({}),
  useSuspenseQuery: () => ({ data: state.categories, refetch: vi.fn() }),
  useSuspenseInfiniteQuery: () => ({
    data: { pages: state.pages },
    hasNextPage: state.hasNextPage,
    isFetchingNextPage: false,
    isFetchNextPageError: state.nextError,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
}));
// Modul yang diuji kini men-transitif-kan auth-middleware (via server function),
// jadi mock perlu menyediakan createMiddleware dan createServerFn.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(),
  createMiddleware: () => ({ server: (fn: unknown) => fn }),
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: () => ({}),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/lib/catalog.functions", () => ({
  listProducts: vi.fn(),
  listServices: vi.fn(),
  listPublicMarketplaceServices: vi.fn(),
  listCatalogCategories: vi.fn(),
}));
vi.mock("@/lib/admin.functions", () => ({ getMyRoles: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/use-website-settings", () => ({
  useWebsiteSettings: () => ({
    store_name: "Ebrystore",
    site_support_email: "support@example.test",
  }),
  useSiteNav: () => [{ url: "/produk", label: "Produk", open_in_new_tab: false }],
}));
vi.mock("@/components/ebry/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: ReactNode }) => children,
}));

import { Route as ProductRoute } from "@/routes/produk.index";
import { Route as ServiceRoute } from "@/routes/layanan.index";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CatalogFilters } from "@/components/catalog-filters";

const renderRoute = (route: unknown) =>
  renderToStaticMarkup(
    createElement((route as { options: { component: ComponentType } }).options.component),
  );
const product = {
  id: "product-1",
  name: "Template asli",
  slug: "template-asli",
  price: 100000,
  discount_price: null,
  thumbnail_url: null,
  short_description: null,
  store_name: "Toko Contoh",
  store_slug: "toko-contoh",
};

beforeEach(() => {
  state.search = {};
  state.pathname = "/produk";
  state.pages = [{ items: [], error: null, total: 1 }];
  state.categories.error = null;
  state.hasNextPage = false;
  state.nextError = false;
});

describe("Public storefront", () => {
  it("uses shared product cards and preserves independent store navigation", () => {
    state.pages[0].items = [product];
    const html = renderRoute(ProductRoute);
    expect(html).toContain('href="/produk/template-asli"');
    expect(html).toContain('href="/toko/toko-contoh"');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
    expect(html).toContain("1 produk ditampilkan");
    expect(html).not.toContain("dari 1 produk");
    expect(html).not.toMatch(/Otomatis|5x unduhan|365 hari|Pilihan untuk kamu/);
  });

  it("does not construct a store destination from a missing slug", () => {
    state.pages[0].items = [{ ...product, store_slug: null }];
    expect(renderRoute(ProductRoute)).not.toContain('href="/toko/');
  });

  it("keeps catalogue products visible when category fetching fails", () => {
    state.pages[0].items = [product];
    state.categories.error = "Kategori gagal dimuat";
    const html = renderRoute(ProductRoute);
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/produk/template-asli"');
  });

  it.each([ProductRoute, ServiceRoute])("renders retryable first-page errors", (route) => {
    state.pages[0].error = "Katalog gagal dimuat";
    const html = renderRoute(route);
    expect(html).toContain("Katalog gagal dimuat");
    expect(html).toContain("Coba lagi");
  });

  it("keeps loaded products when the next page request fails", () => {
    state.pages[0].items = [product];
    state.nextError = true;
    const html = renderRoute(ProductRoute);
    expect(html).toContain("Produk sebelumnya tetap tersedia.");
    expect(html).toContain('href="/produk/template-asli"');
    expect(html).toContain("Coba lagi");
  });

  it("keeps manual pagination accessible", () => {
    state.pages[0].items = [product];
    state.hasNextPage = true;
    expect(renderRoute(ProductRoute)).toContain("Muat lebih banyak");
  });

  it("distinguishes filtered-empty products from an empty catalogue", () => {
    expect(renderRoute(ProductRoute)).toContain("Belum ada produk tersedia.");
    state.search = { q: "tidak-cocok" };
    const html = renderRoute(ProductRoute);
    expect(html).toContain("Tidak ada produk yang cocok.");
    expect(html).toContain("Reset semua filter");
  });

  it("renders seller services with store links and full agreements, not platform checkout links", () => {
    state.pages[0].items = [
      {
        id: "service-1",
        name: "Jasa desain",
        price: 150000,
        store: { name: "Toko Contoh", slug: "toko-contoh" },
        category: { name: "Desain", slug: "desain" },
        agreement: {
          scope: "Lingkup pekerjaan desain",
          exclusions: "Cetak",
          deliverable: "File desain",
          requirements: "Brief pembeli",
          durationDays: 3,
          revisionLimit: 2,
        },
      },
    ];
    state.hasNextPage = true;
    const html = renderRoute(ServiceRoute);
    expect(html).toContain("Jasa dari seller");
    expect(html).toContain('href="/toko/toko-contoh"');
    expect(html).toContain("Brief pembeli");
    expect(html).toContain("<details");
    expect(html).toContain("Muat lebih banyak");
    expect(html).toContain("Pesan jasa");
    expect(html).toContain('href="/checkout/jasa/service-1"');
    expect(html).not.toContain('href="/layanan/');
    expect(html).not.toContain('href="/checkout/layanan/');
  });

  it("provides header search on home and public pages without adding search to account pages", () => {
    expect(renderToStaticMarkup(<SiteHeader />)).toContain("Cari produk di marketplace");
    state.pathname = "/";
    expect(renderToStaticMarkup(<SiteHeader />)).toContain("Cari produk di marketplace");
    state.pathname = "/dashboard";
    expect(renderToStaticMarkup(<SiteHeader />)).not.toContain("Cari produk di marketplace");
  });

  it("preserves settings-driven branding, navigation, and footer support", () => {
    const header = renderToStaticMarkup(<SiteHeader />);
    const footer = renderToStaticMarkup(<SiteFooter />);
    expect(header).toContain("Ebrystore");
    expect(header).toContain('href="/produk"');
    expect(header).toContain("Buka menu");
    expect(footer).toContain('href="mailto:support@example.test"');
    expect(footer).toContain("Kebijakan");
  });

  it("gives filters labelled search, 80-character limit, visible focus, and 44px targets", () => {
    const html = renderToStaticMarkup(
      <CatalogFilters
        q="template"
        category="template"
        categories={state.categories.items}
        placeholder="Cari produk digital…"
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain('role="search"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("focus-within:ring-2");
    expect(html).toContain("min-h-11");
    expect(html).toContain("Reset filter");
  });
});

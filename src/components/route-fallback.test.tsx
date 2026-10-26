import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  RouterContextProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  HeadContent,
  isNotFound,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router";
import { RouteError, routeFailureHead } from "./route-fallback";
import { renderErrorPage } from "@/lib/error-page";

const state = vi.hoisted(() => ({
  product: vi.fn(),
  service: vi.fn(),
  responses: [] as { data: unknown; error: unknown }[],
}));
vi.mock("@/lib/orders.functions", () => ({ getProductDetail: state.product }));
vi.mock("@/lib/catalog.functions", () => ({ getServiceDetail: state.service }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/rate-limit.server", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/lovable-error-reporting", () => ({ reportLovableError: vi.fn() }));
vi.mock("@/lib/website-settings.functions", () => ({ getPublicWebsiteSettings: vi.fn() }));
vi.mock("@/components/maintenance-gate", () => ({ MaintenanceGate: () => null }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/product/review-panel", () => ({ ProductReviewPanel: () => null }));
vi.mock("@/components/product/inquiry-dialog", () => ({ ProductInquiryButton: () => null }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: (input: { data: unknown }) => unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/lib/supabase-public.server", () => ({
  createPublicClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "neq", "order", "limit", "maybeSingle"]) {
        query[method] = () => query;
      }
      query.then = (resolve: (value: unknown) => unknown) =>
        resolve(state.responses.shift() ?? { data: null, error: null });
      return query;
    },
    rpc: () => {
      const call: Record<string, unknown> = {};
      call.then = (resolve: (value: unknown) => unknown) =>
        resolve(state.responses.shift() ?? { data: null, error: null });
      return call;
    },
  }),
}));
vi.mock("@/lib/marketplace-service-catalog.server", () => ({
  readPublicMarketplaceServices: vi.fn(),
  readPublicStoreServices: vi.fn().mockResolvedValue({ items: [], error: null }),
}));

import { Route as ProductRoute } from "@/routes/produk.$slug";
import { Route as ServiceRoute } from "@/routes/layanan.$slug";
import { Route as ArticleRoute } from "@/routes/artikel.$slug";
import { Route as StoreRoute } from "@/routes/toko.$slug";
import { Route as RootRoute } from "@/routes/__root";
import { getArticleBySlug } from "@/lib/articles.functions";
import { getPublicStore } from "@/lib/seller.functions";

type Result = Record<string, unknown>;
type Loader = (input: {
  context: { queryClient: QueryClient };
  params: { slug: string };
}) => Promise<Result>;
const cases = [
  {
    route: ProductRoute,
    path: "produk/$slug",
    field: "product",
    title: "Produk",
    fn: state.product,
  },
  {
    route: ServiceRoute,
    path: "layanan/$slug",
    field: "service",
    title: "Layanan",
    fn: state.service,
  },
  { route: ArticleRoute, path: "artikel/$slug", field: "article", title: "Artikel" },
  { route: StoreRoute, path: "toko/$slug", field: "store", title: "Toko" },
];
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const load = (route: (typeof cases)[number]["route"]) =>
  (route.options.loader as Loader)({
    context: { queryClient: client() },
    params: { slug: "sample" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.responses = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function respond(item: (typeof cases)[number], data: unknown, error: unknown = null) {
  if (item.fn) item.fn.mockResolvedValue({ [item.field]: data, error });
  else {
    state.responses.push({ data, error });
    if (data && !error) state.responses.push({ data: [], error: null });
  }
}

async function routerAt(path: string, routeCase?: (typeof cases)[number]) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: Outlet,
    notFoundComponent: RootRoute.options.notFoundComponent,
    head: RootRoute.options.head as never,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: routeCase?.path ?? "produk/$slug",
    loader: routeCase?.route.options.loader as never,
    head: routeCase?.route.options.head as never,
    component: () => <p>Halaman sehat</p>,
    notFoundComponent: routeCase?.route.options.notFoundComponent,
  });
  const router = createRouter({
    routeTree: root.addChildren([detail as AnyRoute]),
    context: { queryClient: client() },
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: () => <RouteError />,
    // Router >= 1.171 no longer exposes state.statusCode: the SSR status lives
    // on the server-only load result. Force the server path so tests assert the
    // status the HTTP response will actually use.
    isServer: true,
  } as never);
  await router.load();
  return router;
}

/** SSR HTTP status produced by the router's server load path. */
function ssrStatus(router: ReturnType<typeof createRouter>): number | undefined {
  return (router as unknown as { _serverResult?: { status?: number } })._serverResult?.status;
}

describe("klasifikasi detail publik", () => {
  for (const item of cases) {
    it(`${item.title}: absent berhasil adalah notFound`, async () => {
      respond(item, null);
      await expect(load(item.route)).rejects.toSatisfy(isNotFound);
    });
    it(`${item.title}: error query bukan notFound`, async () => {
      respond(item, null, { message: "private database error" });
      await expect(load(item.route)).rejects.toThrow(`${item.title} tidak dapat dimuat.`);
    });
    it(`${item.title}: resource valid tetap normal`, async () => {
      respond(item, { id: "sample", name: "Contoh", title: "Contoh" });
      expect((await load(item.route))[item.field]).toBeTruthy();
    });
    it(`${item.title}: router missing status 404, title dan noindex`, async () => {
      respond(item, null);
      const router = await routerAt(`/${item.path.replace("$slug", "missing")}`, item);
      expect(ssrStatus(router)).toBe(404);
      const meta = router.state.matches.flatMap((match) => match.meta ?? []);
      expect(meta).toContainEqual({ title: `${item.title} tidak ditemukan | Ebrystore` });
      expect(meta).toContainEqual({ name: "robots", content: "noindex" });
    });
    it(`${item.title}: router query error status 500, bukan 404`, async () => {
      respond(item, null, { message: "private database error" });
      const router = await routerAt(`/${item.path.replace("$slug", "sample")}`, item);
      expect(ssrStatus(router)).toBe(500);
      expect(router.state.matches.some((match) => match.status === "notFound")).toBe(false);
      const html = renderToStaticMarkup(<RouterProvider router={router} />);
      expect(html).toContain("Halaman belum dapat dimuat");
      expect(html).not.toContain("private database error");
    });
  }
  it("produk toko gagal tidak menjadi empty state", async () => {
    state.responses = [
      { data: { id: "store" }, error: null },
      { data: null, error: { message: "private error" } },
      { data: { average: 0, total: 0 }, error: null },
      { data: [], error: null },
    ];
    await expect(load(StoreRoute)).rejects.toThrow("Toko tidak dapat dimuat.");
  });
  it("toko berhasil tanpa produk tetap normal", async () => {
    state.responses = [
      { data: { id: "store" }, error: null },
      { data: [], error: null },
      { data: { average: 0, total: 0 }, error: null },
      { data: [], error: null },
    ];
    expect(await load(StoreRoute)).toMatchObject({ store: { id: "store" }, products: [] });
  });
  it("artikel related gagal boleh degradasi optional", async () => {
    state.responses = [
      { data: { id: "article" }, error: null },
      { data: null, error: { message: "related error" } },
    ];
    expect(await getArticleBySlug({ data: { slug: "sample" } })).toEqual({
      article: { id: "article" },
      related: [],
      error: null,
    });
  });
  it("store error discriminator additive dan aman", async () => {
    state.responses = [{ data: null, error: { message: "private error" } }];
    expect(await getPublicStore({ data: { slug: "sample" } })).toMatchObject({
      store: null,
      products: [],
      services: [],
      error: "Toko tidak dapat dimuat.",
    });
  });
});

describe("router dan fallback", () => {
  it.each(["/unknown", "/produk/sample/unknown"])(
    "unknown %s status 404 dan head noindex",
    async (path) => {
      const router = await routerAt(path);
      expect(ssrStatus(router)).toBe(404);
      const html = renderToStaticMarkup(<RouterProvider router={router} />);
      expect(html).toContain("Halaman tidak ditemukan");
      expect(html).toContain('href="/"');
      const head = renderToStaticMarkup(
        <RouterContextProvider router={router}>
          <HeadContent />
        </RouterContextProvider>,
      );
      expect(head).toContain("Halaman tidak ditemukan | Ebrystore");
      expect(head).toContain('name="robots" content="noindex"');
    },
  );
  it("healthy route tidak mendapat noindex palsu", async () => {
    respond(cases[0], { id: "sample", name: "Contoh" });
    const router = await routerAt("/produk/sample", cases[0]);
    expect(ssrStatus(router)).toBe(200);
    expect(router.state.matches.flatMap((match) => match.meta ?? [])).not.toContainEqual({
      name: "robots",
      content: "noindex",
    });
    expect(routeFailureHead([{ status: "success" }])).toBeUndefined();
  });
  it("fallback SSR tanpa reset/router/settings/query provider", () => {
    const html = renderToStaticMarkup(<RouteError />);
    expect(html).toContain('<main lang="id"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain("Muat ulang halaman");
  });
  it.each(["/", "/produk", "/layanan", "/artikel"] as const)("recovery link %s", (href) => {
    expect(renderToStaticMarkup(<RouteError href={href} />)).toContain(`href="${href}"`);
  });
  it("recovery full reload, bukan reset-only atau replay mutasi", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    try {
      const element = RouteError({});
      const button = element.props.children.props.children[1].props.children[0];
      button.props.onClick();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(source("src/components/route-fallback.tsx")).not.toMatch(
      /useQueryClient|invalidate|reset\(|POST|mutation/,
    );
  });
  it("default fallback registered; checkout server contracts untouched", () => {
    expect(source("src/router.tsx")).toContain("defaultErrorComponent: () => <RouteError />");
    expect(source("src/lib/orders.functions.ts")).toContain('error: "Produk tidak dapat dimuat."');
    expect(source("src/lib/catalog.functions.ts")).toContain(
      'error: "Detail layanan sedang tidak dapat dimuat."',
    );
  });
  it("server HTML tetap standalone dan accessible", () => {
    const html = renderErrorPage();
    expect(html).toContain('<html lang="id">');
    expect(html).toContain('<main class="card">');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("min-height: 44px");
    expect(html).toContain(":focus-visible");
    expect(html).toContain('onclick="location.reload()"');
    expect(html).toContain('href="/"');
    expect(html).not.toMatch(/<script|react|supabase|This page didn't load/);
  });
});

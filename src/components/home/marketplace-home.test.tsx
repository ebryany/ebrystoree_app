import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  products: { items: [] as Record<string, unknown>[], error: null as string | null },
  services: { items: [] as Record<string, unknown>[], error: null as string | null },
  sellerServices: { items: [] as Record<string, unknown>[], error: null as string | null },
  categories: { items: [] as Record<string, unknown>[], error: null as string | null },
  serviceCategories: { items: [] as Record<string, unknown>[], error: null as string | null },
  settings: null as Record<string, unknown> | null,
  detailThumbnail: null as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ slug: "template-asli" }),
  }),
  useNavigate: () => vi.fn(),
  useRouterState: (opts?: { select?: (s: unknown) => unknown }) => {
    const routerState = { matches: [{ loaderData: { values: state.settings } }] };
    return opts?.select ? opts.select(routerState) : routerState;
  },
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: { slug: string };
    search?: Record<string, string>;
    children?: ReactNode;
  }) =>
    createElement(
      "a",
      {
        ...props,
        href:
          to.replace("$slug", params?.slug ?? "") +
          (search ? `?${new URLSearchParams(search)}` : ""),
      },
      children,
    ),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => ({ data: null, isPending: false, error: null }),
  useQueryClient: () => ({ resetQueries: vi.fn() }),
  useSuspenseQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === "product-detail"
        ? {
            product: {
              ...product,
              thumbnail_url: state.detailThumbnail,
              download_limit: 5,
              validity_days: 365,
              stores: null,
            },
          }
        : queryKey[0] === "categories"
          ? { product: state.categories, service: state.serviceCategories }
          : queryKey[0] === "storefront-products"
            ? state.products
            : queryKey[0] === "storefront-seller-services"
              ? state.sellerServices
              : state.services,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/catalog.functions", () => ({
  listProducts: vi.fn(),
  listServices: vi.fn(),
  listPublicMarketplaceServices: vi.fn(),
  listCatalogCategories: vi.fn(),
}));
vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/product/review-panel", () => ({ ProductReviewPanel: () => null }));
vi.mock("@/components/product/inquiry-dialog", () => ({ ProductInquiryButton: () => null }));
vi.mock("@/lib/orders.functions", () => ({ getProductDetail: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/rate-limit.server", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(),
  createServerFn: () => {
    const builder: {
      middleware: () => typeof builder;
      validator: (validator: (input: unknown) => unknown) => typeof builder;
      handler: () => { validator: ((input: unknown) => unknown) | undefined };
      _validator?: (input: unknown) => unknown;
    } = {
      middleware: () => builder,
      validator: (validator: (input: unknown) => unknown) => {
        builder._validator = validator;
        return builder;
      },
      handler: () => ({ validator: builder._validator }),
    };
    return builder;
  },
}));

import { Route } from "@/routes/index";
import { Route as ProductRoute } from "@/routes/produk.$slug";
import { saveMyProduct } from "@/lib/seller.functions";
import { isRenderableImageUrl } from "@/lib/utils";
import { BannerBackground } from "./banner-background";
import {
  MarketplaceProductCard,
  MarketplaceServiceCard,
  type ProductCardItem,
} from "./catalog-cards";
import { FIELD_BY_KEY, bannerAssetUrl, validateField } from "@/lib/website-settings";

const product: ProductCardItem = {
  id: "product-1",
  name: "Template asli",
  slug: "template-asli",
  short_description: null,
  thumbnail_url: null,
  price: 100000,
  discount_price: 80000,
  store_name: "Toko Contoh",
  is_official: true,
};
const home = () =>
  renderToStaticMarkup(
    createElement(
      (Route as unknown as { options: { component: ComponentType } }).options.component,
    ),
  );
const card = (overrides: Partial<ProductCardItem> = {}, variant: "default" | "home" = "default") =>
  renderToStaticMarkup(
    <MarketplaceProductCard item={{ ...product, ...overrides }} variant={variant} />,
  );

beforeEach(() => {
  state.products = { items: [], error: null };
  state.services = { items: [], error: null };
  state.sellerServices = { items: [], error: null };
  state.categories = { items: [], error: null };
  state.settings = null;
  state.detailThumbnail = null;
});

describe("Product thumbnail validation", () => {
  const valid = [
    "https://example.com/image.jpg",
    "http://example.com/image.webp",
    "/api/public/catalog-image/products/image.png",
  ];
  const invalid = [
    "ds",
    "",
    "//example.com/image.jpg",
    "/produk",
    "https://",
    "https:///example.com/image.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,a",
    "https://user:pass@example.com/image.jpg",
    "https://example.com/ image.jpg",
    "/api/public/catalog-image/../image.png",
    "/api/public/catalog-image/%2e%2e/image.png",
    "/api/public/catalog-image/%2fimage.png",
    "/api/public/catalog-image/%252e%252e/image.png",
    "/api/public/catalog-image/%",
    "/api/public/catalog-image/",
    "/api/public/catalog-image/image.png?x=1",
    "/api/public/catalog-image/\\\\evil",
  ];
  const detail = () =>
    renderToStaticMarkup(
      createElement(
        (ProductRoute as unknown as { options: { component: ComponentType } }).options.component,
      ),
    );
  const validateSeller = (thumbnailUrl?: string) =>
    (saveMyProduct as unknown as { validator: (input: unknown) => unknown }).validator({
      name: "Template",
      price: 10000,
      thumbnailUrl,
    });

  it.each(valid)("keeps valid thumbnail %s", (url) => {
    expect(isRenderableImageUrl(url)).toBe(true);
    expect(card({ thumbnail_url: url })).toContain(`src="${url}"`);
    state.detailThumbnail = url;
    expect(detail()).toContain(`src="${url}"`);
    expect(() => validateSeller(url)).not.toThrow();
  });

  it.each(invalid)("rejects malformed thumbnail %s without rendering an image", (url) => {
    expect(isRenderableImageUrl(url)).toBe(false);
    for (const variant of ["default", "home"] as const) {
      const html = card({ thumbnail_url: url }, variant);
      expect(html).not.toContain("<img");
      // Tanpa gambar, kartu memakai inisial nama produk sebagai penanda.
      expect(html).toContain("T");
    }
    state.detailThumbnail = url;
    expect(detail()).not.toContain("<img");
    expect(detail()).toContain("grid aspect-[4/3]");
    if (url) expect(() => validateSeller(url)).toThrow("Gambar tidak valid");
  });

  it("allows empty seller thumbnails, trims valid input, and rejects oversized input", () => {
    expect(() => validateSeller()).not.toThrow();
    expect(() => validateSeller("   ")).not.toThrow();
    expect(validateSeller(` ${valid[0]} `)).toMatchObject({ thumbnailUrl: valid[0] });
    expect(() => validateSeller(`https://example.com/${"a".repeat(500)}`)).toThrow();
    for (const value of [null, undefined, 123, {}]) expect(isRenderableImageUrl(value)).toBe(false);
  });
});

describe("Marketplace home", () => {
  it("removes the old discovery panel and does not invent an empty banner", () => {
    const html = home();
    expect(html).not.toContain("Cari kebutuhan digitalmu di Ebrystore.");
    expect(html).not.toContain('aria-label="Pencarian produk digital"');
    expect(html).toContain("Jasa seller");
    expect(html).toContain('href="/layanan"');
  });

  it("renders each product exactly once on the home page", () => {
    state.products.items = [{ ...product }];
    const html = home();
    expect(html.match(/href="\/produk\/template-asli"/g)).toHaveLength(1);
    expect(html).toContain("Jasa seller");
    expect(html).toContain("Layanan dari platform");
    expect(html).not.toMatch(/Ribuan|Populer:|Rekomendasi untukmu|Siap dikirim/);
  });



  it("keeps search and explicit empty states when catalogues are empty", () => {
    const html = home();
    expect(html).toContain("Belum ada produk tersedia.");
    expect(html).toContain("Belum ada layanan tersedia.");
    expect(html).toContain('href="/produk"');
    expect(html).toContain("Belum ada jasa seller tersedia.");
  });

  it("shows separate retryable errors without masking them as empty catalogues", () => {
    state.products.error = "Katalog produk gagal";
    state.services.error = "Katalog layanan gagal";
    const html = home();
    // Dua section dengan data: produk dan jasa seller.
    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html.match(/Coba lagi/g)).toHaveLength(2);
    expect(html).not.toContain("Belum ada produk tersedia.");
    expect(html).toContain('href="/layanan"');
  });
});

describe("Home banner background", () => {
  const uuid = "0f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f";
  const mainUrl = `/api/public/catalog-image/branding/home/${uuid}.jpg`;
  const mobileUrl = `/api/public/catalog-image/branding/home/${uuid}.webp`;

  it("renders the uploaded banner without overlaying the old search panel", () => {
    state.settings = {
      home_banner_image_url: mainUrl,
      home_banner_mobile_image_url: mobileUrl,
      home_banner_alt: "Pesan banner admin",
    };
    const html = home();
    // Banner dirender sebagai latar hero (bukan carousel embla).
    expect(html).toContain('id="hero-banner-host"');
    expect(html).toContain(`srcSet="${mobileUrl}"`);
    expect(html).toContain(`src="${mainUrl}"`);
    expect(html).toContain('alt="Pesan banner admin"');
    expect(html).toContain("object-cover");
    expect(html).not.toContain("Banner berikutnya");
    expect(html).not.toContain("Cari kebutuhan digitalmu di Ebrystore.");
  });

  it("stays neutral when the main image is empty, invalid, or mobile-only", () => {
    for (const settings of [
      { home_banner_image_url: "", home_banner_mobile_image_url: mobileUrl },
      { home_banner_image_url: "https://evil.example.com/banner.jpg" },
      { home_banner_image_url: "/api/public/catalog-image/branding/home/../../etc/passwd.jpg" },
      { home_banner_image_url: "/api/public/catalog-image/branding/home/not-a-uuid.jpg" },
    ]) {
      state.settings = settings as Record<string, unknown>;
      // Banner tidak valid: host banner hero tidak dirender sama sekali
      // (carousel produk tetap ada, jadi asersi tidak menyentuhnya).
      expect(home()).not.toContain('id="hero-banner-host"');
    }
  });

  it("renders the shared renderer with safe defaults for malformed positions", () => {
    const html = renderToStaticMarkup(
      <BannerBackground mainUrl={mainUrl} mobileUrl="" positionX="bukan-angka" positionY={999} />,
    );
    expect(html).toContain("object-position:50% 100%");
    expect(html).toContain('alt=""');
    expect(html).not.toContain('loading="lazy"');
  });

  it("shares the URL guard between renderer and registry validation", () => {
    expect(bannerAssetUrl(mainUrl)).toBe(mainUrl);
    expect(bannerAssetUrl("/api/public/catalog-image/branding/other/xyz.jpg")).toBe("");
    expect(bannerAssetUrl(`${mainUrl}?query=1`)).toBe("");
    expect(bannerAssetUrl(42)).toBe("");
  });
});

describe("Banner settings validation", () => {
  const field = (key: string) => FIELD_BY_KEY.get(key)!;
  const positionCases: [unknown, boolean][] = [
    [50, true],
    [0, true],
    [100, true],
    ["75", true],
    [50.5, false],
    [-1, false],
    [101, false],
    ["NaN", false],
    [Number.POSITIVE_INFINITY, false],
    ["", false],
    ["bukan angka", false],
  ];

  it.each(positionCases)("validates home_banner_position_x %s", (raw, ok) => {
    const result = validateField(field("home_banner_position_x"), raw);
    expect(result.ok).toBe(ok);
    if (ok) expect(result).toEqual({ ok: true, value: Number(raw) });
  });

  it("accepts only the canonical uploaded banner asset path", () => {
    const uuid = "0f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f";
    const valid = `/api/public/catalog-image/branding/home/${uuid}.jpg`;
    expect(validateField(field("home_banner_image_url"), valid)).toEqual({
      ok: true,
      value: valid,
    });
    expect(validateField(field("home_banner_image_url"), "")).toEqual({ ok: true, value: "" });
    for (const raw of [
      "https://cdn.example.com/banner.jpg",
      "//cdn.example.com/banner.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/api/public/catalog-image/branding/home/../../secret.jpg",
      "/api/public/catalog-image/branding/home/short.jpg",
      `${valid}?x=1`,
      `${valid}#frag`,
      "/produk",
      valid.replace("jpg", "svg"),
      valid.replace("jpg", "html"),
    ]) {
      expect(validateField(field("home_banner_image_url"), raw).ok).toBe(false);
    }
    expect(validateField(field("home_banner_mobile_image_url"), valid).ok).toBe(true);
  });
});

describe("Home-only product cards", () => {
  it("opts home into the roomy grid and real product description", () => {
    state.products.items = [{ ...product, short_description: "File template untuk presentasi" }];
    const html = home();
    // Deret kartu beranda: carousel horizontal. Lebar kartu setengah layar di
    // mobile, sepertiga di sm, seperempat di lg.
    expect(html).toContain("basis-[calc(50%-0.375rem)]");
    expect(html).toContain("lg:basis-1/4");
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain("File template untuk presentasi");
    expect(html).toContain("h-full rounded-xl");
    // Harga: bobot dan ukuran dipisah di cn(), jadi diperiksa terpisah.
    expect(html).toContain("font-bold tabular-nums");
    expect(html).toContain("text-lg sm:text-xl");
  });

  it("keeps the default card appearance and hides home-only content", () => {
    const item = {
      ...product,
      thumbnail_url: "/api/public/catalog-image/products/preview.png",
      short_description: "Ringkasan asli",
    };
    const html = renderToStaticMarkup(<MarketplaceProductCard item={item} />);
    expect(html).toBe(
      renderToStaticMarkup(<MarketplaceProductCard item={item} variant="default" />),
    );
    expect(html).toContain("overflow-hidden border border-border bg-card");
    expect(html).toContain("object-cover");
    expect(html).toContain("font-bold tabular-nums");
    // Varian default tidak memuat deskripsi yang hanya untuk beranda.
    expect(html).not.toMatch(/Ringkasan asli|object-contain/);
  });

  it("menampilkan dua CTA pembelian dan gambar dimuat hemat", () => {
    const html = card({ thumbnail_url: "/api/public/catalog-image/products/preview.png" }, "home");
    // Judul tetap tautan ke detail produk.
    expect(html).toContain('href="/produk/template-asli"');
    // Dua aksi pembelian: tambah ke keranjang (tombol) dan beli langsung (tautan).
    expect(html).toContain("<button");
    expect(html).toContain("Keranjang");
    expect(html).toContain("Beli langsung");
    expect(html).toContain('href="/checkout/produk/template-asli"');
    // Gambar dimuat hemat dan dekoratif (alt kosong karena judul sudah menjelaskan).
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt=""');
    expect(html).toContain("object-cover");
    // Fokus keyboard tetap terlihat.
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("does not invent descriptions or official status when data is missing", () => {
    const html = card({ store_name: null, is_official: false, short_description: null }, "home");
    // Tanpa toko, baris meta tidak dirender sama sekali (tidak mengarang nama).
    expect(html).not.toMatch(/Toko Contoh|Toko resmi|>resmi<|mt-2 line-clamp-2/);
    expect(card({ store_name: null }, "home")).toContain("Toko resmi");
    const namedStore = card({}, "home");
    expect(namedStore).toContain("Toko Contoh");
    expect(namedStore.replace(/<[^>]*>/g, "")).toContain("Toko resmi");
    expect(namedStore.match(/lucide-shield-check/g)).toHaveLength(1);
  });
});

describe.each(["default", "home"] as const)("Marketplace price display (%s)", (variant) => {
  it("shows a real discount, store identity, and no unverified readiness claim", () => {
    const html = card({}, variant);
    // Badge diskon sekarang pil persen pendek, mis. "-20%".
    expect(html).toMatch(/-\d+%/);
    expect(html).toMatch(/80[.]000/);
    expect(html).toMatch(/100[.]000/);
    expect(html).toContain("Toko Contoh");
    expect(html.replace(/<[^>]*>/g, "")).toContain("Toko resmi");
    expect(html).not.toContain("Siap dikirim");
  });

  it.each([null, 0, -1, 100000, 120000, "NaN", "Infinity"])(
    "ignores invalid or non-discount price %s",
    (discount_price) => {
      const html = card({ discount_price }, variant);
      expect(html).not.toMatch(/-\d+%/);
      expect(html).toMatch(/100[.]000/);
    },
  );

  it.each([-1, "NaN", "Infinity"])("does not print invalid base price %s", (price) => {
    const html = card({ price }, variant);
    expect(html).toContain("Lihat harga");
    expect(html).not.toMatch(/-\d+%|RpNaN|∞/);
  });

  it("keeps zero price valid without inventing a discount", () => {
    expect(card({ price: 0, discount_price: null }, variant)).not.toContain("Lihat harga");
    expect(card({ price: 0, discount_price: null }, variant)).not.toMatch(/-\d+%/);
  });

  it("chooses only an active valid service package", () => {
    const html = renderToStaticMarkup(
      <MarketplaceServiceCard
        item={{
          id: "service-1",
          name: "Pendampingan",
          slug: "pendampingan",
          short_description: null,
          service_packages: [
            {
              id: "invalid",
              price: "NaN",
              estimated_days: null,
              free_revisions: null,
              is_active: true,
            },
            {
              id: "inactive",
              price: 1,
              estimated_days: null,
              free_revisions: null,
              is_active: false,
            },
            {
              id: "valid",
              price: 50000,
              estimated_days: null,
              free_revisions: null,
              is_active: true,
            },
          ],
        }}
      />,
    );
    expect(html).toMatch(/50[.]000/);
    expect(html).not.toContain("NaN");
  });
});

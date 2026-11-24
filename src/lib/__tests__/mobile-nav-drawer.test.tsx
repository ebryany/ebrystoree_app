import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => "/",
  Link: ({
    to,
    children,
    activeProps: _active,
    search: _search,
    ...props
  }: {
    to: string;
    children?: ReactNode;
    activeProps?: unknown;
    search?: unknown;
  }) => createElement("a", { ...props, href: to }, children),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null }),
  useQueryClient: () => ({ cancelQueries: vi.fn(), clear: vi.fn() }),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(),
}));
vi.mock("@/lib/admin.functions", () => ({ getMyRoles: vi.fn() }));
vi.mock("@/lib/admin-auth.functions", () => ({ adminPortalSignOut: vi.fn() }));
vi.mock("@/lib/inquiries.functions", () => ({ listInquiryUnreadCounts: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/use-website-settings", () => ({
  useWebsiteSettings: () => ({ store_name: "Ebrystore" }),
  useSiteNav: () => [{ url: "/produk", label: "Produk", open_in_new_tab: false }],
}));
vi.mock("@/components/ebry/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/ebry/cart-button", () => ({ CartButton: () => null }));

import { SiteHeader } from "@/components/site-header";

describe("Mobile hamburger navigation drawer (modern web performance & top-layer)", () => {
  it("renders a native <dialog> drawer linked via aria-controls and aria-labelledby", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('aria-label="Buka menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain("<dialog");
    expect(html).toContain("ebry-mobile-drawer");
    expect(html).toContain('aria-label="Tutup menu"');
  });

  it("uses modern top-layer CSS transitions and pure-CSS scroll containment without backdrop blur", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("dialog.ebry-mobile-drawer");
    expect(css).toContain("transition-property: opacity, transform, display, overlay;");
    expect(css).toContain("transition-behavior: allow-discrete;");
    expect(css).toContain("@starting-style");
    expect(css).toContain("dialog.ebry-mobile-drawer:modal");
    expect(css).toContain("overscroll-behavior: contain;");
    expect(css).toContain("dialog.ebry-mobile-drawer::backdrop");
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain("@supports not (content-visibility: auto)");

    const sheetSrc = readFileSync("src/components/ui/sheet.tsx", "utf8");
    expect(sheetSrc).not.toContain("backdrop-blur");
  });
});

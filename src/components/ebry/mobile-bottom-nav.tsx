import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Briefcase, Home, Package, ShoppingCart, UserRound } from "lucide-react";

import { useSession } from "@/hooks/use-session";
import { hydrateCart, setCartOwner, useCart } from "@/lib/cart-store";
import { cn } from "@/lib/utils";

const WORKSPACE_ROUTE_RE = /^\/(dashboard|admin|seller|operator|checkout|auth|see|as)(\/|$)/;

/**
 * Bilah navigasi bawah khusus mobile untuk halaman publik marketplace.
 * Memberi akses satu sentuhan ibu jari ke Beranda, Produk, Jasa, Keranjang, dan Akun.
 */
export function MobileBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user } = useSession();
  const { count } = useCart();

  useEffect(() => {
    setCartOwner(user?.id ?? null);
    hydrateCart();
  }, [user?.id]);

  if (WORKSPACE_ROUTE_RE.test(pathname)) return null;

  const items = [
    {
      key: "home",
      label: "Beranda",
      to: "/" as const,
      icon: Home,
      active: pathname === "/",
      badge: 0,
    },
    {
      key: "products",
      label: "Produk",
      to: "/produk" as const,
      icon: Package,
      active: pathname === "/produk" || pathname.startsWith("/produk/"),
      badge: 0,
    },
    {
      key: "services",
      label: "Jasa",
      to: "/layanan" as const,
      icon: Briefcase,
      active:
        pathname === "/layanan" ||
        pathname.startsWith("/layanan/") ||
        pathname.startsWith("/jasa/"),
      badge: 0,
    },
    {
      key: "cart",
      label: "Keranjang",
      to: "/keranjang" as const,
      icon: ShoppingCart,
      active: pathname === "/keranjang",
      badge: count,
    },
    {
      key: "account",
      label: user ? "Akun" : "Masuk",
      to: (user ? "/dashboard" : "/auth") as "/dashboard" | "/auth",
      icon: UserRound,
      active: pathname.startsWith("/dashboard"),
      badge: 0,
    },
  ];

  return (
    <nav
      aria-label="Navigasi cepat seluler"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-2px_10px_oklch(0.22_0.03_205/6%)] lg:hidden"
    >
      <ul role="list" className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="min-w-0">
              <Link
                to={item.to}
                aria-current={item.active ? "page" : undefined}
                aria-label={
                  item.badge > 0 ? `${item.label}, ${item.badge} item` : item.label
                }
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                  item.active
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-primary"
                  />
                ) : null}
                <span className="relative">
                  <Icon
                    className="size-5"
                    strokeWidth={item.active ? 2.25 : 1.75}
                    aria-hidden="true"
                  />
                  {item.badge > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground"
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

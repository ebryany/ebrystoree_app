import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type BottomNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
  /** Awalan path lain yang juga menandai item ini aktif (mis. katalog + pustaka produk). */
  match?: string[];
};

function isActive(item: BottomNavItem, pathname: string) {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (item.exact ? pathname === item.to || pathname === `${item.to}/` : under(item.to)) return true;
  return Boolean(item.match?.some(under));
}

/**
 * Navigasi bawah mobile. Item aktif melebar jadi pil ikon + label; item lain
 * hanya ikon (label tetap terbaca pembaca layar). Area sentuh selebar kolomnya.
 */
export function BottomNavigation({
  items,
  ariaLabel,
}: {
  items: BottomNavItem[];
  ariaLabel: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label={ariaLabel}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 shadow-[0_-8px_24px_-18px_hsl(0_0%_0%/0.5)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg gap-1 px-1.5 py-1.5">
        {items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li
              key={item.to}
              className={cn(
                "flex min-w-0 justify-center transition-[flex-grow] duration-300 motion-reduce:transition-none",
                active ? "grow-[2.2]" : "grow",
              )}
              style={{ flexBasis: 0 }}
            >
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className="press-scale flex min-h-12 w-full min-w-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span
                  className={cn(
                    "flex h-11 min-w-0 items-center gap-1.5 rounded-full px-3 transition-colors duration-200",
                    active ? "bg-accent/12 text-accent" : "text-muted-foreground",
                  )}
                >
                  <span className="relative shrink-0">
                    <item.icon className="size-5" aria-hidden="true" />
                    {item.badge ? (
                      <span className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground ring-2 ring-background">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className={active ? "truncate text-xs font-semibold" : "sr-only"}>
                    {item.label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

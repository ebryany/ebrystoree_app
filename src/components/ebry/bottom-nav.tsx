import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type BottomNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
};

/** Navigasi bawah mobile (ikon + label, target sentuh >= 44px). */
export function BottomNavigation({ items, ariaLabel }: { items: BottomNavItem[]; ariaLabel: string }) {
  return (
    <nav
      aria-label={ariaLabel}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/80 shadow-[0_-8px_24px_-18px_hsl(0_0%_0%/0.5)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-lg px-1">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <Link
              to={item.to}
              activeOptions={{ exact: Boolean(item.exact) }}
              activeProps={{ className: "text-accent", "data-active": "true" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="press-scale group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span className="relative grid size-9 place-items-center rounded-full transition-all duration-200 group-data-[active=true]:bg-accent/12 group-data-[active=true]:-translate-y-0.5">
                <item.icon
                  className="size-5 transition-transform duration-200 group-active:scale-90 group-data-[active=true]:scale-110"
                  aria-hidden="true"
                />
                {item.badge ? (
                  <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground ring-2 ring-background">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span className="truncate transition-colors group-data-[active=true]:font-semibold">{item.label}</span>
              <span
                className={cn(
                  "absolute inset-x-5 top-0 h-0.5 origin-center scale-x-0 rounded-full bg-accent transition-transform duration-300",
                  "group-data-[active=true]:scale-x-100",
                )}
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
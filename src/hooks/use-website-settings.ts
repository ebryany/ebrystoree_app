import { useRouterState } from "@tanstack/react-router";

import { PUBLIC_DEFAULTS, navFor, type NavItem, type NavLocation } from "@/lib/website-settings";

/** Nilai pengaturan publik yang dimuat root loader (SSR-safe). */
export function useWebsiteSettings(): Record<string, any> {
  const values = useRouterState({
    select: (state) => (state.matches[0]?.loaderData as any)?.values as Record<string, any> | undefined,
  });
  return { ...PUBLIC_DEFAULTS, ...(values ?? {}) };
}

export function useSiteNav(location: NavLocation, isAuthenticated: boolean) {
  const settings = useWebsiteSettings();
  const items = (settings.site_nav_items ?? []) as NavItem[];
  return navFor(items, location).filter(
    (item) =>
      item.is_active &&
      (item.required_auth_state === "any" ||
        (item.required_auth_state === "authenticated" ? isAuthenticated : !isAuthenticated)),
  );
}
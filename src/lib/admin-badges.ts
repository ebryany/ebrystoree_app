import { adminNav, type AdminBadgeKey } from "@/lib/admin-nav";
import type { AdminBadges } from "@/lib/admin.functions";

export const ADMIN_BADGE_KEYS = [
  "sellers",
  "productModeration",
  "serviceModeration",
  "orders",
  "chats",
  "payments",
  "topups",
  "refunds",
  "payouts",
  "tasks",
  "fulfillment",
  "po",
  "security",
] as const satisfies readonly AdminBadgeKey[];

const NAV_ROUTE_ENTRIES = adminNav
  .flatMap((group) => group.items)
  .filter((item): item is typeof item & { to: string } => Boolean(item.available && item.to))
  .sort((a, b) => b.to.length - a.to.length);

/**
 * Petakan pathname rute admin ke kunci badge sidebar yang sesuai.
 *
 * Memakai pencocokan prefiks terpanjang terhadap seluruh item `adminNav` (termasuk
 * rute tanpa badge seperti `/admin/seller/laporan`) agar halaman laporan tidak salah
 * menandai badge `/admin/seller` sebagai sudah dilihat.
 */
export function resolveAdminBadgeKeyForPath(pathname: string): AdminBadgeKey | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  for (const item of NAV_ROUTE_ENTRIES) {
    if (item.exact) {
      if (normalized === item.to) return item.badgeKey ?? null;
      continue;
    }
    if (normalized === item.to || normalized.startsWith(`${item.to}/`)) {
      return item.badgeKey ?? null;
    }
  }
  return null;
}

/** Nolkan satu kunci badge secara optimistik di cache React Query tanpa mengubah kunci lain. */
export function clearAdminBadgeInCache(
  previous: { forbidden?: boolean; badges?: AdminBadges } | undefined,
  badgeKey: AdminBadgeKey,
): { forbidden?: boolean; badges?: AdminBadges } | undefined {
  if (!previous?.badges) return previous;
  if (previous.badges[badgeKey] === 0) return previous;
  return {
    ...previous,
    badges: {
      ...previous.badges,
      [badgeKey]: 0,
    },
  };
}

/** Total angka badge untuk indikator tombol menu seluler admin. */
export function sumAdminBadges(badges: AdminBadges): number {
  return Object.values(badges).reduce((sum, count) => sum + Math.max(0, Number(count || 0)), 0);
}

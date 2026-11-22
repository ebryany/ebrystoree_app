import { safeInternalPath } from "@/lib/utils";

export const ADMIN_SELLER_NOTIFICATION_PREFIX = "admin_seller.";

export type AdminSellerNotificationFilter =
  | "all"
  | "unread"
  | "registration"
  | "verification"
  | "activity";

export type AdminSellerEventCategory = "registration" | "verification" | "activity";

export type AdminSellerNotificationTone = "accent" | "warning" | "success" | "danger" | "neutral";

export type AdminSellerNotificationClassification = {
  category: AdminSellerEventCategory;
  categoryLabel: string;
  activityLabel: string;
  tone: AdminSellerNotificationTone;
};

export type AdminSellerNotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  storeId: string | null;
  storeName: string | null;
  storeSlug: string | null;
  storeExists: boolean;
  category: AdminSellerEventCategory;
  categoryLabel: string;
  activityLabel: string;
  tone: AdminSellerNotificationTone;
  actionUrl: string | null;
  moderationUrl: string | null;
  entityName: string | null;
  eventRef: string | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
  isNew: boolean;
};

export const SELLER_NOTIFICATION_FILTERS: Array<{
  key: AdminSellerNotificationFilter;
  label: string;
}> = [
  { key: "all", label: "Semua" },
  { key: "unread", label: "Belum dibaca" },
  { key: "registration", label: "Seller baru" },
  { key: "verification", label: "Verifikasi" },
  { key: "activity", label: "Aktivitas seller" },
];

export const SELLER_REGISTRATION_TYPES = [
  "admin_seller.registered",
  "admin_seller.auto_approved",
] as const;

export const SELLER_VERIFICATION_TYPES = [
  "admin_seller.reapplied",
  "admin_seller.status_approved",
  "admin_seller.status_rejected",
  "admin_seller.status_suspended",
  "admin_seller.status_reactivated",
  "admin_seller.status_pending",
] as const;

export const SELLER_ACTIVITY_TYPES = [
  "admin_seller.profile_updated",
  "admin_seller.product_submitted",
  "admin_seller.service_submitted",
  "admin_seller.compliance_flagged",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSIFICATION_MAP: Record<string, AdminSellerNotificationClassification> = {
  "admin_seller.registered": {
    category: "registration",
    categoryLabel: "Seller baru",
    activityLabel: "Pendaftaran baru",
    tone: "accent",
  },
  "admin_seller.auto_approved": {
    category: "registration",
    categoryLabel: "Seller baru",
    activityLabel: "Aktif otomatis",
    tone: "success",
  },
  "admin_seller.reapplied": {
    category: "verification",
    categoryLabel: "Verifikasi",
    activityLabel: "Pengajuan ulang",
    tone: "warning",
  },
  "admin_seller.status_pending": {
    category: "verification",
    categoryLabel: "Verifikasi",
    activityLabel: "Menunggu tinjauan",
    tone: "warning",
  },
  "admin_seller.status_approved": {
    category: "verification",
    categoryLabel: "Verifikasi",
    activityLabel: "Disetujui",
    tone: "success",
  },
  "admin_seller.status_rejected": {
    category: "verification",
    categoryLabel: "Verifikasi",
    activityLabel: "Ditolak",
    tone: "danger",
  },
  "admin_seller.status_suspended": {
    category: "verification",
    categoryLabel: "Verifikasi",
    activityLabel: "Ditangguhkan",
    tone: "danger",
  },
  "admin_seller.status_reactivated": {
    category: "verification",
    categoryLabel: "Verifikasi",
    activityLabel: "Diaktifkan ulang",
    tone: "success",
  },
  "admin_seller.profile_updated": {
    category: "activity",
    categoryLabel: "Aktivitas seller",
    activityLabel: "Profil toko diubah",
    tone: "neutral",
  },
  "admin_seller.product_submitted": {
    category: "activity",
    categoryLabel: "Aktivitas seller",
    activityLabel: "Moderasi produk",
    tone: "accent",
  },
  "admin_seller.service_submitted": {
    category: "activity",
    categoryLabel: "Aktivitas seller",
    activityLabel: "Moderasi jasa",
    tone: "accent",
  },
  "admin_seller.compliance_flagged": {
    category: "activity",
    categoryLabel: "Aktivitas seller",
    activityLabel: "Periksa kepatuhan",
    tone: "danger",
  },
};

export function isAdminSellerNotificationType(type: unknown): type is string {
  return typeof type === "string" && type.startsWith(ADMIN_SELLER_NOTIFICATION_PREFIX);
}

export function typesForSellerFilter(
  filter: AdminSellerNotificationFilter,
): readonly string[] | null {
  if (filter === "registration") return SELLER_REGISTRATION_TYPES;
  if (filter === "verification") return SELLER_VERIFICATION_TYPES;
  if (filter === "activity") return SELLER_ACTIVITY_TYPES;
  return null;
}

export function classifySellerNotification(type: string): AdminSellerNotificationClassification {
  return (
    CLASSIFICATION_MAP[type] ?? {
      category: "activity",
      categoryLabel: "Aktivitas seller",
      activityLabel: "Aktivitas seller",
      tone: "neutral",
    }
  );
}

/** Format counter notifikasi belum dibaca: sembunyikan saat 0, tampilkan `99+` di atas 99. */
export function formatUnreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count > 99) return "99+";
  return String(Math.floor(count));
}

function asCleanString(value: unknown, maxLen = 160): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

/** Validasi tujuan internal notifikasi agar aman dari open-redirect atau path non-admin. */
export function resolveSellerNotificationHref(row: {
  action_url?: unknown;
  related_type?: unknown;
  related_id?: unknown;
  metadata?: unknown;
}): string | null {
  const safeAction = safeInternalPath(row.action_url);
  if (safeAction && safeAction.startsWith("/admin/seller")) {
    return safeAction;
  }
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const candidateId =
    row.related_type === "store" && typeof row.related_id === "string"
      ? row.related_id
      : typeof meta?.store_id === "string"
        ? meta.store_id
        : null;
  if (candidateId && UUID_RE.test(candidateId)) {
    return `/admin/seller/${candidateId}`;
  }
  return "/admin/seller";
}

function resolveModerationHref(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const safe = safeInternalPath(meta.moderation_url);
  if (safe && (safe === "/admin/seller/produk" || safe === "/admin/seller/jasa")) {
    return safe;
  }
  return null;
}

export type RawSellerNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  related_type?: string | null;
  related_id?: string | null;
  dedupe_key?: string | null;
  event_ref?: string | null;
  action_url?: string | null;
  metadata?: unknown;
  read_at?: string | null;
  created_at: string;
};

export type StoreLookupEntry = {
  id: string;
  name?: string | null;
  slug?: string | null;
};

/**
 * Normalisasi baris DB/realtime ke payload UI aman.
 * Menanggalkan properti mentah/sensitif dan menyelaraskan ketersediaan toko.
 */
export function extractSafeNotificationSummary(
  row: RawSellerNotificationRow,
  storeLookup?: Map<string, StoreLookupEntry> | null,
  options?: { isNew?: boolean },
): AdminSellerNotificationItem {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;

  const rawStoreId =
    row.related_type === "store" && typeof row.related_id === "string" && UUID_RE.test(row.related_id)
      ? row.related_id
      : typeof meta?.store_id === "string" && UUID_RE.test(meta.store_id)
        ? meta.store_id
        : null;

  const liveStore = rawStoreId && storeLookup ? storeLookup.get(rawStoreId) : undefined;
  const storeExists = rawStoreId ? (storeLookup ? Boolean(liveStore) : true) : false;

  const classification = classifySellerNotification(row.type);
  const actionUrl = storeExists ? resolveSellerNotificationHref(row) : "/admin/seller";

  return {
    id: row.id,
    type: row.type,
    title: asCleanString(row.title, 180) ?? "Aktivitas seller",
    message: asCleanString(row.message, 400) ?? "",
    storeId: rawStoreId,
    storeName: liveStore?.name ?? asCleanString(meta?.store_name, 120),
    storeSlug: liveStore?.slug ?? asCleanString(meta?.store_slug, 80),
    storeExists,
    category: classification.category,
    categoryLabel: classification.categoryLabel,
    activityLabel: classification.activityLabel,
    tone: classification.tone,
    actionUrl,
    moderationUrl: resolveModerationHref(meta),
    entityName: asCleanString(meta?.entity_name, 140),
    eventRef: asCleanString(row.event_ref, 120),
    dedupeKey: asCleanString(row.dedupe_key, 180),
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
    isNew: Boolean(options?.isNew),
  };
}

/**
 * Gabungkan notifikasi existing & incoming secara idempoten.
 * Menghapus duplikasi berdasarkan `id` maupun `dedupeKey`, dan mengurutkan
 * terbaru terlebih dahulu untuk menangani event yang datang tidak berurutan.
 */
export function reconcileNotifications(
  existing: AdminSellerNotificationItem[],
  incoming: AdminSellerNotificationItem[],
): AdminSellerNotificationItem[] {
  const byId = new Map<string, AdminSellerNotificationItem>();
  const byDedupe = new Map<string, string>();

  const upsert = (item: AdminSellerNotificationItem) => {
    const prevById = byId.get(item.id);
    if (prevById) {
      byId.set(item.id, {
        ...prevById,
        ...item,
        isNew: prevById.isNew || item.isNew,
      });
      if (item.dedupeKey) byDedupe.set(item.dedupeKey, item.id);
      return;
    }

    if (item.dedupeKey) {
      const existingId = byDedupe.get(item.dedupeKey);
      if (existingId && existingId !== item.id) {
        const prev = byId.get(existingId);
        if (prev) {
          const prevTs = new Date(prev.createdAt).getTime();
          const nextTs = new Date(item.createdAt).getTime();
          if (nextTs > prevTs) {
            byId.delete(existingId);
            byId.set(item.id, item);
            byDedupe.set(item.dedupeKey, item.id);
          }
          return;
        }
      }
      byDedupe.set(item.dedupeKey, item.id);
    }

    byId.set(item.id, item);
  };

  for (const item of existing) upsert(item);
  for (const item of incoming) upsert(item);

  return [...byId.values()].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
}

const claimedNotificationToasts = new Set<string>();

/**
 * Klaim hak menampilkan toast untuk id notifikasi tertentu agar tidak tampil ganda
 * antara lonceng header admin dan Seller Notification Center.
 */
export function claimNotificationToast(id: unknown): boolean {
  if (typeof id !== "string" || !id) return true;
  if (claimedNotificationToasts.has(id)) return false;
  claimedNotificationToasts.add(id);
  if (claimedNotificationToasts.size > 300) {
    const first = claimedNotificationToasts.values().next().value;
    if (first) claimedNotificationToasts.delete(first);
  }
  return true;
}

export function resetClaimedNotificationToasts(): void {
  claimedNotificationToasts.clear();
}

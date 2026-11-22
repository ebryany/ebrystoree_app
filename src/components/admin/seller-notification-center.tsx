import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Store,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";

import { useCan } from "@/components/admin/admin-ui";
import { relativeTime } from "@/components/ebry/notification-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useAdminSellerNotifications,
  type AdminSellerRealtimeStatus,
} from "@/hooks/use-admin-seller-notifications";
import {
  formatUnreadBadge,
  SELLER_NOTIFICATION_FILTERS,
  type AdminSellerNotificationFilter,
  type AdminSellerNotificationItem,
  type AdminSellerNotificationTone,
} from "@/lib/admin-seller-notifications";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  AdminSellerRealtimeStatus,
  { label: string; dot: string }
> = {
  subscribed: { label: "Live", dot: "bg-success" },
  connecting: { label: "Menghubungkan…", dot: "bg-amber-500" },
  reconnecting: { label: "Menyambung ulang…", dot: "bg-amber-500 animate-pulse" },
  error: { label: "Terputus (Sinkronisasi manual)", dot: "bg-destructive" },
  offline: { label: "Offline", dot: "bg-muted-foreground" },
};

const TONE_WRAP: Record<AdminSellerNotificationTone, string> = {
  accent: "bg-surface-selected text-accent border border-accent/20",
  success: "bg-success/12 text-success border border-success/20",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25",
  danger: "bg-destructive/10 text-destructive border border-destructive/20",
  neutral: "bg-muted text-muted-foreground border border-border",
};

function CategoryIcon({ item }: { item: AdminSellerNotificationItem }) {
  if (item.category === "registration") {
    return <UserPlus className="size-4" aria-hidden="true" />;
  }
  if (item.tone === "danger") {
    return <ShieldAlert className="size-4" aria-hidden="true" />;
  }
  return <Store className="size-4" aria-hidden="true" />;
}

/**
 * Pusat Notifikasi Seller real-time untuk halaman `/admin/seller` dan `/admin/seller/$id`.
 * Mengikuti token tema Ebrystore (Deep Teal, Cream, Soft Mint, Charcoal).
 */
export function SellerNotificationCenter({ className }: { className?: string }) {
  const canViewSellers = useCan("sellers.view");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AdminSellerNotificationFilter>("all");

  const {
    items,
    unreadCount,
    categoryCounts,
    hasMore,
    isPending,
    isFetching,
    isLoadingMore,
    forbidden,
    error,
    connectionStatus,
    pulse,
    soundEnabled,
    toggleSound,
    refetch,
    loadMore,
    markAsRead,
    markAllRead,
  } = useAdminSellerNotifications({ enabled: canViewSellers, filter });

  if (!canViewSellers || forbidden) return null;

  const badgeText = formatUnreadBadge(unreadCount);
  const statusInfo = STATUS_META[connectionStatus];

  async function handleOpenSeller(item: AdminSellerNotificationItem) {
    if (!item.readAt) {
      await markAsRead(item.id, true);
    }
    setOpen(false);
    if (item.storeExists && item.storeId) {
      await navigate({ to: "/admin/seller/$id", params: { id: item.storeId } });
    } else {
      await navigate({ to: "/admin/seller" });
    }
  }

  return (
    <div className={cn("inline-flex items-center", className)}>
      {/* Live region DOM cadangan untuk pembaca layar bila ariaNotify belum didukung */}
      <p id="ebry-notif-live" className="sr-only" aria-live="polite" aria-atomic="true" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={
              unreadCount > 0
                ? `Notifikasi seller, ${unreadCount} belum dibaca`
                : "Notifikasi seller"
            }
            className={cn(
              "relative min-h-11 gap-2 border-border bg-card px-3 text-foreground shadow-none hover:bg-surface-selected/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              unreadCount > 0 && "border-accent/40",
            )}
          >
            <span className="relative inline-flex items-center">
              <Bell
                className={cn(
                  "size-4 text-accent transition-transform motion-reduce:animate-none",
                  pulse && "animate-bounce",
                )}
                aria-hidden="true"
              />
              <span
                title={`Status realtime: ${statusInfo.label}`}
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-card",
                  statusInfo.dot,
                )}
              />
            </span>
            <span className="hidden sm:inline">Notifikasi</span>
            {badgeText ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums text-accent-foreground">
                {badgeText}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-[min(27rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl"
        >
          {/* Header Panel */}
          <div className="border-b border-border bg-surface-selected/45 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display text-sm font-bold text-foreground">
                    Aktivitas Seller
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", statusInfo.dot)} aria-hidden="true" />
                    {statusInfo.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} notifikasi belum dibaca`
                    : "Semua aktivitas seller telah dibaca"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={toggleSound}
                  aria-label={soundEnabled ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"}
                  title={soundEnabled ? "Suara aktif" : "Suara mati"}
                >
                  {soundEnabled ? (
                    <Volume2 className="size-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  aria-label="Segarkan notifikasi seller"
                  title="Segarkan"
                >
                  <RefreshCw
                    className={cn("size-4", isFetching && "animate-spin motion-reduce:animate-none")}
                    aria-hidden="true"
                  />
                </Button>
                {unreadCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-accent hover:bg-surface-selected hover:text-accent"
                    onClick={() => void markAllRead()}
                  >
                    <CheckCheck className="size-3.5" aria-hidden="true" />
                    Tandai semua
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Filter Kategori */}
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter notifikasi">
              {SELLER_NOTIFICATION_FILTERS.map((f) => {
                const count =
                  f.key === "all"
                    ? categoryCounts.all
                    : f.key === "unread"
                      ? unreadCount
                      : categoryCounts[f.key];
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span>{f.label}</span>
                    {count > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                          active
                            ? "bg-accent-foreground/20 text-accent-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Konten Daftar */}
          <ScrollArea className="max-h-[24rem]">
            {isPending ? (
              <div className="space-y-3 p-4" aria-label="Memuat notifikasi seller">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex gap-3 rounded-xl border border-border/60 bg-surface/50 p-3"
                  >
                    <div className="size-9 shrink-0 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                      <div className="h-3.5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                      <div className="h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <AlertTriangle className="mx-auto size-7 text-destructive" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-foreground">{error}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Anda tetap dapat menggunakan daftar seller di bawah sambil mencoba ulang.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-9"
                  onClick={() => void refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-selected text-accent">
                  <Bell className="size-5" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {filter === "unread"
                    ? "Tidak ada notifikasi belum dibaca"
                    : "Belum ada notifikasi pada filter ini"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pendaftaran baru, verifikasi, dan aktivitas penting seller akan muncul langsung di sini.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const isUnread = item.readAt === null;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "relative px-4 py-3.5 transition-colors hover:bg-muted/40",
                        isUnread && "bg-surface-selected/45",
                      )}
                    >
                      {isUnread ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-accent"
                        />
                      ) : null}

                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
                            TONE_WRAP[item.tone],
                          )}
                        >
                          <CategoryIcon item={item} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {item.activityLabel}
                            </span>
                            {item.isNew ? (
                              <Badge
                                variant="secondary"
                                className="h-4 bg-accent px-1.5 text-[10px] font-bold text-accent-foreground"
                              >
                                Baru
                              </Badge>
                            ) : null}
                            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {relativeTime(item.createdAt)}
                            </span>
                          </div>

                          <p
                            className={cn(
                              "mt-1 text-sm leading-snug text-foreground",
                              isUnread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {item.title}
                          </p>

                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {item.message}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            {item.storeName ? (
                              <span className="inline-flex max-w-[11rem] items-center gap-1 truncate rounded-md border border-border bg-background px-1.5 py-0.5 font-medium text-foreground">
                                <Store className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="truncate">{item.storeName}</span>
                              </span>
                            ) : null}

                            {item.storeExists && item.storeId ? (
                              <button
                                type="button"
                                onClick={() => void handleOpenSeller(item)}
                                className="inline-flex min-h-7 items-center gap-0.5 rounded py-1 font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                Buka detail seller
                                <ArrowUpRight className="size-3" aria-hidden="true" />
                              </button>
                            ) : (
                              <span className="text-muted-foreground">Seller tidak tersedia</span>
                            )}

                            {item.moderationUrl ? (
                              <Link
                                to={item.moderationUrl as never}
                                onClick={() => {
                                  if (!item.readAt) void markAsRead(item.id, true);
                                  setOpen(false);
                                }}
                                className="inline-flex min-h-7 items-center gap-0.5 rounded py-1 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                Moderasi
                                <ExternalLink className="size-3" aria-hidden="true" />
                              </Link>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => void markAsRead(item.id, isUnread)}
                              className="ml-auto inline-flex min-h-7 items-center rounded py-1 font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {isUnread ? "Tandai dibaca" : "Tandai belum dibaca"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMore ? (
              <div className="border-t border-border p-2 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLoadingMore}
                  onClick={() => void loadMore()}
                  className="min-h-9 w-full text-xs font-semibold text-accent"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
                      Memuat notifikasi…
                    </>
                  ) : (
                    "Muat lebih banyak"
                  )}
                </Button>
              </div>
            ) : null}
          </ScrollArea>

          {/* Footer Panel */}
          <div className="border-t border-border bg-surface/50 p-2">
            <Button asChild variant="ghost" size="sm" className="min-h-9 w-full text-xs font-medium">
              <Link to="/dashboard/notifikasi" onClick={() => setOpen(false)}>
                Lihat semua notifikasi
              </Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, ChevronRight, Inbox, Volume2, VolumeX } from "lucide-react";

import { AdminError } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/ebry/states";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { getMyRoles } from "@/lib/admin.functions";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/orders.functions";
import {
  dayGroupLabel,
  isPayoutStaff,
  NOTIFICATION_CATEGORIES,
  notificationCategory,
  notificationHref,
  notificationTone,
  relativeTime,
  type NotificationCategory,
} from "@/components/ebry/notification-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/notifikasi")({
  head: () => ({
    meta: [
      { title: "Notifikasi — Ebrystore" },
      {
        name: "description",
        content: "Pemberitahuan pesanan, pembayaran, dan refund akun Ebrystore Anda.",
      },
      { property: "og:title", content: "Notifikasi — Ebrystore" },
      { property: "og:description", content: "Riwayat pemberitahuan akun Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Notifikasi,
});

type Item = {
  id: string;
  type: string;
  title: string;
  message: string;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
};

type CategoryFilter = "all" | NotificationCategory;

function Notifikasi() {
  const queryClient = useQueryClient();
  const fetchItems = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const fetchRoles = useServerFn(getMyRoles);
  const sound = useNotificationSound();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchItems({}),
  });
  const { data: rolesData } = useQuery({ queryKey: ["my-roles"], queryFn: () => fetchRoles({}) });
  const staff = isPayoutStaff((rolesData as { roles?: string[] } | undefined)?.roles);

  useRealtimeRefresh({
    channel: "my-notifications-page",
    tables: ["notifications"],
    keys: [["my-notifications"], ["customer-summary"]],
  });

  const items = ((data as { items?: Item[] } | undefined)?.items ?? []) as Item[];
  const unread = items.filter((n) => !n.read_at).length;

  // Hitung total & belum dibaca per kategori sekali, dipakai sidebar dan chip.
  const counts = useMemo(() => {
    const map = new Map<CategoryFilter, { total: number; unread: number }>();
    map.set("all", { total: items.length, unread });
    for (const c of NOTIFICATION_CATEGORIES) map.set(c.key, { total: 0, unread: 0 });
    for (const n of items) {
      const entry = map.get(notificationCategory(n.type))!;
      entry.total += 1;
      if (!n.read_at) entry.unread += 1;
    }
    return map;
  }, [items, unread]);

  const groups = useMemo(() => {
    const visible = items.filter(
      (n) =>
        (category === "all" || notificationCategory(n.type) === category) &&
        (!unreadOnly || !n.read_at),
    );
    const map = new Map<string, Item[]>();
    for (const n of visible) {
      const key = dayGroupLabel(n.created_at);
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return [...map.entries()];
  }, [items, category, unreadOnly]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-summary"] });
  }
  async function handleRead(id: string) {
    await markRead({ data: { id } });
    await refresh();
  }
  async function handleReadAll() {
    await markAll({});
    await refresh();
  }

  const filters: Array<{ key: CategoryFilter; label: string; icon: typeof Bell }> = [
    { key: "all", label: "Semua", icon: Inbox },
    // Kategori kosong disembunyikan supaya daftar filter tidak penuh angka nol.
    ...NOTIFICATION_CATEGORIES.filter((c) => (counts.get(c.key)?.total ?? 0) > 0),
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground sm:text-xl">Notifikasi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unread > 0
              ? `${unread} belum dibaca dari ${items.length} pemberitahuan`
              : "Semua pemberitahuan sudah dibaca"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={sound.toggle}
            aria-label={sound.enabled ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"}
            title={sound.enabled ? "Suara aktif" : "Suara mati"}
            className="grid size-11 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sound.enabled ? (
              <Volume2 className="size-4" aria-hidden="true" />
            ) : (
              <VolumeX className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={handleReadAll}
            disabled={unread === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CheckCheck className="size-4 text-accent" aria-hidden="true" />
            Tandai semua dibaca
          </button>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop: daftar kategori di kiri. HP: chip geser di atas daftar. */}
        <nav
          aria-label="Kategori notifikasi"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-2"
        >
          {filters.map((f) => {
            const active = category === f.key;
            const c = counts.get(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(f.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "lg:w-full lg:rounded-lg lg:border-transparent lg:px-3",
                  active
                    ? "border-transparent bg-primary text-primary-foreground lg:bg-surface-selected lg:font-semibold lg:text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground lg:bg-transparent lg:hover:bg-surface",
                )}
              >
                <f.icon className="hidden size-4 shrink-0 lg:block" aria-hidden="true" />
                <span className="truncate lg:flex-1 lg:text-left">{f.label}</span>
                {c && c.unread > 0 ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums leading-5",
                      active ? "bg-primary-foreground/20 lg:bg-accent lg:text-accent-foreground" : "bg-accent text-accent-foreground",
                    )}
                  >
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                ) : (
                  <span className="hidden text-xs tabular-nums text-muted-foreground lg:inline">
                    {c?.total ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <section aria-label="Daftar notifikasi" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <div role="tablist" aria-label="Status baca" className="flex gap-1">
              {[
                { key: false, label: "Semua" },
                { key: true, label: "Belum dibaca" },
              ].map((t) => (
                <button
                  key={t.label}
                  type="button"
                  role="tab"
                  aria-selected={unreadOnly === t.key}
                  onClick={() => setUnreadOnly(t.key)}
                  className={cn(
                    "relative min-h-11 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    unreadOnly === t.key
                      ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {groups.reduce((s, [, list]) => s + list.length, 0)} ditampilkan
            </span>
          </div>

          {isPending ? (
            <ul aria-busy="true" className="divide-y divide-border">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex gap-3 px-4 py-4">
                  <span className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                    <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
                  </span>
                </li>
              ))}
            </ul>
          ) : error || (data as { error?: string } | undefined)?.error ? (
            <div className="p-4">
              <AdminError message={(data as { error?: string } | undefined)?.error ?? undefined} />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={Bell}
              className="m-4 border-0"
              title={unreadOnly ? "Tidak ada yang belum dibaca" : "Belum ada notifikasi"}
              description={
                unreadOnly
                  ? "Semua pemberitahuan di kategori ini sudah Anda baca."
                  : "Kabar pesanan, pembayaran, dan saldo akan muncul di sini."
              }
            />
          ) : (
            groups.map(([label, list]) => (
              <div key={label}>
                <h2 className="sticky top-0 border-b border-border bg-surface px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </h2>
                <ul className="divide-y divide-border">
                  {list.map((n) => (
                    <NotificationRow
                      key={n.id}
                      item={n}
                      staff={staff}
                      onRead={() => handleRead(n.id)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function NotificationRow({
  item: n,
  staff,
  onRead,
}: {
  item: Item;
  staff: boolean;
  onRead: () => void;
}) {
  const tone = notificationTone(n.type);
  const Icon = tone.icon;
  const unread = !n.read_at;
  const href = notificationHref(n, staff);

  const body = (
    <>
      <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-full", tone.wrap)}>
        <Icon className="size-[18px]" aria-hidden="true" />
        {unread ? (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-destructive"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn("line-clamp-1 text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>
            {unread ? <span className="sr-only">Belum dibaca: </span> : null}
            {n.title}
          </p>
          <time
            dateTime={n.created_at}
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
          >
            {relativeTime(n.created_at)}
          </time>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {n.message}
        </p>
        <span className="mt-1.5 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tone.label}
        </span>
      </div>
      {href ? (
        <ChevronRight
          className="mt-3 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const rowClass = cn(
    "group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    unread && "bg-accent/[0.04]",
  );

  return (
    <li className="relative">
      {href ? (
        // Membuka notifikasi sekaligus menandainya dibaca.
        <Link
          to={href.to as never}
          params={href.params as never}
          onClick={unread ? onRead : undefined}
          className={rowClass}
        >
          {body}
        </Link>
      ) : (
        <button type="button" onClick={unread ? onRead : undefined} className={rowClass}>
          {body}
        </button>
      )}
    </li>
  );
}

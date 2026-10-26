import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { BankListRow, InlineEmpty, PageHeader, SegmentedFilter } from "@/components/ebry/cards";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { Button } from "@/components/ui/button";
import { getMyRoles } from "@/lib/admin.functions";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/orders.functions";
import {
  dayGroupLabel,
  isPayoutStaff,
  notificationTone,
  relativeTime,
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

type Filter = "all" | "unread";

function Notifikasi() {
  const queryClient = useQueryClient();
  const fetchItems = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const sound = useNotificationSound();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isPending, error } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchItems({}),
  });
  const fetchRoles = useServerFn(getMyRoles);
  const { data: rolesData } = useQuery({ queryKey: ["my-roles"], queryFn: () => fetchRoles({}) });
  const staff = isPayoutStaff((rolesData as any)?.roles);

  useRealtimeRefresh({
    channel: "my-notifications-page",
    tables: ["notifications"],
    keys: [["my-notifications"], ["customer-summary"]],
  });

  const items: any[] = (data as any)?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const groups = useMemo(() => {
    const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;
    const map = new Map<string, any[]>();
    for (const n of visible) {
      const key = dayGroupLabel(n.created_at);
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items, filter]);

  async function handleRead(id: string) {
    await markRead({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-summary"] });
  }

  async function handleReadAll() {
    await markAll({});
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-summary"] });
  }

  return (
    <div className="-mt-5 space-y-4 md:mt-0">
      <PageHeader
        icon={Bell}
        title="Notifikasi"
        description={
          unread > 0 ? `${unread} pemberitahuan belum dibaca` : "Semua pemberitahuan sudah dibaca"
        }
        action={
          unread > 0 ? (
            <button
              type="button"
              onClick={handleReadAll}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Semua
            </button>
          ) : null
        }
      />

      <div className="flex items-center justify-between gap-2">
        <SegmentedFilter
          options={[
            { key: "all", label: `Semua (${items.length})` },
            { key: "unread", label: `Belum dibaca (${unread})` },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as Filter)}
        />
        <button
          type="button"
          onClick={sound.toggle}
          aria-label={sound.enabled ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {sound.enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
      </div>

      {isPending ? (
        <AdminLoading label="Memuat notifikasi…" />
      ) : error ? (
        <AdminError />
      ) : (data as any).error ? (
        <AdminError message={(data as any).error} />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl bg-card">
          <InlineEmpty
            icon={Bell}
            text={
              filter === "unread"
                ? "Tidak ada yang belum dibaca."
                : "Belum ada notifikasi. Kabar pesanan & pembayaran akan muncul di sini."
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([label, list]) => (
            <section key={label} className="space-y-1.5">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </h2>
              <ul className="overflow-hidden rounded-2xl bg-card">
                {list.map((n: any) => {
                  const tone = notificationTone(n.type);
                  const Icon = tone.icon;
                  const unreadItem = !n.read_at;
                  const isPayout = n.related_type === "payout" && n.related_id;
                  return (
                    <li key={n.id} className="relative">
                      {unreadItem ? (
                        <span
                          className="absolute inset-y-3 left-0 w-1 rounded-full bg-accent"
                          aria-hidden="true"
                        />
                      ) : null}
                      <BankListRow
                        icon={Icon}
                        title={n.title}
                        subtitle={`${tone.label} · ${relativeTime(n.created_at)}`}
                        value={
                          <>
                            {isPayout ? (
                              staff ? (
                                <Button
                                  asChild
                                  variant="ghost"
                                  className="min-h-9 px-2.5 text-[11px] font-semibold text-accent"
                                >
                                  <Link to="/admin/payouts/$id" params={{ id: n.related_id }}>
                                    Lihat
                                  </Link>
                                </Button>
                              ) : (
                                <Button
                                  asChild
                                  variant="ghost"
                                  className="min-h-9 px-2.5 text-[11px] font-semibold text-accent"
                                >
                                  <Link to="/seller/keuangan">Lihat</Link>
                                </Button>
                              )
                            ) : null}
                            {unreadItem ? (
                              <button
                                type="button"
                                onClick={() => handleRead(n.id)}
                                className="rounded-full border border-accent/40 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                Tandai
                              </button>
                            ) : null}
                          </>
                        }
                      />
                      <p
                        className={cn(
                          "-mt-1 px-4 pb-3 text-xs leading-relaxed text-muted-foreground",
                          unreadItem && "pl-[4.25rem]",
                        )}
                      >
                        {n.message}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

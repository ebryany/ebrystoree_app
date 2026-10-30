import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession } from "@/hooks/use-session";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { getMyRoles } from "@/lib/admin.functions";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/orders.functions";
import { isPayoutStaff, notificationTone, relativeTime } from "@/components/ebry/notification-meta";
import { pushNotificationToast } from "@/components/ebry/notification-toast";
import { cn } from "@/lib/utils";

const seenNotifications = new Set<string>();

/** true bila id ini belum pernah diproses di tab ini. */
function claimNotification(id: unknown): boolean {
  if (typeof id !== "string") return true;
  if (seenNotifications.has(id)) return false;
  seenNotifications.add(id);
  if (seenNotifications.size > 200) seenNotifications.clear();
  return true;
}

/** Bubble notifikasi realtime dengan badge jumlah belum dibaca + suara lonceng. */
export function NotificationBell({ className }: { className?: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const fetchItems = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const sound = useNotificationSound();
  const playRef = useRef(sound.play);
  playRef.current = sound.play;

  const { data } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchItems({}),
    enabled: Boolean(user),
  });
  // Role dipakai untuk tujuan tautan notifikasi payout (staff → antrean finance,
  // seller → keuangannya). Query key sama dengan site-header supaya cache gabung.
  const fetchRoles = useServerFn(getMyRoles);
  const { data: rolesData } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles({}),
    enabled: Boolean(user),
  });

  const items: any[] = (data as any)?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  useRealtimeRefresh({
    channel: "notification-bell",
    tables: ["notifications"],
    filter: user ? `recipient_id=eq.${user.id}` : undefined,
    keys: [["my-notifications"], ["customer-summary"]],
    enabled: Boolean(user),
    onEvent: (payload) => {
      if (payload.eventType === "INSERT" && payload.new?.title) {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 1600);
        // Lonceng dipasang lebih dari sekali (header desktop + mobile); hanya
        // instance pertama yang menerima id ini boleh berbunyi dan menampilkan kartu.
        if (!claimNotification(payload.new.id)) return;
        // Pengguna sedang membuka halaman objek notifikasi ini (mis. detail pesanan
        // yang baru ia batalkan): toast aksi di halaman itu sudah cukup.
        const related = payload.new.related_id as string | null | undefined;
        if (related && window.location.pathname.includes(related)) return;
        playRef.current();
        pushNotificationToast({
          id: payload.new.id,
          title: payload.new.title,
          message: payload.new.message,
          type: payload.new.type,
          href: "/dashboard/notifikasi",
        });
      }
    },
  });

  if (!user) return null;

  async function handleRead(id: string) {
    await markRead({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  }

  async function handleReadAll() {
    await markAll({});
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-summary"] });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
          className={cn("relative min-h-11 min-w-11", className)}
        >
          <Bell
            className={cn("size-5 transition-transform", pulse && "animate-bounce")}
            aria-hidden="true"
          />
          {unread > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 size-4 animate-ping rounded-full bg-destructive/40"
              />
              <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground shadow-sm">
                {unread > 9 ? "9+" : unread}
              </span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        alignOffset={0}
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl p-0 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-br from-accent/10 to-transparent px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Notifikasi</p>
            <p className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} belum dibaca` : "Semua sudah dibaca"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={sound.toggle}
              aria-label={sound.enabled ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"}
              title={sound.enabled ? "Suara aktif" : "Suara mati"}
            >
              {sound.enabled ? (
                <Volume2 className="size-4" aria-hidden="true" />
              ) : (
                <VolumeX className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
            </Button>
            {unread > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                onClick={handleReadAll}
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Tandai semua
              </Button>
            ) : null}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Bell className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium">Belum ada notifikasi</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Kabar pesanan dan pembayaran akan muncul di sini.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.slice(0, 8).map((n) => {
                const tone = notificationTone(n.type);
                const Icon = tone.icon;
                const isPayout = n.related_type === "payout" && n.related_id;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "group relative px-4 py-3 transition-colors hover:bg-muted/50",
                      n.read_at ? "" : "bg-accent/[0.06]",
                    )}
                  >
                    {n.read_at ? null : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent"
                      />
                    )}
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
                          tone.wrap,
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {tone.label}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {relativeTime(n.created_at)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "mt-0.5 text-sm leading-snug",
                            n.read_at ? "font-medium" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.message}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          {n.read_at ? null : (
                            <button
                              type="button"
                              onClick={() => handleRead(n.id)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Tandai dibaca
                            </button>
                          )}
                          {isPayout && isPayoutStaff((rolesData as any)?.roles) ? (
                            <Link
                              to="/admin/payouts/$id"
                              params={{ id: n.related_id }}
                              onClick={() => setOpen(false)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Lihat permintaan
                            </Link>
                          ) : isPayout ? (
                            <Link
                              to="/seller/keuangan"
                              onClick={() => setOpen(false)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Lihat keuangan
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/dashboard/notifikasi" onClick={() => setOpen(false)}>
              Lihat semua notifikasi
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

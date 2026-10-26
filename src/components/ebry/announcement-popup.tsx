import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Sparkle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { listMyNotifications, markNotificationRead } from "@/lib/orders.functions";

const POPUP_TYPES = new Set(["announcement", "promo", "maintenance", "info"]);
const TYPE_LABEL: Record<string, string> = {
  announcement: "Pengumuman",
  promo: "Promo",
  maintenance: "Pemeliharaan",
  info: "Informasi",
};

/**
 * Pop-up modern untuk pengumuman dari admin.
 * Muncul otomatis saat ada pengumuman belum dibaca, ditutup = ditandai dibaca.
 */
export function AnnouncementPopup() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const fetchItems = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const { data } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchItems({}),
    enabled: Boolean(user),
  });

  const current = useMemo(() => {
    const items: any[] = (data as any)?.items ?? [];
    return items.find((n) => !n.read_at && POPUP_TYPES.has(n.type) && !dismissed.includes(n.id)) ?? null;
  }, [data, dismissed]);

  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(Boolean(current));
  }, [current]);

  if (!user || !current) return null;

  async function close() {
    const id = current!.id;
    setOpen(false);
    setDismissed((prev) => [...prev, id]);
    await markRead({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : void close())}>
      <DialogContent
        surface="glass-glow"
        className="overflow-hidden p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <div className="relative isolate bg-gradient-to-br from-accent/20 via-primary/10 to-transparent px-6 pb-5 pt-7 text-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-accent/20 blur-2xl"
          />
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-accent/30 bg-background/70 shadow-sm backdrop-blur">
            <Megaphone className="size-6 text-accent" aria-hidden="true" />
          </div>
          <p className="mt-4 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-background/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            <Sparkle className="size-3" aria-hidden="true" />
            {TYPE_LABEL[current.type] ?? "Pengumuman"}
          </p>
          <h2 className="mt-3 text-balance text-lg font-bold leading-snug">{current.title}</h2>
        </div>
        <div className="px-6 pb-6">
          <p className="whitespace-pre-wrap text-center text-sm leading-relaxed text-muted-foreground">
            {current.message}
          </p>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {new Date(current.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <Button className="mt-5 w-full" onClick={() => void close()}>
            Mengerti
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

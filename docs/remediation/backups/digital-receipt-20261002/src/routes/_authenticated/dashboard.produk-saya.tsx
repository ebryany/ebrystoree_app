import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/ebry/cards";
import { InlineEmpty } from "@/components/ebry/cards";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { downloadEntitlement, listMyEntitlements } from "@/lib/orders.functions";
import { cn } from "@/lib/utils";
import { CalendarClock, Download, FileArchive, Loader2, Package, ShieldOff, TimerOff } from "lucide-react";

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export const Route = createFileRoute("/_authenticated/dashboard/produk-saya")({
  head: () => ({
    meta: [
      { title: "Produk Saya — Ebrystore" },
      { name: "description", content: "Pustaka produk digital Anda beserta sisa kuota unduhan dan masa berlaku." },
      { property: "og:title", content: "Produk Saya — Ebrystore" },
      { property: "og:description", content: "Unduh produk digital yang sudah Anda beli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProdukSaya,
});

function ProdukSaya() {
  const queryClient = useQueryClient();
  const fetchItems = useServerFn(listMyEntitlements);
  const download = useServerFn(downloadEntitlement);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isPending, error } = useQuery({ queryKey: ["my-entitlements"], queryFn: () => fetchItems({}) });

  useRealtimeRefresh({
    channel: "my-entitlements",
    tables: ["digital_entitlements", "download_logs"],
    keys: [["my-entitlements"]],
  });

  async function handleDownload(id: string) {
    setBusyId(id);
    const result = await download({ data: { entitlementId: id } });
    setBusyId(null);
    if (!result.ok) return toast.error(result.error);
    toast.success(`Unduhan dimulai. Sisa kuota: ${result.remaining}`);
    window.location.href = result.url;
    await queryClient.invalidateQueries({ queryKey: ["my-entitlements"] });
  }

  return (
    <div className="-mt-5 space-y-4 md:mt-0">
      <PageHeader
        icon={Package}
        title="Produk saya"
        description="Setiap unduhan mengurangi kuota dan tercatat untuk keamanan akunmu"
      />

      {isPending ? (
        <AdminLoading label="Memuat pustaka…" />
      ) : error ? (
        <AdminError />
      ) : data.error ? (
        <AdminError message={data.error} />
      ) : data.items.length === 0 ? (
        <div className="rounded-2xl bg-card">
          <InlineEmpty
            icon={FileArchive}
            text="Belum ada produk digital yang bisa diunduh."
            actionLabel="Ke katalog"
            to="/produk"
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((e: any) => {
            const remaining = Number(e.download_limit) - Number(e.download_count);
            const expired = e.valid_until ? new Date(e.valid_until) < new Date() : false;
            const revoked = Boolean(e.revoked_at);
            const limit = Math.max(1, Number(e.download_limit));
            const usedPct = Math.min(100, Math.round((Number(e.download_count) / limit) * 100));
            const left = daysLeft(e.valid_until);
            const locked = revoked || expired || remaining <= 0;
            const product = e.digital_products ?? {};
            return (
              <li
                key={e.id}
                className="group flex flex-col overflow-hidden rounded-2xl bg-card transition-shadow hover:elev-2"
              >
                <div className="relative h-24 overflow-hidden bg-surface-selected">
                  {product.thumbnail_url ? (
                    <img
                      src={product.thumbnail_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      aria-hidden="true"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-muted-foreground">
                      <FileArchive className="size-8" aria-hidden="true" />
                    </span>
                  )}
                  <span
                    className={cn(
                      "absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur",
                      revoked
                        ? "bg-destructive/90 text-destructive-foreground"
                        : expired || remaining <= 0
                          ? "bg-foreground/70 text-background"
                          : "bg-success text-success-foreground",
                    )}
                  >
                    {revoked ? (
                      <>
                        <ShieldOff className="size-3" aria-hidden="true" /> Dicabut
                      </>
                    ) : expired ? (
                      <>
                        <TimerOff className="size-3" aria-hidden="true" /> Kedaluwarsa
                      </>
                    ) : remaining <= 0 ? (
                      "Kuota habis"
                    ) : (
                      "Aktif"
                    )}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                      {product.name ?? "Produk"}
                    </h2>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {e.valid_until
                        ? `Berlaku s/d ${new Date(e.valid_until).toLocaleDateString("id-ID", { dateStyle: "medium" })}`
                        : "Tanpa batas waktu"}
                      {left !== null && left > 0 && left <= 30 ? ` · ${left} hari lagi` : ""}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-foreground">
                        Sisa {Math.max(0, remaining)} dari {e.download_limit} unduhan
                      </span>
                      <span className="text-muted-foreground">{usedPct}%</span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={usedPct}
                      aria-label="Kuota unduhan terpakai"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          remaining <= 0 ? "bg-destructive" : remaining <= 1 ? "bg-warning" : "bg-accent",
                        )}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2">
                    <Button
                      className="min-h-11 flex-1 gap-2"
                      disabled={busyId === e.id || locked}
                      onClick={() => handleDownload(e.id)}
                    >
                      {busyId === e.id ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Menyiapkan…
                        </>
                      ) : (
                        <>
                          <Download className="size-4" aria-hidden="true" /> Unduh
                        </>
                      )}
                    </Button>
                    {product.slug ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
                        <Link to="/produk/$slug" params={{ slug: product.slug }}>
                          Detail
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
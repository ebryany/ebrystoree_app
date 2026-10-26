import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, PackageSearch, X } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideProductModeration, listPendingProducts } from "@/lib/admin-seller.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/seller/produk")({
  head: () => ({
    meta: [
      { title: "Moderasi Produk — Admin Ebrystore" },
      { name: "description", content: "Antrean moderasi produk yang diajukan seller Ebrystore." },
      { property: "og:title", content: "Moderasi Produk — Admin Ebrystore" },
      { property: "og:description", content: "Setujui atau tolak produk seller Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminProductModeration,
});

function AdminProductModeration() {
  const canView = useCan("products.view");
  const canDecide = useCan("products.update");
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const fetchPending = useServerFn(listPendingProducts);
  const decide = useServerFn(decideProductModeration);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-pending-products"],
    queryFn: () => fetchPending({}),
    enabled: canView,
  });

  useRealtimeRefresh({
    channel: "admin-pending-products",
    tables: ["digital_products"],
    keys: [["admin-pending-products"]],
    enabled: canView,
  });

  const mutation = useMutation({
    mutationFn: (vars: { productId: string; decision: "approve" | "reject" }) =>
      decide({
        data: { productId: vars.productId, decision: vars.decision, reason: reason.trim() },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Keputusan gagal disimpan.");
        return;
      }
      toast.success("Keputusan moderasi tersimpan.");
      setReason("");
      setOpenId(null);
      await qc.invalidateQueries({ queryKey: ["admin-pending-products"] });
    },
    onError: () => toast.error("Keputusan gagal disimpan."),
  });

  if (!canView) return <ForbiddenState permission="products.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const items: any[] = (data as any)?.items ?? [];
  const tooShort = reason.trim().length < 5;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Moderasi Produk"
        crumb="Moderasi Produk"
        description="Produk seller yang menunggu persetujuan sebelum tayang."
      />

      {isPending ? (
        <AdminLoading label="Memuat antrean…" />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? undefined} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyRow message="Tidak ada produk yang menunggu moderasi." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {items.map((p: any) => (
              <li key={p.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-selected">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt="" className="size-full object-cover" />
                    ) : (
                      <PackageSearch className="size-5 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatRupiah(Number(p.discount_price ?? p.price))} ·{" "}
                      {p.stores?.name ?? "Toko tidak diketahui"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Diajukan {formatDateTime(p.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {p.store_id ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <Link to="/admin/seller/$id" params={{ id: p.store_id }}>
                          Lihat toko
                        </Link>
                      </Button>
                    ) : null}
                    {canDecide ? (
                      <Button
                        size="sm"
                        className="min-h-11"
                        onClick={() => {
                          setOpenId(openId === p.id ? null : p.id);
                          setReason("");
                        }}
                      >
                        {openId === p.id ? "Tutup" : "Tinjau"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {openId === p.id && canDecide ? (
                  <div className="mt-3 max-w-lg space-y-2.5 rounded-lg border border-border bg-background p-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor={`mod-reason-${p.id}`}>
                        Alasan (wajib, minimal 5 karakter)
                      </Label>
                      <Textarea
                        id={`mod-reason-${p.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Contoh: deskripsi sesuai dan tidak melanggar ketentuan."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-11"
                        disabled={tooShort || mutation.isPending}
                        onClick={() => mutation.mutate({ productId: p.id, decision: "approve" })}
                      >
                        <Check className="size-4" aria-hidden="true" />
                        Setujui & tayangkan
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        disabled={tooShort || mutation.isPending}
                        onClick={() => mutation.mutate({ productId: p.id, decision: "reject" })}
                      >
                        <X className="size-4" aria-hidden="true" />
                        Tolak
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

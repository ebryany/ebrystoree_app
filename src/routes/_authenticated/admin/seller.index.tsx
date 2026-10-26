import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Store, X } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideSellerApplication, listStoresForAdmin } from "@/lib/admin-seller.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/seller/")({
  head: () => ({
    meta: [
      { title: "Seller — Admin Ebrystore" },
      { name: "description", content: "Antrean verifikasi dan daftar seller Ebrystore." },
      { property: "og:title", content: "Seller — Admin Ebrystore" },
      { property: "og:description", content: "Kelola pengajuan dan status seller Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSellerQueue,
});

const FILTERS = [
  { key: "pending", label: "Menunggu verifikasi" },
  { key: "active", label: "Aktif" },
  { key: "suspended", label: "Ditangguhkan" },
  { key: "rejected", label: "Ditolak" },
  { key: "all", label: "Semua" },
];

/** Panel keputusan: wajib alasan, karena RPC menolak alasan < 5 karakter. */
function DecisionPanel({ store, onDone }: { store: any; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const decide = useServerFn(decideSellerApplication);
  const canApprove = useCan("sellers.approve");

  const mutation = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decide({ data: { storeId: store.id, decision, reason: reason.trim() } }),
    onSuccess: (res: any, decision: "approve" | "reject") => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Keputusan gagal disimpan.");
        return;
      }
      // Pesan diambil dari keputusan yang dipilih, bukan dari respons RPC:
      // `review_seller` hanya mengembalikan {status}, tanpa field decision.
      toast.success(
        decision === "approve" ? "Toko disetujui dan diaktifkan." : "Pengajuan toko ditolak.",
      );
      setReason("");
      onDone();
    },
    onError: () => toast.error("Keputusan gagal disimpan."),
  });

  if (!canApprove) {
    return (
      <p className="text-xs text-muted-foreground">
        Anda tidak punya izin menyetujui seller (butuh sellers.approve).
      </p>
    );
  }

  const tooShort = reason.trim().length < 5;

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${store.id}`}>Alasan (wajib, minimal 5 karakter)</Label>
        <Textarea
          id={`reason-${store.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Contoh: data toko lengkap dan kontak aktif."
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={tooShort || mutation.isPending}
          onClick={() => mutation.mutate("approve")}
        >
          <Check className="size-4" aria-hidden="true" />
          Setujui toko
        </Button>
        <Button
          variant="destructive"
          className="min-h-11"
          disabled={tooShort || mutation.isPending}
          onClick={() => mutation.mutate("reject")}
        >
          <X className="size-4" aria-hidden="true" />
          Tolak
        </Button>
      </div>
    </div>
  );
}

function AdminSellerQueue() {
  const canView = useCan("sellers.view");
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchStores = useServerFn(listStoresForAdmin);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-stores", status],
    queryFn: () => fetchStores({ data: { status, search: "" } }),
    refetchOnWindowFocus: "always",
    enabled: canView,
  });

  useRealtimeRefresh({
    channel: "admin-stores",
    tables: ["stores"],
    keys: [["admin-stores"]],
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="sellers.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const items: any[] = (data as any)?.items ?? [];

  const refresh = async () => {
    setOpenId(null);
    await qc.invalidateQueries({ queryKey: ["admin-stores"] });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Seller"
        crumb="Seller"
        description="Antrean pengajuan toko dan status seluruh seller."
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={status === f.key ? "default" : "outline"}
            className="min-h-11"
            onClick={() => {
              setStatus(f.key);
              setOpenId(null);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isPending ? (
        <AdminLoading label="Memuat seller…" />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? undefined} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyRow
            message={
              status === "pending"
                ? "Tidak ada pengajuan seller yang menunggu verifikasi."
                : "Tidak ada seller pada filter ini."
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {items.map((s: any) => (
              <li key={s.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <Link
                        to="/admin/seller/$id"
                        params={{ id: s.id }}
                        className="truncate font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {s.name}
                      </Link>
                      <StatusBadge value={s.status} kind="raw" />
                      {s.is_platform ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          Platform
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">/toko/{s.slug}</p>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex gap-1.5">
                        <dt>Pemilik:</dt>
                        <dd className="font-medium text-foreground">{s.owner_name ?? "-"}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Produk:</dt>
                        <dd className="font-medium text-foreground">
                          {s.product_total} ({s.product_published} tayang)
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Saldo tersedia:</dt>
                        <dd className="font-medium tabular-nums text-foreground">
                          {formatRupiah(Number(s.balance))}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Diajukan:</dt>
                        <dd className="font-medium text-foreground">
                          {formatDateTime(s.created_at)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm" className="min-h-11">
                      <Link to="/admin/seller/$id" params={{ id: s.id }}>
                        Lihat detail
                      </Link>
                    </Button>
                    {s.status === "pending" ? (
                      <Button
                        size="sm"
                        className="min-h-11"
                        onClick={() => setOpenId(openId === s.id ? null : s.id)}
                      >
                        {openId === s.id ? "Tutup" : "Tinjau"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {openId === s.id ? (
                  <div className="mt-3 rounded-lg border border-border bg-background p-3.5">
                    <DecisionPanel store={s} onDone={refresh} />
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

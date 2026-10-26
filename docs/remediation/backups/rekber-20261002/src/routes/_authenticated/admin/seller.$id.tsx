import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Check,
  ExternalLink,
  Package,
  ReceiptText,
  ShieldCheck,
  Star,
  Store,
  User,
  Wallet,
  X,
} from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { DetailCard, Field, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  decideSellerApplication,
  getStoreForAdmin,
  listStoreLedgerForAdmin,
  listStoreOrdersForAdmin,
  setSellerSuspended,
} from "@/lib/admin-seller.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/seller/$id")({
  head: () => ({
    meta: [
      { title: "Detail Seller — Admin Ebrystore" },
      {
        name: "description",
        content: "Rincian satu seller: profil, produk, transaksi, dan saldo.",
      },
      { property: "og:title", content: "Detail Seller — Admin Ebrystore" },
      { property: "og:description", content: "Kelola satu seller Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSellerDetail,
});

const SOURCE_LABEL: Record<string, string> = {
  sale: "Penjualan",
  refund: "Refund",
  adjustment: "Penyesuaian",
  reversal: "Koreksi",
  payout: "Penarikan",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500",
  pending: "bg-amber-500",
  suspended: "bg-red-500",
  rejected: "bg-zinc-400",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Store;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/10">
        <Icon className="size-4 text-accent" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight">{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

function ApplicationDecisionPanel({
  storeId,
  onDone,
}: {
  storeId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const decide = useServerFn(decideSellerApplication);
  const canApprove = useCan("sellers.approve");

  const mutation = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decide({ data: { storeId, decision, reason: reason.trim() } }),
    onSuccess: (res: any, decision: "approve" | "reject") => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Keputusan gagal disimpan.");
        return;
      }
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
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="decision-reason">Catatan keputusan (wajib, minimal 5 karakter)</Label>
        <Textarea
          id="decision-reason"
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
          Tolak pengajuan
        </Button>
      </div>
    </div>
  );
}

function SuspendPanel({
  storeId,
  currentStatus,
  onDone,
}: {
  storeId: string;
  currentStatus: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const canManage = useCan("sellers.manage");
  const suspend = useServerFn(setSellerSuspended);

  const mutation = useMutation({
    mutationFn: (nextSuspend: boolean) =>
      suspend({ data: { storeId, suspend: nextSuspend, reason: reason.trim() } }),
    onSuccess: (res: any, nextSuspend: boolean) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Perubahan status gagal.");
        return;
      }
      toast.success(nextSuspend ? "Toko ditangguhkan." : "Toko diaktifkan kembali.");
      setReason("");
      onDone();
    },
    onError: () => toast.error("Perubahan status gagal."),
  });

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        Anda tidak punya izin mengubah status seller (butuh sellers.manage).
      </p>
    );
  }

  const tooShort = reason.trim().length < 5;
  const isSuspended = currentStatus === "suspended";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="suspend-reason">Alasan (wajib, minimal 5 karakter)</Label>
        <Textarea
          id="suspend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={
            isSuspended
              ? "Contoh: masalah telah diselesaikan seller."
              : "Contoh: produk melanggar ketentuan platform."
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {currentStatus === "active" ? (
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={tooShort || mutation.isPending}
            onClick={() => mutation.mutate(true)}
          >
            <Ban className="size-4" aria-hidden="true" />
            Tangguhkan toko
          </Button>
        ) : (
          <Button
            className="min-h-11"
            disabled={tooShort || mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            <Check className="size-4" aria-hidden="true" />
            Aktifkan kembali
          </Button>
        )}
      </div>
    </div>
  );
}

function AdminSellerDetail() {
  const { id } = Route.useParams();
  const canView = useCan("sellers.view");
  const qc = useQueryClient();

  const fetchSummary = useServerFn(getStoreForAdmin);
  const fetchOrders = useServerFn(listStoreOrdersForAdmin);
  const fetchLedger = useServerFn(listStoreLedgerForAdmin);

  const summaryQ = useQuery({
    queryKey: ["admin-store", id],
    queryFn: () => fetchSummary({ data: { storeId: id } }),
    enabled: canView,
  });
  const ordersQ = useQuery({
    queryKey: ["admin-store-orders", id],
    queryFn: () => fetchOrders({ data: { storeId: id, limit: 20 } }),
    enabled: canView,
  });
  const ledgerQ = useQuery({
    queryKey: ["admin-store-ledger", id],
    queryFn: () => fetchLedger({ data: { storeId: id, limit: 20 } }),
    enabled: canView,
  });

  useRealtimeRefresh({
    channel: `admin-store-${id}`,
    tables: ["stores", "seller_ledger", "order_items"],
    keys: [
      ["admin-store", id],
      ["admin-store-orders", id],
      ["admin-store-ledger", id],
    ],
    enabled: canView,
  });

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ["admin-store", id] });
    await qc.invalidateQueries({ queryKey: ["admin-stores"] });
  };

  if (!canView) return <ForbiddenState permission="sellers.view" />;

  const res: any = summaryQ.data;
  if ((res as any)?.forbidden) return <ForbiddenState permission={(res as any).permission} />;
  if (summaryQ.isPending) return <AdminLoading label="Memuat detail seller…" />;
  if (summaryQ.error || res?.error) return <AdminError message={res?.error ?? undefined} />;

  const s = res?.summary;
  if (!s) return <AdminError message="Data seller tidak ditemukan." />;

  const store = s.store;
  const products = s.products ?? {};
  const orders = s.orders ?? {};
  const rating = s.rating ?? {};
  const orderItems: any[] = (ordersQ.data as any)?.items ?? [];
  const ledgerItems: any[] = (ledgerQ.data as any)?.items ?? [];

  const isPending = store.status === "pending";
  const ratingDisplay =
    Number(rating.total ?? 0) > 0
      ? `${rating.average} / 5`
      : "—";
  const ratingSub =
    Number(rating.total ?? 0) > 0
      ? `${rating.total} ulasan`
      : "Belum ada ulasan";

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title={store.name}
        crumb="Detail Seller"
        description={`/toko/${store.slug} · diajukan ${formatDateTime(store.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {store.status === "active" ? (
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to="/toko/$slug" params={{ slug: store.slug }} target="_blank">
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Lihat toko
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="min-h-11">
              <Link to="/admin/seller">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Kembali
              </Link>
            </Button>
          </div>
        }
      />

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-block size-2.5 rounded-full ${STATUS_COLOR[store.status] ?? "bg-zinc-400"}`}
          aria-hidden="true"
        />
        <StatusBadge value={store.status} kind="raw" />
        {store.is_platform ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-2.5 py-0.5 text-[11px] font-medium text-accent">
            <ShieldCheck className="size-3" aria-hidden="true" />
            Toko platform
          </span>
        ) : null}
      </div>

      {/* Pending application banner */}
      {isPending ? (
        <Alert className="border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20">
          <Store className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Pengajuan menunggu verifikasi.</span>{" "}
            Tinjau profil toko dan pemilik di bawah, lalu setujui atau tolak.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Suspended banner */}
      {store.status === "suspended" && store.suspended_reason ? (
        <Alert variant="destructive">
          <Ban className="size-4" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Toko ditangguhkan.</span>{" "}
            Alasan: {store.suspended_reason}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Package}
          label="Produk"
          value={products.total ?? 0}
          sub={`${products.published ?? 0} tayang · ${products.pending ?? 0} moderasi`}
        />
        <KpiCard
          icon={ReceiptText}
          label="Pesanan"
          value={orders.total ?? 0}
          sub={`${orders.paid ?? 0} dibayar`}
        />
        <KpiCard
          icon={Wallet}
          label="Saldo"
          value={formatRupiah(Number(s.balance ?? 0))}
          sub={`Penjualan ${formatRupiah(Number(orders.gross ?? 0))}`}
        />
        <KpiCard
          icon={Star}
          label="Rating"
          value={ratingDisplay}
          sub={ratingSub}
        />
      </div>

      {/* Decision panel for pending stores */}
      {isPending && !store.is_platform ? (
        <DetailCard title="Keputusan verifikasi">
          <ApplicationDecisionPanel storeId={id} onDone={invalidateAll} />
        </DetailCard>
      ) : null}

      {/* Tabbed content */}
      <Tabs defaultValue="profil" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="profil" className="min-h-9 gap-1.5">
            <Store className="size-3.5" aria-hidden="true" />
            Profil
          </TabsTrigger>
          <TabsTrigger value="pesanan" className="min-h-9 gap-1.5">
            <ReceiptText className="size-3.5" aria-hidden="true" />
            Pesanan
          </TabsTrigger>
          <TabsTrigger value="saldo" className="min-h-9 gap-1.5">
            <Wallet className="size-3.5" aria-hidden="true" />
            Saldo
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Profil ── */}
        <TabsContent value="profil" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <DetailCard title="Profil toko">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama toko">{store.name}</Field>
                <Field label="Slug">/toko/{store.slug}</Field>
                <div className="sm:col-span-2">
                  <Field label="Deskripsi">{store.description || "-"}</Field>
                </div>
                <Field label="Telepon">{store.contact_phone || "-"}</Field>
                <Field label="Email">{store.contact_email || "-"}</Field>
                <Field label="Diajukan">{formatDateTime(store.created_at)}</Field>
                <Field label="Ditinjau">{formatDateTime(store.reviewed_at)}</Field>
                {store.verification_note ? (
                  <div className="sm:col-span-2">
                    <Field label="Catatan verifikasi">{store.verification_note}</Field>
                  </div>
                ) : null}
              </dl>
            </DetailCard>

            <div className="space-y-4">
              <DetailCard title="Pemilik">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nama lengkap">{s.owner?.full_name ?? "-"}</Field>
                  <Field label="Telepon">{s.owner?.phone ?? "-"}</Field>
                  <div className="sm:col-span-2">
                    <Field label="ID pengguna">
                      <span className="font-mono text-xs">{s.owner?.id ?? "-"}</span>
                    </Field>
                  </div>
                </dl>
              </DetailCard>

              <DetailCard title="Statistik produk">
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Total produk">{products.total ?? 0}</Field>
                  <Field label="Tayang">{products.published ?? 0}</Field>
                  <Field label="Menunggu moderasi">{products.pending ?? 0}</Field>
                  <Field label="Ditolak">{products.rejected ?? 0}</Field>
                  <div className="col-span-2">
                    <Separator />
                  </div>
                  <Field label="Total terjual">{products.sold ?? 0}</Field>
                  <Field label="Nilai penjualan">{formatRupiah(Number(orders.gross ?? 0))}</Field>
                </dl>
              </DetailCard>
            </div>
          </div>

          {/* Suspend / reactivate control */}
          {!store.is_platform && !isPending ? (
            <DetailCard
              title="Kontrol status toko"
              description="Menangguhkan toko menghentikan tampilnya toko di marketplace, tanpa menghapus data atau pesanan yang sudah ada."
            >
              <SuspendPanel
                storeId={id}
                currentStatus={store.status}
                onDone={invalidateAll}
              />
            </DetailCard>
          ) : null}
        </TabsContent>

        {/* ── Tab: Pesanan ── */}
        <TabsContent value="pesanan" className="space-y-4">
          <DetailCard title="Pesanan terbaru" description="20 pesanan terakhir dari toko ini.">
            {ordersQ.isPending ? (
              <AdminLoading label="Memuat pesanan…" />
            ) : orderItems.length === 0 ? (
              <EmptyRow message="Belum ada pesanan untuk toko ini." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>No. Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((o: any) => (
                    <TableRow key={o.item_id}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {o.item_name}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {o.order_number}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={o.order_status} kind="order" />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatRupiah(Number(o.total))}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDateTime(o.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DetailCard>
        </TabsContent>

        {/* ── Tab: Saldo ── */}
        <TabsContent value="saldo" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3.5">
              <p className="text-xs text-muted-foreground">Saldo saat ini</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{formatRupiah(Number(s.balance ?? 0))}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3.5">
              <p className="text-xs text-muted-foreground">Nilai penjualan</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{formatRupiah(Number(orders.gross ?? 0))}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3.5">
              <p className="text-xs text-muted-foreground">Pesanan dibayar</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{orders.paid ?? 0}</p>
            </div>
          </div>

          <DetailCard title="Riwayat mutasi saldo" description="20 mutasi terakhir.">
            {ledgerQ.isPending ? (
              <AdminLoading label="Memuat riwayat…" />
            ) : ledgerItems.length === 0 ? (
              <EmptyRow message="Belum ada mutasi saldo." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerItems.map((l: any) => {
                    const credit = l.direction === "credit";
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          {SOURCE_LABEL[l.source_type] ?? l.source_type}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {l.note || "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${
                            credit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {credit ? "+" : "−"}
                          {formatRupiah(Number(l.amount))}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDateTime(l.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </DetailCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

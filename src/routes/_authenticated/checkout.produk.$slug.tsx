import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StickyActionBar } from "@/components/ebry/cards";
import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { CreditUseOption } from "@/components/checkout/credit-use-option";
import { applyCreditToOrder, createDigitalOrder, getProductDetail } from "@/lib/orders.functions";
import { effectivePrice, formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/checkout/produk/$slug")({
  head: () => ({
    meta: [
      { title: "Checkout Produk Digital — Ebrystore" },
      {
        name: "description",
        content: "Konfirmasi pesanan produk digital Ebrystore sebelum melakukan pembayaran.",
      },
      { property: "og:title", content: "Checkout Produk Digital — Ebrystore" },
      {
        property: "og:description",
        content: "Ringkasan pesanan dan instruksi pembayaran Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutProduk,
});

function CheckoutProduk() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchDetail = useServerFn(getProductDetail);
  const submitOrder = useServerFn(createDigitalOrder);
  const applyCredit = useServerFn(applyCreditToOrder);

  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const { data, isPending, error } = useQuery({
    queryKey: ["product-detail", slug],
    queryFn: () => fetchDetail({ data: { slug } }),
  });

  if (isPending) {
    return (
      <Shell>
        <AdminLoading label="Memuat produk…" />
      </Shell>
    );
  }
  if (error || !data?.product) {
    return (
      <Shell>
        <AdminError message="Produk tidak tersedia untuk dipesan." />
        <Button asChild variant="outline" className="mt-4">
          <Link to="/produk">Kembali ke katalog</Link>
        </Button>
      </Shell>
    );
  }

  const p = data.product;
  const uniqueStock = (p as { delivery_mode?: string }).delivery_mode === "unique";
  const codeDelivery = (p as { delivery_mode?: string }).delivery_mode === "code";
  const stock = Number((p as { available_stock?: number }).available_stock ?? 0);
  const soldOut = (uniqueStock || codeDelivery) && stock < 1;
  const maxQty = uniqueStock || codeDelivery ? 1 : 10;
  const store = (p as any).stores as { name: string; slug: string; is_platform: boolean } | null;
  const unit = effectivePrice(
    Number(p.price),
    p.discount_price === null ? null : Number(p.discount_price),
  );
  const subtotal = unit * quantity;
  const hasDiscount = p.discount_price !== null && Number(p.discount_price) < Number(p.price);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    // Analitik: pembeli mulai checkout. Dikirim sebelum order dibuat supaya
    // langkah funnel tercatat walau pembuatan order gagal.
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("checkout_start", `/checkout/produk/${slug}`),
    );
    const result = await submitOrder({
      data: { productId: p.id, quantity, idempotencyKey, note: note.trim() || undefined },
    });

    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }

    // Saldo diterapkan setelah order terbentuk. Bila gagal, pesanan tetap ada
    // dan pembeli bisa memakai saldo dari halaman pesanan — jadi ini tidak
    // memblokir, tapi diberi tahu jujur.
    if (useCredit) {
      const applied = await applyCredit({ data: { orderId: result.order_id } });
      if (!applied.ok) {
        toast.warning(
          `Pesanan ${result.order_number} dibuat, tetapi saldo belum terpakai: ${applied.error} Buka halaman pesanan untuk memakai saldo.`,
        );
      }
    }

    setSubmitting(false);
    toast.success(`Pesanan ${result.order_number} dibuat. Lanjutkan pembayaran.`);
    navigate({ to: "/dashboard/pesanan/$id", params: { id: result.order_id } });
  }

  return (
    <Shell>
      <Link
        to="/produk/$slug"
        params={{ slug }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke detail produk
      </Link>

      {/* Hero */}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-primary/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Checkout aman
          </Badge>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Checkout produk digital
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Harga dihitung ulang di server saat pesanan dibuat, jadi tidak ada biaya tersembunyi.
          </p>
          <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium">
            <StepChip index={1} label="Konfirmasi" active />
            <span className="text-muted-foreground/50" aria-hidden="true">
              →
            </span>
            <StepChip index={2} label="Pembayaran" />
            <span className="text-muted-foreground/50" aria-hidden="true">
              →
            </span>
            <StepChip index={3} label="Unduh file" />
          </ol>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
      >
        <div className="min-w-0 space-y-6">
          {/* Item */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Item pesanan
            </h2>
            <div className="mt-4 flex gap-4">
              {p.thumbnail_url ? (
                <img
                  src={p.thumbnail_url}
                  alt=""
                  className="size-24 shrink-0 rounded-xl border border-border object-cover"
                />
              ) : (
                <div
                  className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary"
                  aria-hidden="true"
                >
                  <Download className="size-7 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold leading-tight">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {p.short_description}
                </p>
                {store ? (
                  <Link
                    to="/toko/$slug"
                    params={{ slug: store.slug }}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Store className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{store.name}</span>
                    {store.is_platform ? (
                      <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                        <ShieldCheck className="size-3" aria-hidden="true" />
                        Official
                      </Badge>
                    ) : null}
                  </Link>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{formatRupiah(unit)}</span>
                  {hasDiscount ? (
                    <span className="text-sm text-muted-foreground line-through">
                      {formatRupiah(Number(p.price))}
                    </span>
                  ) : null}
                  <Badge variant="outline" className="gap-1">
                    <Zap className="size-3" aria-hidden="true" />
                    Akses instan
                  </Badge>
                </div>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label htmlFor="qty">Jumlah lisensi</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {uniqueStock
                    ? soldOut
                      ? "Stok berkas habis untuk saat ini."
                      : `Produk stok unik: 1 berkas khusus per pesanan. Sisa stok ${stock}.`
                    : codeDelivery
                      ? soldOut
                        ? "Stok kode habis untuk saat ini."
                        : `Kode/voucher unik: 1 per pesanan. Sisa stok ${stock}.`
                      : "Maksimal 10 lisensi per pesanan."}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Kurangi jumlah"
                  disabled={quantity <= 1 || uniqueStock || codeDelivery}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </Button>
                <output id="qty" className="w-10 text-center text-sm font-semibold tabular-nums">
                  {quantity}
                </output>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Tambah jumlah"
                  disabled={quantity >= maxQty}
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </section>

          {/* Catatan */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <Label
              htmlFor="note"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Catatan untuk tim (opsional)
            </Label>
            <Textarea
              id="note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: kirim versi terbaru"
              className="mt-3 min-h-24 resize-y"
            />
            <p className="mt-2 text-right text-xs text-muted-foreground">{note.length}/500</p>
          </section>

          {/* Jaminan */}
          <ul className="grid gap-3 sm:grid-cols-3">
            <Assurance
              icon={ShieldCheck}
              title="Transaksi aman"
              desc="Verifikasi pembayaran oleh admin."
            />
            <Assurance icon={Download} title="5 unduhan" desc="Berlaku 365 hari sejak aktif." />
            <Assurance icon={BadgeCheck} title="Harga final" desc="Dihitung ulang di server." />
          </ul>
        </div>

        {/* Ringkasan */}
        <aside className="min-w-0">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-display font-semibold">Ringkasan pesanan</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Harga satuan × {quantity}</dt>
                <dd className="tabular-nums">{formatRupiah(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd className="text-muted-foreground">Dihitung server</dd>
              </div>
            </dl>
            <Separator className="my-4" />
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm text-muted-foreground">Perkiraan total</span>
              <span className="font-display text-2xl font-bold tabular-nums">
                {formatRupiah(subtotal)}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Biaya admin (bila ada) ditambahkan oleh server pada saat pesanan dibuat.
            </p>

            <CreditUseOption
              estimatedTotal={subtotal}
              enabled={useCredit}
              onEnabledChange={setUseCredit}
              className="mt-4"
            />

            <Button
              type="submit"
              size="lg"
              className="mt-5 hidden w-full lg:inline-flex"
              disabled={submitting || soldOut}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Memproses…
                </>
              ) : (
                "Buat pesanan"
              )}
            </Button>
            <Button asChild variant="ghost" className="mt-2 hidden w-full lg:inline-flex">
              <Link to="/produk/$slug" params={{ slug }}>
                Batal
              </Link>
            </Button>
          </div>
        </aside>

        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Perkiraan total</p>
              <p className="font-display text-lg font-bold tabular-nums">
                {formatRupiah(subtotal)}
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              className="ml-auto flex-1"
              disabled={submitting || soldOut}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Memproses…
                </>
              ) : (
                "Buat pesanan"
              )}
            </Button>
          </div>
        </StickyActionBar>
      </form>
    </Shell>
  );
}

function StepChip({
  index,
  label,
  active = false,
}: {
  index: number;
  label: string;
  active?: boolean;
}) {
  return (
    <li
      className={
        active
          ? "inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary"
          : "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-muted-foreground"
      }
    >
      <span
        className={
          active
            ? "grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
            : "grid size-5 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
        }
      >
        {index}
      </span>
      {label}
    </li>
  );
}

function Assurance({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      <SiteFooter />
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  ChevronRight,
  Compass,
  Download,
  LifeBuoy,
  MessageSquarePlus,
  MessagesSquare,
  Package,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Plus,
  Wallet,
  Wrench,
  X,
} from "lucide-react";

import { BankListRow, InlineEmpty, StatSummary, RoundMenuGrid } from "@/components/ebry/cards";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { NotificationBell } from "@/components/ebry/notification-bell";
import { SellerEntryCard } from "@/components/ebry/seller-entry-card";
import { PopularSellers } from "@/components/ebry/popular-sellers";
import { RecentlyViewedShelf } from "@/components/ebry/recently-viewed-shelf";
import { StatusPill } from "@/components/ebry/status";
import { TopupPanel } from "@/components/ebry/topup-panel";
import { useSession } from "@/hooks/use-session";
import { useCart } from "@/lib/cart-store";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { getCustomerSummary, getMyCredit, getMyProfile } from "@/lib/orders.functions";
import { formatRupiah } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/transaction-labels";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard Akun — Ebrystore" },
      {
        name: "description",
        content: "Ringkasan pesanan, pembayaran, dan produk digital Anda di Ebrystore.",
      },
      { property: "og:title", content: "Dashboard Akun — Ebrystore" },
      { property: "og:description", content: "Pantau pesanan dan akses produk digital Anda." },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardRingkasan,
});

const TRUST = [
  { icon: ShieldCheck, label: "Dana ditahan sampai selesai" },
  { icon: BadgeCheck, label: "Jasa ditinjau admin" },
  { icon: MessagesSquare, label: "Chat sebelum pesan" },
  { icon: RotateCcw, label: "Refund ke saldo" },
];

function DashboardRingkasan() {
  const fetchSummary = useServerFn(getCustomerSummary);
  const fetchProfile = useServerFn(getMyProfile);
  const { user } = useSession();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["customer-summary"],
    queryFn: () => fetchSummary({}),
  });
  const { data: profileData } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile({}),
  });
  const fetchCredit = useServerFn(getMyCredit);
  const { data: creditData } = useQuery({
    queryKey: ["my-credit"],
    queryFn: () => fetchCredit({}),
  });
  const creditBalance = creditData?.balance ?? 0;
  const [showTopup, setShowTopup] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { count: cartCount } = useCart();
  const profile = (profileData as any)?.profile;
  const avatarUrl = useAvatarUrl(profile?.avatar_url ?? null);

  useRealtimeRefresh({
    channel: "dashboard-summary",
    tables: ["orders", "payments", "operator_assignments", "job_results", "notifications"],
    keys: [["customer-summary"], ["my-orders"], ["my-credit"]],
  });
  useRealtimeRefresh({
    channel: "dashboard-credit",
    tables: ["credit_ledger", "credit_topups"],
    filter: user ? `user_id=eq.${user.id}` : undefined,
    enabled: Boolean(user),
    keys: [["my-credit"]],
  });

  const fullName =
    (profile?.full_name as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "teman";
  const firstName = fullName.split(" ")[0];
  const initials =
    fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0]?.toUpperCase())
      .join("") || "E";

  const shortcuts = [
    { to: "/dashboard/produk", icon: Package, label: "Produk Digital" },
    { to: "/layanan", icon: Wrench, label: "Pesan Jasa" },
    { to: "/dashboard/pesanan", icon: ReceiptText, label: "Pesanan" },
    { to: "/dashboard/produk-saya", icon: Download, label: "Produk Saya" },
    { to: "/dashboard/po", icon: MessageSquarePlus, label: "PO Custom" },
    { to: "/dashboard/saldo", icon: Wallet, label: "Saldo" },
    { to: "/dashboard/notifikasi", icon: Bell, label: "Notifikasi" },
    { to: "/bantuan", icon: LifeBuoy, label: "Bantuan" },
  ];

  const awaiting = data?.awaitingPayment ?? 0;
  const review = data?.underReview ?? 0;
  const refunds = data?.activeRefunds ?? 0;
  const needsAction = awaiting + review + refunds;

  const subtitle = needsAction ? `${needsAction} hal menunggu tindakanmu` : "Semua pesananmu aman";

  function submitSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    void navigate({ to: "/produk", search: (q ? { q } : {}) as never });
  }

  return (
    <div className="-mt-5 space-y-5 md:mt-0">
      {/* A. Sapaan + tombol bulat notifikasi & keranjang */}
      <header className="flex items-center gap-3 pt-5 md:pt-0">
        <Link
          to="/dashboard/pengaturan"
          aria-label="Buka profil saya"
          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-selected text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : initials}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          <h1 className="truncate text-lg font-bold text-foreground">Halo, {firstName}</h1>
        </div>
        <NotificationBell className="size-11 shrink-0 rounded-full border border-border bg-card hover:bg-muted" />
        <Link
          to="/keranjang"
          aria-label={cartCount ? `Keranjang, ${cartCount} item` : "Keranjang"}
          className="relative grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ShoppingCart className="size-5" aria-hidden="true" />
          {cartCount ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-accent-foreground ring-2 ring-background"
            >
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          ) : null}
        </Link>
      </header>

      {/* B. Pencarian produk */}
      <form role="search" onSubmit={submitSearch} className="relative">
        <label htmlFor="dash-search" className="sr-only">
          Cari produk atau jasa
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="dash-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari produk atau jasa…"
          maxLength={80}
          className="h-12 w-full rounded-full border border-border bg-card pl-12 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Link
          to="/produk"
          aria-label="Buka katalog dengan filter"
          className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        </Link>
      </form>

      {/* C. Banner saldo: dua CTA (isi saldo + riwayat) */}
      {/* Kartu saldo ringkas: hitam + kaca. Warna literal (bukan token) karena
          kartu ini sengaja tetap gelap di tema terang maupun gelap. */}
      <section
        aria-labelledby="saldo-heading"
        className="relative isolate overflow-hidden rounded-[22px] bg-[oklch(0.16_0.012_210)] text-white shadow-[0_16px_32px_-18px_oklch(0.16_0.012_210/80%)]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-14 -z-10 size-40 rounded-full bg-accent/60 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -left-10 -z-10 size-36 rounded-full bg-success/30 blur-3xl"
        />
        <div className="relative rounded-[22px] border border-white/12 bg-gradient-to-br from-white/[0.09] via-white/[0.03] to-white/[0.06] px-4 py-3.5 shadow-[inset_0_1px_0_oklch(1_0_0/18%)] backdrop-blur-xl">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[22px] bg-[linear-gradient(115deg,transparent_40%,oklch(1_0_0/7%)_52%,transparent_64%)]"
          />
          <div className="relative flex items-center justify-between gap-2">
            <h2 id="saldo-heading" className="text-xs font-medium text-white/70">
              Saldo Ebrystore
            </h2>
            <Link
              to="/dashboard/saldo"
              className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-xs font-semibold text-white/85 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Riwayat
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="relative -mt-1 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold leading-tight tracking-tight tabular-nums">
                {formatRupiah(creditBalance)}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-white/60">
                {creditBalance > 0
                  ? "Siap dipakai bayar pesanan"
                  : "Isi saldo untuk bayar lebih cepat"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTopup((v) => !v)}
              aria-expanded={showTopup}
              aria-controls="panel-isi-saldo"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-[oklch(0.16_0.012_210)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {showTopup ? (
                <X className="size-4" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              {showTopup ? "Tutup" : "Isi saldo"}
            </button>
          </div>
        </div>
      </section>
      {showTopup ? (
        <div id="panel-isi-saldo" className="rounded-2xl border border-border bg-card p-4">
          <TopupPanel
            onPaid={async () => {
              setShowTopup(false);
              await refetch();
            }}
          />
        </div>
      ) : null}

      {/* C. Ringkasan aktivitas — kartu terpisah */}
      <StatSummary
        stats={[
          {
            label: "Pesanan aktif",
            value: data?.activeOrders ?? 0,
            to: "/dashboard/pesanan",
            search: { filter: "active" },
          },
          {
            label: "Perlu dibayar",
            value: awaiting,
            to: "/dashboard/pesanan",
            search: { filter: "unpaid" },
            tone: awaiting > 0 ? "warning" : "default",
          },
          {
            label: "Produk dimiliki",
            value: data?.entitlements ?? 0,
            to: "/dashboard/produk-saya",
          },
        ]}
      />

      {/* C. Perlu tindakan — banner berwarna ala "tagihan jatuh tempo" */}
      {data && needsAction > 0 ? (
        <section aria-labelledby="action-heading" className="space-y-2">
          <h2 id="action-heading" className="text-sm font-bold text-foreground">
            Perlu tindakanmu
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {awaiting > 0 ? (
              <ActionTile
                icon={Wallet}
                title={`${awaiting} pesanan menunggu pembayaran`}
                cta="Bayar"
                to="/dashboard/pesanan"
                search={{ filter: "unpaid" }}
              />
            ) : null}
            {review > 0 ? (
              <ActionTile
                icon={ReceiptText}
                title={`${review} bukti pembayaran sedang diperiksa`}
                cta="Lihat"
                to="/dashboard/pesanan"
                search={{ filter: "unpaid" }}
              />
            ) : null}
            {refunds > 0 ? (
              <ActionTile
                icon={RotateCcw}
                title={`${refunds} pengajuan refund berjalan`}
                cta="Pantau"
                to="/dashboard/pesanan"
                search={{ filter: "all" }}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* D. Menu aksi ikon bulat */}
      <section aria-labelledby="shortcut-heading" className="rounded-2xl bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="shortcut-heading" className="text-sm font-bold text-foreground">
            Mau ke mana?
          </h2>
          <Link
            to="/produk"
            className="flex min-h-11 items-center gap-1 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Lihat katalog <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <RoundMenuGrid items={shortcuts} />
      </section>

      <RecentlyViewedShelf />

      <PopularSellers />

      {/* Jaminan: hanya mekanisme yang memang berjalan di platform. */}
      <section aria-label="Jaminan transaksi" className="rounded-2xl bg-card p-4">
        <ul className="grid grid-cols-4 gap-2">
          {TRUST.map((t) => (
            <li key={t.label} className="flex flex-col items-center gap-1.5 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-success/12 text-success">
                <t.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-foreground">
                {t.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* E. Pintu masuk seller (status mengikuti kondisi toko) */}
      <SellerEntryCard />

      {isPending ? <CardSkeleton rows={2} /> : null}
      {error ? <ErrorState onRetry={() => refetch()} /> : null}

      {data ? (
        <>
          {/* E. Pesanan terakhir — list ala transaksi bank */}
          <section aria-labelledby="order-heading" className="rounded-2xl bg-card">
            <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
              <h2 id="order-heading" className="text-sm font-bold text-foreground">
                Pesanan terakhir
              </h2>
              <Link
                to="/dashboard/pesanan"
                search={{ filter: "all" }}
                className="flex min-h-11 items-center gap-1 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat semua <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            {data.recentOrders.length === 0 ? (
              <InlineEmpty
                icon={Compass}
                text="Belum ada pesanan."
                actionLabel="Jelajahi"
                to="/produk"
              />
            ) : (
              <ul className="px-4 pb-1">
                {data.recentOrders.map((o: any) => (
                  <BankListRow
                    key={o.id}
                    icon={o.order_type === "service" ? Wrench : Package}
                    title={o.order_items?.[0]?.name_snapshot ?? "Pesanan Ebrystore"}
                    subtitle={`${ORDER_TYPE_LABEL[o.order_type] ?? ""} · ${o.order_number}`}
                    value={formatRupiah(Number(o.total))}
                    valueTone={o.status === "awaiting_payment" ? "warning" : "default"}
                    to="/dashboard/pesanan/$id"
                    params={{ id: o.id }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* F. Aktivitas terbaru */}
          <section aria-labelledby="notif-heading" className="rounded-2xl bg-card">
            <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
              <h2 id="notif-heading" className="text-sm font-bold text-foreground">
                Aktivitas terbaru
              </h2>
              <Link
                to="/dashboard/notifikasi"
                className="flex min-h-11 items-center gap-1 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat semua <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            {data.notifications.length === 0 ? (
              <InlineEmpty icon={Bell} text="Belum ada aktivitas." />
            ) : (
              <ul className="px-4 pb-1">
                {data.notifications.slice(0, 4).map((n: any) => (
                  <BankListRow
                    key={n.id}
                    icon={Bell}
                    title={n.title}
                    subtitle={new Date(n.created_at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    value={
                      !n.read_at ? <StatusPill value="unread" kind="raw" label="Baru" /> : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Banner aksi mendesak ala "tagihan bank". */
function ActionTile({
  icon: Icon,
  title,
  cta,
  to,
  search,
}: {
  icon: typeof Wallet;
  title: string;
  cta: string;
  to: string;
  search?: Record<string, unknown>;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className="group flex min-h-14 items-center gap-3 rounded-2xl border border-warning/50 bg-warning/10 px-3.5 py-3 transition-colors hover:border-warning/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/20 text-warning-foreground">
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
        {title}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-warning-foreground">
        {cta}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

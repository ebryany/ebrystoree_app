import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowRight,
  Banknote,
  Bell,
  Compass,
  Download,
  LifeBuoy,
  MessageSquarePlus,
  Package,
  ReceiptText,
  RotateCcw,
  Wallet,
  Wrench,
} from "lucide-react";

import {
  BalanceCard,
  BankHeader,
  BankListRow,
  InlineEmpty,
  StatSummary,
  RoundMenuGrid,
} from "@/components/ebry/cards";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { SellerEntryCard } from "@/components/ebry/seller-entry-card";
import { PopularSellers } from "@/components/ebry/popular-sellers";
import { RecentlyViewedShelf } from "@/components/ebry/recently-viewed-shelf";
import { StatusPill } from "@/components/ebry/status";
import { TopupPanel } from "@/components/ebry/topup-panel";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
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
  const profile = (profileData as any)?.profile;
  const avatarUrl = useAvatarUrl(profile?.avatar_url ?? null);

  useRealtimeRefresh({
    channel: "dashboard-summary",
    tables: [
      "orders",
      "payments",
      "operator_assignments",
      "job_results",
      "notifications",
      "credit_ledger",
    ],
    keys: [["customer-summary"], ["my-orders"], ["my-credit"]],
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

  return (
    <div className="-mt-5 space-y-4 md:mt-0">
      {/* A. Header bersih (netral) */}
      <BankHeader
        name={firstName}
        subtitle={subtitle}
        avatarUrl={avatarUrl}
        initials={initials}
        actions={[{ to: "/dashboard/notifikasi", icon: Bell, label: "Buka notifikasi" }]}
      />

      {/* B. Kartu saldo ala ATM bank — tombol Isi Saldo di kiri tautan riwayat */}
      <BalanceCard
        label="Saldo Ebrystore"
        credit={{
          value: formatRupiah(creditBalance),
          caption:
            creditBalance > 0
              ? "Bisa dipakai untuk membayar pesanan"
              : "Belum ada saldo. Isi saldo atau terima refund pesanan yang dibatalkan.",
          to: "/dashboard/saldo",
        }}
        actionLabel="Riwayat saldo"
        actionIcon={Banknote}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => setShowTopup((v) => !v)}
            aria-expanded={showTopup}
            aria-controls="panel-isi-saldo"
          >
            <Wallet className="mr-1.5 size-4" aria-hidden="true" />
            {showTopup ? "Tutup" : "Isi Saldo"}
          </Button>
        }
        panel={
          showTopup ? (
            <div id="panel-isi-saldo" className="mt-4 border-t border-white/40 pt-4">
              <TopupPanel
                onPaid={async () => {
                  setShowTopup(false);
                  await refetch();
                }}
              />
            </div>
          ) : null
        }
      />

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
        <h2 id="shortcut-heading" className="mb-3 text-sm font-bold text-foreground">
          Mau ke mana?
        </h2>
        <RoundMenuGrid items={shortcuts} />
      </section>

      <RecentlyViewedShelf />

      <PopularSellers />

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

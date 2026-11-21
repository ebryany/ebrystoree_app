import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Clock,
  ExternalLink,
  Home,
  MessageSquare,
  Package,
  ReceiptText,
  Settings,
  Store,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { StatusPill } from "@/components/ebry/status";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { useStorePresence } from "@/hooks/use-store-presence";
import { BottomNavigation, type BottomNavItem } from "@/components/ebry/bottom-nav";
import { DashboardSidebar } from "@/components/ebry/dashboard-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SellerMobileTabs, SellerSidebar } from "@/components/seller/seller-sidebar";
import { useSession } from "@/hooks/use-session";
import { useSellerBadges } from "@/hooks/use-seller-badges";
import { listMyNotifications } from "@/lib/orders.functions";
import { applyAsSeller, getMyStore } from "@/lib/seller.functions";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({
    meta: [
      { title: "Dashboard Seller — Ebrystore" },
      { name: "description", content: "Kelola toko dan produk digital Anda di Ebrystore." },
      { property: "og:title", content: "Dashboard Seller — Ebrystore" },
      { property: "og:description", content: "Kelola toko dan produk Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerLayout,
});

const STORE_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Menunggu verifikasi", tone: "waiting" },
  active: { label: "Aktif", tone: "success" },
  suspended: { label: "Ditangguhkan", tone: "danger" },
  rejected: { label: "Ditolak", tone: "neutral" },
};

function SellerLayout() {
  const { user } = useSession();
  const [openedAt] = useState(() => new Date().toISOString());
  const fetchStore = useServerFn(getMyStore);
  const fetchNotifications = useServerFn(listMyNotifications);
  const { data, isPending, error } = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
    staleTime: 5 * 60_000,
  });
  const { data: notifData } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications({}),
    enabled: Boolean(user),
  });
  const unread = (((notifData as any)?.items ?? []) as any[]).filter((n) => !n.read_at).length;

  const storeRecord = data?.store as { id?: string; status?: string } | null | undefined;
  const hasActiveStore = storeRecord?.status === "active";
  const badges = useSellerBadges(hasActiveStore);
  // Panggil satu kali di layout (bukan 4 komponen terpisah) agar listener & query tidak duplikat.
  const ownPresence = useStorePresence(
    hasActiveStore ? storeRecord?.id : null,
    hasActiveStore ? { online: true, lastSeenAt: openedAt } : null,
  );

  // Toko aktif: navigasi bawah khusus kerja seller. Akun pembeli lewat header.
  const bottomNav: BottomNavItem[] = hasActiveStore
    ? [
        { to: "/seller", label: "Toko", icon: Store, exact: true },
        {
          to: "/seller/pesanan",
          label: "Pesanan",
          icon: ReceiptText,
          badge: badges.orders + badges.serviceOrders,
          match: ["/seller/jasa-pesanan"],
        },
        {
          to: "/seller/produk",
          label: "Produk",
          icon: Package,
          match: ["/seller/jasa"],
        },
        { to: "/seller/chat", label: "Chat", icon: MessageSquare, badge: badges.chats },
        { to: "/seller/keuangan", label: "Saldo", icon: Wallet },
      ]
    : [
        { to: "/dashboard", label: "Beranda", icon: Home, exact: true },
        { to: "/seller", label: "Toko", icon: Store, exact: true },
        { to: "/dashboard/pengaturan", label: "Akun", icon: Settings },
      ];

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">
          <AdminLoading label="Memuat data toko…" />
        </main>
        <SiteFooter />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">
          <AdminLoading label="Gagal memuat toko." />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!data?.store) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-8 px-4 pb-28 pt-5 md:pb-12 md:pt-8 lg:px-6">
          <aside className="sticky top-24 hidden w-60 shrink-0 lg:block">
            <DashboardSidebar unread={unread} />
          </aside>
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-6xl lg:mx-0">
              <ApplyForm />
            </div>
          </main>
        </div>
        <div className="hidden md:block">
          <SiteFooter />
        </div>
        <BottomNavigation items={bottomNav} ariaLabel="Navigasi toko" />
      </div>
    );
  }

  const store = data.store as any;
  const meta = STORE_STATUS[store.status] ?? { label: store.status, tone: "neutral" };
  const isActive = store.status === "active";

  const logo = isRenderableImageUrl(store.logo_url)
    ? optimizedMediaUrl(store.logo_url as string, 96)
    : null;

  const avatar = (size: "sm" | "md") => (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center bg-surface-selected text-accent",
        size === "sm" ? "size-10 rounded-xl" : "size-12 rounded-2xl",
      )}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          width={size === "sm" ? 40 : 48}
          height={size === "sm" ? 40 : 48}
          decoding="async"
          className={cn("size-full object-cover", size === "sm" ? "rounded-xl" : "rounded-2xl")}
        />
      ) : (
        <Store className="size-5" aria-hidden="true" />
      )}
      {isActive ? (
        <OnlineDot
          presence={ownPresence}
          className="-bottom-0.5 -right-0.5 size-3 ring-2 ring-card sm:size-3"
        />
      ) : null}
    </span>
  );

  const viewStoreLink = (
    <Link
      to="/toko/$slug"
      params={{ slug: store.slug }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Lihat toko
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </Link>
  );

  // Kartu identitas toko di sidebar desktop (lg+).
  const storeCard = (
    <div>
      <div className="flex items-center gap-3">
        {avatar("md")}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{store.name}</p>
          {isActive ? (
            <PresenceLabel presence={ownPresence} className="flex text-xs" />
          ) : (
            <StatusPill value={meta.tone as any} kind="raw" label={meta.label} />
          )}
        </div>
      </div>
      {isActive ? <div className="-mb-2 mt-1 -ml-2">{viewStoreLink}</div> : null}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* Mobile & tablet (< lg): identitas toko + tab menu seller */}
      <div className="border-b border-border bg-background lg:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-3 pt-3">
          <header className="flex items-center gap-3">
            {avatar("sm")}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold text-foreground">{store.name}</h1>
              {isActive ? (
                <PresenceLabel presence={ownPresence} className="flex text-xs" />
              ) : (
                <p className="truncate text-xs text-muted-foreground">/toko/{store.slug}</p>
              )}
            </div>
            {isActive ? (
              viewStoreLink
            ) : (
              <StatusPill value={meta.tone as any} kind="raw" label={meta.label} />
            )}
          </header>
          {isActive ? <SellerMobileTabs badges={badges} /> : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-6 px-4 pb-28 pt-4 md:pb-12 md:pt-6 lg:gap-8 lg:px-6 lg:pt-8">
        <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-64 shrink-0 overflow-y-auto lg:block">
          <SellerSidebar storeCard={storeCard} badges={badges} canSell={isActive} />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl lg:mx-0">
            {store.status !== "active" ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3.5">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                  aria-hidden="true"
                />
                <div className="text-xs leading-relaxed text-muted-foreground">
                  {store.status === "pending"
                    ? "Toko Anda sedang ditinjau admin. Anda belum bisa menambah produk sampai toko disetujui."
                    : store.status === "suspended"
                      ? store.suspended_reason || "Toko Anda sedang ditangguhkan."
                      : store.verification_note || "Pengajuan toko ditolak."}
                </div>
              </div>
            ) : null}

            <Outlet />
          </div>
        </main>
      </div>
      <div className="hidden md:block">
        <SiteFooter />
      </div>
      <BottomNavigation items={bottomNav} ariaLabel="Navigasi toko" />
    </div>
  );
}

/** Form pendaftaran seller. */
function ApplyForm() {
  const queryClient = useQueryClient();
  const apply = useServerFn(applyAsSeller);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      apply({
        data: {
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
          contactPhone: phone.trim() || undefined,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Pengajuan gagal.");
        return;
      }
      toast.success("Pengajuan toko dikirim. Menunggu verifikasi admin.");
      await queryClient.invalidateQueries({ queryKey: ["my-store"] });
    },
    onError: () => toast.error("Pengajuan gagal. Coba lagi."),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
          <Store className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-foreground">Buka Toko</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Jual produk digital Anda di Ebrystore
          </p>
        </div>
      </header>

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 3) return toast.error("Nama toko minimal 3 karakter.");
          mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="store-name">Nama toko</Label>
          <Input
            id="store-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Toko Digital Nusantara"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="store-slug">Slug toko (opsional)</Label>
          <Input
            id="store-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="toko-nusantara"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">Alamat toko: /toko/&lt;slug&gt;</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="store-desc">Deskripsi (opsional)</Label>
          <Textarea
            id="store-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="store-phone">Nomor WhatsApp (opsional)</Label>
          <Input
            id="store-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xxxxxxxxxx"
            inputMode="tel"
            maxLength={30}
          />
        </div>
        <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Mengirim…" : "Ajukan toko"}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          Pengajuan ditinjau admin sebelum toko aktif.
        </p>
      </form>
    </div>
  );
}

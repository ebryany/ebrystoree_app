import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  Clock,
  Home,
  Package,
  PackagePlus,
  ReceiptText,
  Settings,
  Store,
  TriangleAlert,
} from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { StatusPill } from "@/components/ebry/status";
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
import { listMyNotifications } from "@/lib/orders.functions";
import { applyAsSeller, getMyStore } from "@/lib/seller.functions";
import { formatRupiah } from "@/lib/format";

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
  const fetchStore = useServerFn(getMyStore);
  const fetchNotifications = useServerFn(listMyNotifications);
  const { data, isPending, error } = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
  });
  const { data: notifData } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications({}),
    enabled: Boolean(user),
  });
  const unread = (((notifData as any)?.items ?? []) as any[]).filter((n) => !n.read_at).length;

  const bottomNav: BottomNavItem[] = [
    { to: "/dashboard", label: "Beranda", icon: Home, exact: true },
    { to: "/seller/pesanan", label: "Pesanan", icon: ReceiptText },
    { to: "/seller/produk", label: "Produk", icon: Package },
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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* Tab strip mobile/tablet */}
      <div className="border-b border-border bg-background md:hidden">
        <div className="mx-auto flex h-auto w-full max-w-6xl flex-col gap-2 px-4 py-3">
          <header className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-selected text-accent">
              <Store className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold">{store.name}</h1>
              <p className="truncate text-[11px] text-muted-foreground">/toko/{store.slug}</p>
            </div>
            <StatusPill value={meta.tone as any} kind="raw" label={meta.label} />
          </header>
          {store.status === "active" ? <SellerMobileTabs /> : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-8 px-4 pb-28 pt-5 md:pb-12 md:pt-8 lg:px-6">
        <aside className="sticky top-24 hidden w-60 shrink-0 lg:block">
          {/* Sidebar seller: menu toko (Keuangan, Performa, Pengaturan), bukan menu customer. */}
          <SellerSidebar />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl lg:mx-0">
            {/* Store header — desktop only, mobile sudah di atas */}
            <header className="mb-4 hidden items-start gap-3 md:flex">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
                <Store className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold text-foreground">{store.name}</h1>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">/toko/{store.slug}</p>
              </div>
              <div className="shrink-0">
                <StatusPill value={meta.tone as any} kind="raw" label={meta.label} />
              </div>
            </header>

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

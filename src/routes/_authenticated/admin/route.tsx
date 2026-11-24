import { useEffect, useId, useRef, useState } from "react";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  MessagesSquare,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccessProvider, AdminLoading } from "@/components/admin/admin-ui";
import { NotificationBell } from "@/components/ebry/notification-bell";
import { SecurityErrorView } from "@/components/security-error-page";
import { adminNav, ROLE_LABELS, type AdminBadgeKey } from "@/lib/admin-nav";
import { sumAdminBadges } from "@/lib/admin-badges";
import { adminPortalSignOut } from "@/lib/admin-auth.functions";
import { getMyAccess, type AdminBadges } from "@/lib/admin.functions";
import { useAdminBadges } from "@/hooks/use-admin-badges";
import { reportUnauthorizedRouteAccess } from "@/lib/security.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const navigationOrder = [
  "Ringkasan",
  "Transaksi",
  "Layanan Platform",
  "Marketplace",
  "Katalog",
  "Akses",
  "Website",
];

function NavList({
  permissions,
  isSuperAdmin,
  badges,
  onNavigate,
  onSelectBadge,
}: {
  permissions: string[];
  isSuperAdmin: boolean;
  badges?: AdminBadges;
  onNavigate?: () => void;
  onSelectBadge?: (badgeKey: AdminBadgeKey) => void;
}) {
  const [search, setSearch] = useState("");
  const navigationId = useId();
  const pathname = useRouterState({ select: (state) => state.location.pathname }).replace(
    /\/$/,
    "",
  );
  const groups = navigationOrder.flatMap((label) => {
    const group = adminNav.find((entry) => entry.label === label);
    if (!group) return [];
    const items = group.items.filter(
      (item) =>
        item.available && item.to && (isSuperAdmin || permissions.includes(item.permission)),
    );
    return items.length ? [{ label: label === "Ringkasan" ? "Dashboard" : label, items }] : [];
  });
  const activeItem = groups
    .flatMap((group) => group.items)
    .filter((item) => {
      if (!item.to) return false;
      return (
        pathname === item.to ||
        (!item.exact && item.to !== "/admin" && pathname.startsWith(`${item.to}/`))
      );
    })
    .sort((a, b) => (b.to?.length ?? 0) - (a.to?.length ?? 0))[0];
  const terms = search.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        terms.every((term) =>
          `${group.label} ${item.label}`.toLocaleLowerCase("id").includes(term),
        ),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-4">
        <label className="sr-only" htmlFor={`${navigationId}-search`}>
          Cari menu admin
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${navigationId}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari menu admin"
            aria-label="Cari menu admin"
            aria-controls={navigationId}
            autoComplete="off"
            className="h-11 bg-background pl-9 text-sm shadow-none focus-visible:ring-2"
          />
        </div>
      </div>
      <nav
        id={navigationId}
        aria-label="Navigasi admin"
        className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-5"
      >
        {filteredGroups.length === 0 ? (
          <p role="status" className="break-words px-3 text-sm text-muted-foreground">
            {terms.length
              ? "Tidak ada menu yang cocok. Coba kata kunci lain."
              : "Tidak ada menu admin yang tersedia untuk akun Anda."}
          </p>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.label}>
              <p className="break-words px-3 text-xs font-semibold text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const isActive = item.to === activeItem?.to;
                  const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : 0;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        activeOptions={{ exact: true }}
                        activeProps={{}}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          if (item.badgeKey) onSelectBadge?.(item.badgeKey);
                          onNavigate?.();
                        }}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive
                            ? "bg-surface-selected font-semibold text-primary"
                            : "font-medium text-foreground hover:bg-muted",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 break-words">{item.label}</span>
                        {badgeCount > 0 ? (
                          <>
                            <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-5 tabular-nums text-destructive-foreground">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                            <span className="sr-only">, {badgeCount} perlu tindakan</span>
                          </>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}

function AdminLayout() {
  const fetchAccess = useServerFn(getMyAccess);
  const signOutPortal = useServerFn(adminPortalSignOut);
  const reportDenied = useServerFn(reportUnauthorizedRouteAccess);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deniedRefId, setDeniedRefId] = useState<string | null>(null);
  const reportedRef = useRef<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess({}),
  });

  const canEnter =
    !!data &&
    Boolean(data.adminPortalVerified) &&
    (data.isSuperAdmin || data.permissions.includes("admin.dashboard.view"));
  const { badges, markBadgeSeen } = useAdminBadges(canEnter, pathname);
  const totalBadgeCount = sumAdminBadges(badges);

  useEffect(() => {
    if (isPending || error || !data || canEnter) return;
    if (reportedRef.current === pathname) return;
    reportedRef.current = pathname;
    void reportDenied({ data: { area: "admin", route: pathname } })
      .then((res) => {
        if (res?.requestId) setDeniedRefId(res.requestId);
      })
      .catch(() => { });
  }, [isPending, error, data, canEnter, pathname, reportDenied]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await signOutPortal({}).catch(() => {});
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      await navigate({ to: "/as/feb/auth/admin", replace: true });
    } catch {
      toast.error("Gagal keluar dari akun. Silakan coba lagi.");
    } finally {
      setSigningOut(false);
    }
  }

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-10">
        <AdminLoading label="Memeriksa izin akses…" />
      </div>
    );
  }

  if (error || !canEnter) {
    return (
      <SecurityErrorView
        variant="card"
        status={error ? 500 : 403}
        title={error ? "Gagal memeriksa akses" : "Akses ke area admin dibatasi"}
        description={
          error
            ? "Izin akses belum dapat dimuat. Silakan coba beberapa saat lagi atau kembali ke akun Anda."
            : "Halaman administrasi hanya tersedia bagi akun dengan hak akses yang sesuai."
        }
        requestId={deniedRefId}
        onRetry={error ? () => void refetch() : null}
        backTo="/dashboard"
        backLabel="Kembali ke akun saya"
      />
    );
  }

  const roleLabel = data.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ") || "Tanpa peran";
  const canViewOrders = data.isSuperAdmin || data.permissions.includes("orders.view");

  return (
    <AccessProvider value={data}>
      <div className="min-h-dvh bg-background text-foreground">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[60] focus:flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-primary focus:px-4 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Lewati ke konten utama
        </a>
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-card">
          <div className="flex h-full items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-2 lg:gap-6">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative min-h-11 min-w-11 shrink-0 lg:hidden"
                    aria-label={
                      totalBadgeCount > 0
                        ? `Buka menu admin, ${totalBadgeCount} antrean menunggu tindakan`
                        : "Buka menu admin"
                    }
                  >
                    <Menu className="size-5" aria-hidden="true" />
                    {totalBadgeCount > 0 ? (
                      <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 tabular-nums text-destructive-foreground">
                        {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
                      </span>
                    ) : null}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 [&>button]:right-2 [&>button]:top-3 [&>button]:flex [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:items-center [&>button]:justify-center"
                >
                  <SheetHeader className="shrink-0 border-b border-border px-4 py-5 pr-16 text-left">
                    <SheetTitle className="break-words font-display text-base">
                      Ebrystore Admin
                    </SheetTitle>
                    <SheetDescription className="break-words">
                      Kelola operasional marketplace.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <NavList
                      permissions={data.permissions}
                      isSuperAdmin={data.isSuperAdmin}
                      badges={badges}
                      onNavigate={() => setOpen(false)}
                      onSelectBadge={markBadgeSeen}
                    />
                  </div>
                </SheetContent>
              </Sheet>
              <Link
                to="/admin"
                activeOptions={{ exact: true }}
                className="flex min-h-11 min-w-0 items-center rounded-md font-display text-base font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:w-[208px]"
              >
                <span className="break-words">
                  Ebrystore <span className="font-medium text-muted-foreground">Admin</span>
                </span>
              </Link>
              <p className="hidden text-sm text-muted-foreground lg:block">
                Operasional marketplace
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <NotificationBell />
              {canViewOrders ? (
                <Button asChild variant="ghost" className="hidden min-h-11 gap-1.5 sm:inline-flex">
                  <Link to="/admin/chat" onClick={() => markBadgeSeen("chats")}>
                    <MessagesSquare className="size-4" aria-hidden="true" />
                    <span>Chat Produk</span>
                    {badges.chats > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-5 tabular-nums text-destructive-foreground">
                        {badges.chats > 99 ? "99+" : badges.chats}
                      </span>
                    ) : null}
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" className="hidden min-h-11 md:inline-flex">
                <Link to="/">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Lihat website
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="min-h-11 min-w-11 shadow-none"
                    aria-label={`Menu akun admin, peran ${roleLabel}`}
                  >
                    <User className="size-4 shrink-0" aria-hidden="true" />
                    <span className="hidden max-w-40 truncate sm:inline">{roleLabel}</span>
                    <ChevronDown className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
                  <DropdownMenuLabel className="break-words text-xs font-normal text-muted-foreground">
                    <span className="block font-semibold text-foreground">Peran: {roleLabel}</span>
                    {data.isSuperAdmin
                      ? "Akses penuh sebagai Super Admin"
                      : `${data.permissions.length} izin aktif`}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="min-h-11">
                    <Link to="/dashboard">Akun saya</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-11">
                    <Link to="/">Kembali ke website</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={signingOut}
                    className="min-h-11"
                    onSelect={() => void handleSignOut()}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    {signingOut ? "Sedang keluar…" : "Keluar"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <aside
          aria-label="Menu admin desktop"
          className="fixed bottom-0 left-0 top-16 hidden w-64 border-r border-border bg-card lg:block"
        >
          <NavList
            permissions={data.permissions}
            isSuperAdmin={data.isSuperAdmin}
            badges={badges}
            onSelectBadge={markBadgeSeen}
          />
        </aside>
        <div className="min-w-0 lg:pl-64">
          <main
            id="admin-main"
            tabIndex={-1}
            className="mx-auto min-w-0 w-full max-w-[1440px] break-words px-4 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 lg:px-8 lg:py-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </AccessProvider>
  );
}

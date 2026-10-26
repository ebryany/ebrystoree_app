import { useEffect, useState } from "react";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  ChevronRight,
  ExternalLink,
  FileText,
  LogOut,
  Megaphone,
  Menu,
  Search,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AccessProvider, AdminLoading } from "@/components/admin/admin-ui";
import { getMyAccess } from "@/lib/admin.functions";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Shell dashboard Pertumbuhan (marketing, konten, SEO).
 *
 * Layout mengikuti dashboard admin supaya terasa satu keluarga: sidebar kiri
 * tetap (w-64, mulai di bawah header), header 16, konten `max-w-[1440px]`
 * dengan `lg:pl-64`. Yang berbeda hanya isi menunya.
 *
 * Guard berlapis:
 * - Sesi diperiksa di sini; belum masuk diarahkan ke `/see/masuk`.
 * - Izin `admin.dashboard.view` diperiksa lewat `getMyAccess`, lalu diteruskan
 *   ke halaman anak lewat `AccessProvider` supaya `useCan` bekerja.
 * - Server function tetap memeriksa ulang; UI bukan satu-satunya penjaga.
 */

export const Route = createFileRoute("/see/_dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Pertumbuhan — Ebrystore" },
      {
        name: "description",
        content: "Trafik, konten, SEO, dan kampanye Ebrystore dalam satu dashboard.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GrowthLayout,
});

const NAV: Array<{
  to: string;
  label: string;
  description: string;
  icon: typeof TrendingUp;
  exact?: boolean;
}> = [
  {
    to: "/see",
    label: "Ringkasan",
    description: "Trafik, penjualan, konten, SEO, dan kampanye dalam satu tampilan.",
    icon: TrendingUp,
    exact: true,
  },
  {
    to: "/see/marketing",
    label: "Marketing",
    description: "Dari mana pengunjung datang dan halaman mana yang bekerja.",
    icon: BarChart3,
  },
  {
    to: "/see/konten",
    label: "Konten",
    description: "Board editorial dan performa artikel yang sudah terbit.",
    icon: FileText,
  },
  {
    to: "/see/seo",
    label: "SEO",
    description: "Hasil audit halaman publik dan temuan yang perlu diperbaiki.",
    icon: Search,
  },
  {
    to: "/see/kampanye",
    label: "Kampanye",
    description: "Kanal yang menghasilkan order dan tautan UTM siap pakai.",
    icon: Megaphone,
  },
];

function GrowthLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, loading: sessionLoading } = useSession();
  const fetchAccess = useServerFn(getMyAccess);
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const access = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess({}),
    enabled: !!session,
    staleTime: 60_000,
  });

  // Belum masuk: arahkan ke pintu masuk khusus dashboard ini, bukan `/auth`.
  useEffect(() => {
    if (!sessionLoading && !session) navigate({ to: "/see/masuk", replace: true });
  }, [sessionLoading, session, navigate]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await navigate({ to: "/see/masuk", replace: true });
    } catch {
      toast.error("Gagal keluar dari akun. Silakan coba lagi.");
    } finally {
      setSigningOut(false);
    }
  }

  if (sessionLoading || !session || access.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-10">
        <AdminLoading label="Memeriksa izin akses…" />
      </div>
    );
  }

  const data = access.data;
  const canEnter =
    !!data && (data.isSuperAdmin || data.permissions.includes("admin.dashboard.view"));

  if (access.error || !data || !canEnter) {
    return <ForbiddenScreen failed={!!access.error} onRetry={() => void access.refetch()} />;
  }

  const active =
    NAV.find((item) =>
      item.exact
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`),
    ) ?? NAV[0];

  const navList = (onNavigate?: () => void) => (
    <nav aria-label="Navigasi dashboard pertumbuhan" className="space-y-6 px-3 py-5">
      <div>
        <p className="break-words px-3 text-xs font-semibold text-muted-foreground">Pertumbuhan</p>
        <ul className="mt-2 space-y-1">
          {NAV.map((item) => {
            const isActive = item.to === active.to;
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: true }}
                  activeProps={{}}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "bg-surface-selected font-semibold text-primary"
                      : "font-medium text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );

  return (
    <AccessProvider value={data}>
      <div className="min-h-dvh bg-background text-foreground">
        <a
          href="#see-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[60] focus:flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-primary focus:px-4 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Lewati ke konten utama
        </a>
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-card">
          <div className="flex h-full items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-2 lg:gap-6">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 shrink-0 lg:hidden"
                    aria-label="Buka menu pertumbuhan"
                  >
                    <Menu className="size-5" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 [&>button]:right-2 [&>button]:top-3 [&>button]:flex [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:items-center [&>button]:justify-center"
                >
                  <SheetHeader className="shrink-0 border-b border-border px-4 py-5 pr-16 text-left">
                    <SheetTitle className="break-words font-display text-base">
                      Ebrystore Pertumbuhan
                    </SheetTitle>
                    <SheetDescription className="break-words">
                      Marketing, konten, dan SEO.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {navList(() => setMobileOpen(false))}
                  </div>
                </SheetContent>
              </Sheet>
              <Link
                to="/see"
                activeOptions={{ exact: true }}
                className="flex min-h-11 min-w-0 items-center rounded-md font-display text-base font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:w-[208px]"
              >
                <span className="break-words">
                  Ebrystore <span className="font-medium text-muted-foreground">Pertumbuhan</span>
                </span>
              </Link>
              <p className="hidden text-sm text-muted-foreground lg:block">
                Marketing, konten, dan SEO
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Button asChild variant="ghost" className="hidden min-h-11 md:inline-flex">
                <Link to="/">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Lihat website
                </Link>
              </Button>
              <Button
                variant="outline"
                className="min-h-11 shadow-none"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? "Sedang keluar…" : "Keluar"}
              </Button>
            </div>
          </div>
        </header>
        <aside
          aria-label="Menu pertumbuhan desktop"
          className="fixed bottom-0 left-0 top-16 hidden w-64 border-r border-border bg-card lg:block"
        >
          <div className="h-full overflow-y-auto overscroll-contain">{navList()}</div>
        </aside>
        <div className="min-w-0 lg:pl-64">
          <main
            id="see-main"
            tabIndex={-1}
            className="mx-auto min-w-0 w-full max-w-[1440px] break-words px-4 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 lg:px-8 lg:py-8"
          >
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <nav
                  aria-label="Breadcrumb"
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Link to="/see" className="hover:text-foreground">
                    Pertumbuhan
                  </Link>
                  <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate text-foreground">{active.label}</span>
                </nav>
                <h1 className="mt-1 truncate text-xl font-bold sm:text-2xl">{active.label}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
              </div>
            </header>

            <div className="mt-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AccessProvider>
  );
}

/**
 * Layar penolakan khusus dashboard Pertumbuhan.
 *
 * Tombol kembalinya menuju website, bukan halaman masuk: pengguna yang sudah
 * masuk tapi tidak berizin akan terlempar balik ke sini bila diarahkan ke
 * `/see/masuk` (halaman itu meneruskan sesi aktif ke `/see`).
 */
function ForbiddenScreen({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 break-words text-xl font-bold">
          {failed ? "Gagal memeriksa akses" : "Akses ditolak"}
        </h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {failed
            ? "Izin akses belum dapat dimuat. Coba lagi atau kembali ke website."
            : "Akun Anda tidak memiliki izin untuk membuka dashboard Pertumbuhan."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {failed ? (
            <Button className="min-h-11" onClick={onRetry}>
              Coba lagi
            </Button>
          ) : null}
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/">Kembali ke website</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { CartButton } from "@/components/ebry/cart-button";
import { NotificationBell } from "@/components/ebry/notification-bell";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/hooks/use-session";
import { useScrolled } from "@/hooks/use-scrolled";
import { useSiteNav, useWebsiteSettings } from "@/hooks/use-website-settings";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

const NAV_META: Record<string, { description: string; icon: typeof Package }> = {
  "/produk": { description: "Produk digital dari berbagai toko", icon: Package },
  "/layanan": { description: "Pendampingan akademik dari platform", icon: GraduationCap },
  "/bantuan": { description: "Cara pesan, bayar, dan menerima produk", icon: HelpCircle },
  "/artikel": { description: "Panduan dari tim Ebrystore", icon: BookOpen },
};

export function SiteHeader({ variant = "default" }: { variant?: "default" | "dark" }) {
  void variant;
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const publicPage = !/^\/(dashboard|admin|seller|operator|checkout|auth)(\/|$)/.test(pathname);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  // Header mengecil setelah digulir: di puncak halaman tampil lega, saat
  // menggulir jadi ramping supaya konten dapat lebih banyak ruang.
  const scrolled = useScrolled(24);
  const settings = useWebsiteSettings();
  const navItems = useSiteNav("header", Boolean(user));
  const brandName = String(settings.store_name ?? "Ebrystore");
  const logoUrl = String(settings.site_logo_url ?? "");
  const fetchRoles = useServerFn(getMyRoles);
  const { data: access } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles({}),
    enabled: Boolean(user),
  });
  const isAdmin = Boolean(access?.isAdmin);
  const isOperator = Boolean(access?.roles?.includes("operator"));
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Akun saya";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate({ to: "/produk", search: { q: term.trim() } });
    setSearchOpen(false);
  }

  // Fokuskan input saat panel pencarian terbuka. Ditunda satu frame supaya
  // dialog selesai dipasang; tanpa jeda ini, browser mobile kadang membuka
  // keyboard sebelum input ada di DOM.
  useEffect(() => {
    if (!searchOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [searchOpen]);

  return (
    <header className="pt-safe sticky top-0 z-40">
      {/* Lapisan jarak. Di puncak halaman jaraknya nol sehingga navbar menempel
          ke tepi layar; setelah digulir jaraknya muncul dan navbar terlihat
          mengambang dari tepi viewport. */}
      <div
        className={cn(
          "transition-[padding] duration-300 ease-out motion-reduce:transition-none",
          scrolled ? "px-3 pt-2 sm:px-5 sm:pt-3" : "px-0 pt-0",
        )}
      >
        {/* Permukaan navbar: lebar penuh dengan radius kecil supaya terasa tegas
            seperti aplikasi SaaS, bukan kartu mengambang yang besar. Header di
            luar tetap `sticky` dan menempati ruangnya di alur dokumen, jadi
            perubahan bentuk di sini tidak pernah menggeser konten di bawahnya. */}
        <div
          className={cn(
            "relative w-full border bg-card text-foreground transition-[border-radius,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
            scrolled ? "rounded-xl border-border shadow-card" : "rounded-none border-transparent",
          )}
        >
          <div
            className={cn(
              "flex w-full flex-wrap items-center gap-x-4 px-4 transition-[padding,min-height] duration-300 ease-out motion-reduce:transition-none sm:px-6 lg:px-8",
              scrolled ? "min-h-12 gap-y-1 py-0.5" : "min-h-14 gap-y-1.5 py-1.5",
            )}
          >
            <Link
              to="/"
              className={cn(
                "flex min-h-11 min-w-11 shrink items-center justify-center gap-2.5 rounded-md font-bold tracking-tight transition-[font-size] duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[440px]:justify-start",
                scrolled ? "text-base" : "text-lg",
              )}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="size-9 shrink-0 object-contain" />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <ShoppingBag className="size-5" aria-hidden="true" />
                </span>
              )}
              {/* Nama brand disembunyikan di layar sempit supaya kolom pencarian tetap lega. */}
              <span className="hidden truncate min-[440px]:inline">{brandName}</span>
            </Link>
            {/* Navigasi utama sebaris dengan pencarian, bukan baris terpisah:
                satu baris membuat navbar terbaca sebagai satu permukaan. */}
            {navItems.length ? (
              <nav
                aria-label="Navigasi utama"
                className="hidden shrink-0 items-center gap-0.5 lg:flex"
              >
                {navItems.map((item) => (
                  <Link
                    key={`${item.url}-${item.label}`}
                    to={item.url as string}
                    target={item.open_in_new_tab ? "_blank" : undefined}
                    rel={item.open_in_new_tab ? "noopener noreferrer" : undefined}
                    className={cn(
                      "flex items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-[min-height,color,background-color] duration-300 hover:bg-surface hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      scrolled ? "min-h-9" : "min-h-11",
                    )}
                    activeProps={{ className: "bg-surface-selected font-semibold text-primary" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            {publicPage ? (
              <>
                {/* Mobile: satu tombol search. Desktop: form inline penuh.
                    Pemisahan ini menghapus dua ikon search yang sebelumnya
                    tampil berdampingan di satu form. */}
                <Button
                  ref={searchTriggerRef}
                  variant="outline"
                  className="min-h-11 min-w-11 flex-1 justify-start gap-2 px-3 text-muted-foreground lg:hidden"
                  aria-label="Cari produk dan jasa"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate text-sm">Cari di Ebrystore</span>
                </Button>

                <form
                  onSubmit={searchProducts}
                  role="search"
                  aria-label="Cari produk di marketplace"
                  className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background p-1 focus-within:ring-2 focus-within:ring-ring lg:flex"
                >
                  <Search
                    className="ml-2 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    name="q"
                    maxLength={80}
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="Cari produk digital…"
                    aria-label="Cari produk digital"
                    className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground"
                  />
                  <Button type="submit" variant="ghost" className="min-h-11">
                    Cari
                  </Button>
                </form>
              </>
            ) : null}
            <div className="ml-auto hidden items-center gap-1 border-l border-border pl-3 lg:flex">
              <CartButton />
              {loading ? (
                <div
                  className="h-11 w-28 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
                  aria-label="Memuat akun"
                />
              ) : user ? (
                <>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label="Chat produk"
                  >
                    <Link to="/dashboard/chat">
                      <MessagesSquare className="size-5" aria-hidden="true" />
                    </Link>
                  </Button>
                  <NotificationBell />
                  {isAdmin ? (
                    <Button asChild variant="ghost" className="min-h-11">
                      <Link to="/admin">Admin</Link>
                    </Button>
                  ) : null}
                  {isOperator ? (
                    <Button asChild variant="ghost" className="min-h-11">
                      <Link to="/operator">Tugas saya</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" className="min-h-11">
                    <Link to="/dashboard">
                      <UserRound className="size-4" aria-hidden="true" /> Akun saya
                    </Link>
                  </Button>
                  <Button variant="ghost" className="min-h-11" onClick={handleSignOut}>
                    Keluar
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="ghost" className="min-h-11">
                    <Link to="/auth">Masuk</Link>
                  </Button>
                  <Button asChild className="min-h-11">
                    <Link to="/auth" search={{ mode: "daftar" }}>
                      Daftar
                    </Link>
                  </Button>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1 lg:hidden">
              <CartButton />
              {user ? (
                <>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label="Chat produk"
                  >
                    <Link to="/dashboard/chat">
                      <MessagesSquare className="size-5" aria-hidden="true" />
                    </Link>
                  </Button>
                  <NotificationBell />
                </>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Buka menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full max-w-none flex-col gap-0 overflow-y-auto p-0 [&>button]:hidden sm:max-w-md lg:hidden"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <SheetTitle className="min-w-0 truncate text-lg">{brandName}</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label="Tutup menu"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
          {user ? (
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="m-4 flex min-h-14 items-center gap-3 rounded-lg bg-surface-selected p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserRound className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </Link>
          ) : (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Masuk untuk memesan dan memantau pesanan.
            </p>
          )}
          {user ? (
            <nav
              aria-label="Menu akun"
              className="grid grid-cols-2 gap-2 border-b border-border px-4 pb-4"
            >
              <Button asChild variant="outline" className="min-h-11">
                <Link
                  to="/dashboard/pesanan"
                  search={{ filter: "all" }}
                  onClick={() => setOpen(false)}
                >
                  Pesanan
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/dashboard/produk-saya" onClick={() => setOpen(false)}>
                  Produk dibeli
                </Link>
              </Button>
              <Button asChild variant="ghost" className="min-h-11">
                <Link to="/dashboard/notifikasi" onClick={() => setOpen(false)}>
                  Notifikasi
                </Link>
              </Button>
              <Button asChild variant="ghost" className="min-h-11">
                <Link to="/dashboard/pengaturan" onClick={() => setOpen(false)}>
                  Pengaturan
                </Link>
              </Button>
            </nav>
          ) : null}
          <nav aria-label="Navigasi seluler" className="flex flex-col gap-1 p-3">
            {navItems.map((item) => {
              const meta = NAV_META[item.url];
              const Icon = meta?.icon ?? ChevronRight;
              return (
                <Link
                  key={`${item.url}-${item.label}`}
                  to={item.url as string}
                  target={item.open_in_new_tab ? "_blank" : undefined}
                  rel={item.open_in_new_tab ? "noopener noreferrer" : undefined}
                  onClick={() => setOpen(false)}
                  className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  activeProps={{ className: "bg-surface-selected" }}
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    {meta ? (
                      <span className="block text-xs text-muted-foreground">
                        {meta.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
            {user ? (
              <>
                {isAdmin ? (
                  <Button asChild variant="outline" className="min-h-11 justify-start">
                    <Link to="/admin" onClick={() => setOpen(false)}>
                      <ShieldCheck className="size-4" aria-hidden="true" /> Dashboard admin
                    </Link>
                  </Button>
                ) : null}
                {isOperator ? (
                  <Button asChild variant="outline" className="min-h-11 justify-start">
                    <Link to="/operator" onClick={() => setOpen(false)}>
                      <ClipboardList className="size-4" aria-hidden="true" /> Tugas saya
                    </Link>
                  </Button>
                ) : null}
                <Button asChild className="min-h-11 justify-start">
                  <Link to="/dashboard" onClick={() => setOpen(false)}>
                    <LayoutDashboard className="size-4" aria-hidden="true" /> Akun saya
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 justify-start"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-4" aria-hidden="true" /> Keluar
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="min-h-11">
                  <Link to="/auth" search={{ mode: "daftar" }} onClick={() => setOpen(false)}>
                    Daftar akun
                  </Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/auth" onClick={() => setOpen(false)}>
                    Masuk
                  </Link>
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Pencarian mobile: satu panel penuh agar input lega dan keyboard tidak
          mendorong konten navbar. Ditutup dengan X atau Escape. */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="top-0 left-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 [&>button]:hidden lg:hidden"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            searchTriggerRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <DialogTitle className="sr-only">Cari di Ebrystore</DialogTitle>
            <form
              onSubmit={searchProducts}
              role="search"
              aria-label="Cari produk di marketplace"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background p-1 focus-within:ring-2 focus-within:ring-ring"
            >
              <Search className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                name="q"
                maxLength={80}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Cari produk digital…"
                aria-label="Cari produk digital"
                enterKeyHint="search"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="sm" className="min-h-11 shrink-0">
                Cari
              </Button>
            </form>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              aria-label="Tutup pencarian"
              onClick={() => setSearchOpen(false)}
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Jelajahi
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const meta = NAV_META[item.url];
                const Icon = meta?.icon ?? ChevronRight;
                return (
                  <Link
                    key={`search-${item.url}-${item.label}`}
                    to={item.url as string}
                    onClick={() => setSearchOpen(false)}
                    className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

import { useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  MessageSquarePlus,
  MessagesSquare,
  Phone,
  ReceiptText,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AvatarUploader } from "@/components/ebry/avatar-uploader";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/format";
import {
  getCustomerSummary,
  getMyCredit,
  getMyProfile,
  updateMyAvatar,
  updateMyProfile,
} from "@/lib/orders.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/pengaturan")({
  head: () => ({
    meta: [
      { title: "Profil Saya — Ebrystore" },
      {
        name: "description",
        content: "Kelola nama, nomor telepon, dan keamanan akun Ebrystore Anda.",
      },
      { property: "og:title", content: "Profil Saya — Ebrystore" },
      { property: "og:description", content: "Perbarui data profil dan kata sandi akun Anda." },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary" },
      { property: "robots", content: "noindex" },
    ],
  }),
  component: ProfilSaya,
});

type EditTarget = "name" | "phone" | "password" | null;

/** Kotak ikon kecil di kiri setiap baris, sama untuk semua grup. */
function IconTile({
  icon: Icon,
  tone = "accent",
}: {
  icon: LucideIcon;
  tone?: "accent" | "danger";
}) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl",
        tone === "danger"
          ? "bg-destructive/10 text-destructive"
          : "bg-surface-selected text-accent",
      )}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </span>
  );
}

const ROW =
  "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-selected/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Baris info: label abu kecil di atas, nilai di bawah. */
function InfoRow({
  icon,
  label,
  value,
  placeholder,
  onEdit,
  trailing,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  onEdit?: () => void;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "block truncate text-sm font-semibold",
            value ? "text-foreground" : "font-normal text-muted-foreground",
          )}
        >
          {value || placeholder || "—"}
        </span>
      </span>
      {trailing ??
        (onEdit ? (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null)}
    </>
  );
  return (
    <li className="border-b border-border last:border-b-0">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className={ROW}
          aria-label={`Ubah ${label.toLowerCase()}`}
        >
          {body}
        </button>
      ) : (
        <div className={cn(ROW, "hover:bg-transparent")}>{body}</div>
      )}
    </li>
  );
}

/** Baris menu: ikon, label, chevron. Bisa tautan, tombol, atau kontrol di kanan. */
function MenuRow({
  icon,
  label,
  hint,
  to,
  onClick,
  trailing,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  tone?: "danger";
}) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone === "danger" ? "danger" : "accent"} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            tone === "danger" ? "text-destructive" : "text-foreground",
          )}
        >
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {trailing ?? (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </>
  );
  return (
    <li className="border-b border-border last:border-b-0">
      {to ? (
        <Link to={to} className={ROW}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={ROW}>
          {body}
        </button>
      ) : (
        <div className={cn(ROW, "hover:bg-transparent")}>{body}</div>
      )}
    </li>
  );
}

function ProfilSaya() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchSummary = useServerFn(getCustomerSummary);
  const fetchCredit = useServerFn(getMyCredit);
  const saveProfile = useServerFn(updateMyProfile);
  const saveAvatar = useServerFn(updateMyAvatar);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile({}),
  });
  const { data: summary } = useQuery({
    queryKey: ["customer-summary"],
    queryFn: () => fetchSummary({}),
  });
  const { data: credit } = useQuery({ queryKey: ["my-credit"], queryFn: () => fetchCredit({}) });

  const [editing, setEditing] = useState<EditTarget>(null);
  const [draft, setDraft] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const profile = (data as any)?.profile;
  const fullName: string = profile?.full_name ?? "";
  const phone: string = profile?.phone ?? "";
  const email: string = profile?.email ?? user?.email ?? "";
  const emailNotifications = profile?.email_notifications_enabled !== false;

  const profileMutation = useMutation({
    mutationFn: async (patch: {
      fullName?: string;
      phone?: string;
      emailNotificationsEnabled?: boolean;
    }) =>
      saveProfile({
        data: {
          fullName: (patch.fullName ?? fullName).trim(),
          phone: (patch.phone ?? phone).trim(),
          emailNotificationsEnabled: patch.emailNotificationsEnabled ?? emailNotifications,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Profil gagal disimpan.");
        return;
      }
      toast.success("Profil tersimpan.");
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: () => toast.error("Nama minimal 2 karakter dan nomor telepon harus valid."),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
    },
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      setEditing(null);
      toast.success("Kata sandi diperbarui.");
    },
    onError: (err: any) => toast.error(err?.message ?? "Kata sandi gagal diperbarui."),
  });

  async function handleAvatarChange(url: string) {
    const res: any = await saveAvatar({ data: { avatarUrl: url } });
    if (!res?.ok) {
      toast.error(res?.error ?? "Foto profil gagal disimpan.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-summary"] });
    toast.success(url ? "Foto profil diperbarui." : "Foto profil dihapus.");
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function openEdit(target: Exclude<EditTarget, null>) {
    setDraft(target === "name" ? fullName : target === "phone" ? phone : "");
    setEditing(target);
  }

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
    : null;

  // Pintasan akun: ditampilkan sebagai kartu kecil geser horizontal (angka hanya bila ada datanya).
  const shortcuts: { to: string; icon: LucideIcon; label: string; meta?: string }[] = [
    {
      to: "/dashboard/pesanan",
      icon: ReceiptText,
      label: "Pesanan",
      meta: summary ? `${summary.activeOrders ?? 0} aktif` : undefined,
    },
    {
      to: "/dashboard/produk-saya",
      icon: Download,
      label: "Produk saya",
      meta: summary ? `${summary.entitlements ?? 0} produk` : undefined,
    },
    {
      to: "/dashboard/saldo",
      icon: Wallet,
      label: "Saldo",
      meta: credit ? formatRupiah(credit.balance ?? 0) : undefined,
    },
    { to: "/dashboard/chat", icon: MessagesSquare, label: "Chat" },
    { to: "/dashboard/disukai", icon: Heart, label: "Disukai" },
    { to: "/dashboard/po", icon: MessageSquarePlus, label: "PO Custom" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Bar atas: kembali + judul. Tombol bulat mengikuti referensi. */}
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
        <Link
          to="/dashboard"
          aria-label="Kembali ke beranda akun"
          className="grid size-11 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-center text-base font-bold">Profil saya</h1>
        <span aria-hidden="true" />
      </header>

      {isPending ? <CardSkeleton rows={3} /> : null}
      {error ? <ErrorState onRetry={() => refetch()} /> : null}

      {data ? (
        <>
          <section aria-label="Identitas" className="flex flex-col items-center text-center">
            <AvatarUploader
              variant="centered"
              value={profile?.avatar_url ?? null}
              userId={profile?.id ?? user?.id ?? ""}
              name={fullName || email || null}
              onChange={handleAvatarChange}
            />
            <p className="mt-3 max-w-full truncate text-xl font-bold text-foreground">
              {fullName || "Pengguna Ebrystore"}
            </p>
            {joined ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Bergabung {joined}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="info-heading">
            <h2 id="info-heading" className="sr-only">
              Data diri
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              <InfoRow
                icon={UserRound}
                label="Nama lengkap"
                value={fullName}
                placeholder="Tambahkan nama"
                onEdit={() => openEdit("name")}
              />
              <InfoRow
                icon={Phone}
                label="Nomor WhatsApp"
                value={phone}
                placeholder="Tambahkan nomor"
                onEdit={() => openEdit("phone")}
              />
              <InfoRow
                icon={Mail}
                label="Email"
                value={email}
                trailing={
                  <Lock
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-label="Email login tidak dapat diubah sendiri"
                  />
                }
              />
            </ul>
          </section>

          <section aria-labelledby="shortcut-heading">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 id="shortcut-heading" className="text-sm font-bold text-foreground">
                Aktivitas saya
              </h2>
              <Link
                to="/dashboard"
                className="inline-flex min-h-11 items-center gap-0.5 text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Beranda
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="-mx-4 flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
              {shortcuts.map((s) => (
                <li key={s.to} className="w-32 shrink-0 snap-start md:w-auto">
                  <Link
                    to={s.to}
                    className="flex h-full min-h-24 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-surface-selected text-accent">
                      <s.icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.label}</span>
                      {s.meta ? (
                        <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                          {s.meta}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="security-heading">
            <h2 id="security-heading" className="mb-2 px-1 text-sm font-bold text-foreground">
              Keamanan & preferensi
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              <MenuRow
                icon={KeyRound}
                label="Ubah kata sandi"
                hint="Minimal 8 karakter yang unik"
                onClick={() => openEdit("password")}
              />
              <li className="border-b border-border last:border-b-0">
                <label htmlFor="email-notif" className={cn(ROW, "cursor-pointer")}>
                  <IconTile icon={BellRing} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Email transaksi</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Pembayaran diterima, pesanan selesai, refund
                    </span>
                  </span>
                  <Switch
                    id="email-notif"
                    checked={emailNotifications}
                    disabled={profileMutation.isPending}
                    onCheckedChange={(v) =>
                      profileMutation.mutate({ emailNotificationsEnabled: v })
                    }
                  />
                </label>
              </li>
              <MenuRow
                icon={LifeBuoy}
                label="Bantuan"
                hint="Panduan dan kontak tim"
                to="/bantuan"
              />
            </ul>
          </section>

          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            <MenuRow
              icon={LogOut}
              label="Keluar dari akun"
              tone="danger"
              onClick={() => void handleSignOut()}
              trailing={<span />}
            />
          </ul>
        </>
      ) : null}

      {/* Lembar edit dari bawah: satu bidang per lembar supaya fokus di HP. */}
      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <span
            aria-hidden="true"
            className="mx-auto -mt-2 mb-1 block h-1.5 w-10 rounded-full bg-border"
          />
          {editing === "password" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (password.length < 8) return toast.error("Kata sandi minimal 8 karakter.");
                if (password !== confirm) return toast.error("Konfirmasi kata sandi tidak sama.");
                passwordMutation.mutate();
              }}
            >
              <SheetHeader className="text-left">
                <SheetTitle>Ubah kata sandi</SheetTitle>
                <SheetDescription>Gunakan minimal 8 karakter yang unik.</SheetDescription>
              </SheetHeader>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Kata sandi baru</Label>
                <Input
                  id="new-password"
                  type="password"
                  className="min-h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Ulangi kata sandi</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  className="min-h-11"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button
                type="submit"
                className="min-h-11 w-full"
                disabled={passwordMutation.isPending}
              >
                {passwordMutation.isPending ? "Memperbarui…" : "Perbarui kata sandi"}
              </Button>
            </form>
          ) : editing ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                profileMutation.mutate(editing === "name" ? { fullName: draft } : { phone: draft });
              }}
            >
              <SheetHeader className="text-left">
                <SheetTitle>{editing === "name" ? "Nama lengkap" : "Nomor WhatsApp"}</SheetTitle>
                <SheetDescription>
                  {editing === "name"
                    ? "Nama yang tampil di pesanan dan chat."
                    : "Dipakai tim dan penjual untuk menghubungi soal pesanan."}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-1.5">
                <Label htmlFor="profile-field" className="sr-only">
                  {editing === "name" ? "Nama lengkap" : "Nomor WhatsApp"}
                </Label>
                <Input
                  id="profile-field"
                  autoFocus
                  className="min-h-11"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={editing === "name" ? "Nama sesuai identitas" : "08xxxxxxxxxx"}
                  inputMode={editing === "phone" ? "tel" : undefined}
                  autoComplete={editing === "name" ? "name" : "tel"}
                  maxLength={editing === "name" ? 120 : 20}
                />
              </div>
              <Button
                type="submit"
                className="min-h-11 w-full"
                disabled={profileMutation.isPending}
              >
                {profileMutation.isPending ? "Menyimpan…" : "Simpan"}
              </Button>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

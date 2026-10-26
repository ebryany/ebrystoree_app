import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AvatarUploader } from "@/components/ebry/avatar-uploader";
import { PageHeader } from "@/components/ebry/cards";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, updateMyAvatar, updateMyProfile } from "@/lib/orders.functions";

export const Route = createFileRoute("/_authenticated/dashboard/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Akun — Ebrystore" },
      {
        name: "description",
        content: "Kelola nama, nomor telepon, dan keamanan akun Ebrystore Anda.",
      },
      { property: "og:title", content: "Pengaturan Akun — Ebrystore" },
      { property: "og:description", content: "Perbarui data profil dan kata sandi akun Anda." },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary" },
      { property: "robots", content: "noindex" },
    ],
  }),
  component: PengaturanAkun,
});

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-selected text-accent">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function PengaturanAkun() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const saveAvatar = useServerFn(updateMyAvatar);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile({}),
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const profile = (data as any)?.profile;
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setEmailNotifications(profile.email_notifications_enabled !== false);
  }, [profile]);

  const profileMutation = useMutation({
    mutationFn: async () =>
      saveProfile({
        data: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          emailNotificationsEnabled: emailNotifications,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Profil gagal disimpan.");
        return;
      }
      toast.success("Profil tersimpan.");
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

  return (
    <div className="-mt-5 space-y-4 md:mt-0">
      <PageHeader
        icon={UserRound}
        title="Profil Saya"
        description="Kelola data diri dan keamanan akun Ebrystore kamu"
      />

      {isPending ? <CardSkeleton rows={2} /> : null}
      {error ? <ErrorState onRetry={() => refetch()} /> : null}

      {data ? (
        <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
          {/* Kartu profil — kolom kiri khusus desktop */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-col items-center text-center">
                <span className="grid size-20 place-items-center overflow-hidden rounded-full border border-border bg-surface-selected text-xl font-semibold text-accent">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    (profile?.full_name ?? user?.email ?? "E").slice(0, 2).toUpperCase()
                  )}
                </span>
                <p className="mt-3 text-sm font-bold text-foreground">
                  {profile?.full_name ?? "Pengguna Ebrystore"}
                </p>
                <p className="mt-0.5 break-all text-xs text-muted-foreground">
                  {profile?.email ?? user?.email ?? "—"}
                </p>
              </div>
              <dl className="mt-4 space-y-2.5 border-t border-border pt-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Status akun</dt>
                  <dd className="font-semibold text-success">Aktif</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-medium text-foreground">
                    {profile?.email ? "Terverifikasi" : "—"}
                  </dd>
                </div>
                {profile?.created_at ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Bergabung</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(profile.created_at).toLocaleDateString("id-ID", {
                        month: "short",
                        year: "numeric",
                      })}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </aside>

          {/* Konten form — mobile tetap 1 kolom, desktop 2 kolom */}
          <div className="grid gap-3 lg:grid-cols-2 lg:content-start">
            <div className="lg:col-span-2">
              <SettingsCard
                icon={UserRound}
                title="Profil"
                description="Nama dan kontak yang kami pakai untuk pesananmu."
              >
                <AvatarUploader
                  value={profile?.avatar_url ?? null}
                  userId={profile?.id ?? user?.id ?? ""}
                  name={profile?.full_name ?? user?.email ?? null}
                  onChange={handleAvatarChange}
                />
                <form
                  className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    profileMutation.mutate();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="full-name">Nama lengkap</Label>
                    <Input
                      id="full-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nama sesuai identitas"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Nomor WhatsApp</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </div>

                  {/* Preferensi email transaksional. Diletakkan di form profil supaya
                  tersimpan bersama perubahan lain, bukan aksi terpisah. */}
                  <div className="lg:col-span-2">
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={emailNotifications}
                        onChange={(e) => setEmailNotifications(e.target.checked)}
                        className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          Email transaksi pesanan
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          Kabar saat pembayaran diterima, pesanan selesai, hasil jasa dikirim, dan
                          refund selesai. Dimatikan berarti kamu hanya melihat kabar ini di
                          dashboard.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="lg:col-span-2">
                    <Button
                      type="submit"
                      className="min-h-11 w-full lg:w-auto"
                      disabled={profileMutation.isPending}
                    >
                      {profileMutation.isPending ? "Menyimpan…" : "Simpan perubahan"}
                    </Button>
                  </div>
                </form>
              </SettingsCard>
            </div>

            <SettingsCard
              icon={Mail}
              title="Email"
              description="Email login tidak dapat diubah sendiri."
            >
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-3">
                <p className="text-sm font-medium break-all">
                  {profile?.email ?? user?.email ?? "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hubungi tim dukungan bila email perlu diganti agar riwayat pesanan tetap aman.
                </p>
              </div>
              {profile?.created_at ? (
                <p className="text-xs text-muted-foreground">
                  Bergabung sejak{" "}
                  {new Date(profile.created_at).toLocaleDateString("id-ID", { dateStyle: "long" })}
                </p>
              ) : null}
            </SettingsCard>

            <SettingsCard
              icon={KeyRound}
              title="Kata sandi"
              description="Gunakan minimal 8 karakter yang unik."
            >
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password.length < 8) {
                    toast.error("Kata sandi minimal 8 karakter.");
                    return;
                  }
                  if (password !== confirm) {
                    toast.error("Konfirmasi kata sandi tidak sama.");
                    return;
                  }
                  passwordMutation.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Kata sandi baru</Label>
                  <Input
                    id="new-password"
                    type="password"
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
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={passwordMutation.isPending}
                >
                  {passwordMutation.isPending ? "Memperbarui…" : "Perbarui kata sandi"}
                </Button>
              </form>
            </SettingsCard>

            <SettingsCard
              icon={ShieldCheck}
              title="Sesi & keamanan"
              description="Keluar dari perangkat ini kapan saja."
            >
              <Button
                variant="outline"
                className="min-h-11 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" aria-hidden="true" />
                Keluar dari akun
              </Button>
            </SettingsCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}

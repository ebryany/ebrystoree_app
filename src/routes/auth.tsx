import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MailCheck,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { GlassActionButton } from "@/components/ui/glass-action-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useWebsiteSettings } from "@/hooks/use-website-settings";
import { homeBannerSlides } from "@/lib/website-settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string; mode?: "masuk" | "daftar" } => {
    const next = typeof s["next"] === "string" ? s["next"] : "";
    const mode = s["mode"] === "daftar" ? "daftar" : undefined;
    return {
      ...(next.startsWith("/") && !next.startsWith("//") ? { next } : {}),
      ...(mode ? { mode } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Masuk atau Daftar — Ebrystore" },
      {
        name: "description",
        content:
          "Masuk ke akun Ebrystore untuk memantau pesanan, mengunduh produk digital, dan mengikuti progres bantuan tugas.",
      },
      { property: "og:title", content: "Masuk atau Daftar — Ebrystore" },
      {
        property: "og:description",
        content: "Akses pesanan dan produk digital Ebrystore lewat akun kamu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HalamanAuth,
});

type Mode = "masuk" | "daftar" | "lupa";

/** Error per field, bukan hanya toast, supaya pengguna tahu mana yang salah. */
type FieldErrors = Partial<Record<"email" | "password" | "confirm" | "name" | "terms", string>>;

function HalamanAuth() {
  const navigate = useNavigate();
  // Banner diambil dari unggahan admin (Pengaturan Website). Bila kosong,
  // panel memakai bidang warna brand sehingga tidak ada area putih kosong.
  const settings = useWebsiteSettings();
  const bannerImage = homeBannerSlides(settings)[0]?.imageUrl ?? "";
  const { next, mode: initialMode } = Route.useSearch();
  const { user, loading } = useSession();
  const [mode, setMode] = useState<Mode>(initialMode ?? "masuk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Setelah daftar tanpa sesi, verifikasi email memang aktif: tampilkan status
  // jujur alih-alih mengarahkan ke dashboard yang belum bisa dipakai.
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const goNext = () => {
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  };

  useEffect(() => {
    if (!loading && user && !awaitingEmail) {
      if (next) window.location.href = next;
      else navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, user, navigate, next, awaitingEmail]);

  function validate(): boolean {
    const nextErrors: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) nextErrors.email = "Email wajib diisi.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      nextErrors.email = "Format email tidak valid.";

    if (mode === "lupa") {
      setErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    }

    if (!password) nextErrors.password = "Kata sandi wajib diisi.";
    else if (password.length < 8) nextErrors.password = "Kata sandi minimal 8 karakter.";

    if (mode === "daftar") {
      if (fullName.trim().length < 2) nextErrors.name = "Nama lengkap minimal 2 karakter.";
      if (confirm !== password) nextErrors.confirm = "Konfirmasi kata sandi tidak sama.";
      if (!termsAccepted) nextErrors.terms = "Setujui syarat dan kebijakan privasi untuk lanjut.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === "lupa") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        setResetSent(true);
      } else if (mode === "masuk") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Berhasil masuk.");
        goNext();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${next || "/dashboard"}`,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Akun dibuat. Mengarahkan ke dashboard…");
          goNext();
        } else {
          setAwaitingEmail(email.trim());
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
      if (message.includes("Invalid login credentials")) {
        setErrors({ password: "Email atau kata sandi salah." });
      } else if (message.includes("already registered")) {
        setErrors({ email: "Email ini sudah terdaftar. Silakan masuk." });
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    // OAuth langsung ke Supabase, bukan lewat broker Lovable. Broker hanya
    // hidup di Lovable Cloud; setelah self-host, rute /~oauth/initiate tidak
    // ada (404) sehingga tombol ini mati total di produksi.
    //
    // Supabase mengembalikan user ke /auth/callback dengan ?code=.
    // `next` dititipkan lewat query agar tujuan setelah login tidak hilang.
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      setBusy(false);
      toast.error("Gagal masuk dengan Google. Coba lagi.");
      return;
    }
    // Sukses berarti browser sedang diarahkan ke Google; `busy` sengaja
    // dibiarkan true supaya tombol tidak bisa diklik dua kali saat redirect.
  }

  const inputClass = "h-11 rounded-lg bg-card";

  /* ---------- Status setelah daftar: verifikasi email aktif ---------- */
  if (awaitingEmail) {
    return (
      <PageShell>
        <div className="bg-surface">
          <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10 sm:py-16">
            <section className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-7">
              <span className="grid size-11 place-items-center rounded-xl bg-surface-selected text-accent">
                <MailCheck className="size-5" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-xl font-bold">Periksa email kamu</h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Tautan konfirmasi dikirim ke <strong className="break-all">{awaitingEmail}</strong>.
                Buka tautan itu untuk mengaktifkan akun, lalu masuk kembali di sini.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  onClick={() => {
                    setAwaitingEmail(null);
                    setMode("masuk");
                    setPassword("");
                    setConfirm("");
                  }}
                >
                  Masuk ke akun
                </Button>
                <Button variant="outline" className="min-h-11" asChild>
                  <Link to="/">Kembali ke beranda</Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ---------- Status setelah kirim tautan reset ---------- */
  if (resetSent) {
    return (
      <PageShell>
        <div className="bg-surface">
          <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10 sm:py-16">
            <section className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-7">
              <span className="grid size-11 place-items-center rounded-xl bg-surface-selected text-accent">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-xl font-bold">Tautan reset dikirim</h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Bila <strong className="break-all">{email.trim()}</strong> terdaftar, kami mengirim
                tautan untuk membuat kata sandi baru. Periksa kotak masuk dan folder spam.
              </p>
              <Button
                variant="outline"
                className="mt-5 min-h-11"
                onClick={() => {
                  setResetSent(false);
                  setMode("masuk");
                }}
              >
                <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
                Kembali ke halaman masuk
              </Button>
            </section>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="bg-surface">
        {/* Kontainer sejajar dengan navbar/footer (max-w-6xl + padding sama),
            sehingga tepi halaman auth tidak melebihi kerangka situs. */}
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:grid-cols-2">
            {/* Panel gambar: hanya gambar, tanpa teks. Bila banner belum
                diunggah, panel memakai bidang netral gelap berpola halus. */}
            <aside className="relative hidden min-h-[560px] overflow-hidden bg-foreground lg:block">
              {bannerImage ? (
                <img
                  src={bannerImage}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 size-full object-cover"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(140deg,oklch(0.28_0.02_220)_0%,oklch(0.2_0.015_220)_100%)]"
                />
              )}
            </aside>

            <section className="flex min-w-0 flex-col justify-center px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
              <div className="mx-auto w-full max-w-sm">
                {/* Pemilih mode dengan peran tablist agar pembaca layar mengenalinya. */}
                {mode === "lupa" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("masuk");
                      setErrors({});
                    }}
                    className="mb-5 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Kembali ke halaman masuk
                  </button>
                ) : (
                  <div
                    role="tablist"
                    aria-label="Pilih masuk atau daftar"
                    className="relative grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1"
                  >
                    {(
                      [
                        ["masuk", "Masuk"],
                        ["daftar", "Daftar"],
                      ] as const
                    ).map(([value, label]) => {
                      const active = mode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            setMode(value);
                            setErrors({});
                          }}
                          className={cn(
                            "min-h-10 rounded-md text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                            active
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {mode === "masuk"
                      ? "Masuk ke akun"
                      : mode === "daftar"
                        ? "Buat akun baru"
                        : "Lupa kata sandi"}
                  </h1>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {mode === "masuk"
                      ? "Lanjutkan ke pesanan, produk digital, dan progres pekerjaanmu."
                      : mode === "daftar"
                        ? "Satu akun untuk memesan, membayar, dan memantau progres."
                        : "Masukkan email akunmu, kami kirim tautan untuk membuat kata sandi baru."}
                  </p>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
                  {mode === "daftar" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="nama">Nama lengkap</Label>
                      <div className="relative">
                        <User
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="nama"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          autoComplete="name"
                          placeholder="Nama kamu"
                          className={cn(inputClass, "pl-9")}
                          aria-invalid={Boolean(errors.name)}
                          aria-describedby={errors.name ? "nama-error" : undefined}
                        />
                      </div>
                      {errors.name ? (
                        <p id="nama-error" role="alert" className="text-xs text-destructive">
                          {errors.name}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="nama@email.com"
                        className={cn(inputClass, "pl-9")}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "email-error" : undefined}
                      />
                    </div>
                    {errors.email ? (
                      <p id="email-error" role="alert" className="text-xs text-destructive">
                        {errors.email}
                      </p>
                    ) : null}
                  </div>

                  {mode !== "lupa" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Kata sandi</Label>
                      <div className="relative">
                        <LockKeyhole
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete={mode === "masuk" ? "current-password" : "new-password"}
                          placeholder="Minimal 8 karakter"
                          className={cn(inputClass, "pl-9 pr-11")}
                          aria-invalid={Boolean(errors.password)}
                          aria-describedby={errors.password ? "password-error" : undefined}
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={
                            showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                          }
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                          ) : (
                            <Eye className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {errors.password ? (
                        <p id="password-error" role="alert" className="text-xs text-destructive">
                          {errors.password}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {mode === "daftar" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="konfirmasi">Ulangi kata sandi</Label>
                      <div className="relative">
                        <ShieldCheck
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="konfirmasi"
                          type={showPassword ? "text" : "password"}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Tulis ulang kata sandi"
                          className={cn(inputClass, "pl-9")}
                          aria-invalid={Boolean(errors.confirm)}
                          aria-describedby={errors.confirm ? "konfirmasi-error" : undefined}
                        />
                      </div>
                      {errors.confirm ? (
                        <p id="konfirmasi-error" role="alert" className="text-xs text-destructive">
                          {errors.confirm}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {mode === "daftar" ? (
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-0.5 size-4 shrink-0 rounded border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                          aria-invalid={Boolean(errors.terms)}
                        />
                        <span className="min-w-0 text-muted-foreground">
                          Saya menyetujui{" "}
                          <Link
                            to="/syarat-ketentuan"
                            className="font-medium text-foreground underline"
                          >
                            syarat & ketentuan
                          </Link>{" "}
                          dan{" "}
                          <Link
                            to="/kebijakan-privasi"
                            className="font-medium text-foreground underline"
                          >
                            kebijakan privasi
                          </Link>
                          .
                        </span>
                      </label>
                      {errors.terms ? (
                        <p role="alert" className="text-xs text-destructive">
                          {errors.terms}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {mode === "masuk" ? (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("lupa");
                          setErrors({});
                        }}
                        className="rounded-md text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        Lupa kata sandi?
                      </button>
                    </div>
                  ) : null}

                  <GlassActionButton type="submit" disabled={busy}>
                    {busy
                      ? "Memproses…"
                      : mode === "masuk"
                        ? "Masuk"
                        : mode === "daftar"
                          ? "Buat akun"
                          : "Kirim tautan reset"}
                    {!busy ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
                  </GlassActionButton>
                </form>

                {/* Alternatif login diletakkan setelah form: pengguna mengisi
                    kredensial lebih dulu, lalu memilih cara lain bila perlu. */}
                {mode !== "lupa" ? (
                  <>
                    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      atau
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 w-full rounded-xl bg-card"
                      onClick={handleGoogle}
                      disabled={busy}
                    >
                      <span className="flex size-5 items-center justify-center rounded-full border border-border text-[11px] font-bold">
                        G
                      </span>
                      Lanjutkan dengan Google
                    </Button>
                  </>
                ) : null}

                {mode !== "lupa" ? (
                  <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
                    Dengan melanjutkan, kamu menyetujui{" "}
                    <Link
                      to="/syarat-ketentuan"
                      className="font-medium text-foreground hover:underline"
                    >
                      syarat & ketentuan
                    </Link>{" "}
                    serta{" "}
                    <Link
                      to="/kebijakan-privasi"
                      className="font-medium text-foreground hover:underline"
                    >
                      kebijakan privasi
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

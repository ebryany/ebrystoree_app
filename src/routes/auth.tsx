import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MailCheck,
  ShieldCheck,
  ShoppingBag,
  Star,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useWebsiteSettings } from "@/hooks/use-website-settings";
import { listRecentReviews } from "@/lib/reviews.functions";
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
type Method = "google" | "email";

/** Error per field, bukan hanya toast, supaya pengguna tahu mana yang salah. */
type FieldErrors = Partial<Record<"email" | "password" | "confirm" | "name" | "terms", string>>;

/** Metode masuk terakhir disimpan lokal (bukan data akun) untuk menandai tombol yang biasa dipakai. */
const LAST_METHOD_KEY = "ebry:last-auth-method";
/** Bukti sosial baru ditampilkan bila ulasan nyata cukup; di bawah itu terlihat mengarang. */
const MIN_REVIEWS_FOR_PROOF = 3;

function rememberMethod(method: Method) {
  try {
    window.localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // Mode privat/penyimpanan penuh: fitur ini opsional.
  }
}

/** Skor 0–4 kekuatan kata sandi dari aturan sederhana yang bisa dijelaskan ke pengguna. */
function passwordStrength(value: string) {
  const checks = [
    { ok: value.length >= 8, label: "8+ karakter" },
    { ok: /[a-z]/.test(value) && /[A-Z]/.test(value), label: "Huruf besar & kecil" },
    { ok: /\d/.test(value), label: "Angka" },
    { ok: /[^A-Za-z0-9]/.test(value), label: "Simbol" },
  ];
  const score = checks.filter((c) => c.ok).length;
  const label = ["Terlalu lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"][score];
  return { checks, score, label };
}

function HalamanAuth() {
  const navigate = useNavigate();
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
  const [capsLock, setCapsLock] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastMethod, setLastMethod] = useState<Method | null>(null);
  // Setelah daftar tanpa sesi, verifikasi email memang aktif: tampilkan status
  // jujur alih-alih mengarahkan ke dashboard yang belum bisa dipakai.
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // localStorage hanya dibaca di klien agar SSR dan hidrasi tetap sama.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_METHOD_KEY);
      if (saved === "google" || saved === "email") setLastMethod(saved);
    } catch {
      // abaikan
    }
  }, []);

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

  function switchMode(value: Mode) {
    setMode(value);
    setErrors({});
  }

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
        rememberMethod("email");
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
        rememberMethod("email");
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
    rememberMethod("google");
    // Sukses berarti browser sedang diarahkan ke Google; `busy` sengaja
    // dibiarkan true supaya tombol tidak bisa diklik dua kali saat redirect.
  }

  /** Peringatan Caps Lock: kesalahan kata sandi paling umum yang tidak terlihat. */
  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  const inputClass = "h-11 rounded-xl bg-card";

  /* ---------- Status setelah daftar: verifikasi email aktif ---------- */
  if (awaitingEmail) {
    return (
      <StatusCard
        icon={<MailCheck className="size-5" aria-hidden="true" />}
        title="Periksa email kamu"
      >
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Tautan konfirmasi dikirim ke <strong className="break-all">{awaitingEmail}</strong>. Buka
          tautan itu untuk mengaktifkan akun, lalu masuk kembali di sini.
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
      </StatusCard>
    );
  }

  /* ---------- Status setelah kirim tautan reset ---------- */
  if (resetSent) {
    return (
      <StatusCard
        icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
        title="Tautan reset dikirim"
      >
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Bila <strong className="break-all">{email.trim()}</strong> terdaftar, kami mengirim tautan
          untuk membuat kata sandi baru. Periksa kotak masuk dan folder spam.
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
      </StatusCard>
    );
  }

  const strength = mode === "daftar" && password ? passwordStrength(password) : null;

  return (
    <PageShell>
      <AuthBackdrop>
        <div className="grid gap-2 rounded-3xl border border-border/70 bg-card p-2 shadow-lifted lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <GlowPanel mode={mode} />

          <section className="flex min-w-0 flex-col justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
            <div className="mx-auto w-full max-w-sm">
              {mode === "lupa" ? (
                <button
                  type="button"
                  onClick={() => switchMode("masuk")}
                  className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Kembali ke halaman masuk
                </button>
              ) : null}

              <div className="text-center">
                <BrandMark className="mx-auto" />
                <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-[1.75rem]">
                  {mode === "masuk"
                    ? "Selamat datang kembali"
                    : mode === "daftar"
                      ? "Buat akun Ebrystore"
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

              {mode !== "lupa" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="relative mt-6 min-h-11 w-full rounded-xl bg-card font-semibold"
                    onClick={handleGoogle}
                    disabled={busy}
                  >
                    <GoogleIcon />
                    {mode === "daftar" ? "Daftar dengan Google" : "Masuk dengan Google"}
                    {lastMethod === "google" ? <LastUsedBadge /> : null}
                  </Button>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    atau pakai email
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              ) : null}

              <form
                className={cn("space-y-4", mode === "lupa" && "mt-6")}
                onSubmit={handleSubmit}
                noValidate
              >
                {mode === "daftar" ? (
                  <Field id="nama" label="Nama lengkap" error={errors.name} icon={User}>
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
                  </Field>
                ) : null}

                <Field
                  id="email"
                  label="Email"
                  error={errors.email}
                  icon={Mail}
                  aside={
                    lastMethod === "email" && mode === "masuk" ? <LastUsedBadge inline /> : null
                  }
                >
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
                </Field>

                {mode !== "lupa" ? (
                  <Field
                    id="password"
                    label="Kata sandi"
                    error={errors.password}
                    icon={LockKeyhole}
                    aside={
                      mode === "masuk" ? (
                        <button
                          type="button"
                          onClick={() => switchMode("lupa")}
                          className="rounded-md text-xs font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          Lupa kata sandi?
                        </button>
                      ) : null
                    }
                    trailing={
                      <button
                        type="button"
                        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
                    }
                  >
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={trackCaps}
                      onKeyDown={trackCaps}
                      onBlur={() => setCapsLock(false)}
                      autoComplete={mode === "masuk" ? "current-password" : "new-password"}
                      placeholder="Minimal 8 karakter"
                      className={cn(inputClass, "pl-9 pr-11")}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={
                        [errors.password && "password-error", strength && "password-strength"]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                    />
                  </Field>
                ) : null}

                {capsLock && mode !== "lupa" ? (
                  <p
                    role="status"
                    className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-foreground dark:text-warning"
                  >
                    <TriangleAlert className="size-3.5" aria-hidden="true" /> Caps Lock aktif
                  </p>
                ) : null}

                {strength ? <StrengthMeter {...strength} /> : null}

                {mode === "daftar" ? (
                  <Field
                    id="konfirmasi"
                    label="Ulangi kata sandi"
                    error={errors.confirm}
                    icon={ShieldCheck}
                  >
                    <Input
                      id="konfirmasi"
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Tulis ulang kata sandi"
                      className={cn(
                        inputClass,
                        "pl-9",
                        confirm && confirm === password && "border-success/60",
                      )}
                      aria-invalid={Boolean(errors.confirm)}
                      aria-describedby={errors.confirm ? "konfirmasi-error" : undefined}
                    />
                  </Field>
                ) : null}

                {mode === "daftar" ? (
                  <div className="space-y-1.5">
                    <label className="flex items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 rounded border-border accent-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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

                <Button
                  type="submit"
                  disabled={busy}
                  className="group min-h-12 w-full rounded-xl text-sm font-semibold shadow-[0_10px_24px_-12px_var(--primary)]"
                >
                  {busy
                    ? "Memproses…"
                    : mode === "masuk"
                      ? "Masuk"
                      : mode === "daftar"
                        ? "Buat akun"
                        : "Kirim tautan reset"}
                  {!busy ? (
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  ) : null}
                </Button>
              </form>

              {mode !== "lupa" ? (
                <p className="mt-5 text-center text-sm text-muted-foreground">
                  {mode === "masuk" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(mode === "masuk" ? "daftar" : "masuk")}
                    className="inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {mode === "masuk" ? "Daftar gratis" : "Masuk"}
                  </button>
                </p>
              ) : null}

              <p className="mt-2 flex items-start justify-center gap-1.5 text-center text-xs leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Data kamu dijaga sesuai{" "}
                  <Link
                    to="/kebijakan-privasi"
                    className="font-medium text-foreground hover:underline"
                  >
                    kebijakan privasi
                  </Link>{" "}
                  dan{" "}
                  <Link
                    to="/syarat-ketentuan"
                    className="font-medium text-foreground hover:underline"
                  >
                    syarat & ketentuan
                  </Link>
                  .
                </span>
              </p>
            </div>
          </section>
        </div>
      </AuthBackdrop>
    </PageShell>
  );
}

/* ====================== Komponen pendukung ====================== */

/** Latar halaman: kabut teal + amber dengan orb blur; kartu putih duduk di atasnya. */
function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden bg-surface">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full bg-accent/20 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-20 -z-10 size-80 rounded-full bg-aurora/25 blur-3xl"
      />
      {/* Kontainer sejajar navbar/footer (max-w-6xl + padding sama). */}
      <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 sm:py-12">{children}</div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <AuthBackdrop>
        <section className="mx-auto max-w-md rounded-3xl border border-border/70 bg-card p-5 shadow-lifted sm:p-7">
          <span className="grid size-11 place-items-center rounded-xl bg-surface-selected text-accent">
            {icon}
          </span>
          <h1 className="mt-4 text-xl font-bold">{title}</h1>
          {children}
        </section>
      </AuthBackdrop>
    </PageShell>
  );
}

function BrandMark({ className, withName }: { className?: string; withName?: boolean }) {
  const settings = useWebsiteSettings();
  const brandName = String(settings.store_name ?? "Ebrystore");
  const logoUrl = String(settings.site_logo_url ?? "");
  return (
    <Link
      to="/"
      aria-label={`${brandName} — beranda`}
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-xl font-display text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-11 shrink-0 object-contain" />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)]">
          <ShoppingBag className="size-5" aria-hidden="true" />
        </span>
      )}
      {withName ? <span className="truncate">{brandName}</span> : null}
    </Link>
  );
}

/**
 * Panel kiri bercahaya (desktop). Isi berubah mengikuti mode: masuk menonjolkan
 * apa yang menunggu di akun, daftar menonjolkan alur belanja. Bukti sosial dan
 * kutipan ulasan diambil dari ulasan nyata; bila belum cukup, tidak ditampilkan.
 */
function GlowPanel({ mode }: { mode: Mode }) {
  const fetchReviews = useServerFn(listRecentReviews);
  const { data } = useQuery({
    // Berbagi cache dengan pita ulasan di beranda.
    queryKey: ["home-review-marquee"],
    queryFn: () => fetchReviews({}),
    staleTime: 5 * 60_000,
  });

  const reviews = data?.items ?? [];
  const hasProof = (data?.total ?? 0) >= MIN_REVIEWS_FOR_PROOF;
  const quote = useMemo(
    () => reviews.find((r) => r.rating >= 4 && (r.body ?? "").trim().length >= 20) ?? null,
    [reviews],
  );
  const avatars = reviews
    .map((r) => (r.reviewer_name ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const copy =
    mode === "daftar"
      ? {
          title: "Belanja produk digital & jasa, dana tetap aman.",
          lines: [
            { icon: Wallet, text: "Bayar QRIS, harga dihitung server" },
            { icon: ShieldCheck, text: "Dana jasa ditahan sampai hasil kamu terima" },
            { icon: BadgeCheck, text: "Produk dikirim otomatis ke akunmu" },
          ],
        }
      : {
          title: "Pesanan dan produkmu menunggu di satu tempat.",
          lines: [
            { icon: ShoppingBag, text: "Lacak status pesanan secara langsung" },
            { icon: BadgeCheck, text: "Unduh ulang produk digital kapan saja" },
            { icon: ShieldCheck, text: "Chat seller & ajukan revisi jasa" },
          ],
        };

  return (
    <aside
      aria-label="Tentang Ebrystore"
      className="relative isolate hidden min-h-[600px] overflow-hidden rounded-2xl bg-auth-glow lg:flex lg:flex-col"
    >
      {/* Orb kaca bercahaya. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-10 top-24 -z-10 size-56 rounded-full bg-accent/35 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 bottom-28 -z-10 size-64 rounded-full bg-aurora/40 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="animate-auth-float pointer-events-none absolute right-16 top-20 -z-10 size-36 rounded-full border border-white/60 bg-gradient-to-br from-white/70 via-white/20 to-accent/20 shadow-[inset_0_2px_12px_oklch(1_0_0/70%),0_20px_50px_-20px_var(--accent)] backdrop-blur-md"
      />
      <span
        aria-hidden="true"
        className="animate-auth-float pointer-events-none absolute left-20 top-56 -z-10 size-16 rounded-full border border-white/60 bg-gradient-to-br from-white/80 to-aurora/30 shadow-[inset_0_2px_8px_oklch(1_0_0/70%)] backdrop-blur-md [animation-delay:-4s]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 auth-grid opacity-40 [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]"
      />

      <div className="p-7">
        <BrandMark withName />
      </div>

      {/* Kutipan ulasan nyata terbaru, kartu kaca melayang. */}
      {quote ? (
        <figure className="mx-7 mt-2 max-w-xs self-end rounded-2xl border border-white/60 bg-white/55 p-4 shadow-[0_18px_40px_-24px_var(--primary)] backdrop-blur-xl dark:border-glass-border dark:bg-glass-strong">
          <div className="flex gap-0.5" aria-label={`${quote.rating} dari 5 bintang`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={cn(
                  "size-3.5",
                  i < quote.rating ? "fill-aurora text-aurora" : "text-muted-foreground/40",
                )}
                aria-hidden="true"
              />
            ))}
          </div>
          <blockquote className="mt-2 line-clamp-3 text-sm leading-snug">
            “{quote.body?.trim()}”
          </blockquote>
          <figcaption className="mt-2 truncate text-xs text-muted-foreground">
            {quote.reviewer_name ?? "Pembeli"}
            {quote.product ? ` · ${quote.product.name}` : ""}
          </figcaption>
        </figure>
      ) : null}

      <div className="mt-auto p-7">
        <h2 className="max-w-md text-[1.75rem] font-bold leading-tight tracking-tight">
          {copy.title}
        </h2>
        <ul className="mt-5 space-y-2.5 text-sm">
          {copy.lines.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/60 bg-white/50 text-primary backdrop-blur dark:border-glass-border dark:bg-glass">
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        {hasProof && data ? (
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/55 py-1.5 pl-1.5 pr-4 shadow-[0_10px_30px_-18px_var(--primary)] backdrop-blur-xl dark:border-glass-border dark:bg-glass-strong">
            <span className="flex -space-x-2" aria-hidden="true">
              {avatars.map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className={cn(
                    "grid size-8 place-items-center rounded-full border-2 border-card text-xs font-bold",
                    [
                      "bg-primary text-primary-foreground",
                      "bg-aurora text-aurora-foreground",
                      "bg-accent text-accent-foreground",
                      "bg-secondary text-secondary-foreground",
                    ][i % 4],
                  )}
                >
                  {name[0]!.toUpperCase()}
                </span>
              ))}
            </span>
            <span className="text-sm leading-tight">
              <span className="flex items-center gap-1 font-bold">
                <Star className="size-3.5 fill-aurora text-aurora" aria-hidden="true" />
                {data.average.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground">
                dari {data.total} ulasan pembeli terbaru
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Field({
  id,
  label,
  error,
  icon: Icon,
  aside,
  trailing,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  icon: typeof Mail;
  aside?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        {children}
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Meter kekuatan kata sandi: 4 segmen + daftar syarat yang sudah/belum terpenuhi. */
function StrengthMeter({ checks, score, label }: ReturnType<typeof passwordStrength>) {
  const tone =
    score <= 1
      ? "bg-destructive"
      : score === 2
        ? "bg-warning"
        : score === 3
          ? "bg-accent"
          : "bg-success";
  return (
    <div id="password-strength" className="-mt-1 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-colors duration-300",
                i < score ? tone : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="w-20 shrink-0 text-right text-xs font-medium">{label}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {checks.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-1", c.ok && "text-foreground")}>
            <CheckCircle2
              className={cn("size-3", c.ok ? "text-success" : "text-muted-foreground/50")}
              aria-hidden="true"
            />
            {c.label}
            <span className="sr-only">{c.ok ? " terpenuhi" : " belum"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LastUsedBadge({ inline }: { inline?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full bg-aurora px-2 py-0.5 text-[10px] font-semibold text-aurora-foreground",
        !inline && "absolute -top-2 right-3",
      )}
    >
      Terakhir dipakai
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

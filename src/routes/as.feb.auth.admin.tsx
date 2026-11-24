import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import {
  adminPortalSignIn,
  adminPortalVerifyMfa,
  getAdminPortalConfig,
} from "@/lib/admin-auth.functions";
import { getMyAccess } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/as/feb/auth/admin")({
  head: () => ({
    meta: [
      { title: "Portal Administrasi — Ebrystore" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: AdminPortalLoginPage,
});

type MfaChallengeState = {
  factorId: string;
  challengeId: string;
  accessToken: string;
  refreshToken: string;
};

type FieldErrors = Partial<Record<"email" | "password" | "passcode" | "code", string>>;

function AdminPortalLoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: sessionLoading } = useSession();

  const fetchConfig = useServerFn(getAdminPortalConfig);
  const fetchAccess = useServerFn(getMyAccess);
  const submitSignIn = useServerFn(adminPortalSignIn);
  const submitMfa = useServerFn(adminPortalVerifyMfa);

  const { data: config } = useQuery({
    queryKey: ["admin-portal-config"],
    queryFn: () => fetchConfig({}),
    staleTime: 5 * 60_000,
  });
  const passcodeRequired = Boolean(config?.passcodeRequired);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [website, setWebsite] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [mfa, setMfa] = useState<MfaChallengeState | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passcodeRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  // Bila sesi admin sudah terverifikasi oleh cookie HttpOnly di server, langsung masuk ke /admin.
  useEffect(() => {
    if (sessionLoading || !user || busy || mfa) return;
    let alive = true;
    void fetchAccess({})
      .then((access) => {
        if (!alive) return;
        const allowed =
          Boolean(access?.adminPortalVerified) &&
          (access.isSuperAdmin || access.permissions.includes("admin.dashboard.view"));
        if (allowed) {
          void navigate({ to: "/admin", replace: true });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionLoading, user, busy, mfa, fetchAccess, navigate]);

  // Pindahkan fokus ke input kode OTP saat transisi ke langkah verifikasi 2FA.
  useEffect(() => {
    if (mfa) {
      totpRef.current?.focus();
    }
  }, [mfa]);

  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  function validateCredentials(): boolean {
    const nextErrors: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) nextErrors.email = "Email wajib diisi.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      nextErrors.email = "Format email tidak valid.";

    if (!password) nextErrors.password = "Kata sandi wajib diisi.";
    else if (password.length < 8) nextErrors.password = "Kata sandi minimal 8 karakter.";

    if (passcodeRequired && !passcode.trim()) {
      nextErrors.passcode = "Kode akses admin wajib diisi.";
    }

    setFieldErrors(nextErrors);
    if (nextErrors.email) {
      emailRef.current?.focus();
      return false;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return false;
    }
    if (nextErrors.passcode) {
      passcodeRef.current?.focus();
      return false;
    }
    return true;
  }

  async function finalizeSession(accessToken: string, refreshToken: string) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw new Error("Gagal mengaktifkan sesi browser. Coba masuk kembali.");
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    toast.success("Autentikasi admin berhasil.");
    await navigate({ to: "/admin", replace: true });
  }

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError("");
    if (!validateCredentials()) return;

    setBusy(true);
    try {
      const res = await submitSignIn({
        data: {
          email: email.trim(),
          password,
          ...(passcodeRequired ? { passcode: passcode.trim() } : {}),
          ...(website ? { website } : {}),
        },
      });

      if (!res.ok) {
        setFormError(res.error);
        return;
      }

      if (res.mfaRequired) {
        setMfa({
          factorId: res.factorId,
          challengeId: res.challengeId,
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
        });
        setTotpCode("");
        return;
      }

      await finalizeSession(res.accessToken, res.refreshToken);
    } catch {
      setFormError("Tidak dapat memproses login saat ini. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mfa) return;
    setFormError("");
    const cleaned = totpCode.replace(/\s+/g, "");
    if (!/^[0-9]{6}$/.test(cleaned)) {
      setFieldErrors({ code: "Masukkan tepat 6 digit kode autentikator." });
      totpRef.current?.focus();
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await submitMfa({
        data: {
          accessToken: mfa.accessToken,
          refreshToken: mfa.refreshToken,
          factorId: mfa.factorId,
          challengeId: mfa.challengeId,
          code: cleaned,
        },
      });
      if (!res.ok) {
        setFormError(res.error);
        totpRef.current?.focus();
        return;
      }
      await finalizeSession(res.accessToken, res.refreshToken);
    } catch {
      setFormError("Verifikasi kode gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-surface px-4 py-10 text-foreground">
      <main className="mx-auto w-full max-w-md">
        <section
          aria-labelledby="admin-portal-heading"
          className="rounded-2xl border border-border bg-card p-6 shadow-lifted sm:p-8"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1
                id="admin-portal-heading"
                className="font-display text-xl font-bold tracking-tight text-foreground"
              >
                {mfa ? "Verifikasi Dua Langkah" : "Portal Administrasi"}
              </h1>
              <p className="text-xs text-muted-foreground">
                Akses terbatas untuk operator dan administrator berwenang.
              </p>
            </div>
          </div>

          {formError ? (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          {mfa ? (
            <form method="post" onSubmit={handleMfaSubmit} noValidate className="mt-6 space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Buka aplikasi autentikator Anda dan masukkan 6 digit kode verifikasi untuk melanjutkan
                ke panel admin.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="admin-totp">Kode Autentikator (6 digit)</Label>
                <div className="relative">
                  <KeyRound
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={totpRef}
                    id="admin-totp"
                    name="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    enterKeyHint="done"
                    required
                    value={totpCode}
                    onChange={(e) => {
                      setTotpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                      if (fieldErrors.code) setFieldErrors((prev) => ({ ...prev, code: undefined }));
                    }}
                    placeholder="000000"
                    className="min-h-12 pl-9 font-mono text-base tracking-[0.25em] tabular-nums"
                    aria-invalid={Boolean(fieldErrors.code)}
                    aria-describedby={fieldErrors.code ? "admin-totp-error" : undefined}
                  />
                </div>
                {fieldErrors.code ? (
                  <p id="admin-totp-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.code}
                  </p>
                ) : null}
              </div>

              <Button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl font-semibold">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {busy ? "Memverifikasi…" : "Verifikasi & Masuk"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full"
                disabled={busy}
                onClick={() => {
                  setMfa(null);
                  setTotpCode("");
                  setFormError("");
                  setFieldErrors({});
                }}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Kembali ke form kredensial
              </Button>
            </form>
          ) : (
            <form
              method="post"
              onSubmit={handleCredentialsSubmit}
              noValidate
              className="mt-6 space-y-4"
            >
              {/* Honeypot anti-bot: tersembunyi dari pengguna dan pembaca layar */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="admin-company-website">Website</label>
                <input
                  id="admin-company-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-email">Email Admin</Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={emailRef}
                    id="admin-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    enterKeyHint="next"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    placeholder="admin@ebrystore.my.id"
                    className="min-h-12 rounded-xl bg-background pl-9 text-base"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "admin-email-error" : undefined}
                  />
                </div>
                {fieldErrors.email ? (
                  <p id="admin-email-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-password">Kata Sandi</Label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={passwordRef}
                    id="admin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    enterKeyHint={passcodeRequired ? "next" : "done"}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }
                    }}
                    onKeyUp={trackCaps}
                    onKeyDown={trackCaps}
                    onBlur={() => setCapsLock(false)}
                    placeholder="Masukkan kata sandi"
                    className={cn("min-h-12 rounded-xl bg-background pl-9 pr-12 text-base")}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "admin-password-error" : undefined}
                  />
                  <button
                    type="button"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-describedby="admin-pw-toggle-hint"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                  <span id="admin-pw-toggle-hint" className="sr-only">
                    Peringatan: menampilkan kata sandi akan memperlihatkannya di layar.
                  </span>
                </div>
                {fieldErrors.password ? (
                  <p id="admin-password-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.password}
                  </p>
                ) : null}
                {capsLock ? (
                  <p
                    role="status"
                    className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground dark:text-warning"
                  >
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    Caps Lock aktif
                  </p>
                ) : null}
              </div>

              {passcodeRequired ? (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-passcode">Kode Akses Admin</Label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      ref={passcodeRef}
                      id="admin-passcode"
                      name="passcode"
                      type="password"
                      autoComplete="off"
                      enterKeyHint="done"
                      required
                      value={passcode}
                      onChange={(e) => {
                        setPasscode(e.target.value);
                        if (fieldErrors.passcode) {
                          setFieldErrors((prev) => ({ ...prev, passcode: undefined }));
                        }
                      }}
                      placeholder="Masukkan kode akses tambahan"
                      className="min-h-12 rounded-xl bg-background pl-9 text-base"
                      aria-invalid={Boolean(fieldErrors.passcode)}
                      aria-describedby={fieldErrors.passcode ? "admin-passcode-error" : undefined}
                    />
                  </div>
                  {fieldErrors.passcode ? (
                    <p id="admin-passcode-error" role="alert" className="text-xs text-destructive">
                      {fieldErrors.passcode}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={busy}
                className="min-h-12 w-full rounded-xl text-sm font-semibold"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {busy ? "Memverifikasi kredensial…" : "Masuk ke Panel Admin"}
              </Button>
            </form>
          )}
        </section>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          Sesi administrasi terpisah, diaudit, dan berakhir otomatis setelah 8 jam.
        </p>
      </main>
    </div>
  );
}

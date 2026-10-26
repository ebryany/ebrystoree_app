import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Lock, Mail, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Halaman masuk khusus dashboard Pertumbuhan.
 *
 * Terpisah dari `/auth` supaya pintu masuknya jelas: orang marketing masuk di
 * sini, pembeli/seller masuk di halaman utama. Sesi yang dipakai sama (Supabase
 * Auth), jadi tidak ada akun kedua yang perlu diingat.
 *
 * Keamanan tetap di server: halaman ini hanya memverifikasi identitas. Izin
 * `admin.dashboard.view` diperiksa lagi oleh guard rute dan server function,
 * sehingga orang yang berhasil masuk tapi tidak berizin tetap tidak bisa
 * melihat data.
 */

export const Route = createFileRoute("/see/masuk")({
  head: () => ({
    meta: [
      { title: "Masuk Dashboard Pertumbuhan — Ebrystore" },
      { name: "description", content: "Masuk ke dashboard marketing, konten, dan SEO Ebrystore." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HalamanMasukSee,
});

function HalamanMasukSee() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Sudah masuk: langsung ke dashboard, tidak perlu mengetik ulang.
  useEffect(() => {
    if (!loading && user) navigate({ to: "/see", replace: true });
  }, [loading, user, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError("Isi email dan kata sandi dengan benar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      toast.success("Berhasil masuk.");
      navigate({ to: "/see", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setError(
        message.includes("Invalid login credentials") ? "Email atau kata sandi salah." : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <TrendingUp className="size-5" aria-hidden="true" />
            </span>
            Ebrystore
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h1 className="text-xl font-bold text-foreground">Dashboard Pertumbuhan</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Masuk untuk melihat trafik, konten, dan SEO. Halaman ini terpisah dari akun pembeli.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="see-email">Email</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="see-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@ebrystore.my.id"
                  className="min-h-11 pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="see-password">Kata sandi</Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="see-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="min-h-11 pl-9"
                  required
                />
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" className="min-h-11 w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Memeriksa…" : "Masuk"}
            </Button>
          </form>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Bukan bagian tim pertumbuhan?{" "}
            <Link to="/auth" className="font-medium text-accent underline-offset-4 hover:underline">
              Masuk sebagai pembeli
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Akses dashboard dibatasi izin akun. Bila Anda merasa seharusnya punya akses, hubungi
          admin.
        </p>
      </main>
    </div>
  );
}

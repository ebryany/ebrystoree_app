import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Callback OAuth (Google) untuk Supabase Auth.
 *
 * Alur: Google -> Supabase /auth/v1/callback -> halaman ini dengan ?code=.
 * Halaman ini menukar code menjadi session (PKCE), lalu mengarahkan pengguna
 * ke tujuan semula.
 *
 * Keamanan:
 * - `next` hanya diterima bila berupa path internal ("/..." tapi bukan "//"),
 *   supaya tidak menjadi open redirect ke domain lain.
 * - Code ditukar oleh Supabase SDK; tidak ada token yang dibaca dari URL
 *   secara manual, jadi tidak ada token yang bisa disuntikkan lewat query.
 * - Tidak ada pembuatan profil manual di sini. Profile/role tetap dibuat oleh
 *   trigger database yang sama dengan login email/password, sehingga user
 *   Google tidak mendapat peran tambahan.
 */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { code?: string; next?: string; error?: string } => {
    const rawNext = typeof s["next"] === "string" ? s["next"] : "";
    // Hanya path internal. "//evil.com" dan "https://evil.com" ditolak.
    const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";
    return {
      ...(typeof s["code"] === "string" ? { code: s["code"] } : {}),
      ...(safeNext ? { next: safeNext } : {}),
      ...(typeof s["error"] === "string" ? { error: s["error"] } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Menyelesaikan masuk — Ebrystore" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const { code, next, error: oauthError } = Route.useSearch();
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // Provider menolak atau pengguna membatalkan consent.
      if (oauthError) {
        setFailed("Masuk dengan Google dibatalkan.");
        return;
      }
      if (!code) {
        setFailed("Kode otorisasi tidak ditemukan. Coba masuk lagi.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (error) {
        setFailed("Sesi Google tidak dapat diselesaikan. Coba masuk lagi.");
        return;
      }

      // Session sudah tersimpan oleh SDK. Arahkan ke tujuan semula, atau
      // dashboard sebagai default.
      navigate({ to: next || "/dashboard", replace: true });
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [code, next, oauthError, navigate]);

  return (
    <PageShell>
      <div className="bg-surface">
        <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-12">
          <section className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
            {failed ? (
              <>
                <h1 className="text-lg font-bold text-foreground">Gagal masuk</h1>
                <p className="mt-2 text-sm text-muted-foreground">{failed}</p>
                <Button asChild className="mt-5 min-h-11 w-full">
                  <a href="/auth">Kembali ke halaman masuk</a>
                </Button>
              </>
            ) : (
              <>
                <h1 className="text-lg font-bold text-foreground">Menyelesaikan masuk</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sebentar, kami menyiapkan sesi Anda.
                </p>
                <div
                  className="mx-auto mt-5 size-6 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span className="sr-only" role="status">
                  Memproses masuk dengan Google
                </span>
              </>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}

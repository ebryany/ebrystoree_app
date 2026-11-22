import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  HelpCircle,
  Home,
  Lock,
  RefreshCw,
  ShieldAlert,
  SearchX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, safeInternalPath } from "@/lib/utils";

export type SecurityErrorStatus = 401 | 403 | 404 | 429 | 500;

export type SecurityErrorViewProps = {
  status: SecurityErrorStatus;
  title?: string;
  description?: string;
  requestId?: string | null;
  timestamp?: string | null;
  returnTo?: string | null;
  onRetry?: (() => void) | null;
  variant?: "page" | "card";
  backTo?: "/" | "/dashboard";
  backLabel?: string;
};

const ERROR_COPY: Record<
  SecurityErrorStatus,
  { title: string; description: string; badge: string; icon: typeof ShieldAlert; tone: string }
> = {
  401: {
    title: "Sesi Diperlukan untuk Melanjutkan",
    description:
      "Silakan masuk terlebih dahulu ke akun Ebrystore Anda untuk mengakses halaman ini.",
    badge: "401 · Autentikasi Diperlukan",
    icon: Lock,
    tone: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  403: {
    title: "Akses ke Halaman Ini Dibatasi",
    description:
      "Akun Anda belum memiliki hak akses untuk membuka halaman atau resource ini.",
    badge: "403 · Akses Dibatasi",
    icon: ShieldAlert,
    tone: "bg-destructive/10 text-destructive border-destructive/25",
  },
  404: {
    title: "Halaman tidak ditemukan",
    description: "Tautan yang Anda buka mungkin keliru atau halaman sudah tidak tersedia.",
    badge: "404 · Tidak Ditemukan",
    icon: SearchX,
    tone: "bg-muted text-muted-foreground border-border",
  },
  429: {
    title: "Terlalu Banyak Permintaan",
    description:
      "Sistem membatasi permintaan sementara untuk menjaga kestabilan layanan. Silakan tunggu sejenak lalu coba lagi.",
    badge: "429 · Batas Permintaan",
    icon: Clock,
    tone: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  500: {
    title: "Halaman Belum Dapat Dimuat",
    description:
      "Terjadi kendala sementara saat memproses permintaan. Muat ulang halaman atau kembali ke beranda.",
    badge: "500 · Kendala Sementara",
    icon: AlertTriangle,
    tone: "bg-destructive/10 text-destructive border-destructive/25",
  },
};

export function SecurityErrorView({
  status,
  title,
  description,
  requestId,
  timestamp,
  returnTo,
  onRetry,
  variant = "page",
  backTo = "/",
  backLabel,
}: SecurityErrorViewProps) {
  const copy = ERROR_COPY[status];
  const Icon = copy.icon;
  const safeNext = safeInternalPath(returnTo);
  const [copied, setCopied] = useState(false);
  const [clientTime, setClientTime] = useState<string | null>(timestamp ?? null);

  useEffect(() => {
    if (timestamp) {
      setClientTime(timestamp);
      return;
    }
    setClientTime(
      new Date().toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }, [timestamp]);

  async function handleCopyRef() {
    if (!requestId || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* abaikan bila clipboard tidak tersedia */
    }
  }

  const content = (
    <section
      aria-labelledby="security-error-title"
      className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8"
    >
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">{status}</span>
        <span>·</span>
        <span>Ebrystore Security</span>
      </div>

      <div
        className={cn(
          "mx-auto mt-5 grid size-14 place-items-center rounded-2xl border",
          copy.tone,
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </div>

      <h1 id="security-error-title" className="mt-5 font-display text-xl font-bold sm:text-2xl">
        {title ?? copy.title}
      </h1>

      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        {description ?? copy.description}
      </p>

      {requestId || clientTime ? (
        <dl className="mt-5 grid gap-2 rounded-xl border border-border bg-surface/70 px-3.5 py-3 text-left text-xs sm:grid-cols-2">
          {requestId ? (
            <div className="min-w-0">
              <dt className="text-[11px] font-medium text-muted-foreground">Kode Referensi</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground">
                <span className="truncate">{requestId}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyRef()}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Salin kode referensi"
                >
                  {copied ? (
                    <Check className="size-3 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3" aria-hidden="true" />
                  )}
                </button>
              </dd>
            </div>
          ) : null}
          {clientTime ? (
            <div className="min-w-0">
              <dt className="text-[11px] font-medium text-muted-foreground">Waktu Kejadian</dt>
              <dd className="mt-0.5 truncate text-[11px] tabular-nums text-foreground">
                {clientTime}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        {status === 401 ? (
          <Button asChild className="min-h-11">
            <Link to="/auth" search={safeNext ? { next: safeNext } : undefined}>
              Masuk ke Akun
            </Link>
          </Button>
        ) : null}

        {onRetry ? (
          <Button variant={status === 401 ? "outline" : "default"} className="min-h-11" onClick={onRetry}>
            <RefreshCw className="mr-1.5 size-4" aria-hidden="true" />
            Coba Lagi
          </Button>
        ) : null}

        <Button
          asChild
          variant={status === 401 || onRetry ? "outline" : "default"}
          className="min-h-11"
        >
          <Link to={backTo}>
            <Home className="mr-1.5 size-4" aria-hidden="true" />
            {backLabel ?? (backTo === "/dashboard" ? "Kembali ke Akun Saya" : "Kembali ke Beranda")}
          </Link>
        </Button>

        <Button asChild variant="ghost" className="min-h-11">
          <Link to="/bantuan">
            <HelpCircle className="mr-1.5 size-4" aria-hidden="true" />
            Pusat Bantuan
          </Link>
        </Button>
      </div>
    </section>
  );

  if (variant === "card") {
    return <div className="px-4 py-12">{content}</div>;
  }

  return (
    <main
      lang="id"
      className="flex min-h-screen items-center justify-center bg-surface px-4 py-12 text-foreground"
    >
      {content}
    </main>
  );
}

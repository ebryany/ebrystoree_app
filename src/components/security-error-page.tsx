import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronRight,
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
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { cn, safeInternalPath } from "@/lib/utils";

function MissingMilkCartonIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 250"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Latar semak siluet di belakang kotak susu */}
      <path
        d="M 38 222 C 36 211 44 202 53 204 C 55 191 66 185 74 193 C 80 183 92 185 96 197 L 96 222 Z"
        fill="currentColor"
      />
      <path
        d="M 212 190 C 222 179 238 183 242 196 C 252 193 263 201 262 213 C 266 215 268 219 266 222 L 212 222 Z"
        fill="currentColor"
      />

      {/* Garis tanah & bayangan alas */}
      <path
        d="M 24 222 L 95 222 M 248 222 L 274 222 M 282 222 L 288 222 M 297 222 L 310 222"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M 164 221 L 252 219 C 261 219 266 221 264 224 C 260 227 246 228 224 228 L 164 226 Z"
        fill="currentColor"
      />

      {/* Tiga garis aksen kiri atas */}
      <path
        d="M 73 64 Q 80 73 86 81 M 64 95 L 78 96 M 62 120 Q 72 114 82 109"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Lipatan puncak atas */}
      <path
        d="M 122 28 Q 160 27 198 30 L 196 42 Q 158 41 120 41 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Atap miring depan */}
      <path
        d="M 120 41 L 196 42 L 168 79 Q 130 78 93 77 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Segitiga lipatan kanan + bayangan lipatan */}
      <path
        d="M 196 42 L 218 75 L 168 79 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 195 45 L 213 72 L 193 62 L 173 75 Z"
        fill="currentColor"
      />

      {/* Sabuk lipatan horizontal di bawah atap */}
      <path
        d="M 93 77 Q 130 78 168 79 L 168 87 Q 130 86 91 85 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 168 79 L 218 75 L 220 83 L 168 87 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Panel depan & samping kanan kotak susu */}
      <path
        d="M 91 85 Q 130 86 168 87 L 166 221 Q 128 222 92 221 Q 91 153 91 85 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 168 87 L 220 83 L 215 220 L 166 221 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tutup botol bundar 3D di atap depan */}
      <path
        d="M 128 60 C 128 70 154 74 157 60 L 156 56 L 129 56 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <ellipse
        cx="143"
        cy="56"
        rx="14.5"
        ry="13.5"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3.5"
      />

      {/* Bingkai wajah "missing" pada panel depan */}
      <path
        d="M 104 114 Q 129 113 153 113 Q 154 136 154 158 Q 129 159 104 158 Q 104 136 104 114 Z"
        className="fill-white dark:fill-slate-900"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 114 129 L 120 135 M 120 129 L 114 135 M 138 127 L 144 133 M 144 127 L 138 133"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M 112 149 Q 115.5 144 119 148 T 126 148 T 133 148 T 140 148 L 145 147"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dua garis teks di bawah bingkai wajah */}
      <path
        d="M 104 176 L 142 176 M 104 190 L 131 190"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Garis aksen vertikal di sisi kanan bawah */}
      <path
        d="M 203 151 Q 202 180 201 206"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  backTo?: "/" | "/dashboard" | "/produk" | "/layanan" | "/artikel";
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

  if (status === 404) {
    const resolvedLinkLabel =
      backLabel ?? (backTo === "/dashboard" ? "Kembali ke akun saya" : "Kembali ke beranda");
    const notFoundContent = (
      <section
        aria-labelledby="security-error-title"
        className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-10 md:flex-row md:gap-16"
      >
        <MissingMilkCartonIllustration className="h-auto w-56 shrink-0 text-[#111827] sm:w-64 md:w-72 dark:text-slate-100" />

        <div className="max-w-sm text-left">
          <h1 className="font-display text-6xl leading-none font-extrabold tracking-tight text-[#161e2e] sm:text-7xl dark:text-foreground">
            <span className="sr-only">Error </span>404
          </h1>

          <h2
            id="security-error-title"
            className="mt-3 font-display text-xl font-bold text-[#161e2e] sm:text-2xl dark:text-foreground"
          >
            {title ?? "Halaman tidak ditemukan."}
          </h2>

          <p className="mt-2.5 text-[15px] leading-relaxed text-[#525d68] dark:text-muted-foreground">
            {description ??
              "Halaman yang Anda cari tidak tersedia atau tautan yang Anda masukkan keliru."}
          </p>

          <div className="mt-5">
            <Link
              to={backTo}
              className="inline-flex min-h-11 items-center gap-0.5 rounded py-1.5 text-[15px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:text-[#60a5fa] dark:hover:text-[#93c5fd] dark:focus-visible:outline-[#60a5fa]"
            >
              {resolvedLinkLabel}
              <ChevronRight className="size-4 stroke-[2.5]" aria-hidden="true" />
            </Link>
          </div>

          {requestId ? (
            <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-[#64748b] dark:text-muted-foreground">
              <span>Kode Referensi: {requestId}</span>
              <button
                type="button"
                onClick={() => void handleCopyRef()}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded text-[#64748b] hover:text-[#161e2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:text-muted-foreground dark:hover:text-foreground"
                aria-label="Salin kode referensi"
              >
                {copied ? (
                  <Check className="size-3 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="size-3" aria-hidden="true" />
                )}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    );

    if (variant === "card") {
      return (
        <div className="bg-[#f6f7f8] px-6 py-16 text-[#161e2e] dark:bg-background dark:text-foreground">
          {notFoundContent}
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col bg-[#f6f7f8] text-[#161e2e] dark:bg-background dark:text-foreground">
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Lewati ke konten utama
        </a>
        <SiteHeader />
        <main id="konten-utama" lang="id" className="flex flex-1 items-center justify-center px-6 py-16">
          {notFoundContent}
        </main>
        <SiteFooter />
      </div>
    );
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
    <div className="flex min-h-screen flex-col bg-surface text-foreground">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Lewati ke konten utama
      </a>
      <SiteHeader />
      <main id="konten-utama" lang="id" className="flex flex-1 items-center justify-center px-4 py-12">
        {content}
      </main>
      <SiteFooter />
    </div>
  );
}

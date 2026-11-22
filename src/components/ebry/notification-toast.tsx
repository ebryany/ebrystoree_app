import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronRight, X } from "lucide-react";

import { notificationTone } from "@/components/ebry/notification-meta";
import { cn } from "@/lib/utils";

export type PushNotificationInput = {
  /** Id notifikasi; dipakai sebagai id toast supaya tidak tampil dobel. */
  id?: string;
  title: string;
  message?: string | null;
  type?: string | null;
  /** Tautan opsional saat kartu ditekan. */
  href?: string;
  /** Label aksi opsional di bagian bawah kartu toast. */
  actionLabel?: string;
};

function nowLabel() {
  return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Umumkan konten toast yang terlihat kepada screen reader (ariaNotify + fallback live region). */
function announceNotification(title: string, message?: string | null, hasAction?: boolean) {
  if (typeof document === "undefined") return;
  const textParts = [title, message].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  if (hasAction) textParts.push("Tindakan tersedia.");
  const text = textParts.join(". ");
  if (!text) return;

  const docAny = document as unknown as {
    ariaNotify?: (msg: string, opts?: { priority?: "normal" | "high" }) => void;
  };
  if (typeof docAny.ariaNotify === "function") {
    try {
      docAny.ariaNotify(text, { priority: "normal" });
      return;
    } catch {
      /* lanjut ke fallback live region DOM */
    }
  }

  const liveNode = document.getElementById("ebry-notif-live");
  if (liveNode) {
    liveNode.textContent = text;
  }
}

/** Sorot nominal rupiah di dalam pesan supaya mirip notifikasi mobile banking. */
function renderMessage(message: string) {
  const parts = message.split(/(Rp\s?[\d.,]+)/g);
  return parts.map((part, index) =>
    /^Rp\s?[\d.,]+$/.test(part) ? (
      <span key={index} className="font-semibold text-foreground tabular-nums">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function NotificationToastCard({
  id,
  title,
  message,
  type,
  href,
  actionLabel,
}: Omit<PushNotificationInput, "id"> & { id: string | number }) {
  const tone = notificationTone(type);
  const Icon = tone.icon;

  const body = (
    <div className="flex items-start gap-3 px-3.5 pb-3.5 pt-2">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", tone.wrap)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-snug text-foreground">{title}</p>
        {message ? (
          <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {renderMessage(message)}
          </p>
        ) : null}
        {href && actionLabel ? (
          <span className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent">
            {actionLabel}
            <ChevronRight className="size-3" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {href && !actionLabel ? (
        <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </div>
  );

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl",
        "border border-border/70 bg-background/95 shadow-[0_18px_40px_-16px_hsl(var(--foreground)/0.35)]",
        "backdrop-blur-xl supports-[backdrop-filter]:bg-background/80",
        "animate-in slide-in-from-top-3 fade-in duration-300 motion-reduce:animate-none",
      )}
    >
      {/* Header ala notifikasi aplikasi: identitas app, kategori, waktu */}
      <div className="flex items-center gap-2 px-3.5 pt-2.5 text-[11px] font-medium text-muted-foreground">
        <span className="grid size-4 place-items-center rounded-[5px] bg-primary text-[8px] font-bold text-primary-foreground">
          E
        </span>
        <span className="text-foreground/70">Ebrystore</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{tone.label}</span>
        <span className="ml-auto tabular-nums">{nowLabel()}</span>
        <button
          type="button"
          aria-label="Tutup notifikasi"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toast.dismiss(id);
          }}
          className="-mr-1 grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {href ? (
        <Link to={href as never} onClick={() => toast.dismiss(id)} className="block transition-colors hover:bg-muted/40">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/** Tampilkan notifikasi gaya push mobile banking (kartu melayang di atas layar). */
export function pushNotificationToast({ id: notificationId, ...input }: PushNotificationInput) {
  // Hindari menampilkan toast di latar belakang saat dialog modal terbuka agar tidak terlewat.
  if (
    typeof document !== "undefined" &&
    document.querySelector('[role="dialog"][data-state="open"], dialog[open]')
  ) {
    announceNotification(input.title, input.message, Boolean(input.href));
    return;
  }

  announceNotification(input.title, input.message, Boolean(input.href));
  toast.custom((id) => <NotificationToastCard id={id} {...input} />, {
    ...(notificationId ? { id: `notif:${notificationId}` } : {}),
    duration: 6500,
    className: "!bg-transparent !border-0 !p-0 !shadow-none",
  });
}

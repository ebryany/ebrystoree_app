import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { toast, useSonner, type Action, type ToastT } from "sonner";
import { X } from "lucide-react";

import { toastIcons } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

/**
 * Notifikasi menempel di bawah header dashboard, bukan melayang.
 *
 * Host hanya "mengambil alih" saat dirinya terlihat di layar. Begitu pengguna
 * scroll jauh ke bawah, Toaster melayang di __root aktif lagi supaya
 * notifikasi tidak muncul di luar pandangan.
 */
let visibleHosts = 0;
const listeners = new Set<() => void>();

function changeVisibleHosts(delta: number) {
  visibleHosts += delta;
  listeners.forEach((l) => l());
}

export function useInlineToastActive() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => visibleHosts > 0,
    () => false,
  );
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

function isAction(a: unknown): a is Action {
  return typeof a === "object" && a !== null && "label" in a && "onClick" in a;
}

function render(node: ToastT["title"]): ReactNode {
  return typeof node === "function" ? node() : node;
}

function InlineToast({ t }: { t: ToastT }) {
  useEffect(() => {
    if (t.type === "loading" || t.duration === Infinity) return;
    const timer = setTimeout(() => toast.dismiss(t.id), t.duration ?? DEFAULT_DURATION);
    return () => clearTimeout(timer);
  }, [t.id, t.type, t.duration]);

  if (t.jsx) return <div className="[&>*]:!w-full">{t.jsx}</div>;

  const icon = t.icon ?? (t.type && t.type !== "normal" && t.type !== "default" ? toastIcons[t.type as keyof typeof toastIcons] : null);

  const button = (a: ToastT["action"], primary: boolean) => {
    if (!a) return null;
    if (!isAction(a)) return a;
    return (
      <button
        type="button"
        onClick={(e) => {
          a.onClick(e);
          if (!e.defaultPrevented) toast.dismiss(t.id);
        }}
        className={cn(
          "inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          primary ? "bg-accent text-primary-foreground hover:bg-accent/90" : "bg-muted text-muted-foreground",
        )}
      >
        {a.label}
      </button>
    );
  };

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-3 animate-in fade-in slide-in-from-top-2 duration-300">
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-sm font-semibold leading-snug text-foreground">{render(t.title)}</p>
        {t.description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{render(t.description)}</p>
        ) : null}
        {t.action || t.cancel ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {button(t.action, true)}
            {button(t.cancel, false)}
          </div>
        ) : null}
      </div>
      {t.type !== "loading" && t.dismissible !== false ? (
        <button
          type="button"
          aria-label="Tutup notifikasi"
          onClick={() => toast.dismiss(t.id)}
          className="-m-1.5 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Pasang di bawah header halaman dashboard. */
export function InlineToasts() {
  const sentinel = useRef<HTMLDivElement>(null);
  const active = useInlineToastActive();
  const { toasts } = useSonner();
  const items = toasts.filter((t) => !t.toasterId && !t.delete).slice(0, MAX_VISIBLE);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let counted = false;
    // Margin atas memperhitungkan header situs yang sticky.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting !== counted) {
          counted = entry.isIntersecting;
          changeVisibleHosts(counted ? 1 : -1);
        }
      },
      { rootMargin: "-72px 0px 0px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (counted) changeVisibleHosts(-1);
    };
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div role="region" aria-label="Notifikasi" aria-live="polite">
        {active && items.length > 0 ? (
          <div className="mt-2 space-y-2">
            {items.map((t) => (
              <InlineToast key={t.id} t={t} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

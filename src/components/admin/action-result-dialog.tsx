import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionResultStatus = "loading" | "success" | "error" | "partial";

export type ActionResultAction = {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
};

export type ActionResult = {
  status: ActionResultStatus;
  title: string;
  description?: string;
  /** Rincian baris per item, mis. daftar perubahan yang diterapkan. */
  details?: ReactNode;
  /** Aksi lanjutan setelah sukses, mis. "Lihat audit". */
  actions?: ActionResultAction[];
  /** Aksi utama saat gagal, mis. "Coba lagi". */
  retry?: ActionResultAction;
};

const STATUS_META: Record<
  ActionResultStatus,
  { icon: typeof CheckCircle2; wrap: string; iconClass: string }
> = {
  loading: {
    icon: Loader2,
    wrap: "border-border bg-surface",
    iconClass: "text-accent animate-spin",
  },
  success: {
    icon: CheckCircle2,
    wrap: "border-success/40 bg-success/5",
    iconClass: "text-success",
  },
  error: {
    icon: XCircle,
    wrap: "border-destructive/40 bg-destructive/5",
    iconClass: "text-destructive",
  },
  partial: {
    icon: AlertTriangle,
    wrap: "border-warning/50 bg-warning/10",
    iconClass: "text-warning-foreground",
  },
};

/**
 * Dialog hasil aksi: satu tempat untuk status proses, berhasil, gagal, atau
 * sebagian berhasil. Dipakai untuk aksi berdampak; aksi ringan tetap memakai toast.
 *
 * Dialog tidak menutup otomatis pada sukses berdampak, supaya pengguna sempat
 * membaca ringkasan dan memilih aksi lanjutan. Saat gagal, konteks tetap terbuka
 * agar pengguna dapat mencoba lagi tanpa kehilangan perubahan yang ditinjau.
 */
export function ActionResultDialog({
  open,
  onOpenChange,
  result,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ActionResult | null;
  onClose?: () => void;
}) {
  const reduced = useReducedMotion();
  if (!result) return null;

  const meta = STATUS_META[result.status];
  const Icon = meta.icon;
  const busy = result.status === "loading";

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent
        surface="glass"
        className="max-w-md"
        // Dialog status bersifat informatif; tombol tutup tetap tersedia saat tidak sibuk.
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        aria-busy={busy}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={result.status}
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduced ? undefined : { scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex"
              >
                <Icon className={cn("size-5", meta.iconClass)} aria-hidden="true" />
              </motion.span>
            </AnimatePresence>
            {result.title}
          </DialogTitle>
          {result.description ? <DialogDescription>{result.description}</DialogDescription> : null}
        </DialogHeader>

        {result.details ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn("rounded-xl border px-3 py-2.5 text-sm", meta.wrap)}
          >
            {result.details}
          </motion.div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          {result.status === "error" && result.retry ? (
            <Button
              className="min-h-11"
              onClick={() => {
                result.retry?.onClick();
              }}
            >
              {result.retry.label}
            </Button>
          ) : null}
          {result.status !== "loading"
            ? (result.actions ?? []).map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant ?? "outline"}
                  className="min-h-11"
                  onClick={() => {
                    onOpenChange(false);
                    action.onClick();
                  }}
                >
                  {action.label}
                </Button>
              ))
            : null}
          <Button
            variant={result.status === "error" ? "outline" : "default"}
            className="min-h-11"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
              onClose?.();
            }}
          >
            {busy ? "Memproses…" : "Tutup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

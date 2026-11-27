import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { SocialMediaItem } from "@/lib/social-threads.shared";
import { optimizedMediaUrl } from "@/lib/utils";

/**
 * Native modal `<dialog>` image lightbox following modern-web-guidance `dialog` rules:
 * - Uses `showModal()` for native top-layer, inert background, Esc dismissal, and focus return.
 * - Uses `closedby="any"` with pointer bounding-rect fallback for browsers lacking `closedBy` (e.g., Safari).
 * - Relies on native modal semantics without redundant ARIA overrides.
 */
export function ThreadImageLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: SocialMediaItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && items.length > 1) {
        e.preventDefault();
        onIndexChange((index - 1 + items.length) % items.length);
      } else if (e.key === "ArrowRight" && items.length > 1) {
        e.preventDefault();
        onIndexChange((index + 1) % items.length);
      }
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("keydown", handleKey);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("keydown", handleKey);
      if (dialog.open) dialog.close();
    };
  }, [index, items.length, onClose, onIndexChange]);

  const current = items[index];
  if (!current) return null;

  const isOutsideContent = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Pratinjau foto utas"
      {...({ closedby: "any" } as Record<string, string>)}
      onPointerDown={(e) => {
        if (!("closedBy" in HTMLDialogElement.prototype)) {
          pressedOutsideRef.current = isOutsideContent(e);
        }
      }}
      onPointerUp={(e) => {
        if (
          !("closedBy" in HTMLDialogElement.prototype) &&
          pressedOutsideRef.current &&
          isOutsideContent(e)
        ) {
          dialogRef.current?.close();
        }
        pressedOutsideRef.current = false;
      }}
      className="m-auto max-h-[92dvh] max-w-[94vw] overflow-visible bg-transparent p-0 text-white backdrop:bg-black/85 backdrop:backdrop-blur-xs"
    >
      <div className="relative flex flex-col items-center">
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current?.close()}
          aria-label="Tutup pratinjau gambar"
          className="absolute -top-12 right-0 grid size-10 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="relative flex items-center justify-center">
          {items.length > 1 ? (
            <button
              type="button"
              onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
              aria-label="Foto sebelumnya"
              className="absolute left-2 z-10 grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          ) : null}

          <img
            src={optimizedMediaUrl(current.url, 1200)}
            alt={current.alt || "Foto utas"}
            className="max-h-[82dvh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />

          {items.length > 1 ? (
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % items.length)}
              aria-label="Foto berikutnya"
              className="absolute right-2 z-10 grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {items.length > 1 ? (
          <p className="mt-3 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums text-white">
            {index + 1} / {items.length}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}

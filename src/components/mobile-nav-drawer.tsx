import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

let supportsDisplayTransition: boolean | undefined;

/**
 * Deteksi nyata dukungan transisi diskrit `display` (Firefox 129+ mem-parse
 * `transition-behavior: allow-discrete` tetapi belum menganimasikan `display`).
 */
export function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

interface MobileNavDrawerProps {
  id: string;
  open: boolean;
  instantClose?: boolean;
  labelledBy: string;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus?: () => void;
  children: ReactNode;
}

/**
 * Drawer navigasi seluler berbasis native `<dialog>` top-layer.
 *
 * Menggantikan Radix Sheet agar klik tombol hamburger langsung responsif:
 * - Tidak memutasi `body { overflow: hidden }` (mencegah reflow penuh halaman).
 * - Tidak menjalankan DOM walk `aria-hidden` JS; browser menandai latar `inert` secara native.
 * - Transisi compositor-only (`transform` + `opacity`) dengan fallback `data-closing`
 *   untuk browser tanpa dukungan `overlay` + transisi `display`.
 */
export function MobileNavDrawer({
  id,
  open,
  instantClose = false,
  labelledBy,
  onOpenChange,
  onRestoreFocus,
  children,
}: MobileNavDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef(onRestoreFocus);
  restoreFocusRef.current = onRestoreFocus;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let cancelled = false;

    if (open) {
      dialog.removeAttribute("data-closing");
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (!dialog.open) return;

    if (instantClose || supportsTopLayerExit()) {
      dialog.removeAttribute("data-closing");
      dialog.close();
      return;
    }

    // Fallback exit untuk browser tanpa transisi top-layer (`overlay` + `display`).
    dialog.setAttribute("data-closing", "");
    const animations =
      typeof dialog.getAnimations === "function"
        ? dialog.getAnimations({ subtree: false })
        : [];
    const finish = () => {
      if (cancelled || !dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
      if (dialog.open) dialog.close();
    };

    if (animations.length === 0) {
      finish();
      return;
    }

    void Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      new Promise((resolve) => window.setTimeout(resolve, 260)),
    ]).then(finish);

    return () => {
      cancelled = true;
    };
  }, [open, instantClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleCancel(event: Event) {
      if (event.cancelable) {
        event.preventDefault();
        onOpenChange(false);
      }
    }

    function handleClose() {
      dialog?.removeAttribute("data-closing");
      onOpenChange(false);
      restoreFocusRef.current?.();
    }

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, [onOpenChange]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (outside) onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={labelledBy}
      onClick={handleBackdropClick}
      className="ebry-mobile-drawer lg:hidden"
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
        {children}
      </div>
    </dialog>
  );
}

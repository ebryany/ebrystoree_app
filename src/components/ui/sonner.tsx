import { CheckCircle2, CircleAlert, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";

import { cn } from "@/lib/utils";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Wrapper Toaster global — satu-satunya titik desain untuk SELURUH toast
 * status Ebrystore (success/error/warning/info/loading), sehingga puluhan
 * call site toast.success/error/info di seluruh aplikasi otomatis konsisten
 * tanpa diubah satu per satu.
 *
 * Keputusan desain (sesuai arah "subtle glass, premium restraint"):
 * - Permukaan frosted netral (bg-card/85 + backdrop-blur-md): terbaca di atas
 *   konten apa pun, dan mengikuti tema terang/gelap lewat token. Status
 *   dikenali dari IKON semantik, bukan latar hijau/merah penuh (richColors
 *   dihapus dari __root).
 * - Ikon tiap varian diberi latar lembut berwarna semantik — aksen, bukan
 *   promosi warna.
 * - Tombol aksi memakai aksen brand (bukan hitam pekat bawaan), cancel ghost.
 * - Lebar responsif penting(!): sonner memaksa 356px via stylesheet-nya; di
 *   viewport 320-375px itu meluber, jadi mobile mengikuti viewport - 32px.
 * - Backdrop blur hanya aktif bila browser mendukung (supports-), fallback
 *   permukaan solid dari token — toast tetap terbaca tanpa efek.
 */
const iconWrap = "grid size-8 shrink-0 place-items-center rounded-full";

export const toastIcons = {
  success: (
    <span className={cn(iconWrap, "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
      <CheckCircle2 className="size-4" />
    </span>
  ),
  error: (
    <span className={cn(iconWrap, "bg-destructive/10 text-destructive")}>
      <CircleAlert className="size-4" />
    </span>
  ),
  warning: (
    <span className={cn(iconWrap, "bg-amber-500/10 text-amber-600 dark:text-amber-400")}>
      <TriangleAlert className="size-4" />
    </span>
  ),
  info: (
    <span className={cn(iconWrap, "bg-primary/10 text-primary")}>
      <Info className="size-4" />
    </span>
  ),
  loading: (
    <span className={cn(iconWrap, "bg-primary/10 text-primary")}>
      <Loader2 className="size-4 animate-spin" />
    </span>
  ),
};

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={toastIcons}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!w-[calc(100vw-2rem)] sm:group-[.toaster]:!w-[356px] group-[.toaster]:bg-card/85 group-[.toaster]:supports-[backdrop-filter]:bg-card/70 group-[.toaster]:backdrop-blur-md group-[.toaster]:text-foreground group-[.toaster]:border-border/80 group-[.toaster]:shadow-card group-[.toaster]:rounded-xl group-[.toaster]:gap-2.5 group-[.toaster]:p-3.5",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold group-[.toast]:text-foreground",
          description:
            "group-[.toast]:text-xs group-[.toast]:leading-relaxed group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:inline-flex group-[.toast]:h-8 group-[.toast]:items-center group-[.toast]:gap-1 group-[.toast]:rounded-lg group-[.toast]:bg-accent group-[.toast]:px-3 group-[.toast]:text-xs group-[.toast]:font-semibold group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-accent/90 group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-ring",
          cancelButton:
            "group-[.toast]:h-8 group-[.toast]:rounded-lg group-[.toast]:bg-muted group-[.toast]:px-3 group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

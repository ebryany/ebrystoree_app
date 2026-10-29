import { Shelf } from "@/components/ebry/product-shelf";
import { clearRecentlyViewed, useRecentlyViewed } from "@/lib/recently-viewed";

/** Rak "Terakhir dilihat"; tersembunyi bila riwayat kosong. */
export function RecentlyViewedShelf({ title = "Terakhir dilihat" }: { title?: string }) {
  const items = useRecentlyViewed();
  if (!items.length) return null;
  return (
    <Shelf
      title={title}
      items={items}
      action={
        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="min-h-11 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Hapus riwayat
        </button>
      }
    />
  );
}

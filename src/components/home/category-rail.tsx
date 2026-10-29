import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { listCatalogCategories } from "@/lib/catalog.functions";

const categoriesQuery = queryOptions({
  queryKey: ["categories", "service", "home"],
  queryFn: () => listCatalogCategories({ data: { kind: "service" } }),
});

type CategoryItem = { id: string; name: string; slug: string };
type CategoryPayload = { items?: CategoryItem[]; error?: string | null };

/**
 * Rail kategori jasa untuk homepage.
 *
 * Mengapa ada: katalog jasa punya kategori nyata (tabel `categories`, kind
 * `service`) dan halaman /layanan sudah menerima filter ?kategori= — tetapi
 * homepage tidak pernah menampilkannya, padahal ini pintu eksplorasi paling
 * murah bagi pembeli. Setiap chip adalah tautan sungguhan ke hasil terfilter,
 * bukan dekorasi.
 *
 * Keputusan desain:
 * - Hanya kategori service yang ada di data (kategori produk kosong), jadi
 *   rail ini milik penawaran jasa dan diberi label jujur.
 * - Scroll horizontal native + snap (pola NativeTrack ShowcaseGallery): satu
 *   baris di semua ukuran layar, tanpa scroll-jack, tetap bisa dijelajahi
 *   keyboard lewat fokus.
 * - Data kosong atau gagal → section tidak dirender sama sekali; navigasi
 *   kategori tetap tersedia lewat halaman /layanan, jadi tidak ada kontrol
 *   mati maupun error block yang mengganggu hero.
 */
export function CategoryRail() {
  const { data } = useSuspenseQuery(categoriesQuery);
  // Normalisasi bentuk data: runtime mengembalikan { items, error }; mock test
  // historis untuk queryKey "categories" mengembalikan { product, service }.
  const payload = data as Partial<CategoryPayload> & {
    service?: Partial<CategoryPayload>;
  };
  const items = (payload.service ?? payload).items ?? [];
  if (!items.length) return null;

  return (
    <section aria-label="Kategori jasa" className="pb-1">
      <h2 className="text-sm font-semibold text-foreground">
        Jelajahi jasa berdasarkan kategori
      </h2>
      <div
        role="region"
        aria-label="Daftar kategori jasa"
        tabIndex={0}
        className="-mx-4 mt-2.5 overflow-x-auto px-4 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mx-6 sm:px-6 [scrollbar-width:thin]"
      >
        <ul className="flex w-max gap-2">
          {items.map((item) => (
            <li key={item.id} className="shrink-0">
              <Link
                to="/layanan"
                search={{ kategori: item.slug }}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/50 hover:bg-accent/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

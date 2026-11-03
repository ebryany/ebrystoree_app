import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const PULSE = "animate-pulse rounded bg-muted motion-reduce:animate-none";

/**
 * Kerangka halaman detail produk/jasa. Tampil langsung saat link diklik,
 * supaya halaman tidak terasa macet selama data dimuat.
 */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 sm:pt-6"
        role="status"
        aria-label={label}
      >
        <span className="sr-only">{label}…</span>
        <div className={`h-3 w-48 ${PULSE}`} />
        <section className="mt-3 overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="p-4">
            <div className={`aspect-square w-full rounded-lg ${PULSE}`} />
          </div>
          <div className="space-y-4 p-4">
            <div className={`h-6 w-3/4 ${PULSE}`} />
            <div className={`h-4 w-1/3 ${PULSE}`} />
            <div className={`h-20 w-full rounded-lg ${PULSE}`} />
            <div className={`h-4 w-full ${PULSE}`} />
            <div className={`h-4 w-5/6 ${PULSE}`} />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className={`h-11 rounded-lg ${PULSE}`} />
              <div className={`h-11 rounded-lg ${PULSE}`} />
            </div>
          </div>
        </section>
        <div className={`mt-4 h-24 w-full rounded-xl ${PULSE}`} />
      </main>
      <SiteFooter />
    </div>
  );
}

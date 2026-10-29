import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Search, ShieldCheck, Store } from "lucide-react";

import { WordAnimator } from "@/components/ui/word-animator";
import { listCatalogCategories } from "@/lib/catalog.functions";

const WORDS = ["produk digital", "jasa"];

const productCategoriesQuery = queryOptions({
  queryKey: ["categories", "product"],
  queryFn: () => listCatalogCategories({ data: { kind: "product" } }),
  staleTime: 5 * 60_000,
});

const TRUST = [
  { icon: ShieldCheck, label: "Pembayaran diverifikasi" },
  { icon: BadgeCheck, label: "Dana jasa ditahan sampai hasil diterima" },
  { icon: Store, label: "Toko ditinjau sebelum tayang" },
];

/**
 * Hero beranda gaya toko modern: judul, pencarian besar sebagai aksi utama,
 * pintasan kategori, lalu tiga jaminan yang memang berjalan di sistem.
 * Tepi kiri memakai padding yang sama dengan navbar dan section di bawahnya.
 */
export function HomeHero() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const categories = useQuery(productCategoriesQuery);
  const chips = (
    (categories.data as { items?: Array<{ id: string; name: string; slug: string }> } | undefined)
      ?.items ?? []
  ).slice(0, 5);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = q.trim().slice(0, 80);
    void navigate({ to: "/produk", search: term ? { q: term } : {} });
  }

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden border-b border-border bg-background px-4 sm:px-6 lg:px-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_80%_at_85%_40%,var(--surface-selected),transparent_70%)]"
      />
      <div className="grid w-full items-center gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:py-14">
        <div className="min-w-0">
          <h1
            id="hero-heading"
            className="font-display text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Belanja di Ebrystore
            <span className="mt-1 block">
              <WordAnimator
                words={WORDS}
                duration={3}
                className="max-w-full text-accent [&>span]:whitespace-normal"
              />
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Produk digital dan jasa dari toko terpilih. Harga jelas di depan, dan setiap pesanan
            bisa dipantau sampai tuntas.
          </p>

          <form
            role="search"
            onSubmit={submit}
            className="mt-6 flex max-w-2xl items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-card focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-ring/30"
          >
            <Search className="ml-2.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="hero-search" className="sr-only">
              Cari produk
            </label>
            <input
              id="hero-search"
              type="search"
              value={q}
              maxLength={80}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Cari template, akun premium, makalah…"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:text-base"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-6"
            >
              Cari
            </button>
          </form>

          {chips.length ? (
            <ul aria-label="Kategori produk" className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/produk"
                    search={{ kategori: c.slug }}
                    className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3.5 text-xs font-medium capitalize text-foreground transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  >
                    {c.name.toLowerCase()}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/layanan"
                  className="inline-flex min-h-9 items-center rounded-full border border-dashed border-accent/50 px-3.5 text-xs font-medium text-accent transition-colors hover:bg-accent/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                >
                  Cari jasa
                </Link>
              </li>
            </ul>
          ) : null}

          <ul className="mt-7 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5 sm:text-sm">
            {TRUST.map((t) => (
              <li key={t.label} className="flex items-center gap-1.5">
                <t.icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                {t.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden min-w-0 justify-center lg:flex">
          <img
            src="/images/ebrystore-hero-mascot.webp?v=bf406217"
            alt="Maskot Ebrystore membawa laptop"
            width={1254}
            height={1254}
            decoding="async"
            className="h-auto w-full max-w-sm object-contain xl:max-w-md"
          />
        </div>
      </div>
    </section>
  );
}

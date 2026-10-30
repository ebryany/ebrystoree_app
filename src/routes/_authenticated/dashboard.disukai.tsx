import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Heart, Store } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { InlineEmpty, PageHeader } from "@/components/ebry/cards";
import { MarketplaceProductCard } from "@/components/home/catalog-cards";
import { FollowStoreButton } from "@/components/store/social-buttons";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { listMyFollowsAndLikes } from "@/lib/social.functions";

export const Route = createFileRoute("/_authenticated/dashboard/disukai")({
  head: () => ({
    meta: [
      { title: "Disukai & Diikuti — Ebrystore" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DisukaiPage,
});

function DisukaiPage() {
  const fetchList = useServerFn(listMyFollowsAndLikes);
  const { data, isPending, error } = useQuery({
    queryKey: ["my-follows-likes"],
    queryFn: () => fetchList(),
  });

  return (
    <div className="-mt-5 space-y-6 md:mt-0">
      <PageHeader
        icon={Heart}
        title="Disukai & Diikuti"
        description="Produk yang kamu sukai dan toko yang kamu ikuti. Produk baru dari toko yang diikuti dikabarkan lewat notifikasi."
      />

      {isPending ? (
        <AdminLoading label="Memuat daftar…" />
      ) : error ? (
        <AdminError />
      ) : data.error ? (
        <AdminError message={data.error} />
      ) : (
        <>
          <section aria-labelledby="toko-diikuti">
            <h2 id="toko-diikuti" className="text-base font-bold">
              Toko diikuti <span className="tabular-nums text-muted-foreground">({data.stores.length})</span>
            </h2>
            {data.stores.length === 0 ? (
              <div className="mt-3 rounded-2xl bg-card">
                <InlineEmpty icon={Store} text="Belum ada toko yang kamu ikuti." actionLabel="Cari produk" to="/produk" />
              </div>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.stores.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-card p-3">
                    <Link
                      to="/toko/$slug"
                      params={{ slug: s.slug }}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="relative shrink-0">
                        <span className="grid size-11 place-items-center overflow-hidden rounded-full bg-surface-selected font-bold text-accent">
                          {s.logo_url ? (
                            <img src={s.logo_url} alt="" className="size-full object-cover" />
                          ) : (
                            <span aria-hidden="true">{s.name.charAt(0).toUpperCase()}</span>
                          )}
                        </span>
                        <OnlineDot presence={s.presence} className="bottom-0 right-0 size-3 sm:size-3" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-sm font-semibold">
                          <span className="truncate">{s.name}</span>
                          {s.is_platform ? (
                            <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Toko resmi" />
                          ) : null}
                        </span>
                        <PresenceLabel presence={s.presence} className="flex" />
                      </span>
                    </Link>
                    <FollowStoreButton storeId={s.id} className="shrink-0 px-3" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="produk-disukai">
            <h2 id="produk-disukai" className="text-base font-bold">
              Produk disukai <span className="tabular-nums text-muted-foreground">({data.products.length})</span>
            </h2>
            {data.products.length === 0 ? (
              <div className="mt-3 rounded-2xl bg-card">
                <InlineEmpty icon={Heart} text="Belum ada produk yang kamu sukai." actionLabel="Ke katalog" to="/produk" />
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
                {data.products.map((p) => (
                  <MarketplaceProductCard key={p.id} item={p} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

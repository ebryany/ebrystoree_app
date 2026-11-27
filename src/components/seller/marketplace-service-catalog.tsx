import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, FileText, Info, Plus, RefreshCw, Video } from "lucide-react";

import {
  SellerFilterTabs,
  SellerMobileSegment,
  SellerPageHeader,
} from "@/components/seller/seller-ui";
import { ServiceDraftWizard } from "@/components/seller/service-draft-wizard";

import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import {
  marketplaceServiceStatusLabels,
  serviceMediaUrl,
  type MarketplaceServiceDraft,
  type MarketplaceServiceListing,
} from "@/lib/marketplace-service";
import {
  actOnMyMarketplaceService,
  listMyMarketplaceServices,
  saveMyMarketplaceService,
} from "@/lib/marketplace-service.functions";
import { cn, optimizedMediaUrl } from "@/lib/utils";

const TABS = [
  { key: "all", label: "Semua", filter: null, hint: "Semua jasa di toko Anda." },
  {
    key: "in_review",
    label: "Moderasi",
    filter: "in_review" as const,
    hint: "Jasa yang sedang ditinjau moderator.",
  },
  {
    key: "approved",
    label: "Disetujui",
    filter: "approved" as const,
    hint: "Jasa yang sudah lulus moderasi.",
  },
  {
    key: "needs_work",
    label: "Perlu perbaikan",
    filter: "needs_work" as const,
    hint: "Draft dan yang ditolak, perlu diedit ulang.",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function filterItems(items: MarketplaceServiceListing[], tab: TabKey) {
  if (tab === "all") return items;
  if (tab === "in_review") return items.filter((i) => i.status === "in_review");
  if (tab === "approved") return items.filter((i) => i.status === "approved");
  // needs_work = draft + rejected
  return items.filter((i) => i.status === "draft" || i.status === "rejected");
}

function countByTab(items: MarketplaceServiceListing[]) {
  return {
    all: items.length,
    in_review: items.filter((i) => i.status === "in_review").length,
    approved: items.filter((i) => i.status === "approved").length,
    needs_work: items.filter((i) => i.status === "draft" || i.status === "rejected").length,
  };
}

export function MarketplaceServiceCatalog() {
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<TabKey>("all");
  const [editing, setEditing] = useState<MarketplaceServiceListing | null | undefined>();
  const [feedback, setFeedback] = useState("");
  const queryClient = useQueryClient();
  const fetchListings = useServerFn(listMyMarketplaceServices);
  const save = useServerFn(saveMyMarketplaceService);
  const act = useServerFn(actOnMyMarketplaceService);
  const queryKey = ["my-marketplace-services", page];
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchListings({ data: { page } }),
    placeholderData: keepPreviousData,
  });
  useRealtimeRefresh({
    channel: "my-marketplace-services",
    tables: ["marketplace_services"],
    keys: [["my-marketplace-services"]],
  });
  const mutation = useMutation({
    mutationFn: (
      input:
        | { draft: MarketplaceServiceDraft }
        | { listing: MarketplaceServiceListing; action: "submit" | "archive" },
    ) =>
      "draft" in input
        ? save({ data: input.draft })
        : act({
            data: {
              id: input.listing.id,
              expectedVersion: input.listing.version,
              action: input.action,
              reason: "",
            },
          }),
    onSuccess: async (result) => {
      setFeedback(result.ok ? "Perubahan jasa tersimpan." : result.error);
      if (!result.ok) return;
      setEditing(undefined);
      await queryClient.invalidateQueries({ queryKey: ["my-marketplace-services"] });
    },
    onError: () => setFeedback("Perubahan gagal disimpan. Draft tidak dihapus; coba lagi."),
  });

  const allItems = useMemo(() => data?.items ?? [], [data?.items]);
  const counts = useMemo(() => countByTab(allItems), [allItems]);
  const filtered = useMemo(() => filterItems(allItems, tab), [allItems, tab]);
  const pageSize = data?.pageSize ?? 20;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  function switchTab(next: TabKey) {
    setTab(next);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <SellerMobileSegment
        ariaLabel="Pilih katalog toko"
        items={[
          { to: "/seller/produk", label: "Produk Digital" },
          { to: "/seller/jasa", label: "Jasa Saya" },
        ]}
      />

      <SellerPageHeader
        title="Jasa Saya"
        description="Susun paket jasa toko Anda, ajukan moderasi, dan pantau status penayangannya."
        actions={
          <>
            {data?.categories.length && editing === undefined ? (
              <Button
                className="min-h-11"
                onClick={() => {
                  setFeedback("");
                  setEditing(null);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Tambahkan Jasa
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="min-h-11"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={isFetching ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
              Muat ulang
            </Button>
          </>
        }
      />

      <details className="group rounded-[var(--radius-panel)] border border-border bg-card text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Info className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="flex-1 font-medium">Aturan tayang &amp; edit jasa</span>
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <p className="border-t border-border px-4 py-3 leading-relaxed text-muted-foreground">
          Jasa yang disetujui dapat dipesan selama toko dan kategori aktif serta checkout diaktifkan
          admin. Mengedit jasa mengembalikannya ke draft; arsip menghapusnya dari katalog. Pesanan
          yang sudah dibuat tetap mengikuti kesepakatan tersimpan.
        </p>
      </details>

      <div className="border-b border-border pb-1">
        <SellerFilterTabs<TabKey>
          ariaLabel="Filter status jasa"
          value={tab}
          onChange={switchTab}
          items={TABS.map((entry) => ({
            key: entry.key,
            label: entry.label,
            count: data ? counts[entry.key] : 0,
            hint: entry.hint,
          }))}
        />
      </div>

      {feedback ? (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {feedback}
        </p>
      ) : null}

      {/* Form inline */}
      {editing !== undefined && data ? (
        <ServiceDraftWizard
          key={editing?.id ?? "new"}
          listing={editing}
          categories={data.categories}
          pending={mutation.isPending}
          onCancel={() => setEditing(undefined)}
          onSave={(draft) => mutation.mutate({ draft })}
        />
      ) : null}

      {/* Content area */}
      {isPending ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <ErrorState
          title="Katalog jasa gagal dimuat"
          description={error.message}
          onRetry={() => void refetch()}
        />
      ) : data && filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tab === "all" ? "Belum ada jasa" : "Tidak ada jasa di filter ini"}
          description={
            tab === "all"
              ? "Tambahkan jasa pertama Anda, lalu ajukan moderasi."
              : "Coba lihat tab lain atau buat draft baru."
          }
          action={
            tab === "all" && data.categories.length ? (
              <Button
                className="min-h-11"
                onClick={() => {
                  setFeedback("");
                  setEditing(null);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Tambahkan Jasa
              </Button>
            ) : undefined
          }
        />
      ) : data ? (
        <>
          <section
            aria-label="Daftar jasa"
            className={cn(
              "grid items-start gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-3",
              isPlaceholderData && "opacity-60",
            )}
          >
            {filtered.map((listing, index) => (
              <ServiceCard
                key={listing.id}
                listing={listing}
                index={index}
                mutationPending={mutation.isPending}
                onEdit={() => {
                  setFeedback("");
                  setEditing(listing);
                }}
                onSubmit={() => mutation.mutate({ listing, action: "submit" })}
                onArchive={() => mutation.mutate({ listing, action: "archive" })}
              />
            ))}
          </section>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {data.total} jasa · Halaman {page + 1} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page === 0 || mutation.isPending}
                onClick={() => setPage(page - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page + 1 >= totalPages || mutation.isPending}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </footer>
        </>
      ) : null}

      {!data?.categories.length && data ? (
        <p className="text-sm text-muted-foreground">
          Kategori jasa aktif belum tersedia. Draft membutuhkan kategori platform.
        </p>
      ) : null}
    </div>
  );
}

function ServiceCard({
  listing,
  index,
  mutationPending,
  onEdit,
  onSubmit,
  onArchive,
}: {
  listing: MarketplaceServiceListing;
  index: number;
  mutationPending: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
        index >= 4 && "cv-card",
      )}
    >
      {/* Kartu grid: media di atas, info, lalu aksi di bawah. */}
      <span className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-surface-selected">
        {listing.media[0]?.kind === "image" ? (
          <img
            src={optimizedMediaUrl(serviceMediaUrl(listing.media[0].path), 480)}
            alt={listing.media[0].alt}
            decoding="async"
            className="size-full object-cover"
            loading="lazy"
          />
        ) : listing.media[0] ? (
          <Video className="size-7 text-muted-foreground" aria-hidden="true" />
        ) : (
          <FileText className="size-7 text-accent" aria-hidden="true" />
        )}
        <span className="absolute left-2 top-2">
          <StatusPill
            value={listing.status}
            kind="raw"
            label={marketplaceServiceStatusLabels[listing.status]}
            className="bg-card px-2 py-0.5 text-[11px]"
          />
        </span>
      </span>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="line-clamp-2 break-words text-sm font-semibold leading-snug">
            {listing.name}
          </h2>
          <p className="text-base font-bold tabular-nums text-price">
            {formatRupiah(listing.price)}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {listing.agreement.durationDays} hari · {listing.agreement.revisionLimit} revisi
            {listing.media.length > 0 ? ` · ${listing.media.length} media` : ""}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {["draft", "rejected", "approved"].includes(listing.status) ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={mutationPending}
              onClick={onEdit}
            >
              Edit
            </Button>
          ) : null}
          {["draft", "rejected"].includes(listing.status) ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={mutationPending}
              onClick={onSubmit}
            >
              Ajukan moderasi
            </Button>
          ) : null}
          {listing.status !== "archived" ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={mutationPending}
              onClick={onArchive}
            >
              Arsipkan
            </Button>
          ) : null}
        </div>

      {/* Catatan moderator */}
      {listing.moderation_note ? (
        <div className="rounded-lg border-l-2 border-warning bg-warning/5 px-3 py-2">
          <p className="text-xs font-semibold text-warning-foreground">Catatan moderator</p>
          <p className="mt-0.5 break-words text-sm">{listing.moderation_note}</p>
        </div>
      ) : null}

      {/* Collapsible agreement */}
      <button
        onClick={() => setOpen(!open)}
        type="button"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 border-t border-border text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
        Lihat agreement draft
      </button>
      {open ? (
        <div className="overflow-hidden">
          <ServiceAgreement listing={listing} />
        </div>
      ) : null}
      </div>
    </article>
  );
}

export function ServiceAgreement({ listing }: { listing: MarketplaceServiceListing }) {
  return (
    <dl className="space-y-3 py-3 text-sm">
      {(
        [
          ["Scope pekerjaan", listing.agreement.scope],
          ["Di luar scope", listing.agreement.exclusions],
          ["Hasil yang diserahkan", listing.agreement.deliverable],
          ["Data dari buyer", listing.agreement.requirements],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium text-foreground">{label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

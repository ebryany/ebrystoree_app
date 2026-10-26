import { useId, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Search } from "lucide-react";

import { AdminError, AdminLoading, ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { formatDateTime } from "@/components/admin/tx-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMarketplaceOverview } from "@/lib/admin-seller.functions";
import { formatRupiah } from "@/lib/format";
import {
  filterSellerReport,
  type MarketplaceSellerRow,
  type SellerReportSort,
} from "@/lib/marketplace-report";

export const Route = createFileRoute("/_authenticated/admin/seller/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Marketplace | Admin Ebrystore" },
      {
        name: "description",
        content: "Ringkasan penjualan, performa seller, katalog, dan refund Ebrystore.",
      },
    ],
  }),
  component: AdminMarketplaceReport,
});

const focus =
  "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const count = (value: number) => value.toLocaleString("id-ID");

function ReportPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SellerLink({ seller }: { seller: MarketplaceSellerRow }) {
  return (
    <Link
      to="/admin/seller/$id"
      params={{ id: seller.store_id }}
      className={`inline-flex min-h-11 items-center break-words font-semibold text-primary underline-offset-4 hover:underline ${focus}`}
    >
      {seller.store_name}
    </Link>
  );
}

function SellerPerformance({ sellers }: { sellers: MarketplaceSellerRow[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SellerReportSort>("sales");
  const id = useId();
  const rows = filterSellerReport(sellers, search, sort);
  const rating = (value: number) =>
    value > 0 ? `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} / 5` : "Belum ada";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)]">
        <div className="min-w-0">
          <label htmlFor={`${id}-search`} className="mb-2 block text-sm font-medium">
            Cari nama toko
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              placeholder="Cari dalam daftar seller"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-controls={`${id}-results`}
              className="min-h-11 border-muted-foreground bg-background pl-9 shadow-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-sort`} className="mb-2 block text-sm font-medium">
            Urutkan berdasarkan
          </label>
          <select
            id={`${id}-sort`}
            value={sort}
            onChange={(event) => setSort(event.target.value as SellerReportSort)}
            className={`min-h-11 w-full border border-muted-foreground bg-background px-3 text-sm ${focus}`}
          >
            <option value="sales">Penjualan tertinggi</option>
            <option value="orders">Item dibayar terbanyak</option>
            <option value="products">Produk tayang terbanyak</option>
            <option value="name">Nama toko A–Z</option>
          </select>
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {count(rows.length)} dari {count(sellers.length)} seller dalam daftar. Pencarian dan urutan
        hanya berlaku pada daftar ini.
      </p>
      <div id={`${id}-results`}>
        {sellers.length === 0 ? (
          <div className="rounded-lg bg-muted p-5 text-sm">
            <p className="font-semibold">Belum ada seller dalam laporan</p>
            <p className="mt-2 text-muted-foreground">
              Toko non-platform akan muncul di sini setelah terdaftar, termasuk toko tanpa
              penjualan.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg bg-muted p-5 text-sm">
            <p className="font-semibold">Tidak ada toko yang cocok</p>
            <p className="mt-2 text-muted-foreground">Coba nama lain atau kosongkan pencarian.</p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => setSearch("")}>
              Hapus pencarian
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Performa seller, diurutkan sesuai pilihan</caption>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="w-[30%] px-2 py-3 text-left font-medium">
                      Toko
                    </th>
                    <th scope="col" className="w-[25%] px-2 py-3 text-right font-medium">
                      Penjualan ledger
                    </th>
                    <th scope="col" className="px-2 py-3 text-right font-medium">
                      Item dibayar
                    </th>
                    <th scope="col" className="px-2 py-3 text-right font-medium">
                      Produk tayang
                    </th>
                    <th scope="col" className="px-2 py-3 text-right font-medium">
                      Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((seller) => (
                    <tr
                      key={seller.store_id}
                      className="border-b border-border last:border-0 hover:bg-muted/50"
                    >
                      <th scope="row" className="break-words px-2 py-3 text-left">
                        <SellerLink seller={seller} />
                      </th>
                      <td className="break-words px-2 py-3 text-right font-semibold tabular-nums">
                        {formatRupiah(seller.sales_amount)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {count(seller.orders_paid)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {count(seller.products_published)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {rating(seller.rating_average)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 xl:hidden">
              {rows.map((seller) => (
                <li key={seller.store_id} className="min-w-0 rounded-lg border border-border p-4">
                  <SellerLink seller={seller} />
                  <dl className="mt-2 divide-y divide-border">
                    <SummaryRow
                      label="Penjualan ledger"
                      value={formatRupiah(seller.sales_amount)}
                    />
                    <SummaryRow label="Item dibayar" value={count(seller.orders_paid)} />
                    <SummaryRow label="Produk tayang" value={count(seller.products_published)} />
                    <SummaryRow label="Rating" value={rating(seller.rating_average)} />
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function AdminMarketplaceReport() {
  const canView = useCan("sellers.view");
  const canModerate = useCan("products.view");
  const fetchOverview = useServerFn(getMarketplaceOverview);
  const { data, isPending, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin-marketplace-overview"],
    queryFn: () => fetchOverview({}),
    enabled: canView,
  });
  const report = data && !("forbidden" in data) ? data : null;
  const overview = report?.overview;
  if (!canView) return <ForbiddenState permission="sellers.view" />;
  if (data && "forbidden" in data) return <ForbiddenState permission={data.permission} />;
  return (
    <div className="space-y-6">
      <header>
        <nav
          aria-label="Breadcrumb laporan"
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          <Link
            to="/admin"
            className={`inline-flex min-h-11 items-center hover:text-foreground ${focus}`}
          >
            Admin
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            to="/admin/seller"
            className={`inline-flex min-h-11 items-center hover:text-foreground ${focus}`}
          >
            Seller
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Laporan marketplace</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Laporan Marketplace
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pantau penjualan, kondisi toko, dan performa seller dalam satu laporan.
            </p>
          </div>
          <Button
            variant="outline"
            className="min-h-11 bg-card"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {isFetching ? "Memperbarui…" : "Perbarui laporan"}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <p>Seluruh periode. Tidak ada filter tanggal; transaksi uji belum dikecualikan.</p>
          {dataUpdatedAt > 0 && report && !report.error ? (
            <p>Diperbarui {formatDateTime(new Date(dataUpdatedAt).toISOString())}</p>
          ) : null}
        </div>
      </header>
      {isPending ? (
        <AdminLoading label="Memuat penjualan, kondisi toko, dan performa seller…" />
      ) : error || report?.error || !overview ? (
        <AdminError
          message={
            report?.error ??
            "Laporan tidak dapat dimuat. Gunakan Perbarui laporan untuk mencoba lagi."
          }
        />
      ) : (
        <>
          <section
            aria-labelledby="sales-report-heading"
            className="rounded-xl border border-border bg-card"
          >
            <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="min-w-0 rounded-t-xl bg-primary p-5 text-primary-foreground sm:p-6 xl:rounded-l-xl xl:rounded-tr-none">
                <h2 id="sales-report-heading" className="text-sm font-medium">
                  Nilai item dibayar (GMV)
                </h2>
                <p className="mt-3 break-words font-display text-3xl font-bold tabular-nums sm:text-4xl">
                  {formatRupiah(overview.gmv)}
                </p>
                <p className="mt-3 max-w-lg text-sm leading-relaxed">
                  Item bertoko pada pesanan berstatus dibayar atau selesai. Termasuk toko platform.
                </p>
                <p className="mt-6 text-xs leading-relaxed">
                  Penjualan ledger terakhir:{" "}
                  {overview.last_sale_at ? formatDateTime(overview.last_sale_at) : "belum tercatat"}
                  .
                </p>
              </div>
              <dl className="min-w-0 divide-y divide-border px-5 py-2 sm:px-6">
                <SummaryRow
                  label="Penjualan tercatat di ledger"
                  value={formatRupiah(overview.seller_sales_ledger)}
                />
                <SummaryRow
                  label="Debit refund di ledger"
                  value={formatRupiah(overview.seller_refund_ledger)}
                />
                <SummaryRow
                  label="Saldo ledger saat ini"
                  value={formatRupiah(overview.seller_balance_total)}
                />
              </dl>
            </div>
          </section>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <ReportPanel
              title="Kondisi toko"
              description="Toko non-platform, berdasarkan status saat ini."
            >
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">Total toko</dt>
                  <dd className="mt-2 text-3xl font-bold tabular-nums">
                    {count(overview.stores_total)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Toko aktif</dt>
                  <dd className="mt-2 text-3xl font-bold tabular-nums">
                    {count(overview.stores_active)}
                  </dd>
                </div>
              </dl>
              <dl className="mt-4 divide-y divide-border border-t border-border">
                <SummaryRow label="Menunggu verifikasi" value={count(overview.stores_pending)} />
                <SummaryRow label="Ditangguhkan" value={count(overview.stores_suspended)} />
              </dl>
              <Button asChild variant="outline" className="mt-3 min-h-11 w-full sm:w-auto">
                <Link to="/admin/seller">Kelola dan tinjau toko</Link>
              </Button>
            </ReportPanel>
            <ReportPanel
              title="Katalog & ulasan"
              description="Seluruh katalog, termasuk produk toko platform."
            >
              <dl className="divide-y divide-border">
                <SummaryRow label="Produk belum dihapus" value={count(overview.products_total)} />
                <SummaryRow label="Produk tayang" value={count(overview.products_published)} />
                <SummaryRow label="Menunggu moderasi" value={count(overview.products_pending)} />
                <SummaryRow label="Ulasan terlihat" value={count(overview.reviews_total)} />
              </dl>
              {canModerate ? (
                <Button asChild variant="outline" className="mt-3 min-h-11 w-full sm:w-auto">
                  <Link to="/admin/seller/produk">Buka moderasi produk</Link>
                </Button>
              ) : null}
            </ReportPanel>
          </div>
          <ReportPanel
            title="Performa seller"
            description="Maksimal 10 toko non-platform dengan kredit penjualan ledger tertinggi, termasuk toko tanpa penjualan."
          >
            {report.leaderboardError ? (
              <AdminError message={report.leaderboardError} />
            ) : (
              <SellerPerformance sellers={report.leaderboard} />
            )}
            <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Item dibayar menghitung baris item pada pesanan, bukan jumlah pesanan unik. Klik nama
              toko untuk membuka detail seller.
            </p>
          </ReportPanel>
          <ReportPanel
            title="Refund & pembacaan laporan"
            description="Ringkasan refund seluruh marketplace, bukan hanya seller dalam daftar di atas."
          >
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <SummaryRow label="Total pengajuan refund" value={count(overview.refunds_total)} />
              <SummaryRow
                label="Nilai refund selesai"
                value={formatRupiah(overview.refunds_completed_amount)}
              />
            </dl>
            <details className="mt-4 rounded-lg border border-border bg-background">
              <summary className={`min-h-11 cursor-pointer px-4 py-3 text-sm font-medium ${focus}`}>
                Definisi angka dan batas laporan
              </summary>
              <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  GMV mengikuti status pesanan saat ini. Penjualan ledger merupakan kredit dengan
                  sumber penjualan; saldo ledger adalah seluruh kredit dikurangi debit. Ketiganya
                  memiliki definisi berbeda dan tidak harus sama.
                </p>
                <p>
                  Refund selesai berasal dari tabel refund, sedangkan debit refund berasal dari
                  ledger. Laporan ini tidak menyatakan keduanya sudah direkonsiliasi.
                </p>
                <p>
                  Saldo ledger bukan estimasi dana siap dicairkan. Komisi dan dana siap dicairkan
                  belum tersedia pada laporan ini.
                </p>
                <p>
                  Jumlah toko tidak mencakup toko platform. Jumlah produk, ulasan, GMV, dan refund
                  mengikuti cakupan sumber masing-masing. Tidak ada perbandingan periode atau
                  persentase pertumbuhan.
                </p>
              </div>
            </details>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

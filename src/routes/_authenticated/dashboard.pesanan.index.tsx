import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";

import {
  ArrowRight,
  FileText,
  GraduationCap,
  Package,
  Receipt,
  ShoppingBag,
  Store,
} from "lucide-react";

import { AdminError, Pager } from "@/components/admin/admin-ui";
import { PageHeader, SegmentedFilter } from "@/components/ebry/cards";
import { StatusPill } from "@/components/ebry/status";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyOrders } from "@/lib/orders.functions";
import { formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, customerAction } from "@/lib/transaction-labels";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ filter: z.string().catch("all") });

export const Route = createFileRoute("/_authenticated/dashboard/pesanan/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Pesanan Saya — Ebrystore" },
      {
        name: "description",
        content: "Daftar pesanan produk digital dan bantuan tugas Anda di Ebrystore.",
      },
      { property: "og:title", content: "Pesanan Saya — Ebrystore" },
      { property: "og:description", content: "Lacak status setiap pesanan Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PesananSaya,
});

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "unpaid", label: "Belum dibayar" },
  { key: "active", label: "Aktif" },
  { key: "completed", label: "Selesai" },
  { key: "cancelled", label: "Batal/refund" },
] as const;

const EMPTY_COPY: Record<string, { title: string; description: string }> = {
  all: {
    title: "Belum ada pesanan",
    description: "Pesanan produk digital dan bantuan tugas Anda akan tampil di sini.",
  },
  unpaid: { title: "Tidak ada tagihan", description: "Semua pesanan Anda sudah terbayar. Mantap!" },
  active: {
    title: "Tidak ada pesanan aktif",
    description: "Saat ada pesanan yang sedang diproses, statusnya muncul di sini.",
  },
  completed: {
    title: "Belum ada pesanan selesai",
    description: "Riwayat pesanan yang tuntas akan tersimpan di sini.",
  },
  cancelled: {
    title: "Tidak ada pembatalan",
    description: "Pesanan batal atau refund akan tercatat di sini.",
  },
};

function OrderSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-52" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className="ml-auto h-6 w-28 rounded-full" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          </div>
          <Skeleton className="mt-4 h-9 w-full rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ filter }: { filter: string }) {
  const copy = EMPTY_COPY[filter] ?? EMPTY_COPY.all;
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent">
        <Receipt className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{copy.title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{copy.description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild size="sm" className="min-h-11">
          <Link to="/produk">Lihat produk digital</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <Link to="/layanan">Lihat layanan</Link>
        </Button>
      </div>
    </div>
  );
}

function PesananSaya() {
  const { filter } = Route.useSearch();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { user } = useSession();
  const fetchOrders = useServerFn(listMyOrders);

  const { data, isPending, error } = useQuery({
    queryKey: ["my-orders", filter, page],
    queryFn: () => fetchOrders({ data: { filter, page } }),
  });
  useRealtimeRefresh({
    channel: "my-orders",
    tables: ["orders"],
    filter: user ? `user_id=eq.${user.id}` : undefined,
    keys: [["my-orders"]],
    enabled: Boolean(user),
  });

  return (
    <div className="-mt-5 space-y-4 md:mt-0">
      <PageHeader
        icon={ShoppingBag}
        title="Pesanan saya"
        description={
          typeof data?.total === "number"
            ? `${data.total} pesanan pada filter ini`
            : "Semua pesanan beserta status dan tindakan berikutnya"
        }
      />

      <SegmentedFilter
        options={FILTERS.map((f) => ({ key: f.key, label: f.label }))}
        value={filter}
        onChange={(key) => {
          setPage(1);
          navigate({ to: "/dashboard/pesanan", search: { filter: key } });
        }}
      />

      {isPending ? (
        <OrderSkeleton />
      ) : error ? (
        <AdminError />
      ) : data.error ? (
        <AdminError message={data.error} />
      ) : data.items.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
          <ul className="overflow-hidden rounded-2xl bg-card">
            {data.items.map((o: any) => {
              const action = customerAction(o.status, o.payments?.[0]?.status ?? null);
              const TypeIcon =
                o.order_type === "service"
                  ? GraduationCap
                  : o.order_type === "marketplace_service"
                    ? Store
                    : Package;
              const items = (o.order_items ?? []) as any[];
              const needsPayment = o.status === "awaiting_payment";
              return (
                <li
                  key={o.id}
                  className={cn(
                    "relative border-b border-border last:border-b-0",
                    needsPayment && "bg-warning/[0.06]",
                  )}
                >
                  {needsPayment ? (
                    <span
                      className="absolute inset-y-3 left-0 w-1 rounded-full bg-warning"
                      aria-hidden="true"
                    />
                  ) : null}
                  <Link
                    to="/dashboard/pesanan/$id"
                    params={{ id: o.id }}
                    className="flex min-h-[76px] items-start gap-3 py-3.5 pl-4 pr-4 transition-colors hover:bg-surface-selected/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-surface-selected text-accent">
                      <TypeIcon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                          {o.order_number}
                        </p>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-price">
                          {formatRupiah(Number(o.total))}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ORDER_TYPE_LABEL[o.order_type] ?? o.order_type} ·{" "}
                        {new Date(o.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {items.slice(0, 2).map((i: any, idx: number) => (
                          <li
                            key={idx}
                            className="flex items-start gap-1.5 text-[13px] text-foreground/85"
                          >
                            <FileText
                              className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="line-clamp-1">
                              {i.name_snapshot}
                              {i.quantity > 1 ? ` ×${i.quantity}` : ""}
                            </span>
                          </li>
                        ))}
                        {items.length > 2 ? (
                          <li className="text-[11px] text-muted-foreground">
                            +{items.length - 2} item lainnya
                          </li>
                        ) : null}
                      </ul>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusPill value={o.status} />
                        {action ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                            <ArrowRight className="size-3" aria-hidden="true" />
                            {action}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={10} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

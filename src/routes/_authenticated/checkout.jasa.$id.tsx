import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { marketplaceServiceCheckoutSchema, serviceMediaUrl } from "@/lib/marketplace-service";
import {
  createMarketplaceServiceOrder,
  quoteMarketplaceServiceOrder,
} from "@/lib/marketplace-service.functions";
import { applyCreditToOrder } from "@/lib/orders.functions";
import { CreditUseOption } from "@/components/checkout/credit-use-option";

export const Route = createFileRoute("/_authenticated/checkout/jasa/$id")({
  head: () => ({
    meta: [{ title: "Checkout Jasa Seller | Ebrystore" }, { name: "robots", content: "noindex" }],
  }),
  component: CheckoutJasa,
});

function CheckoutJasa() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchQuote = useServerFn(quoteMarketplaceServiceOrder);
  const createOrder = useServerFn(createMarketplaceServiceOrder);
  const applyCredit = useServerFn(applyCreditToOrder);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [requirements, setRequirements] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [useCredit, setUseCredit] = useState(false);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["marketplace-service-quote", id],
    queryFn: () => fetchQuote({ data: { serviceId: id } }),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof marketplaceServiceCheckoutSchema.parse>[0]) =>
      createOrder({ data: marketplaceServiceCheckoutSchema.parse(input) }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      // Saldo diterapkan setelah order terbentuk. Bila gagal, pesanan tetap ada
      // dan saldo masih bisa dipakai dari halaman pesanan.
      if (useCredit) {
        const applied = await applyCredit({ data: { orderId: result.order_id } });
        if (!applied.ok) {
          setFeedback(
            `Pesanan dibuat, tetapi saldo belum terpakai: ${applied.error} Buka halaman pesanan untuk memakai saldo.`,
          );
        }
      }
      await navigate({ to: "/dashboard/pesanan/$id", params: { id: result.order_id } });
    },
    onError: () =>
      setFeedback(
        "Pesanan belum terpastikan. Coba lagi tanpa menutup formulir, atau periksa daftar pesanan.",
      ),
  });
  const quote = data?.quote;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || mutation.isPending || isFetching) return;

    // Analitik: pembeli mulai checkout jasa.
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("checkout_start", `/checkout/jasa/${id}`),
    );
    const input = marketplaceServiceCheckoutSchema.safeParse({
      serviceId: id,
      idempotencyKey,
      expectedVersion: quote.version,
      expectedTotal: quote.total,
      requirements,
      agreementAccepted: accepted,
    });
    if (!input.success) {
      setFeedback("Isi kebutuhan minimal 10 karakter dan setujui kesepakatan jasa.");
      return;
    }
    setFeedback("");
    mutation.mutate(input.data);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/layanan">Kembali ke jasa seller</Link>
        </Button>
        <h1 className="text-2xl font-bold">Checkout jasa seller</h1>
        {isPending ? <p role="status">Memuat kesepakatan dan biaya pesanan…</p> : null}
        {!isPending && (error || !quote) ? (
          <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-5">
            <p>
              {data?.error ??
                "Jasa tidak dapat dimuat. Periksa kembali status jasa atau koneksi Anda."}
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              Muat ulang
            </Button>
          </div>
        ) : null}
        {quote ? (
          <form
            onSubmit={submit}
            className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
          >
            <div className="min-w-0 space-y-6">
              <section className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div>
                  <h2 className="break-words text-xl font-semibold">{quote.name}</h2>
                  <Link
                    to="/toko/$slug"
                    params={{ slug: quote.store.slug }}
                    className="inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {quote.store.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{quote.category.name}</p>
                </div>
                {quote.media.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Gambaran hasil</h3>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {quote.media.map((entry) => (
                        <li
                          key={entry.path}
                          className="overflow-hidden rounded-lg border border-border bg-surface-selected"
                        >
                          {entry.kind === "image" ? (
                            <img
                              src={serviceMediaUrl(entry.path)}
                              alt={entry.alt}
                              loading="lazy"
                              decoding="async"
                              className="aspect-square size-full object-cover"
                            />
                          ) : (
                            <video
                              src={serviceMediaUrl(entry.path)}
                              controls
                              preload="metadata"
                              className="aspect-square size-full object-cover"
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <h3 className="font-semibold">Kesepakatan pekerjaan</h3>
                <dl className="space-y-4 text-sm">
                  {[
                    ["Lingkup pekerjaan", quote.agreement.scope],
                    ["Tidak termasuk", quote.agreement.exclusions],
                    ["Hasil yang diterima", quote.agreement.deliverable],
                    ["Kebutuhan dari pembeli", quote.agreement.requirements],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="font-medium">{label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="font-medium">Durasi dan revisi</dt>
                    <dd>
                      {quote.agreement.durationDays} hari pengerjaan,{" "}
                      {quote.agreement.revisionLimit} revisi.
                    </dd>
                  </div>
                </dl>
                <p className="text-sm text-muted-foreground">
                  Durasi dimulai setelah pembayaran lunas dan kebutuhan Anda disetujui seller. Dana
                  seller dilepas setelah Anda menerima hasil.
                </p>
              </section>
              <section className="space-y-3 rounded-xl border border-border bg-card p-5">
                <Label htmlFor="service-requirements">Kebutuhan pekerjaan Anda</Label>
                <Textarea
                  id="service-requirements"
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={6}
                  value={requirements}
                  disabled={mutation.isPending}
                  onChange={(event) => setRequirements(event.target.value)}
                  aria-describedby="requirements-help"
                />
                <p id="requirements-help" className="text-sm text-muted-foreground">
                  Isi sesuai kebutuhan yang diminta seller, 10 sampai 5000 karakter. Jangan kirim
                  kata sandi atau kredensial akun.
                </p>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    required
                    checked={accepted}
                    disabled={mutation.isPending}
                    onChange={(event) => setAccepted(event.target.checked)}
                    className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  />
                  <span>
                    Saya menyetujui lingkup pekerjaan, pengecualian, hasil, durasi, jumlah revisi,
                    dan total biaya di halaman ini.
                  </span>
                </label>
              </section>
            </div>
            <section className="min-w-0 space-y-4 self-start rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24">
              <h2 className="font-semibold">Ringkasan biaya</h2>
              <dl className="space-y-3 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt>Harga jasa</dt>
                  <dd>{formatRupiah(quote.price)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Biaya admin</dt>
                  <dd>{formatRupiah(quote.adminFee)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border pt-3 font-semibold">
                  <dt>Total</dt>
                  <dd>{formatRupiah(quote.total)}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                Pesanan dibuat terlebih dahulu. Pilih pembayaran pada halaman pesanan berikutnya.
              </p>

              <CreditUseOption
                estimatedTotal={quote.total}
                enabled={useCredit}
                onEnabledChange={setUseCredit}
              />

              {feedback ? (
                <p role="alert" className="text-sm">
                  {feedback}
                </p>
              ) : null}
              <Button
                type="submit"
                className="min-h-11 w-full"
                disabled={mutation.isPending || isFetching}
              >
                {mutation.isPending ? "Membuat pesanan…" : "Buat pesanan dan lanjut bayar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                disabled={mutation.isPending || isFetching}
                onClick={() => {
                  setAccepted(false);
                  setFeedback("");
                  void refetch();
                }}
              >
                Perbarui harga dan kesepakatan
              </Button>
              <Link
                to="/dashboard/pesanan"
                search={{ filter: "all" }}
                className="inline-flex min-h-11 items-center text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Periksa pesanan saya
              </Link>
            </section>
          </form>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { StarInput, StarRating } from "@/components/ebry/rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import {
  getMyReviewState,
  listProductReviews,
  submitGuestReview,
  submitProductReview,
} from "@/lib/reviews.functions";

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Event untuk membuka form ulasan dari tombol lain di halaman produk. */
export const OPEN_REVIEW_EVENT = "ebry:open-review";

function useOpenReviewEvent(onOpen: () => void) {
  useEffect(() => {
    window.addEventListener(OPEN_REVIEW_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_REVIEW_EVENT, onOpen);
  }, [onOpen]);
}

/** Ulasan tanpa akun untuk pelanggan yang membeli di luar web (mis. WhatsApp). */
function GuestReviewForm({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitGuestReview);
  const [open, setOpen] = useState(false);
  useOpenReviewEvent(useCallback(() => setOpen(true), []));
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      submit({ data: { productId, name, rating, body: body || undefined, website: website || undefined } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSent(true);
      setOpen(false);
      toast.success("Terima kasih, ulasan kamu sudah tampil.");
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
      queryClient.invalidateQueries({ queryKey: ["home-reviews"] });
    },
    onError: () => toast.error("Ulasan gagal dikirim. Coba lagi."),
  });

  if (sent) {
    return <p className="text-sm text-muted-foreground">Terima kasih, ulasan kamu sudah kami terima.</p>;
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Pernah membeli produk ini? Bagikan pengalamanmu.</p>
        <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
          Tulis ulasan
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 2) {
          toast.error("Isi nama kamu dulu.");
          return;
        }
        if (rating < 1) {
          toast.error("Pilih rating bintang terlebih dahulu.");
          return;
        }
        if (!mutation.isPending) mutation.mutate();
      }}
    >
      <StarInput value={rating} onChange={setRating} disabled={mutation.isPending} />
      <div>
        <label htmlFor="guest-review-name" className="text-sm font-medium">
          Nama
        </label>
        <Input
          id="guest-review-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          className="mt-1"
          placeholder="Nama yang tampil di ulasan"
        />
      </div>
      <div>
        <label htmlFor="guest-review-body" className="text-sm font-medium">
          Ulasan <span className="text-muted-foreground">(opsional)</span>
        </label>
        <Textarea
          id="guest-review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-1"
          placeholder="Ceritakan pengalamanmu memakai produk ini"
        />
      </div>
      {/* Honeypot anti-bot: tersembunyi dari pengguna dan pembaca layar. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        name="website"
      />
      <p className="text-xs text-muted-foreground">
        Ulasan tampil dengan label "Transaksi di luar web".
      </p>
      <div className="flex gap-2">
        <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
          {mutation.isPending ? "Mengirim…" : "Kirim ulasan"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}

export function ProductReviewPanel({ productId }: { productId: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const reviews = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: () => listProductReviews({ data: { productId } }),
  });

  const fetchState = useServerFn(getMyReviewState);
  const state = useQuery({
    queryKey: ["product-review-state", productId, user?.id ?? "anon"],
    queryFn: () => fetchState({ data: { productId } }),
    enabled: Boolean(user),
  });

  const submit = useServerFn(submitProductReview);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Form tertutup default; terbuka otomatis bila pengguna sudah punya ulasan.
  const [formOpen, setFormOpen] = useState(false);
  useOpenReviewEvent(useCallback(() => setFormOpen(true), []));

  useEffect(() => {
    const mine = state.data?.myReview;
    if (mine) {
      setRating(Number(mine.rating));
      setTitle(mine.title ?? "");
      setBody(mine.body ?? "");
      setFormOpen(true);
    }
  }, [state.data?.myReview]);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { productId, rating, title: title || undefined, body: body || undefined } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error("Ulasan gagal dikirim", { description: result.error ?? undefined });
        return;
      }
      toast.success("Terima kasih, ulasan kamu tersimpan.");
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-review-state", productId] });
      queryClient.invalidateQueries({ queryKey: ["home-reviews"] });
    },
    onError: () => toast.error("Ulasan gagal dikirim. Coba lagi."),
  });

  const items = reviews.data?.items ?? [];
  const average = reviews.data?.average ?? 0;
  const canReview = state.data?.canReview ?? false;
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: items.filter((r) => Math.round(Number(r.rating)) === star).length,
  }));
  const shown =
    starFilter === null ? items : items.filter((r) => Math.round(Number(r.rating)) === starFilter);

  return (
    <section
      className="scroll-mt-24 rounded-xl border border-border bg-card"
      aria-labelledby="ulasan-produk-judul"
      id="ulasan-produk"
    >
      <h2 id="ulasan-produk-judul" className="px-4 pt-4 text-base font-semibold sm:px-5 sm:pt-5">
        Ulasan pembeli
      </h2>

      {items.length ? (
        <div className="mx-4 mt-3 flex flex-col gap-4 rounded-lg bg-surface p-4 sm:mx-5 sm:flex-row sm:items-center">
          <div className="shrink-0 sm:w-36">
            <p className="text-3xl font-bold tabular-nums text-price">
              {average.toFixed(1)}
              <span className="text-base font-medium text-muted-foreground"> / 5</span>
            </p>
            <StarRating value={average} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">{items.length} ulasan</p>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5" aria-label="Sebaran bintang">
            {counts.map(({ star, count }) => (
              <li key={star} className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 tabular-nums">{star} ★</span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-aurora"
                    style={{ width: `${(count / items.length) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length ? (
        <div className="mx-4 mt-3 flex flex-wrap gap-2 sm:mx-5" role="group" aria-label="Filter ulasan">
          {[null, 5, 4, 3, 2, 1].map((star) => {
            const active = starFilter === star;
            const count = star === null ? items.length : counts.find((c) => c.star === star)!.count;
            return (
              <button
                key={star ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setStarFilter(star)}
                className={
                  "min-h-11 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground " +
                  (active
                    ? "border-primary bg-primary/5 font-medium text-primary"
                    : "border-border bg-card hover:border-primary/50")
                }
              >
                {star === null ? "Semua" : `${star} Bintang`} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Form hanya tampil bagi yang berhak, dan default tertutup supaya
          pembeli yang tidak memenuhi syarat tidak disodori form besar.
          Pengguna yang sudah punya ulasan langsung melihat formnya terbuka. */}
      <div className="mt-4 border-y border-border px-4 py-4 sm:px-5">
        {!user || !canReview ? (
          <GuestReviewForm productId={productId} />
        ) : (
          <>
            {!formOpen ? (
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                {state.data?.myReview ? "Perbarui ulasan kamu" : "Tulis ulasan"}
              </Button>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rating < 1) {
                    toast.error("Pilih rating bintang terlebih dahulu.");
                    return;
                  }
                  if (mutation.isPending) return;
                  mutation.mutate();
                }}
              >
                <StarInput value={rating} onChange={setRating} disabled={mutation.isPending} />
                <div>
                  <label htmlFor="review-title" className="text-sm font-medium">
                    Judul <span className="text-muted-foreground">(opsional)</span>
                  </label>
                  <Input
                    id="review-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    className="mt-1"
                    placeholder="Ringkas kesanmu"
                  />
                </div>
                <div>
                  <label htmlFor="review-body" className="text-sm font-medium">
                    Ulasan <span className="text-muted-foreground">(opsional)</span>
                  </label>
                  <Textarea
                    id="review-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="mt-1"
                    placeholder="Ceritakan pengalamanmu memakai produk ini"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending
                      ? "Mengirim…"
                      : state.data?.myReview
                        ? "Perbarui ulasan"
                        : "Kirim ulasan"}
                  </Button>
                  {state.data?.myReview ? null : (
                    <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                      Batal
                    </Button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {shown.length ? (
        <ul className="divide-y divide-border px-4 sm:px-5">
          {shown.map((review) => (
            <li key={review.id} className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold">{review.reviewer_name ?? "Pembeli Ebrystore"}</span>
                  {review.is_verified ? (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      <BadgeCheck className="size-3" aria-hidden="true" />
                      Pembeli terverifikasi
                    </span>
                  ) : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Transaksi di luar web
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dateFmt.format(new Date(review.created_at))}
                </span>
              </div>
              <StarRating value={Number(review.rating)} className="mt-1" />
              {review.title ? <p className="mt-2 text-sm font-medium">{review.title}</p> : null}
              {review.body ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{review.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-sm text-muted-foreground sm:px-5">
          {items.length ? "Tidak ada ulasan dengan bintang ini." : "Belum ada ulasan untuk produk ini."}
        </p>
      )}
    </section>
  );
}

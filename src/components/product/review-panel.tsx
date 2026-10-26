import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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
  submitProductReview,
} from "@/lib/reviews.functions";

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

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

  return (
    <section className="mt-4 border border-border bg-card" aria-labelledby="ulasan-produk">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface px-5 py-4">
        <h2 id="ulasan-produk" className="text-base font-semibold">
          Ulasan pembeli
        </h2>
        {items.length ? (
          <span className="flex items-center gap-2 text-sm">
            <StarRating value={average} />
            <span className="font-semibold">{average.toFixed(1)}</span>
            <span className="text-muted-foreground">({items.length})</span>
          </span>
        ) : null}
      </div>

      {/* Form hanya tampil bagi yang berhak, dan default tertutup supaya
          pembeli yang tidak memenuhi syarat tidak disodori form besar.
          Pengguna yang sudah punya ulasan langsung melihat formnya terbuka. */}
      <div className="border-b border-border p-5">
        {!user ? (
          <p className="text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Masuk
            </Link>{" "}
            untuk memberi ulasan setelah pembelianmu diverifikasi.
          </p>
        ) : !canReview ? (
          <p className="text-sm text-muted-foreground">
            Ulasan terbuka setelah pesanan produk ini lunas — supaya penilaian tetap jujur.
          </p>
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

      {items.length ? (
        <ul className="divide-y divide-border px-5">
          {items.map((review) => (
            <li key={review.id} className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{review.reviewer_name ?? "Pembeli Ebrystore"}</span>
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
        <p className="px-5 py-8 text-sm text-muted-foreground">Belum ada ulasan untuk produk ini.</p>
      )}
    </section>
  );
}

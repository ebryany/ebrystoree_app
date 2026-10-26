"use client";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Store } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Marquee } from "@/components/ui/marquee";
import { listRecentReviews, type PublicReview } from "@/lib/reviews.functions";
import { cn } from "@/lib/utils";

/**
 * Pita review pembeli terhadap toko tempat mereka membeli.
 *
 * Keputusan desain dan alasannya:
 * - Isinya review NYATA dari database (listRecentReviews), bukan contoh. Bila
 *   belum ada review, seluruh section tidak dirender, jadi tidak ada pita kosong.
 * - Nama pembeli ditampilkan apa adanya dari `reviewer_name`; yang kosong
 *   ditulis "Pembeli" tanpa mengarang nama.
 * - Pita menyatu dengan latar halaman (tanpa kotak berbingkai), tepi kanan-kiri
 *   memudar lewat mask supaya terlihat berlanjut, bukan terpotong.
 * - Dua baris berlawanan arah hanya dipakai bila review cukup banyak; kalau
 *   sedikit, cukup satu baris agar tidak terlihat mengulang.
 * - Saat pengguna memilih gerak minimal, baris berhenti berjalan dan tetap bisa
 *   dibaca (lihat `motion-reduce:animate-none` di Marquee).
 */

/**
 * Ambang minimum ulasan sebelum section ditampilkan.
 *
 * Dengan satu atau dua ulasan, pita berjalan hanya mengulang kartu yang sama dan
 * justru melemahkan kepercayaan. Tiga adalah batas paling rendah yang masih
 * terlihat seperti kumpulan pendapat, bukan satu suara yang digandakan.
 */
const MIN_REVIEWS_FOR_SECTION = 3;

function ReviewCard({ review }: { review: PublicReview }) {
  const store = review.store;
  const name = review.reviewer_name?.trim() || "Pembeli";
  const initial = name[0]?.toUpperCase() ?? "?";
  const body = review.body?.trim() || review.title?.trim() || "Memberi penilaian tanpa catatan.";

  const inner = (
    <figure className="flex h-full w-[17rem] flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-selected text-xs font-bold text-accent"
          >
            {initial}
          </span>
          <div className="flex min-w-0 flex-col">
            <figcaption className="truncate text-sm font-semibold text-foreground">
              {name}
            </figcaption>
            <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Store className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{store?.name ?? "Toko Ebrystore"}</span>
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                "size-3",
                star <= review.rating ? "fill-aurora text-aurora" : "text-muted-foreground/30",
              )}
            />
          ))}
        </span>
      </div>

      <span className="sr-only">Penilaian {review.rating} dari 5</span>

      <blockquote className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {body}
      </blockquote>
    </figure>
  );

  if (!store) return <div className="shrink-0">{inner}</div>;

  return (
    <Link
      to="/toko/$slug"
      params={{ slug: store.slug }}
      className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {inner}
    </Link>
  );
}

export function ReviewMarqueeSection() {
  const fetchReviews = useServerFn(listRecentReviews);
  const { data } = useQuery({
    queryKey: ["home-review-marquee"],
    queryFn: () => fetchReviews({}),
    staleTime: 5 * 60_000,
  });

  const reviews = (data?.items ?? []).filter((item) => item.store);
  // Ambang minimum: satu atau dua ulasan yang digandakan berjalan akan terlihat
  // seperti mengarang bukti. Lebih baik section tidak tampil sampai datanya layak.
  if (reviews.length < MIN_REVIEWS_FOR_SECTION) return null;

  // Dua baris hanya kalau isinya cukup; kalau sedikit, satu baris lebih jujur
  // daripada mengulang kartu yang sama sampai terlihat seperti banyak pembeli.
  const useTwoRows = reviews.length >= 4;
  const half = Math.ceil(reviews.length / 2);
  const firstRow = useTwoRows ? reviews.slice(0, half) : reviews;
  const secondRow = useTwoRows ? reviews.slice(half) : [];

  return (
    <section aria-labelledby="review-pembeli-heading" className="pt-8 sm:pt-10">
      <div className="mb-4">
        <h2 id="review-pembeli-heading" className="text-xl font-bold sm:text-2xl">
          Kata pembeli
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data?.total && data.total > reviews.length
            ? `${reviews.length} dari ${data.total} ulasan terbaru.`
            : "Ulasan pembeli terhadap toko tempat mereka membeli."}
        </p>
      </div>

      <div className="relative flex flex-col gap-3 [mask-image:linear-gradient(90deg,transparent,black_5%,black_95%,transparent)]">
        <Marquee pauseOnHover repeat={1} durationSeconds={28} gap="1rem">
          {firstRow.map((review) => (
            <ReviewCard key={`a-${review.id}`} review={review} />
          ))}
        </Marquee>
        {useTwoRows ? (
          <Marquee reverse pauseOnHover repeat={1} durationSeconds={28} gap="1rem">
            {secondRow.map((review) => (
              <ReviewCard key={`b-${review.id}`} review={review} />
            ))}
          </Marquee>
        ) : null}
      </div>
    </section>
  );
}

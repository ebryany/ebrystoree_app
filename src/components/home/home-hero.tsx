import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, MessagesSquare, ShieldCheck, Store, Wallet } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";

import { Button } from "@/components/ui/button";

/**
 * Jalur masuk seller.
 *
 * Bukan satu kotak dengan satu tombol, tapi panel yang menyebutkan apa saja
 * yang didapat seller setelah membuka toko. Isinya berasal dari fitur yang
 * benar-benar ada di dashboard seller (pesanan, produk, chat, keuangan),
 * jadi tidak ada janji kosong.
 *
 * Dana ditahan sampai pembeli menerima hasil; setiap jasa ditinjau admin
 * sebelum tayang. Dua hal ini mekanisme nyata, bukan klaim pemasaran.
 */

const PERKS = [
  {
    icon: Store,
    title: "Toko sendiri",
    body: "Halaman toko dengan daftar produk dan jasa yang bisa dibuka pembeli.",
  },
  {
    icon: MessagesSquare,
    title: "Chat sebelum pesan",
    body: "Pembeli bisa bertanya dulu, jadi kesepakatan jelas sejak awal.",
  },
  {
    icon: BarChart3,
    title: "Pesanan terpantau",
    body: "Setiap pesanan punya status dan riwayat yang bisa kamu lihat kapan saja.",
  },
  {
    icon: Wallet,
    title: "Pendapatan tercatat",
    body: "Pendapatan masuk ke saldo toko setelah pembeli menerima hasil, bukan saat pembayaran masuk.",
  },
];

export function SellerJoinSection({
  stores = [],
}: {
  /** Toko nyata dari katalog jasa yang sudah dimuat homepage (bukan data karangan). */
  stores?: Array<{ name: string; slug: string }>;
}) {
  const reduced = useReducedMotion();
  // Reveal sekali saat section masuk viewport: urutan ikut urutan baca.
  // Gerak hanya transform + opacity, dan dilepas penuh saat reduced motion.
  const reveal: Variants = {
    hidden: reduced ? {} : { opacity: 0, y: 14 },
    show: reduced
      ? {}
      : { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
  };
  const stagger: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.07 } },
  };

  return (
    <motion.section
      aria-labelledby="seller-join-heading"
      className="relative mt-10 overflow-hidden rounded-2xl border border-border bg-card sm:mt-12"
      initial={reduced ? false : "hidden"}
      whileInView={reduced ? undefined : "show"}
      viewport={{ once: true, margin: "-60px" }}
    >
      <motion.div
        className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
        variants={stagger}
      >
        {/* Kiri: ajakan + tombol. Transparan agar grid tetap terlihat. */}
        <div className="flex min-w-0 flex-col justify-center p-5 sm:p-7 lg:p-8">
          <motion.span
            variants={reveal}
            className="grid size-10 place-items-center rounded-xl border border-border bg-card text-accent"
          >
            <Store className="size-5" aria-hidden="true" />
          </motion.span>
          <motion.h2
            id="seller-join-heading"
            variants={reveal}
            className="mt-4 max-w-[22ch] text-2xl font-bold leading-tight tracking-tight sm:text-3xl"
          >
            Punya produk digital atau jasa untuk <span className="text-accent">dijual?</span>
          </motion.h2>
          <motion.p
            variants={reveal}
            className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground"
          >
            Buka toko, susun kesepakatan kerja, dan terima pendapatan yang tercatat di saldo toko
            setelah pembeli menerima hasil.
          </motion.p>
          <motion.div variants={reveal} className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild className="min-h-11 rounded-control">
              <Link to="/auth">
                Mulai jualan
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="min-h-11">
              <Link to="/bantuan">Cara kerja jualan</Link>
            </Button>
          </motion.div>
          <motion.p
            variants={reveal}
            className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <ShieldCheck className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
            Setiap jasa ditinjau admin sebelum tayang
          </motion.p>
        </div>

        {/* Kanan: manfaat bernomor. HP 1 kolom; sm+ grid 2x2 agar teks tidak
            memanjang di layar lebar. Garis pemisah = gap-px di atas latar border. */}
        <motion.div
          className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:border-l lg:border-t-0"
          variants={stagger}
        >
          {PERKS.map((perk, i) => (
            <motion.div
              key={perk.title}
              variants={reveal}
              className="group flex items-start gap-3 bg-card p-4 transition-colors duration-200 hover:bg-surface motion-reduce:transition-none sm:p-6"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <perk.icon
                    className="size-4 shrink-0 text-accent transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    aria-hidden="true"
                  />
                  {perk.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{perk.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Bukti nyata: toko yang benar-benar punya jasa tayang. Hanya dirender
          bila datanya ada, dan tidak mengklaim jumlah apa pun. */}
      {stores.length > 0 ? (
        <motion.div
          variants={reveal}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-5 py-4 sm:px-7"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Toko yang sudah berjualan
          </p>
          <ul className="flex min-w-0 flex-wrap gap-2">
            {stores.map((store) => (
              <li key={store.slug}>
                <Link
                  to="/toko/$slug"
                  params={{ slug: store.slug }}
                  className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:border-accent/50 hover:bg-accent/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {store.name}
                </Link>
              </li>
            ))}
          </ul>
        </motion.div>
      ) : null}
    </motion.section>
  );
}

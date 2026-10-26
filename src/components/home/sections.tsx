import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Download,
  FileCheck,
  FileCheck2,
  Layers,
  Network,
  Package,
  Radio,
  Receipt,
  ShieldCheck,
  User,
} from "lucide-react";

import founderAsset from "@/assets/founder-febryanus-tambing.png.asset.json";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const paths = [
  {
    icon: Download,
    title: "Jalur produk digital",
    steps: [
      "Pilih produk lalu checkout langsung tanpa keranjang.",
      "Bayar dan unggah bukti transfer pada halaman pembayaran pesanan.",
      "Setelah pembayaran diverifikasi, akses unduhan terbit otomatis.",
      "Kuota unduhan default 5 kali dan aktif 365 hari sejak akses terbit.",
    ],
    to: "/produk" as const,
    cta: "Lihat produk digital",
  },
  {
    icon: ClipboardList,
    title: "Jalur bantuan tugas",
    steps: [
      "Pilih paket dan add-on, lalu isi kebutuhan tugas saat checkout.",
      "Setelah pembayaran diverifikasi, pesanan masuk antrean penugasan operator.",
      "Pendamping akademik mengerjakan dan mengirim progres beserta hasil.",
      "Ajukan revisi sesuai jatah paket sebelum pesanan ditutup.",
    ],
    to: "/layanan" as const,
    cta: "Lihat bantuan tugas",
  },
];

export function TwoPathSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <h2 className="text-xl font-bold sm:text-2xl">Dua cara memesan, alur yang berbeda</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Produk digital selesai lewat unduhan, bantuan tugas selesai lewat pendampingan akademik.
        Berikut bedanya.
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {paths.map((path) => (
          <article key={path.title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <path.icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{path.title}</h3>
            <ol className="mt-4 space-y-3">
              {path.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[11px] text-secondary-foreground">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link to={path.to}>
                {path.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

const trackingStates = [
  {
    label: "Menunggu pembayaran",
    note: "Pesanan dibuat, batas pembayaran 24 jam.",
    icon: Clock,
    badge: "Dimulai",
    tone: "muted" as const,
  },
  {
    label: "Pembayaran diverifikasi",
    note: "Bukti transfer diperiksa tim keuangan.",
    icon: CreditCard,
    badge: "Diverifikasi",
    tone: "success" as const,
  },
  {
    label: "Diproses",
    note: "Produk digital terbit, atau layanan ditugaskan ke operator.",
    icon: Package,
    badge: "Dikerjakan",
    tone: "warning" as const,
  },
  {
    label: "Menunggu review kamu",
    note: "Hasil pengerjaan dikirim untuk kamu periksa.",
    icon: FileCheck,
    badge: "Review",
    tone: "info" as const,
  },
  {
    label: "Selesai",
    note: "Pesanan ditutup dan tersimpan di riwayat akun.",
    icon: CheckCircle2,
    badge: "Selesai",
    tone: "success" as const,
  },
];

const toneClasses: Record<
  string,
  { icon: string; badge: string; badgeText: string; card: string; title: string; note: string }
> = {
  muted: {
    icon: "bg-muted text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
    badgeText: "text-muted-foreground",
    card: "bg-card border-border",
    title: "text-foreground",
    note: "text-muted-foreground",
  },
  success: {
    icon: "bg-success text-success-foreground",
    badge: "bg-success/15 text-success",
    badgeText: "text-success",
    card: "bg-success/5 border-success/30",
    title: "text-foreground",
    note: "text-success/90",
  },
  warning: {
    icon: "bg-warning text-warning-foreground",
    badge: "bg-warning/15 text-warning",
    badgeText: "text-warning",
    card: "bg-warning/5 border-warning/30",
    title: "text-foreground",
    note: "text-warning/90",
  },
  info: {
    icon: "bg-info text-info-foreground",
    badge: "bg-info/15 text-info",
    badgeText: "text-info",
    card: "bg-info/5 border-info/30",
    title: "text-foreground",
    note: "text-info/90",
  },
};

export function TrackingPreviewSection() {
  const [activeIndex, setActiveIndex] = useState(2);

  return (
    <section className="bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary shadow-card">
            <Radio className="size-3.5 text-success motion-safe:animate-pulse" aria-hidden="true" />
            Pantau status real-time
          </span>
          <h2 className="mt-4 text-xl font-bold sm:text-2xl md:text-3xl">
            Pantau pesanan tanpa menebak-nebak
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Setiap perubahan status tercatat pada riwayat pesanan. Status diperbarui saat prosesnya
            berubah, jadi kamu tidak perlu menanyakan kabar pesanan satu per satu.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Receipt className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Nomor pesanan, invoice, dan rincian biaya tersimpan di akun.
            </li>
            <li className="flex gap-2">
              <FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Hasil pengerjaan dan catatan revisi tercatat per versi.
            </li>
          </ul>
          <Button asChild className="mt-6">
            <Link to="/dashboard">
              Buka pesanan saya
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div
          className="relative rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
          role="region"
          aria-label="Demo status pesanan"
        >
          <ol className="relative space-y-4">
            {trackingStates.map((state, i) => {
              const isActive = i === activeIndex;
              const isPast = i < activeIndex;
              const tone = isActive || isPast ? state.tone : "muted";
              const styles = toneClasses[tone];
              const isLast = i === trackingStates.length - 1;

              return (
                <li key={state.label} className="group relative">
                  {!isLast ? (
                    <span
                      className={`absolute left-[27px] top-[52px] -bottom-4 w-0.5 rounded-full transition-colors duration-500 motion-reduce:transition-none ${
                        isPast ? "bg-accent" : "bg-border"
                      }`}
                      aria-hidden="true"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className="flex w-full items-start gap-4 rounded-xl p-2 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                    aria-pressed={isActive}
                  >
                    <span
                      className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl ring-4 ring-card transition-all duration-300 motion-reduce:transition-none ${styles.icon} ${
                        isActive ? "scale-110 shadow-lifted" : "shadow-card"
                      }`}
                      aria-hidden="true"
                    >
                      <state.icon className="size-5" />
                    </span>

                    <div
                      className={`flex-1 rounded-xl border p-4 transition-all duration-300 motion-reduce:transition-none ${
                        isActive
                          ? `${styles.card} shadow-lifted`
                          : "border-transparent bg-transparent group-hover:border-border group-hover:bg-surface/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold ${isActive ? styles.title : "text-foreground"}`}>
                          {state.label}
                        </p>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isActive ? styles.badge : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isActive ? state.badge : isPast ? "Lewat" : "Berikutnya"}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-xs transition-colors ${
                          isActive ? styles.note : "text-muted-foreground"
                        }`}
                      >
                        {state.note}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>

          <p className="mt-4 text-center text-xs text-muted-foreground md:hidden">
            Ketuk langkah untuk melihat detail status.
          </p>
        </div>
      </div>
    </section>
  );
}

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Harga dan status dihitung di server",
    body: "Total pesanan dan status pembayaran tidak pernah ditentukan dari sisi browser.",
  },
  {
    icon: Receipt,
    title: "Pembayaran diperiksa manusia",
    body: "Bukti transfer diverifikasi tim keuangan sebelum pesanan diproses, lengkap dengan catatan keputusan.",
  },
  {
    icon: Layers,
    title: "Riwayat pesanan tersimpan",
    body: "Pesanan, invoice, hasil pengerjaan, dan revisi tersimpan pada akunmu.",
  },
  {
    icon: Download,
    title: "Akses unduhan terkendali",
    body: "Produk digital diberikan lewat tautan berbatas waktu, bukan file publik.",
  },
];

export function TrustSection() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Keamanan transaksi</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">Kenapa lewat Ebrystore</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Standar kerja yang sama kami terapkan pada setiap pesanan, dari pembayaran sampai serah terima.
        </p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {trustPoints.map((point) => (
            <article key={point.title} className="flex gap-4 bg-card p-6 transition-colors hover:bg-surface-raised">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
                <point.icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{point.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "Bagaimana cara membayar?",
    a: "Saat ini pembayaran memakai transfer manual ke kanal yang ditampilkan pada halaman pembayaran pesanan, lalu kamu mengunggah bukti transfer. Nominal harus sama persis dengan total pesanan.",
  },
  {
    q: "Berapa lama pembayaran diverifikasi?",
    a: "Bukti transfer diperiksa tim keuangan. Selama menunggu, status pesanan tetap terlihat di akunmu dan berubah begitu keputusan verifikasi dibuat.",
  },
  {
    q: "Kapan produk digital bisa diunduh?",
    a: "Setelah pembayaran diverifikasi, akses unduhan terbit otomatis. Kuota default 5 kali unduh dan berlaku 365 hari.",
  },
  {
    q: "Bagaimana jika hasil layanan belum sesuai?",
    a: "Ajukan revisi dari halaman pesanan. Jumlah revisi gratis mengikuti paket yang kamu pilih; kelebihannya mengikuti kebijakan paket tersebut.",
  },
  {
    q: "Apakah bisa refund?",
    a: "Refund diajukan dari halaman pesanan dan memerlukan persetujuan admin. Refund parsial dimungkinkan dan total refund tidak melebihi nilai yang sudah dibayar.",
  },
  {
    q: "Berapa lama batas pembayaran?",
    a: "Pembayaran manual memiliki batas 24 jam sejak pesanan dibuat. Lewat batas itu, pembayaran menjadi kedaluwarsa dan pesanan perlu dibuat ulang.",
  },
];

export function FaqSection() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16">
      <h2 className="text-xl font-bold sm:text-2xl">Pertanyaan yang sering muncul</h2>
      <Accordion type="single" collapsible className="mt-6">
        {faqs.map((faq) => (
          <AccordionItem key={faq.q} value={faq.q}>
            <AccordionTrigger className="text-left text-sm font-semibold">{faq.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="mt-6 text-sm text-muted-foreground">
        Belum terjawab?{" "}
        <Link to="/bantuan" className="font-semibold text-primary underline-offset-4 hover:underline">
          Buka pusat bantuan
        </Link>
        .
      </p>
    </section>
  );
}

export function FinalCtaSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-hero-gradient p-8 text-primary-foreground shadow-lifted sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-10">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary-foreground/10 blur-2xl"
        />
        <div className="relative min-w-0">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Mulai dari satu pesanan</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-primary-foreground/80">
            Buat akun untuk menyimpan pesanan, memantau progres, dan mengakses produk digital yang
            sudah kamu beli.
          </p>
        </div>
        <div className="relative mt-6 flex shrink-0 flex-col gap-3 sm:mt-0 sm:flex-row">
          <Button asChild size="lg" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <Link to="/auth">Buat akun</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/bantuan">Pelajari alurnya</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

const founderInterests = [
  { icon: Network, label: "Network Analysis", desc: "Analisis & arsitektur jaringan" },
  { icon: Brain, label: "AI Development", desc: "Pengembangan kecerdasan buatan" },
  { icon: User, label: "Software Engineer", desc: "Rekayasa perangkat lunak" },
];

export function FounderSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-lifted">
        <div className="grid lg:grid-cols-[1.1fr_1.9fr]">
          <div className="relative h-72 bg-surface lg:h-auto">
            <img
              src={founderAsset.url}
              alt="Febryanus Tambing — Founder Ebrystore"
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent lg:bg-gradient-to-r" />
            <div className="absolute bottom-4 left-4 text-white lg:bottom-6 lg:left-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Founder</p>
              <p className="mt-1 text-lg font-bold">Febryanus Tambing</p>
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-accent">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Di balik Ebrystore
            </span>
            <h2 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
              Dibangun oleh praktisi teknologi
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Ebrystore dikembangkan dengan standar rekayasa perangkat lunak, analisis jaringan,
              dan pendekatan AI untuk memastikan setiap transaksi produk digital dan layanan
              pendampingan akademik berjalan aman, transparan, dan terukur.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {founderInterests.map((item) => (
                <article
                  key={item.label}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{item.label}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Punya pertanyaan teknis atau kerja sama? Hubungi founder langsung.
              </p>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/bantuan">
                  Hubungi kami
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
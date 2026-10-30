import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CreditCard,
  Download,
  FileText,
  LifeBuoy,
  PackageSearch,
  RefreshCcw,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/bantuan")({
  head: () => ({
    meta: [
      { title: "Pusat Bantuan Ebrystore — Cara Pesan, Bayar, dan Pantau" },
      {
        name: "description",
        content:
          "Panduan membeli produk digital, memesan bantuan tugas kuliah, membayar, memantau pesanan, mengunduh file, meminta revisi, dan mengajukan refund di Ebrystore.",
      },
      { property: "og:title", content: "Pusat Bantuan Ebrystore" },
      {
        property: "og:description",
        content: "Panduan lengkap memesan, membayar, memantau, dan menyelesaikan pesanan di Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Bantuan,
});

type Topic = {
  id: string;
  icon: typeof FileText;
  title: string;
  summary: string;
  keywords: string;
  body: ReactNode;
};

const TOPICS: Topic[] = [
  {
    id: "beli-produk",
    icon: PackageSearch,
    title: "Cara membeli produk digital",
    summary: "Dari memilih produk sampai akses unduhan terbit.",
    keywords: "produk digital beli checkout unduh file ebook template",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Buka <Link to="/produk" className="font-medium text-primary hover:underline">Produk digital</Link>{" "}
          lalu pilih produk yang kamu butuhkan.
        </li>
        <li>Klik beli, atau tambahkan ke keranjang bila ingin membeli beberapa produk.</li>
        <li>Lakukan pembayaran sesuai instruksi di halaman pembayaran.</li>
        <li>Setelah pembayaran diverifikasi, akses unduhan terbit otomatis di akunmu.</li>
      </ol>
    ),
  },
  {
    id: "pesan-layanan",
    icon: Sparkles,
    title: "Cara memesan layanan",
    summary: "Pilih paket, isi kebutuhan, lalu bayar.",
    keywords: "layanan jasa bantuan tugas paket add-on operator",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Buka <Link to="/layanan" className="font-medium text-primary hover:underline">Bantuan Tugas</Link>{" "}
          dan pilih layanan.
        </li>
        <li>Pilih paket dan add-on yang sesuai kebutuhan.</li>
        <li>Isi form kebutuhan pengerjaan selengkap mungkin agar operator tidak menunggu data.</li>
        <li>Selesaikan pembayaran. Pesanan masuk antrean penugasan operator setelah diverifikasi.</li>
      </ol>
    ),
  },
  {
    id: "pembayaran",
    icon: CreditCard,
    title: "Cara pembayaran",
    summary: "Aturan nominal, batas waktu, dan bukti transfer.",
    keywords: "bayar pembayaran manual transfer bukti dana nominal batas waktu",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Pembayaran manual dilakukan ke kanal yang ditampilkan pada halaman pembayaran pesanan.</li>
        <li>Nominal transfer harus sama persis dengan total pesanan.</li>
        <li>Batas waktu pembayaran manual 24 jam sejak pesanan dibuat.</li>
        <li>Bukti transfer berupa JPG, PNG, WEBP, atau PDF, maksimal 5 MB.</li>
        <li>Unggah ulang bukti maksimal 3 kali per pembayaran.</li>
      </ul>
    ),
  },
  {
    id: "pantau-order",
    icon: FileText,
    title: "Cara memantau pesanan",
    summary: "Status pesanan diperbarui otomatis di dashboard.",
    keywords: "pantau status order pesanan tracking progres",
    body: (
      <p>
        Semua pesanan tercatat di{" "}
        <Link to="/dashboard" className="font-medium text-primary hover:underline">Pesanan saya</Link>.
        Status diperbarui saat prosesnya berubah, termasuk verifikasi pembayaran, penugasan operator,
        progres pengerjaan, pengiriman hasil, dan penyelesaian.
      </p>
    ),
  },
  {
    id: "unduh",
    icon: Download,
    title: "Cara mengunduh produk",
    summary: "Kuota 5 kali unduh, masa aktif 365 hari.",
    keywords: "unduh download kuota masa aktif akses file",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Akses unduhan muncul di halaman pesanan setelah pembayaran diverifikasi.</li>
        <li>Kuota default 5 kali unduh dan masa aktif 365 hari sejak akses terbit.</li>
        <li>Setiap unduhan dicatat sistem.</li>
      </ul>
    ),
  },
  {
    id: "revisi",
    icon: RotateCcw,
    title: "Cara meminta revisi",
    summary: "Jatah revisi mengikuti paket yang dipilih.",
    keywords: "revisi perbaikan hasil paket",
    body: (
      <p>
        Ajukan revisi dari halaman pesanan saat hasil pengerjaan dikirim. Jumlah revisi gratis
        mengikuti paket yang dipilih; kelebihan revisi ditolak atau menjadi add-on berbayar sesuai
        ketentuan paket.
      </p>
    ),
  },
  {
    id: "refund",
    icon: RefreshCcw,
    title: "Cara mengajukan refund",
    summary: "Refund parsial dimungkinkan dengan persetujuan admin.",
    keywords: "refund pengembalian dana uang batal",
    body: (
      <p>
        Ajukan refund dari halaman pesanan dengan menuliskan alasan. Refund parsial dimungkinkan dan
        memerlukan persetujuan admin. Total refund atas satu pesanan tidak melebihi total yang sudah
        dibayar. Refund produk digital mencabut akses unduhan terkait.
      </p>
    ),
  },
  {
    id: "dukungan",
    icon: LifeBuoy,
    title: "Cara menghubungi dukungan",
    summary: "Lewat Chat ke toko resmi atau dari pesanan terkait.",
    keywords: "kontak dukungan bantuan support komplain chat admin",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Untuk masalah pesanan, buka pesanan terkait di{" "}
          <Link to="/dashboard" className="font-medium text-primary hover:underline">
            Pesanan saya
          </Link>{" "}
          agar riwayat kasusnya terlihat oleh tim kami.
        </li>
        <li>
          Untuk pertanyaan umum, tekan tombol Chat di halaman{" "}
          <Link
            to="/toko/$slug"
            params={{ slug: "ebrystore-official" }}
            className="font-medium text-primary hover:underline"
          >
            Ebrystore Official
          </Link>
          . Balasan muncul di menu Chat pada dashboard.
        </li>
      </ul>
    ),
  },
];

function Bantuan() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>([]);

  function openTopic(id: string) {
    setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter((t) =>
      `${t.title} ${t.summary} ${t.keywords}`.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <PageShell>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-4xl px-4 py-12 text-center sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <LifeBuoy className="size-3.5" aria-hidden="true" />
            Pusat bantuan
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Ada yang bisa kami bantu?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Panduan singkat memakai Ebrystore, dari memilih produk sampai pesanan selesai.
          </p>

          <div className="relative mx-auto mt-6 max-w-lg">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari topik: pembayaran, refund, unduh…"
              aria-label="Cari topik bantuan"
              className="h-12 pl-9"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        {query.trim() === "" ? (
          <div className="mb-10 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {TOPICS.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => openTopic(topic.id)}
                className="min-w-0 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <topic.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="mt-2.5 block text-sm font-semibold leading-snug">
                  {topic.title.replace(/^Cara /, "")}
                </span>
                <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                  {topic.summary}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {results.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <p className="text-base font-semibold">Topik tidak ditemukan</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Coba kata kunci lain seperti “bayar”, “revisi”, atau “unduh”.
            </p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => setQuery("")}>
              Tampilkan semua topik
            </Button>
          </div>
        ) : (
          <Accordion type="multiple" value={open} onValueChange={setOpen} className="space-y-3">
            {results.map((topic) => (
              <AccordionItem
                key={topic.id}
                value={topic.id}
                id={topic.id}
                className="scroll-mt-24 rounded-xl border border-border bg-card px-4 shadow-card"
              >
                <AccordionTrigger className="gap-3 py-4 text-left hover:no-underline">
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <topic.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{topic.title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {topic.summary}
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pl-11 text-sm text-muted-foreground">
                  {topic.body}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-base font-semibold">Masih butuh bantuan?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Buka pesanan terkait di dashboard supaya tim kami bisa melihat riwayat kasusnya.
            </p>
            <Button asChild className="mt-4 min-h-11">
              <Link to="/dashboard">
                Buka pesanan saya
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-base font-semibold">Ketentuan lengkap</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Detail aturan layanan, privasi, dan refund tersedia di halaman kebijakan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/syarat-ketentuan">Syarat & ketentuan</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/kebijakan-refund">Kebijakan refund</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

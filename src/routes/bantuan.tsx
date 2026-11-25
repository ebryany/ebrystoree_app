import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  CreditCard,
  Download,
  FileText,
  LifeBuoy,
  MessagesSquare,
  PackagePlus,
  PackageSearch,
  RefreshCcw,
  RotateCcw,
  Search,
  Store,
  Wallet,
  X,
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bantuan")({
  head: () => ({
    meta: [
      { title: "Pusat Bantuan | Ebrystore" },
      {
        name: "description",
        content:
          "Panduan membeli produk digital, memesan jasa seller, membayar, memantau pesanan, mengunduh file, meminta revisi, refund, serta berjualan di Ebrystore.",
      },
      { property: "og:title", content: "Pusat Bantuan | Ebrystore" },
      {
        property: "og:description",
        content:
          "Panduan lengkap untuk pembeli dan seller di Ebrystore, dari memesan hingga menyelesaikan transaksi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Bantuan,
});

type Audience = "buyer" | "seller";

type Topic = {
  id: string;
  audience: Audience;
  icon: typeof FileText;
  cardTitle: string;
  title: string;
  summary: string;
  keywords: string;
  body: ReactNode;
};

const BUYER_TOPICS: Topic[] = [
  {
    id: "beli-produk",
    audience: "buyer",
    icon: PackageSearch,
    cardTitle: "Beli produk digital",
    title: "Cara membeli produk digital",
    summary: "Dari memilih produk sampai akses unduhan terbit.",
    keywords: "produk digital beli checkout unduh file ebook template akun",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Buka{" "}
          <Link to="/produk" className="font-medium text-primary hover:underline">
            Produk digital
          </Link>{" "}
          lalu pilih produk dan variasi yang sesuai kebutuhan.
        </li>
        <li>Klik beli sekarang, atau simpan ke keranjang bila ingin membandingkan beberapa produk.</li>
        <li>Lakukan pembayaran sesuai instruksi di halaman pembayaran.</li>
        <li>Setelah pembayaran diverifikasi, akses unduhan terbit otomatis di akun Anda.</li>
      </ol>
    ),
  },
  {
    id: "pesan-layanan",
    audience: "buyer",
    icon: Briefcase,
    cardTitle: "Pesan jasa seller",
    title: "Cara memesan jasa seller",
    summary: "Bandingkan durasi, revisi, chat seller, lalu pesan.",
    keywords: "layanan jasa seller tugas paket brief revisi escrow dana ditahan",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Buka{" "}
          <Link to="/layanan" className="font-medium text-primary hover:underline">
            Jasa seller
          </Link>{" "}
          dan bandingkan harga, durasi pengerjaan, serta jatah revisi.
        </li>
        <li>Gunakan tombol Chat pada kartu atau halaman jasa bila ingin berdiskusi sebelum memesan.</li>
        <li>Isi detail kebutuhan pengerjaan selengkap mungkin agar proses berjalan lancar.</li>
        <li>
          Selesaikan pembayaran. Dana ditahan sistem sampai hasil pekerjaan dikirim dan Anda terima.
        </li>
      </ol>
    ),
  },
  {
    id: "pembayaran",
    audience: "buyer",
    icon: CreditCard,
    cardTitle: "Pembayaran",
    title: "Cara pembayaran",
    summary: "Aturan nominal, batas waktu, dan bukti transfer.",
    keywords: "bayar pembayaran qris manual transfer bukti dana nominal batas waktu",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Pembayaran dilakukan ke kanal yang ditampilkan pada halaman pembayaran pesanan.</li>
        <li>Nominal transfer harus sama persis dengan total pesanan yang dihitung server.</li>
        <li>Batas waktu pembayaran manual adalah 24 jam sejak pesanan dibuat.</li>
        <li>Bukti transfer dapat berupa JPG, PNG, WEBP, atau PDF dengan ukuran maksimal 5 MB.</li>
        <li>Unggah ulang bukti maksimal 3 kali per pembayaran.</li>
      </ul>
    ),
  },
  {
    id: "pantau-order",
    audience: "buyer",
    icon: FileText,
    cardTitle: "Pantau pesanan",
    title: "Cara memantau pesanan",
    summary: "Status pesanan diperbarui otomatis di dashboard.",
    keywords: "pantau status order pesanan tracking progres",
    body: (
      <p>
        Semua pesanan tercatat di{" "}
        <Link to="/dashboard" className="font-medium text-primary hover:underline">
          Pesanan saya
        </Link>
        . Status diperbarui saat prosesnya berubah, mulai dari verifikasi pembayaran, pengerjaan,
        pengiriman hasil, hingga penyelesaian.
      </p>
    ),
  },
  {
    id: "unduh",
    audience: "buyer",
    icon: Download,
    cardTitle: "Unduh produk",
    title: "Cara mengunduh produk",
    summary: "Kuota 5 kali unduh, masa aktif 365 hari.",
    keywords: "unduh download kuota masa aktif akses file",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Akses unduhan muncul di halaman pesanan setelah pembayaran diverifikasi.</li>
        <li>Kuota default adalah 5 kali unduh dengan masa aktif 365 hari sejak akses terbit.</li>
        <li>Setiap aktivitas unduhan dicatat sistem demi keamanan akun Anda.</li>
      </ul>
    ),
  },
  {
    id: "revisi",
    audience: "buyer",
    icon: RotateCcw,
    cardTitle: "Minta revisi",
    title: "Cara meminta revisi",
    summary: "Jatah revisi mengikuti kesepakatan jasa.",
    keywords: "revisi perbaikan hasil paket jasa",
    body: (
      <p>
        Ajukan revisi dari halaman pesanan saat hasil pengerjaan dikirim. Jumlah revisi gratis
        mengikuti kesepakatan jasa yang dipilih; permintaan di luar lingkup atau batas revisi
        memerlukan kesepakatan tambahan.
      </p>
    ),
  },
  {
    id: "refund",
    audience: "buyer",
    icon: RefreshCcw,
    cardTitle: "Ajukan refund",
    title: "Cara mengajukan refund",
    summary: "Refund parsial dimungkinkan dengan persetujuan admin.",
    keywords: "refund pengembalian dana uang batal",
    body: (
      <p>
        Ajukan refund dari halaman pesanan dengan menuliskan alasan yang jelas. Refund parsial
        dimungkinkan dan memerlukan persetujuan admin. Total refund atas satu pesanan tidak melebihi
        total yang sudah dibayar, dan refund produk digital akan mencabut akses unduhan terkait.
      </p>
    ),
  },
  {
    id: "dukungan",
    audience: "buyer",
    icon: LifeBuoy,
    cardTitle: "Hubungi dukungan",
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
          agar riwayat kasusnya terlihat langsung oleh tim kami.
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
          . Balasan akan muncul di menu Chat pada dashboard.
        </li>
      </ul>
    ),
  },
];

const SELLER_TOPICS: Topic[] = [
  {
    id: "seller-buka-toko",
    audience: "seller",
    icon: Store,
    cardTitle: "Buka toko seller",
    title: "Cara membuka toko di Ebrystore",
    summary: "Daftar akun, lengkapi profil toko, lalu mulai berjualan.",
    keywords: "seller buka toko jualan daftar verifikasi profil toko",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Daftar atau masuk akun melalui{" "}
          <Link to="/auth" className="font-medium text-primary hover:underline">
            halaman masuk
          </Link>
          .
        </li>
        <li>Buka menu toko di dashboard untuk melengkapi nama, slug, dan deskripsi toko Anda.</li>
        <li>
          Setelah toko aktif, halaman toko Anda dapat dikunjungi pembeli lengkap dengan daftar
          produk dan jasa yang tersedia.
        </li>
      </ol>
    ),
  },
  {
    id: "seller-publikasi",
    audience: "seller",
    icon: PackagePlus,
    cardTitle: "Tayangkan produk & jasa",
    title: "Cara menayangkan produk dan jasa",
    summary: "Tulis detail jelas; setiap jasa ditinjau admin sebelum tayang.",
    keywords: "seller upload produk digital jasa moderasi review admin harga variasi",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Untuk produk digital, unggah berkas dan tentukan harga serta variasi bila diperlukan.
        </li>
        <li>
          Untuk jasa seller, lengkapi ruang lingkup, pengecualian, durasi pengerjaan, dan batas
          revisi agar ekspektasi pembeli jelas sejak awal.
        </li>
        <li>Setiap jasa seller ditinjau admin terlebih dahulu sebelum tayang di katalog publik.</li>
      </ul>
    ),
  },
  {
    id: "seller-chat-pesanan",
    audience: "seller",
    icon: MessagesSquare,
    cardTitle: "Chat & kelola pesanan",
    title: "Menangani chat pembeli dan pesanan masuk",
    summary: "Diskusikan kebutuhan di Chat dan kirim hasil lewat dashboard.",
    keywords: "seller chat pembeli pesanan order kirim hasil revisi",
    body: (
      <p>
        Pembeli dapat menghubungi toko Anda melalui tombol Chat sebelum memesan. Saat pesanan masuk,
        pantau statusnya di dashboard, kirim hasil pekerjaan sesuai durasi yang disepakati, dan
        tanggapi permintaan revisi dalam batas kesepakatan jasa.
      </p>
    ),
  },
  {
    id: "seller-saldo",
    audience: "seller",
    icon: Wallet,
    cardTitle: "Saldo & pendapatan",
    title: "Saldo toko dan pencairan pendapatan",
    summary: "Pendapatan masuk ke saldo toko setelah pembeli menerima hasil.",
    keywords: "seller saldo pendapatan withdraw pencairan rekening dana ditahan escrow",
    body: (
      <p>
        Dana pembayaran pembeli ditahan sistem selama pengerjaan jasa berlangsung. Pendapatan baru
        dicatat ke saldo toko setelah pembeli menerima hasil atau transaksi dinyatakan selesai,
        kemudian dapat dipantau dan ditarik lewat menu keuangan toko di dashboard.
      </p>
    ),
  },
];

const ALL_TOPICS = [...BUYER_TOPICS, ...SELLER_TOPICS];

const AUDIENCE_TABS: Array<{ id: Audience; label: string; count: number }> = [
  { id: "buyer", label: "Pembeli", count: BUYER_TOPICS.length },
  { id: "seller", label: "Seller", count: SELLER_TOPICS.length },
];

function Bantuan() {
  const [audience, setAudience] = useState<Audience>("buyer");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const trimmedQuery = query.trim().toLowerCase();
  const activeAudienceTopics = audience === "buyer" ? BUYER_TOPICS : SELLER_TOPICS;

  const results = useMemo(() => {
    if (!trimmedQuery) return activeAudienceTopics;
    return ALL_TOPICS.filter((t) =>
      `${t.cardTitle} ${t.title} ${t.summary} ${t.keywords}`.toLowerCase().includes(trimmedQuery),
    );
  }, [trimmedQuery, activeAudienceTopics]);

  function openTopic(id: string) {
    setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % AUDIENCE_TABS.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + AUDIENCE_TABS.length) % AUDIENCE_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = AUDIENCE_TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = AUDIENCE_TABS[nextIndex];
    setAudience(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <PageShell>
      <section className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-7xl px-3 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 2xl:max-w-[88rem]">
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link
              to="/"
              className="flex min-h-11 items-center rounded-md hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Beranda
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">
              Pusat bantuan
            </span>
          </nav>

          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ada yang bisa kami bantu?
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Panduan singkat untuk pembeli dan seller di Ebrystore, dari memilih produk hingga
              pesanan selesai.
            </p>

            <div role="search" className="relative mx-auto mt-5 max-w-xl">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari topik: pembayaran, refund, unduh, buka toko..."
                aria-label="Cari topik bantuan"
                className="h-12 rounded-xl pl-10 pr-11 text-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Hapus pencarian bantuan"
                  className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="bg-surface">
        <div className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:max-w-[88rem]">
          <div className="mx-auto max-w-5xl">
            {trimmedQuery === "" ? (
              <div className="mb-6 border-b border-border">
                <div
                  role="tablist"
                  aria-label="Kategori panduan"
                  className="flex items-center gap-6"
                >
                  {AUDIENCE_TABS.map((tab, index) => {
                    const selected = audience === tab.id;
                    return (
                      <button
                        key={tab.id}
                        ref={(el) => {
                          tabRefs.current[index] = el;
                        }}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => setAudience(tab.id)}
                        onKeyDown={(e) => handleTabKeyDown(e, index)}
                        className={cn(
                          "relative inline-flex min-h-11 items-center gap-2 border-b-2 pb-2 pt-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span>{tab.label}</span>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {trimmedQuery === "" ? (
              <section aria-labelledby="pintasan-topik-heading" className="mb-8">
                <h2 id="pintasan-topik-heading" className="sr-only">
                  Pintasan topik {audience === "buyer" ? "pembeli" : "seller"}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10.5rem),1fr))] gap-2.5 sm:gap-3 lg:grid-cols-4">
                  {activeAudienceTopics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => openTopic(topic.id)}
                      className="flex min-h-11 min-w-0 flex-col rounded-xl border border-border bg-card p-3.5 text-left shadow-[var(--elev-1)] transition-colors hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-selected text-primary">
                        <topic.icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="mt-2.5 block break-words text-sm font-semibold leading-snug text-foreground">
                        {topic.cardTitle}
                      </span>
                      <span className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                        {topic.summary}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="topik-bantuan-heading">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 id="topik-bantuan-heading" className="font-display text-lg font-bold">
                  {trimmedQuery
                    ? `Hasil pencarian untuk "${query.trim()}"`
                    : audience === "buyer"
                      ? "Panduan pembeli"
                      : "Panduan seller"}
                </h2>
                <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
                  {results.length} topik
                </p>
              </div>

              {results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
                  <p className="text-base font-semibold text-foreground">Topik tidak ditemukan</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    Coba kata kunci lain seperti &ldquo;bayar&rdquo;, &ldquo;revisi&rdquo;,
                    &ldquo;unduh&rdquo;, atau &ldquo;buka toko&rdquo;.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4 min-h-11 rounded-control"
                    onClick={() => setQuery("")}
                  >
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
                      className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-card px-3 shadow-[var(--elev-1)] sm:px-4"
                    >
                      <AccordionTrigger className="min-h-11 w-full min-w-0 gap-2.5 py-4 text-left hover:no-underline sm:gap-3">
                        <span className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-selected text-primary">
                            <topic.icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="break-words text-sm font-semibold text-foreground">
                                {topic.title}
                              </span>
                              {trimmedQuery ? (
                                <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {topic.audience === "buyer" ? "Pembeli" : "Seller"}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block break-words text-xs font-normal text-muted-foreground">
                              {topic.summary}
                            </span>
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 pl-0 text-sm leading-relaxed text-muted-foreground sm:pl-11">
                        {topic.body}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </section>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--elev-1)] sm:p-6">
                <h2 className="font-display text-base font-bold text-foreground">
                  Masih butuh bantuan?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Buka pesanan terkait di dashboard supaya tim kami bisa melihat riwayat kasusnya
                  secara lengkap.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    asChild
                    className="min-h-11 max-w-full whitespace-normal rounded-control text-center"
                  >
                    <Link to="/dashboard">
                      Buka pesanan saya
                      <ArrowRight className="ml-1.5 size-4 shrink-0" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 max-w-full whitespace-normal rounded-control text-center"
                  >
                    <Link to="/toko/$slug" params={{ slug: "ebrystore-official" }}>
                      Chat toko resmi
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--elev-1)] sm:p-6">
                <h2 className="font-display text-base font-bold text-foreground">
                  Ketentuan lengkap
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Detail aturan layanan, privasi, dan pengembalian dana tersedia di halaman
                  kebijakan Ebrystore.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 max-w-full whitespace-normal rounded-control text-center"
                  >
                    <Link to="/syarat-ketentuan">Syarat & ketentuan</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 max-w-full whitespace-normal rounded-control text-center"
                  >
                    <Link to="/kebijakan-refund">Kebijakan refund</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

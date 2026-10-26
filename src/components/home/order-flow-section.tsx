/**
 * Rounded Step Path — alur pemesanan Ebrystore.
 *
 * Garis adalah elemen utama: satu path orthogonal bersudut membulat (perintah
 * H/V + Q) yang berjalan ke kanan, berbelok turun, lalu kembali ke kiri —
 * pola serpentine dua kolom. Node bergantian kiri/kanan mengikuti arah jalur.
 * Kartu penjelas adalah elemen sekunder yang muncul saat node diinteraksi.
 *
 * Bukti business flow: src/lib/transaction-labels.ts — pembayaran melewati
 * waiting_verification sebelum paid; pesanan jasa melewati
 * waiting_assignment/in_progress sebelum completed. Karena itu tidak ada klaim
 * "instan", escrow, atau jaminan hasil.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import {
  CreditCard,
  FileCheck2,
  ListChecks,
  Package,
  Search,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Konfigurasi tahap                                                   */
/* ------------------------------------------------------------------ */

type FlowStep = { id: string; icon: typeof Search; title: string; body: string };
type VariantKey = "produk" | "jasa";

const PRODUCT_STEPS: FlowStep[] = [
  {
    id: "pilih",
    icon: Search,
    title: "Pilih produk",
    body: "Temukan produk digital yang diinginkan lalu tinjau detail serta ketentuannya.",
  },
  {
    id: "checkout",
    icon: ListChecks,
    title: "Checkout",
    body: "Periksa pesanan, harga, dan metode pembayaran yang tersedia.",
  },
  {
    id: "bayar",
    icon: CreditCard,
    title: "Pembayaran terverifikasi",
    body: "Pembayaran diproses lalu diverifikasi sebelum pesanan berjalan.",
  },
  {
    id: "akses",
    icon: Package,
    title: "Akses produk",
    body: "Akses diberikan sesuai jenis produk dan aturan entitlement yang berlaku.",
  },
];

const SERVICE_STEPS: FlowStep[] = [
  {
    id: "pilih",
    icon: Search,
    title: "Pilih jasa",
    body: "Tinjau detail layanan, paket, dan ketentuan pengerjaan.",
  },
  {
    id: "pesan",
    icon: ListChecks,
    title: "Buat pesanan",
    body: "Konfirmasi kebutuhan melalui alur pemesanan yang tersedia.",
  },
  {
    id: "bayar",
    icon: CreditCard,
    title: "Pembayaran",
    body: "Pembayaran diproses dan diverifikasi.",
  },
  {
    id: "kerja",
    icon: UserCheck,
    title: "Pengerjaan",
    body: "Pesanan ditangani seller atau operator sesuai workflow.",
  },
  {
    id: "hasil",
    icon: FileCheck2,
    title: "Hasil dan penyelesaian",
    body: "Hasil diserahkan untuk ditinjau; revisi mengikuti kesepakatan paket.",
  },
];

const VARIANTS: Array<{ key: VariantKey; label: string; steps: FlowStep[] }> = [
  { key: "produk", label: "Produk digital", steps: PRODUCT_STEPS },
  { key: "jasa", label: "Jasa seller", steps: SERVICE_STEPS },
];

/* ------------------------------------------------------------------ */
/* Geometri serpentine                                                 */
/* ------------------------------------------------------------------ */

const X_LEFT = 170;
const X_RIGHT = 630;
const SWING = 84; // seberapa jauh kurva mengayun keluar dari kolom node
const Y_START = 64;
// Jarak antar baris: cukup untuk label di bawah node (NODE_R + 22) plus napas,
// tidak lebih — section ini penjelasan, bukan panggung.
const ROW_GAP = 150;
const NODE_R = 18;
const VB_WIDTH = 800;

type Geo = {
  d: string;
  nodes: Array<{ x: number; y: number; row: number; side: "L" | "R" }>;
  width: number;
  height: number;
};

/**
 * Path berbentuk huruf S antar baris.
 *
 * Perpindahan sebaris memakai garis horizontal lurus. Saat turun ke baris
 * berikutnya, jalur memakai satu kurva Bézier kubik dengan dua titik kendali
 * berlawanan arah: kendali pertama mendorong keluar dari kolom asal, kendali
 * kedua menarik masuk dari sisi seberang. Hasilnya kurva S yang mulus, bukan
 * belokan siku maupun busur C.
 */
function buildSerpentine(count: number): Geo {
  const nodes: Geo["nodes"] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2);
    const side: "L" | "R" =
      row % 2 === 0 ? (i % 2 === 0 ? "L" : "R") : i % 2 === 0 ? "R" : "L";
    nodes.push({ x: side === "L" ? X_LEFT : X_RIGHT, y: Y_START + row * ROW_GAP, row, side });
  }

  const parts: string[] = [`M ${nodes[0].x} ${nodes[0].y}`];

  for (let i = 0; i < count - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];

    if (a.row === b.row) {
      parts.push(`H ${b.x}`);
      continue;
    }

    const dy = b.y - a.y;
    const out = a.side === "R" ? SWING : -SWING;
    // Dua kendali berlawanan arah: keluar dulu, lalu masuk dari seberang.
    parts.push(
      `C ${a.x + out} ${a.y + dy * 0.45}, ${b.x - out} ${b.y - dy * 0.45}, ${b.x} ${b.y}`,
    );
  }

  const maxRow = Math.max(...nodes.map((n) => n.row));
  return {
    d: parts.join(" "),
    nodes,
    width: VB_WIDTH,
    height: Y_START + maxRow * ROW_GAP + 90,
  };
}

/* ------------------------------------------------------------------ */
/* Kartu penjelas                                                      */
/* ------------------------------------------------------------------ */

function StepCard({
  step,
  index,
  onEnter,
  onLeave,
  onClose,
  align,
}: {
  step: FlowStep;
  index: number;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  align: "start" | "center" | "end";
}) {
  const Icon = step.icon;
  return (
    <div
      role="tooltip"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={cn(
        "w-[min(17rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-card p-3.5 shadow-card",
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none",
        align === "start" && "mr-auto",
        align === "center" && "mx-auto",
        align === "end" && "ml-auto",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </p>
          <p className="text-sm font-semibold leading-snug text-foreground">{step.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup keterangan"
          className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ×
          </span>
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export function OrderFlowSection() {
  const [variant, setVariant] = useState<VariantKey>("produk");
  const [active, setActive] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-12% 0px" });

  const steps = VARIANTS.find((v) => v.key === variant)?.steps ?? PRODUCT_STEPS;
  const geo = useMemo(() => buildSerpentine(steps.length), [steps.length]);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), 80);
    return () => clearTimeout(t);
  }, [inView, reduced, variant]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Jeda tutup: memberi waktu pointer berpindah dari node ke kartu tanpa flicker.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setActive(null), 160);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section aria-labelledby="order-flow-heading" className="pt-8 sm:pt-10">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 id="order-flow-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
              Bagaimana cara memesan?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Arahkan kursor, fokuskan keyboard, atau ketuk titik tahap untuk melihat penjelasannya.
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Jenis pesanan"
            className="flex rounded-lg border border-border bg-surface p-1"
          >
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                role="tab"
                type="button"
                aria-selected={variant === v.key}
                onClick={() => {
                  setVariant(v.key);
                  setActive(null);
                }}
                className={cn(
                  "min-h-9 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  variant === v.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---------------- Desktop / tablet: serpentine SVG ---------------- */}
        <div ref={sectionRef} className="relative mt-6 hidden md:block">
          <svg
            viewBox={`0 0 ${geo.width} ${geo.height}`}
            role="group"
            aria-label={`Alur pemesanan ${variant === "produk" ? "produk digital" : "jasa seller"}, ${steps.length} tahap`}
            className="h-auto w-full overflow-visible"
          >
            {/* Rel jalur: selalu terlihat, tipis, netral. */}
            <path
              d={geo.d}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-border"
            />
            {/* Aksen yang tergambar progresif mengikuti arah perjalanan. */}
            <path
              d={geo.d}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={drawn ? 0 : 1}
              className="stroke-accent"
              style={{
                transition: reduced
                  ? undefined
                  : "stroke-dashoffset 1600ms cubic-bezier(0.33, 0, 0.2, 1)",
              }}
            />

            {geo.nodes.map((n, i) => {
              const isActive = active === i;
              const step = steps[i];
              return (
                <g key={step.id}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={NODE_R}
                    strokeWidth={isActive ? 2 : 1.25}
                    className={cn(
                      "pointer-events-none transition-[fill,stroke] duration-300",
                      isActive ? "fill-accent stroke-accent" : "fill-card stroke-border",
                    )}
                  />
                  <text
                    x={n.x}
                    y={n.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={cn(
                      "pointer-events-none select-none font-mono text-[11px] tabular-nums transition-colors duration-300",
                      isActive ? "fill-accent-foreground" : "fill-muted-foreground",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </text>

                  {/* Label di bawah node, rata tengah. Penempatan samping pada
                      y yang sama membuat teks dilintasi segmen horizontal jalur
                      (garis H membentang antar node pada y identik). Di bawah
                      node, segmen vertikal/kurva hanya lewat tepi kolom, jadi
                      label selalu bebas tabrakan. */}
                  <text
                    x={n.x}
                    y={n.y + NODE_R + 22}
                    textAnchor="middle"
                    className={cn(
                      "pointer-events-none select-none text-[11.5px] font-medium transition-colors duration-300",
                      isActive ? "fill-foreground" : "fill-muted-foreground",
                    )}
                  >
                    {step.title}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tombol HTML transparan di atas tiap node. Elemen SVG <circle
              tabIndex> tidak memicu event focus di semua browser, jadi kontrol
              interaktif dibuat sebagai <button> asli yang diposisikan absolut
              mengikuti koordinat viewBox. Hover, fokus keyboard, dan tap
              memakai satu jalur kode yang sama. */}
          {geo.nodes.map((n, i) => {
            const isActive = active === i;
            return (
              <button
                key={`hit-${steps[i].id}`}
                type="button"
                aria-label={`Tahap ${i + 1}: ${steps[i].title}`}
                aria-expanded={isActive}
                onPointerEnter={() => {
                  cancelClose();
                  setActive(i);
                }}
                onPointerLeave={scheduleClose}
                onFocus={() => {
                  // Batalkan penutupan tertunda dari pointerleave sebelumnya;
                  // tanpa ini, kartu langsung tertutup lagi saat fokus keyboard.
                  cancelClose();
                  setActive(i);
                }}
                onBlur={scheduleClose}
                onClick={() => setActive(i)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{
                  left: `${(n.x / geo.width) * 100}%`,
                  top: `${(n.y / geo.height) * 100}%`,
                  width: `${(68 / geo.width) * 100}%`,
                  aspectRatio: "1",
                  maxWidth: 68,
                }}
              />
            );
          })}

          {/* Kartu mengambang: menempel di sisi node aktif, di luar kolom jalur,
              sehingga tidak menutupi node maupun segmen lain. */}
          {active !== null ? (
            <div
              className="pointer-events-none absolute z-10"
              style={{
                left: `${((geo.nodes[active].x + (geo.nodes[active].side === "L" ? -1 : 1) * 26) / geo.width) * 100}%`,
                top: `${(geo.nodes[active].y / geo.height) * 100}%`,
                transform:
                  geo.nodes[active].side === "L"
                    ? "translate(-100%, -50%)"
                    : "translate(0, -50%)",
              }}
            >
              <div className="pointer-events-auto">
                <StepCard
                  step={steps[active]}
                  index={active}
                  align="start"
                  onEnter={cancelClose}
                  onLeave={scheduleClose}
                  onClose={() => setActive(null)}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ---------------- Mobile: rounded step path vertikal ---------------- */}
        <div className="mt-6 md:hidden">
          <ol>
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1;
              const isActive = active === i;
              return (
                <li key={step.id} className={cn("relative", isLast ? "pb-0" : "pb-7")}>
                  {/* Segmen: turun lurus lalu belok mendatar ke marker berikutnya,
                      sudut membulat lewat rounded-bl. */}
                  {!isLast ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-[15px] top-8 h-[calc(100%-1.75rem)] w-5 rounded-bl-lg border-b border-l border-border"
                    />
                  ) : null}
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setActive(isActive ? null : i)}
                      onPointerEnter={() => {
                        cancelClose();
                        setActive(i);
                      }}
                      onPointerLeave={scheduleClose}
                      aria-expanded={isActive}
                      aria-label={`Tahap ${i + 1}: ${step.title}`}
                      className={cn(
                        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border font-mono text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActive(isActive ? null : i)}
                      className="min-h-8 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {step.title}
                    </button>
                  </div>
                  {isActive ? (
                    <div className="mt-2 pl-11">
                      <StepCard
                        step={step}
                        index={i}
                        align="start"
                        onEnter={cancelClose}
                        onLeave={scheduleClose}
                        onClose={() => setActive(null)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Gambaran umum alur; detail tiap pesanan mengikuti jenis produk dan ketentuan toko.
          </p>
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setDrawn(false);
              requestAnimationFrame(() => setDrawn(true));
            }}
            disabled={Boolean(reduced)}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Putar ulang
          </button>
        </div>

        {/* Ringkasan statis: semua tahap tetap terbaca tanpa hover, tanpa JS,
            dan oleh pembaca layar. */}
        <ol className="sr-only">
          {steps.map((s, i) => (
            <li key={s.id}>
              Tahap {i + 1}: {s.title}. {s.body}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

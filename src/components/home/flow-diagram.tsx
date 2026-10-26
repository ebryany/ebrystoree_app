import { CreditCard, ListChecks, PackageSearch, Radar, ShieldCheck, Sparkles } from "lucide-react";

const steps = [
  {
    icon: PackageSearch,
    label: "Pilih produk atau layanan",
    body: "Produk digital untuk file siap pakai, layanan untuk pengerjaan oleh operator.",
  },
  {
    icon: ListChecks,
    label: "Checkout",
    body: "Isi kebutuhan pesanan. Total dihitung ulang di server sebelum dikunci.",
  },
  {
    icon: CreditCard,
    label: "Pembayaran",
    body: "Bayar lalu unggah bukti. Pembayaran diverifikasi sebelum pesanan berjalan.",
  },
  {
    icon: Sparkles,
    label: "Diproses",
    body: "Produk digital terbit otomatis; layanan masuk antrean operator.",
  },
  {
    icon: Radar,
    label: "Pantau status",
    body: "Status diperbarui saat prosesnya berubah, langsung di akunmu.",
  },
  {
    icon: ShieldCheck,
    label: "Selesai",
    body: "Unduh file atau terima hasil pengerjaan, dengan opsi revisi sesuai paket.",
  },
];

export function FlowDiagram() {
  return (
    <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 p-5 backdrop-blur-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">
        Alur pesanan Ebrystore
      </p>
      <ol className="relative mt-5 grid gap-5 sm:grid-cols-2">
        <li
          aria-hidden="true"
          className="ebry-line-fill absolute left-[19px] top-2 hidden w-px bg-primary-foreground/30 sm:block"
          style={{ height: "calc(100% - 1rem)" }}
        />
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 text-accent">
              <step.icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary-foreground">
                <span className="font-mono text-xs text-primary-foreground/60">
                  {String(index + 1).padStart(2, "0")}
                </span>{" "}
                {step.label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-primary-foreground/75">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
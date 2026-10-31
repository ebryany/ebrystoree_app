import type {
  MarketplaceServiceOrderRow,
  MarketplaceServiceWorkState,
} from "./marketplace-service";

/**
 * Logika tampilan halaman pesanan jasa seller.
 *
 * Halaman ini satu layar keputusan: pesanan mana yang harus dikerjakan sekarang.
 * Semua fungsi di sini murni dan tanpa akses jaringan supaya bisa diuji langsung
 * dan dipakai bersama oleh kartu dan halaman.
 */

export type ServiceOrderTabKey =
  "needs_action" | "in_progress" | "revision" | "awaiting_buyer" | "all";

export const SERVICE_ORDER_TABS: ReadonlyArray<{
  key: ServiceOrderTabKey;
  label: string;
  hint: string;
}> = [
  {
    key: "needs_action",
    label: "Perlu tindakan",
    hint: "Pesanan yang menunggu persetujuan Anda, sedang dikerjakan, atau minta revisi.",
  },
  {
    key: "in_progress",
    label: "Dikerjakan",
    hint: "Pesanan yang sedang Anda kerjakan.",
  },
  {
    key: "revision",
    label: "Revisi",
    hint: "Pembeli meminta revisi hasil pekerjaan.",
  },
  {
    key: "awaiting_buyer",
    label: "Menunggu pembeli",
    hint: "Hasil sudah dikirim dan sedang ditinjau pembeli.",
  },
  { key: "all", label: "Semua", hint: "Semua pesanan jasa toko Anda." },
];

const ACTIONABLE_WORK_STATES: readonly MarketplaceServiceWorkState[] = [
  "awaiting_requirements",
  "in_progress",
  "revision_requested",
];

/** Pesanan sudah dibayar dan tidak sedang komplain, jadi seller boleh bertindak. */
export function isServiceOrderActionable(row: {
  order_status: string;
  work_state: MarketplaceServiceWorkState;
  complaint_open: boolean;
}): boolean {
  if (row.complaint_open) return false;
  if (row.order_status !== "paid") return false;
  return ACTIONABLE_WORK_STATES.includes(row.work_state);
}

export type ServiceOrderNextAction = {
  tone: "action" | "waiting" | "danger" | "done";
  title: string;
  hint: string;
};

/**
 * Satu langkah berikutnya yang bisa dibaca seller dari kartu tertutup.
 * Urutan pemeriksaan: komplain, pembayaran, lalu work_state.
 */
export function serviceOrderNextAction(row: {
  order_status: string;
  work_state: MarketplaceServiceWorkState;
  complaint_open: boolean;
}): ServiceOrderNextAction {
  if (row.complaint_open) {
    return {
      tone: "danger",
      title: "Komplain ditinjau admin",
      hint: "Pencairan dana dibekukan sampai admin memutuskan. Jangan kirim hasil baru dulu.",
    };
  }
  if (row.order_status === "awaiting_payment") {
    return {
      tone: "waiting",
      title: "Menunggu pembayaran pembeli",
      hint: "Pesanan aktif setelah pembayaran terverifikasi.",
    };
  }
  if (row.order_status === "payment_under_review") {
    return {
      tone: "waiting",
      title: "Bukti pembayaran sedang diperiksa",
      hint: "Pesanan aktif setelah Finance menyetujui pembayaran.",
    };
  }
  if (row.order_status === "cancelled" || row.order_status === "refunded") {
    return {
      tone: "danger",
      title: "Pesanan tidak berjalan",
      hint: "Pesanan dibatalkan atau dana dikembalikan. Tidak ada pekerjaan tersisa.",
    };
  }
  switch (row.work_state) {
    case "awaiting_requirements":
      return {
        tone: "action",
        title: "Setujui atau tolak kebutuhan",
        hint: "Respons dalam 24 jam sejak dibayar. Tanpa respons, pesanan batal dan dana kembali ke pembeli.",
      };
    case "in_progress":
      return {
        tone: "action",
        title: "Kerjakan dan kirim hasil",
        hint: "Kirim hasil sebelum tenggat supaya pembeli bisa meninjau.",
      };
    case "revision_requested":
      return {
        tone: "action",
        title: "Kirim hasil revisi",
        hint: "Pembeli meminta revisi. Kirim versi baru sesuai catatan.",
      };
    case "delivered":
      return {
        tone: "waiting",
        title: "Menunggu pembeli meninjau",
        hint: "Dana dilepas saat pembeli menerima, atau otomatis 3 hari setelah hasil dikirim.",
      };
    case "accepted":
      return {
        tone: "done",
        title: "Selesai",
        hint: "Pembeli menerima hasil. Dana dilepas ke saldo toko.",
      };
    case "refunded":
      return {
        tone: "danger",
        title: "Dana dikembalikan",
        hint: "Pesanan berakhir dengan refund.",
      };
    case "complaint_open":
      return {
        tone: "danger",
        title: "Komplain ditinjau admin",
        hint: "Pencairan dana dibekukan sampai admin memutuskan.",
      };
    default:
      return {
        tone: "waiting",
        title: "Tidak ada tindakan",
        hint: "Pantau perubahan status pesanan di sini.",
      };
  }
}

export type ServiceOrderDeadline = {
  tone: "overdue" | "soon" | "normal";
  label: string;
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Tenggat dengan tiga tingkat: lewat, kurang dari 24 jam, normal. */
export function serviceOrderDeadline(
  dueAt: string | null,
  now: number,
): ServiceOrderDeadline | null {
  if (!dueAt) return null;
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return null;
  if (due <= now) return { tone: "overdue", label: `Tenggat lewat ${formatDue(dueAt)}` };
  const hours = Math.floor((due - now) / 3_600_000);
  if (hours < 24) return { tone: "soon", label: `Tenggat ${hours} jam lagi` };
  return { tone: "normal", label: `Tenggat ${formatDue(dueAt)}` };
}

/**
 * Tenggat yang relevan untuk fase saat ini:
 * - menunggu kebutuhan -> batas respons seller (lewat = refund otomatis);
 * - hasil dikirim -> jendela tinjau pembeli (lewat = diterima otomatis);
 * - selain itu -> tenggat pengerjaan.
 */
export function serviceOrderPhaseDeadline(
  row: Pick<
    MarketplaceServiceOrderRow,
    "work_state" | "order_status" | "due_at" | "seller_response_due_at" | "review_due_at"
  >,
  now: number,
): ServiceOrderDeadline | null {
  if (row.order_status !== "paid") return null;
  if (row.work_state === "awaiting_requirements") {
    const d = serviceOrderDeadline(row.seller_response_due_at, now);
    if (!d) return null;
    if (d.tone === "overdue") return { tone: "overdue", label: "Batas respons lewat" };
    const hours = Math.max(
      0,
      Math.floor((Date.parse(row.seller_response_due_at!) - now) / 3_600_000),
    );
    return { tone: hours < 6 ? "overdue" : "soon", label: `Respons ${hours} jam lagi` };
  }
  if (row.work_state === "delivered") {
    const d = serviceOrderDeadline(row.review_due_at, now);
    if (!d) return null;
    return { tone: "normal", label: d.label.replace("Tenggat", "Diterima otomatis") };
  }
  if (row.work_state === "in_progress" || row.work_state === "revision_requested")
    return serviceOrderDeadline(row.due_at, now);
  return null;
}

export function filterServiceOrders(
  items: MarketplaceServiceOrderRow[],
  tab: ServiceOrderTabKey,
): MarketplaceServiceOrderRow[] {
  if (tab === "all") return items;
  if (tab === "needs_action") return items.filter(isServiceOrderActionable);
  if (tab === "in_progress")
    return items.filter(
      (row) =>
        row.order_status === "paid" && !row.complaint_open && row.work_state === "in_progress",
    );
  if (tab === "revision")
    return items.filter(
      (row) =>
        row.order_status === "paid" &&
        !row.complaint_open &&
        row.work_state === "revision_requested",
    );
  return items.filter(
    (row) => row.order_status === "paid" && !row.complaint_open && row.work_state === "delivered",
  );
}

export function countServiceOrders(
  items: MarketplaceServiceOrderRow[],
): Record<ServiceOrderTabKey, number> {
  return {
    needs_action: filterServiceOrders(items, "needs_action").length,
    in_progress: filterServiceOrders(items, "in_progress").length,
    revision: filterServiceOrders(items, "revision").length,
    awaiting_buyer: filterServiceOrders(items, "awaiting_buyer").length,
    all: items.length,
  };
}

export function countServiceComplaints(items: MarketplaceServiceOrderRow[]): number {
  return items.filter((row) => row.complaint_open).length;
}

/** Satu baris penjelas per status kerja: apa artinya bagi seller. */
export const serviceOrderWorkStateHint: Record<MarketplaceServiceWorkState, string> = {
  awaiting_requirements: "Periksa kebutuhan pembeli, lalu setujui atau tolak.",
  in_progress: "Kerjakan sesuai agreement, lalu kirim hasil sebelum tenggat.",
  delivered: "Menunggu pembeli meninjau hasil yang sudah dikirim.",
  revision_requested: "Pembeli meminta revisi. Kirim versi baru.",
  accepted: "Selesai. Dana dilepas ke saldo toko.",
  complaint_open: "Komplain ditinjau admin. Pencairan dibekukan.",
  refunded: "Dana dikembalikan ke pembeli.",
};

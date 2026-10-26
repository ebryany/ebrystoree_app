/** Label ramah pelanggan untuk status internal. Client-safe. */

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  awaiting_payment: "Menunggu pembayaran",
  payment_under_review: "Bukti pembayaran sedang diperiksa",
  paid: "Pembayaran diterima",
  waiting_assignment: "Menunggu penugasan operator",
  assigned: "Sudah ditugaskan",
  waiting_customer_data: "Menunggu data dari Anda",
  queued: "Dalam antrean",
  in_progress: "Sedang dikerjakan",
  waiting_customer_review: "Menunggu peninjauan Anda",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  refund_requested: "Refund diajukan",
  refund_processing: "Refund diproses",
  refunded: "Refund selesai",
  disputed: "Sengketa",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  pending: "Menunggu",
  waiting_payment: "Menunggu pembayaran",
  waiting_verification: "Menunggu verifikasi",
  paid: "Lunas",
  failed: "Gagal",
  expired: "Kedaluwarsa",
  rejected: "Bukti ditolak",
  cancelled: "Dibatalkan",
  refund_requested: "Refund diajukan",
  partially_refunded: "Refund sebagian",
  refunded: "Refund penuh",
};

export const TASK_TYPE_LABEL: Record<string, string> = {
  verify_payment: "Verifikasi pembayaran",
  assign_operator: "Tugaskan operator",
  review_refund: "Review refund",
  follow_up_customer_data: "Tindak lanjut data pelanggan",
  check_transaction: "Periksa transaksi",
  review_seller: "Verifikasi seller baru",
  review_product: "Moderasi produk seller",
  review_service_complaint: "Tinjau komplain jasa",
};

export const MODERATION_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu moderasi",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export const STORE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu verifikasi",
  active: "Aktif",
  suspended: "Ditangguhkan",
  rejected: "Ditolak",
};

export const ORDER_TYPE_LABEL: Record<string, string> = {
  digital_product: "Produk digital",
  service: "Pesanan Akademik",
  marketplace_service: "Jasa seller",
};

/** Satu tindakan paling relevan bagi pelanggan pada sebuah order. */
export function customerAction(orderStatus: string, paymentStatus: string | null): string | null {
  if (orderStatus === "awaiting_payment") {
    return paymentStatus === "rejected" ? "Unggah ulang bukti pembayaran" : "Bayar & unggah bukti";
  }
  if (orderStatus === "payment_under_review") return "Tunggu verifikasi pembayaran";
  if (orderStatus === "waiting_customer_data") return "Lengkapi data kebutuhan";
  if (orderStatus === "completed") return "Unduh produk";
  if (orderStatus === "waiting_assignment") return "Tunggu penugasan operator";
  if (orderStatus === "in_progress") return "Tunggu hasil pengerjaan";
  return null;
}

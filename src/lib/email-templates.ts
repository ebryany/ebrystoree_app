/**
 * Template email transaksional Ebrystore.
 *
 * Setiap fungsi menerima data NYATA (dari database) dan mengembalikan subjek,
 * HTML, dan versi teks. Tidak ada angka atau nama contoh di dalam berkas ini.
 *
 * Aturan anti-slop yang dipatuhi (docs/marketplace/09-...):
 * - Subjek menyebut fakta + nomor pesanan (E-08), tanpa emoji dan em-dash (E-05, E-06).
 * - Semua nilai berasal dari pemanggil; null punya teks penjelas (E-13).
 * - Satu tombol aksi per email (E-14).
 * - Terbaca tanpa gambar: header memakai teks (E-17).
 */

import {
  renderEmail,
  renderEmailText,
  type EmailDetailRow,
  type EmailLayoutInput,
  type EmailStatus,
} from "./email-layout";
import { formatRupiah } from "./format";

export type EmailContent = { subject: string; html: string; text: string };

function siteUrl(path: string): string {
  const base = (process.env["SITE_URL"] ?? "https://app.ebrystore.my.id").replace(/\/$/, "");
  return `${base}${path}`;
}

function build(input: EmailLayoutInput & { subject: string }): EmailContent {
  return {
    subject: input.subject,
    html: renderEmail(input),
    text: renderEmailText(input),
  };
}

/** Teks pengganti yang jujur bila sebuah nilai tidak ada di database. */
function orText(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

export type OrderEmailData = {
  orderNumber: string;
  orderId: string;
  total: number;
  itemName: string | null;
  storeName: string | null;
};

/** 1. Pembayaran diterima. */
export function emailOrderPaid(d: OrderEmailData, recipientId: string): EmailContent {
  return build({
    subject: `Pembayaran diterima untuk pesanan ${d.orderNumber}`,
    heading: "Pembayaranmu sudah diterima",
    intro:
      "Pesanan sudah lunas dan sedang diproses. Kami akan memberi kabar lagi setelah ada perkembangan.",
    status: "success",
    statusLabel: "Lunas",
    details: [
      { label: "Nomor pesanan", value: d.orderNumber },
      { label: "Item", value: orText(d.itemName, "Pesanan Ebrystore") },
      ...(d.storeName ? [{ label: "Toko", value: d.storeName }] : []),
      { label: "Total dibayar", value: formatRupiah(d.total) },
    ],
    action: { label: "Lihat pesanan", url: siteUrl(`/dashboard/pesanan/${d.orderId}`) },
    note: "Simpan email ini sebagai bukti pembayaran.",
    preview: `Pesanan ${d.orderNumber} sudah lunas.`,
    unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
    helpUrl: siteUrl("/bantuan"),
  });
}

/** 2. Produk digital selesai: akses terbit. */
export function emailOrderCompletedDigital(d: OrderEmailData, recipientId: string): EmailContent {
  return build({
    subject: `Pesanan ${d.orderNumber} selesai. Akses produkmu sudah aktif`,
    heading: "Pesananmu selesai",
    intro:
      "Akses produk sudah aktif di pustaka akunmu. Kamu bisa mengunduhnya sekarang dan kapan saja sesuai masa berlaku.",
    status: "success",
    statusLabel: "Selesai",
    details: [
      { label: "Nomor pesanan", value: d.orderNumber },
      { label: "Produk", value: orText(d.itemName, "Produk digital") },
      ...(d.storeName ? [{ label: "Toko", value: d.storeName }] : []),
      { label: "Total", value: formatRupiah(d.total) },
    ],
    action: { label: "Buka pustaka produk", url: siteUrl("/dashboard/produk-saya") },
    preview: `Akses produk untuk pesanan ${d.orderNumber} sudah aktif.`,
    unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
    helpUrl: siteUrl("/bantuan"),
  });
}

/** 3. Seller mengirim hasil pekerjaan jasa. */
export function emailServiceDelivered(
  d: OrderEmailData & { version: number },
  recipientId: string,
): EmailContent {
  return build({
    subject: `Hasil pekerjaan siap ditinjau untuk pesanan ${d.orderNumber}`,
    heading: "Hasil pekerjaan sudah dikirim",
    intro:
      "Seller sudah mengirim hasilnya. Tinjau dulu, lalu terima bila sudah sesuai atau minta revisi sesuai kesepakatan.",
    status: "pending",
    statusLabel: "Perlu ditinjau",
    details: [
      { label: "Nomor pesanan", value: d.orderNumber },
      { label: "Jasa", value: orText(d.itemName, "Jasa seller") },
      ...(d.storeName ? [{ label: "Toko", value: d.storeName }] : []),
      { label: "Versi hasil", value: `Ke-${d.version}` },
    ],
    action: { label: "Tinjau hasil pekerjaan", url: siteUrl(`/dashboard/pesanan/${d.orderId}`) },
    note: "Dana seller baru dilepas setelah kamu menerima hasilnya.",
    preview: `Hasil untuk pesanan ${d.orderNumber} menunggu tinjauanmu.`,
    unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
    helpUrl: siteUrl("/bantuan"),
  });
}

/** 4. Hasil jasa diterima pembeli: transaksi selesai. */
export function emailServiceAccepted(
  d: OrderEmailData & { sellerView?: boolean },
  recipientId: string,
): EmailContent {
  if (d.sellerView) {
    return build({
      subject: `Pesanan ${d.orderNumber} selesai. Pendapatan dilepas ke saldo tokomu`,
      heading: "Pembeli menerima hasil pekerjaan",
      intro:
        "Transaksi selesai dan pendapatan sudah masuk ke saldo tokomu. Kamu bisa melihat rinciannya di halaman keuangan.",
      status: "success",
      statusLabel: "Selesai",
      details: [
        { label: "Nomor pesanan", value: d.orderNumber },
        { label: "Jasa", value: orText(d.itemName, "Jasa seller") },
        { label: "Nilai transaksi", value: formatRupiah(d.total) },
      ],
      action: { label: "Lihat keuangan toko", url: siteUrl("/seller/keuangan") },
      preview: `Pendapatan dari pesanan ${d.orderNumber} sudah dilepas.`,
      // Preferensi email adalah setelan AKUN, bukan setelan toko. Penjual
      // diarahkan ke pengaturan akun yang sama dengan pembeli supaya tautannya
      // benar-benar berfungsi (halaman pengaturan toko tidak punya kontrol ini).
      unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
      helpUrl: siteUrl("/bantuan"),
    });
  }

  return build({
    subject: `Pesanan ${d.orderNumber} selesai`,
    heading: "Terima kasih, pesananmu selesai",
    intro: "Kamu sudah menerima hasil pekerjaannya. Simpan email ini sebagai catatan transaksi.",
    status: "success",
    statusLabel: "Selesai",
    details: [
      { label: "Nomor pesanan", value: d.orderNumber },
      { label: "Jasa", value: orText(d.itemName, "Jasa seller") },
      ...(d.storeName ? [{ label: "Toko", value: d.storeName }] : []),
      { label: "Total", value: formatRupiah(d.total) },
    ],
    action: { label: "Lihat pesanan", url: siteUrl(`/dashboard/pesanan/${d.orderId}`) },
    preview: `Transaksi pesanan ${d.orderNumber} selesai.`,
    unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
    helpUrl: siteUrl("/bantuan"),
  });
}

/** 5. Konfirmasi penerimaan tercatat. */
export function emailReceiptAccepted(d: OrderEmailData, recipientId: string): EmailContent {
  return build({
    subject: `Penerimaan pesanan ${d.orderNumber} sudah tercatat`,
    heading: "Penerimaanmu sudah tercatat",
    intro:
      "Kami mencatat bahwa kamu sudah menerima produknya. Transaksi ini selesai dan tersimpan di riwayat akunmu.",
    status: "success",
    statusLabel: "Selesai",
    details: [
      { label: "Nomor pesanan", value: d.orderNumber },
      { label: "Produk", value: orText(d.itemName, "Produk digital") },
      { label: "Total", value: formatRupiah(d.total) },
    ],
    action: { label: "Lihat riwayat pesanan", url: siteUrl(`/dashboard/pesanan/${d.orderId}`) },
    preview: `Penerimaan pesanan ${d.orderNumber} sudah tercatat.`,
    unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
    helpUrl: siteUrl("/bantuan"),
  });
}

/** 6. Refund selesai: dana kembali sebagai saldo. */
export function emailRefundCompleted(
  d: { orderNumber: string; orderId: string; amount: number; refundNumber: string },
  recipientId: string,
): EmailContent {
  const details: EmailDetailRow[] = [
    { label: "Nomor refund", value: d.refundNumber },
    { label: "Nomor pesanan", value: d.orderNumber },
    { label: "Jumlah dikembalikan", value: formatRupiah(d.amount) },
  ];
  const status: EmailStatus = "success";

  return build({
    subject: `Refund ${d.refundNumber} selesai`,
    heading: "Refund sudah diproses",
    intro:
      "Dana refund sudah dikembalikan ke saldo Ebrystore akunmu. Saldo bisa dipakai untuk berbelanja di Ebrystore.",
    status,
    statusLabel: "Refund selesai",
    details,
    action: { label: "Lihat saldo", url: siteUrl("/dashboard/saldo") },
    note: "Saldo belum dapat dicairkan ke rekening bank.",
    preview: `Refund ${d.refundNumber} sudah masuk ke saldo akunmu.`,
    unsubscribeUrl: siteUrl(`/dashboard/pengaturan?email=off&uid=${recipientId}`),
    helpUrl: siteUrl("/bantuan"),
  });
}

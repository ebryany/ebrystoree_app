/** Helper server-only untuk domain transaksi. Tidak boleh diimpor dari komponen. */

const RPC_ERROR_MESSAGE: Record<string, string> = {
  UNAUTHENTICATED: "Sesi Anda berakhir. Silakan masuk kembali.",
  FORBIDDEN: "Anda tidak memiliki izin untuk tindakan ini.",
  NOT_FOUND: "Data tidak ditemukan atau bukan milik Anda.",
  INVALID_STATE: "Status saat ini tidak mengizinkan tindakan tersebut.",
  INVALID_DECISION: "Keputusan verifikasi tidak dikenal.",
  INVALID_IDEMPOTENCY_KEY: "Permintaan checkout tidak valid.",
  PRODUCT_UNAVAILABLE: "Produk tidak tersedia atau sudah tidak diterbitkan.",
  OUT_OF_STOCK: "Stok produk ini sudah habis. Silakan pilih produk lain atau hubungi kami.",
  STORE_SUSPENDED: "Toko penjual sedang ditangguhkan. Pesanan tidak dapat diproses saat ini.",
  SERVICE_UNAVAILABLE: "Layanan tidak tersedia atau sudah tidak diterbitkan.",
  PACKAGE_UNAVAILABLE: "Paket layanan tidak tersedia lagi.",
  PAYMENT_EXPIRED: "Batas waktu pembayaran sudah lewat.",
  REUPLOAD_LIMIT_REACHED: "Batas unggah ulang bukti pembayaran sudah tercapai.",
  MANUAL_PAYMENT_UNAVAILABLE: "Pembayaran manual sedang tidak tersedia.",
  MANUAL_ONLY: "Pembayaran ini memakai gateway, bukan transfer manual.",
  INVALID_PROOF: "Bukti tidak valid. Unggah JPG, PNG, WEBP, atau PDF maksimal 5 MiB.",
  PROOF_REQUIRED: "Bukti pembayaran yang diajukan belum tersedia.",
  AMOUNT_MISMATCH: "Nominal bukti berbeda dari tagihan. Minta unggah ulang sebelum menyetujui.",
  REASON_REQUIRED: "Alasan wajib diisi.",
  REFUND_WINDOW_CLOSED: "Masa pengajuan refund sudah lewat.",
  NO_PAID_PAYMENT: "Belum ada pembayaran lunas pada pesanan ini.",
  DELIVERY_NOT_READY: "Seluruh produk belum tersedia. Konfirmasikan setelah produk dapat diakses.",
  REFUND_ACTIVE: "Pengajuan refund sedang diproses. Penerimaan belum dapat dikonfirmasi.",
  RECEIPT_REQUIRED: "Pendapatan belum dapat dilepas sebelum pembeli mengonfirmasi penerimaan.",
  REFUND_ALLOCATION_REQUIRED: "Refund ini memerlukan keputusan alokasi dana. Saldo belum diubah.",
  REVOKED: "Hak akses produk ini sudah dicabut.",
  EXPIRED: "Masa berlaku unduhan sudah habis.",
  LIMIT_REACHED: "Kuota unduhan sudah habis.",
  FILE_UNAVAILABLE: "Berkas produk belum tersedia. Hubungi admin.",
  OPERATOR_INVALID: "Pengguna yang dipilih bukan operator aktif.",
  ALREADY_ASSIGNED: "Pesanan ini sudah memiliki operator aktif.",
  ASSIGNMENT_REQUIRED: "Tugaskan operator terlebih dahulu sebelum menyelesaikan tugas ini.",
  INTEGRITY_REQUIRED: "Anda harus menyetujui pernyataan integritas akademik terlebih dahulu.",
  ACADEMIC_FIELDS_REQUIRED: "Lengkapi seluruh data akademik wajib terlebih dahulu.",
  EDUCATION_LEVEL_UNSUPPORTED: "Jenjang pendidikan tersebut belum didukung layanan ini.",
  TIMEZONE_INVALID: "Zona waktu tidak dikenali.",
  DEADLINE_INVALID: "Tenggat harus minimal 2 jam dari sekarang.",
  SCOPE_FLAG_INVALID: "Penanda cakupan tidak dikenal.",
  CATEGORY_INACTIVE: "Kategori akademik layanan ini sedang tidak aktif.",
  ADDON_INVALID: "Ada tambahan yang sudah tidak tersedia.",
};

export function rpcErrorMessage(message: string | undefined | null): string {
  if (!message) return "Terjadi kesalahan. Coba lagi.";
  for (const [code, text] of Object.entries(RPC_ERROR_MESSAGE)) {
    if (message.includes(code)) return text;
  }
  console.error("[transaksi] kesalahan tidak terduga:", message);
  return "Terjadi kesalahan pada server. Coba lagi.";
}

export async function loadPaymentInstruction(supabase: any) {
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", ["manual_payment_instruction", "order_expiry_hours", "admin_fee"]);

  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    instruction:
      (map.get("manual_payment_instruction") as string) ??
      "Transfer sesuai nominal tepat, lalu unggah bukti pembayaran.",
    expiryHours: Number(map.get("order_expiry_hours") ?? 24),
    adminFee: Number(map.get("admin_fee") ?? 0),
  };
}

/** Detail rekening manual disimpan sebagai setting privat, dibaca dengan service role. */
export async function loadManualAccount() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "manual_payment_method",
      "manual_payment_number",
      "manual_payment_holder",
      "manual_payment_active",
      "feature_manual_payment",
      "proof_reupload_limit",
    ]);

  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    method: (map.get("manual_payment_method") as string) ?? "DANA",
    number: (map.get("manual_payment_number") as string) ?? "",
    holder: (map.get("manual_payment_holder") as string) ?? "",
    active:
      map.get("manual_payment_active") !== false && map.get("feature_manual_payment") !== false,
    reuploadLimit: Number(map.get("proof_reupload_limit") ?? 3),
  };
}

/**
 * Status metode pembayaran yang tersedia untuk checkout.
 *
 * Satu sumber kebenaran supaya admin dan checkout tidak pernah berbeda tafsir.
 * Sebelumnya ada tiga nama setting berbeda (qris_enabled, qris_payment_active,
 * feature_qris) dan dua di antaranya tidak ada di database, sehingga nilai
 * `undefined` dianggap "aktif" dan saklar admin tidak berpengaruh.
 *
 * Aturan: nama kanonik yang berlaku bila ADA. Alias lama hanya dipakai bila nama
 * kanonik belum ada. Ini mencegah keadaan "kanonik false tapi alias true" yang
 * membuat saklar tampak tidak berfungsi.
 */
export type PaymentMethods = { qris: boolean; manual: boolean; shopeepay: boolean };

function resolveEnabled(map: Map<string, unknown>, canonical: string, aliases: string[]): boolean {
  const canonicalValue = map.get(canonical);
  if (canonicalValue !== undefined) return canonicalValue !== false;
  // Belum ada nama kanonik: pakai alias; aktif kecuali salah satunya false.
  return aliases.every((key) => {
    const value = map.get(key);
    return value === undefined ? true : value !== false;
  });
}

export async function loadPaymentMethods(): Promise<PaymentMethods> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "qris_enabled",
      "qris_payment_active",
      "feature_qris",
      "manual_payment_active",
      "feature_manual_payment",
      "shopeepay_enabled",
    ]);

  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  const { sumopodConfig } = await import("./sumopod.server");
  const { shopeepayConfig } = await import("./shopeepay.server");

  return {
    // QRIS juga butuh kredensial provider; tanpa itu saklar tidak ada artinya.
    qris:
      Boolean(sumopodConfig()) &&
      resolveEnabled(map, "qris_enabled", ["qris_payment_active", "feature_qris"]),
    manual: resolveEnabled(map, "manual_payment_active", ["feature_manual_payment"]),
    // ShopeePay resmi: wajib SHOPEEPAY_ENABLED=true + kredensial lengkap di server,
    // dan dapat dimatikan admin lewat setting shopeepay_enabled=false.
    shopeepay: Boolean(shopeepayConfig()) && map.get("shopeepay_enabled") !== false,
  };
}

export async function signedUrl(
  bucket: string,
  path: string,
  seconds = 300,
  downloadAs?: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, seconds, downloadAs ? { download: downloadAs } : undefined);
  if (error) {
    console.error("[storage] gagal membuat signed URL:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export function maskReference(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 6) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

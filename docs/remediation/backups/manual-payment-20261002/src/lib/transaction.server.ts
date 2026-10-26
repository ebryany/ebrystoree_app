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
  REASON_REQUIRED: "Alasan wajib diisi.",
  REFUND_WINDOW_CLOSED: "Masa pengajuan refund sudah lewat.",
  NO_PAID_PAYMENT: "Belum ada pembayaran lunas pada pesanan ini.",
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
    .in("key", ["manual_payment_method", "manual_payment_number", "manual_payment_holder", "manual_payment_active"]);

  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    method: (map.get("manual_payment_method") as string) ?? "DANA",
    number: (map.get("manual_payment_number") as string) ?? "",
    holder: (map.get("manual_payment_holder") as string) ?? "",
    active: map.get("manual_payment_active") !== false,
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
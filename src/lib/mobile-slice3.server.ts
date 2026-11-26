import { z } from "zod";
import {
  marketplaceServiceAcceptSchema,
  marketplaceServiceCancelOverdueSchema,
  marketplaceServiceCheckoutSchema,
  marketplaceServiceComplaintSchema,
  marketplaceServiceExtensionResponseSchema,
  marketplaceServiceRevisionSchema,
  serviceMediaUrl,
} from "./marketplace-service";
import type { MobileAuthResult } from "./mobile-auth.server";
import { parsePaymentMethods, type CustomPaymentMethod } from "./payment-methods";
import { enforceRateLimit } from "./rate-limit.server";
import { getOrLoad } from "./server-cache.server";
import { isAcademicCategorySlug, looksLikeSecret } from "./service-types";

export interface MobileSlice3Helpers {
  ok: (data: unknown, status?: number) => Response;
  okPublic?: (data: unknown, maxAgeSeconds?: number, swrSeconds?: number) => Response;
  err: (code: string, message: string, status: number) => Response;
  readJsonBody: (
    request: Request,
  ) => Promise<{ ok: true; body: unknown } | { ok: false; response: Response }>;
  requireAuth: (request: Request) => Promise<MobileAuthResult>;
  checkPublicRateLimit: (request: Request) => Promise<{ error: string } | null>;
}

const uuidSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1).max(140);

const pushTokenRegisterSchema = z
  .object({
    token: z.string().trim().min(20).max(512),
    platform: z.enum(["android", "ios", "web"]).default("android"),
    appVersion: z.string().trim().max(40).optional(),
    deviceLabel: z.string().trim().max(100).optional(),
  })
  .strict();

const pushTokenDeleteSchema = z.object({ token: z.string().trim().min(20).max(512) }).strict();

const servicesListQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    kind: z.enum(["all", "platform", "seller"]).default("all"),
    page: z.coerce.number().int().min(0).max(500).default(0),
    pageSize: z.coerce.number().int().min(1).max(40).default(16),
  })
  .strict();

const academicQuoteSchema = z
  .object({
    serviceId: z.string().uuid(),
    packageId: z.string().uuid(),
    addonIds: z.array(z.string().uuid()).max(20).default([]),
    deadline: z.string().max(40).nullable().optional(),
    reviewerRequested: z.boolean().default(false),
  })
  .strict();

const academicDetailSchema = z.object({
  course_name: z.string().trim().min(2).max(120),
  study_program: z.string().trim().min(2).max(120),
  education_level: z.enum(["d3", "s1", "s2", "s3"]),
  assignment_title: z.string().trim().min(3).max(200),
  assignment_description: z.string().trim().min(20).max(4000),
  lecturer_instructions: z.string().trim().max(4000).optional().default(""),
  official_deadline_at: z.string().min(10).max(40),
  customer_timezone: z.string().trim().min(2).max(60),
  language: z.string().trim().min(2).max(20),
  output_type: z.string().trim().min(2).max(40),
  file_format: z.string().trim().min(2).max(20),
  citation_style: z.string().trim().max(20).optional().default(""),
  estimated_pages: z.string().trim().max(6).optional().default(""),
  institution_name: z.string().trim().max(160).optional().default(""),
  software_required: z.string().trim().max(160).optional().default(""),
  dataset_description: z.string().trim().max(1000).optional().default(""),
  presentation_duration: z.string().trim().max(6).optional().default(""),
  special_notes: z.string().trim().max(1000).optional().default(""),
  extra_fields: z.record(z.string(), z.string().trim().max(1000)).default({}),
});

const createAcademicOrderSchema = z
  .object({
    serviceId: z.string().uuid(),
    packageId: z.string().uuid(),
    addonIds: z.array(z.string().uuid()).max(20).default([]),
    academic: academicDetailSchema,
    scopeFlags: z.array(z.string().max(40)).max(12).default([]),
    reviewerRequested: z.boolean().default(false),
    integrityAccepted: z.boolean(),
    noCredentialAccepted: z.boolean(),
    draftKey: z.string().uuid().nullable().optional(),
    idempotencyKey: z.string().min(8).max(64),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const createGeneralOrderSchema = z
  .object({
    serviceId: z.string().uuid(),
    packageId: z.string().uuid(),
    addonIds: z.array(z.string().uuid()).max(20).default([]),
    brief: z.object({
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().min(20).max(4000),
      deliverables: z.string().trim().max(2000).optional().default(""),
      references: z.string().trim().max(2000).optional().default(""),
      deadline_at: z.string().max(40).nullable().optional(),
    }),
    noCredentialAccepted: z.literal(true),
    draftKey: z.string().uuid().nullable().optional(),
    idempotencyKey: z.string().min(8).max(64),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const ATTACHMENT_TYPES = [
  "assignment_instruction",
  "rubric",
  "template",
  "draft",
  "dataset",
  "reference",
  "lecturer_feedback",
  "supporting_document",
] as const;

const ATTACHMENT_MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const attachmentUploadUrlSchema = z
  .object({
    draftKey: z.string().uuid(),
    mimeType: z.string().trim().min(3).max(120),
    sizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
  })
  .strict();

const attachmentRegisterSchema = z
  .object({
    draftKey: z.string().uuid(),
    attachmentType: z.enum(ATTACHMENT_TYPES),
    storagePath: z.string().min(3).max(400),
    originalName: z.string().min(1).max(200),
    mimeType: z.string().max(120).optional(),
    fileSize: z.number().int().min(1).max(20 * 1024 * 1024),
  })
  .strict();

const qrisTopupSchema = z.object({ amount: z.number().int().min(10_000).max(1_000_000) }).strict();
const topupIdSchema = z.object({ topupId: z.string().uuid() }).strict();
const manualTopupSchema = z
  .object({
    amount: z.number().int().min(10_000).max(1_000_000),
    methodId: z.string().min(1).max(40),
  })
  .strict();

const PROOF_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const PROOF_EXT: Record<(typeof PROOF_MIME)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const topupProofPrepSchema = z
  .object({
    topupId: z.string().uuid(),
    mimeType: z.enum(PROOF_MIME),
    sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
  })
  .strict();

const topupProofSubmitSchema = z
  .object({
    topupId: z.string().uuid(),
    filePath: z.string().min(3).max(300),
    senderName: z.string().trim().min(2).max(100),
  })
  .strict();

const articlesQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    tag: z.string().trim().max(40).optional(),
    page: z.coerce.number().int().min(0).max(200).default(0),
    pageSize: z.coerce.number().int().min(1).max(24).default(12),
  })
  .strict();

async function checkUserRate(
  userId: string,
  bucket: "order.create" | "topup.create" | "payment.proof",
) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return enforceRateLimit(userId, bucket);
}

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, " ").trim();
}

function marketplaceOrderError(message: string) {
  if (message.includes("SELF_PURCHASE_DENIED"))
    return "Anda tidak dapat membeli jasa dari toko sendiri.";
  if (message.includes("STALE_QUOTE"))
    return "Harga atau kesepakatan berubah. Muat ulang lalu periksa kembali sebelum memesan.";
  if (message.includes("SERVICE_UNAVAILABLE"))
    return "Jasa tidak tersedia. Toko, kategori, atau persetujuannya sudah berubah.";
  if (message.includes("REVISION_ALLOWANCE_EXHAUSTED"))
    return "Jatah revisi sudah habis. Ajukan komplain bila hasil tidak sesuai kesepakatan.";
  if (message.includes("COMPLAINT_ACTIVE"))
    return "Komplain sedang ditinjau admin. Tunggu keputusan.";
  if (message.includes("NO_EXTENSION"))
    return "Tidak ada pengajuan perpanjangan yang perlu dijawab.";
  if (message.includes("NOT_OVERDUE"))
    return "Tenggat belum lewat. Pembatalan tersedia setelah tenggat terlewati.";
  if (message.includes("INVALID_STATE"))
    return "Status pesanan saat ini tidak mengizinkan aksi ini. Muat ulang pesanan.";
  return "Aksi pesanan jasa gagal diproses. Muat ulang dan coba lagi.";
}

async function loadTopupMethodsConfig(): Promise<{
  methods: CustomPaymentMethod[];
  deadlineHours: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["custom_payment_methods", "topup_manual_deadline_hours"]);
  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    methods: parsePaymentMethods(map.get("custom_payment_methods") ?? []).filter(
      (m) => m.is_active && m.for_topup,
    ),
    deadlineHours: Math.min(72, Math.max(1, Number(map.get("topup_manual_deadline_hours") ?? 24))),
  };
}

const LEGAL_AND_HELP_CONTENT = {
  documents: [
    {
      slug: "syarat-ketentuan",
      title: "Syarat & Ketentuan",
      intro:
        "Ketentuan ini menjelaskan cara Ebrystore memproses pesanan dan apa yang diharapkan dari pengguna.",
      markdown: [
        "## Akun",
        "- Pemesanan memerlukan akun agar pesanan, pembayaran, dan hasil tercatat.",
        "- Kamu bertanggung jawab menjaga kerahasiaan akses akunmu.",
        "- Data pesanan hanya dapat dilihat pemilik akun dan staf yang berwenang.",
        "",
        "## Pemesanan dan Harga",
        "- Total pesanan dihitung ulang di sisi server saat pesanan dibuat.",
        "- Checkout dilakukan terpisah antara produk digital dan layanan.",
        "- Biaya admin, bila ada, ditampilkan sebagai baris terpisah pada rincian pesanan.",
        "",
        "## Pembayaran",
        "- Nominal transfer harus sama persis dengan total pesanan (BR-60).",
        "- Batas pembayaran manual 24 jam sejak pesanan dibuat; setelah itu pembayaran kedaluwarsa (BR-61).",
        "- Bukti transfer diverifikasi tim keuangan sebelum pesanan diproses (BR-63).",
        "- Unggah ulang bukti dibatasi 3 kali per pembayaran (BR-64).",
        "",
        "## Produk Digital",
        "- Akses unduhan terbit setelah pembayaran diverifikasi.",
        "- Kuota default 5 kali unduh dan masa aktif 365 hari, dapat berbeda per produk (BR-21).",
        "- File tidak untuk didistribusikan ulang tanpa izin pemilik hak.",
        "",
        "## Layanan",
        "- Estimasi waktu pengerjaan mengikuti paket yang dipilih dan mulai berjalan setelah kebutuhan lengkap.",
        "- Jumlah revisi gratis mengikuti paket; kelebihannya mengikuti ketentuan paket (BR-32).",
        "- Keterlambatan pengiriman kebutuhan dari pelanggan dapat menggeser estimasi penyelesaian.",
      ].join("\n"),
    },
    {
      slug: "kebijakan-privasi",
      title: "Kebijakan Privasi",
      intro:
        "Halaman ini menjelaskan data yang benar-benar diproses aplikasi Ebrystore saat kamu memakai layanannya.",
      markdown: [
        "## Data yang Dikumpulkan",
        "- Data akun: email, nama, dan nomor telepon bila kamu mengisinya.",
        "- Data pesanan: item yang dipesan, catatan kebutuhan, nilai pesanan, dan riwayat status.",
        "- Data pembayaran: bukti transfer yang kamu unggah beserta catatan verifikasinya.",
        "- Catatan aktivitas sistem untuk keperluan audit dan penanganan sengketa.",
        "",
        "## Penggunaan Data",
        "- Memproses pesanan, verifikasi pembayaran, dan pengiriman hasil.",
        "- Menyediakan riwayat pesanan dan akses produk digital pada akunmu.",
        "- Menangani revisi, sengketa, dan pengajuan refund.",
        "",
        "## Akses Data",
        "- Data pesanan hanya dapat diakses pemilik akun dan staf berwenang sesuai perannya.",
        "- Operator hanya melihat pesanan yang ditugaskan kepadanya.",
        "- Bukti pembayaran disimpan pada penyimpanan privat, bukan tautan publik.",
      ].join("\n"),
    },
    {
      slug: "kebijakan-refund",
      title: "Kebijakan Refund",
      intro:
        "Ketentuan berikut mengikuti aturan bisnis yang dipakai sistem Ebrystore saat memproses refund.",
      markdown: [
        "## Cara Mengajukan",
        "Refund diajukan dari halaman pesanan pada akunmu dengan mencantumkan alasan. Pengajuan masuk ke antrean peninjauan admin.",
        "",
        "## Ketentuan Utama",
        "- Refund parsial dimungkinkan dan wajib memiliki nominal, alasan, serta persetujuan admin (BR-40).",
        "- Total refund atas satu pesanan tidak boleh melebihi total yang sudah dibayar (BR-41).",
        "- Refund atas produk digital mencabut akses unduhan yang terkait pesanan tersebut (BR-42).",
        "- Setiap keputusan refund tercatat beserta alasannya pada riwayat pesanan.",
        "",
        "## Peninjauan",
        "Admin dapat menyetujui, menyetujui sebagian, atau menolak pengajuan disertai alasan. Status pengajuan terlihat pada halaman pesanan dan diperbarui saat keputusan dibuat.",
      ].join("\n"),
    },
  ],
  helpTopics: [
    {
      id: "beli-produk",
      audience: "buyer",
      icon: "package_search",
      cardTitle: "Beli produk digital",
      title: "Cara membeli produk digital",
      summary: "Dari memilih produk sampai akses unduhan terbit.",
      keywords: "produk digital beli checkout unduh file ebook template akun",
      markdown: [
        "1. Buka katalog **Produk digital** lalu pilih produk dan variasi yang sesuai kebutuhan.",
        "2. Ketuk **Beli sekarang**, atau simpan ke **Keranjang** bila ingin membandingkan beberapa produk.",
        "3. Lakukan pembayaran sesuai instruksi di halaman pembayaran (QRIS, ShopeePay, Saldo Ebrystore, atau transfer manual).",
        "4. Setelah pembayaran diverifikasi, akses unduhan atau kode lisensi terbit otomatis di menu **Produk saya**.",
      ].join("\n"),
    },
    {
      id: "pesan-layanan",
      audience: "buyer",
      icon: "briefcase",
      cardTitle: "Pesan jasa seller",
      title: "Cara memesan jasa seller",
      summary: "Bandingkan durasi, revisi, chat seller, lalu pesan.",
      keywords: "layanan jasa seller tugas paket brief revisi escrow dana ditahan",
      markdown: [
        "1. Buka **Jasa seller** dan bandingkan harga, durasi pengerjaan, serta jatah revisi.",
        "2. Periksa ruang lingkup pekerjaan, hasil yang diterima, serta pengecualian sebelum memesan.",
        "3. Isi detail kebutuhan pengerjaan selengkap mungkin agar proses berjalan lancar (tanpa menyertakan kata sandi akun).",
        "4. Selesaikan pembayaran. Dana ditahan sistem sampai hasil pekerjaan dikirim dan Anda terima.",
      ].join("\n"),
    },
    {
      id: "pembayaran",
      audience: "buyer",
      icon: "credit_card",
      cardTitle: "Pembayaran",
      title: "Cara pembayaran",
      summary: "Aturan nominal, batas waktu, dan bukti transfer.",
      keywords: "bayar pembayaran qris manual transfer bukti dana nominal batas waktu saldo topup",
      markdown: [
        "- Pembayaran dilakukan ke kanal yang ditampilkan pada halaman pembayaran pesanan.",
        "- Nominal transfer harus sama persis dengan total pesanan yang dihitung server.",
        "- Batas waktu pembayaran manual adalah 24 jam sejak pesanan dibuat.",
        "- Bukti transfer dapat berupa JPG, PNG, WEBP, atau PDF dengan ukuran maksimal 5 MB.",
        "- Unggah ulang bukti maksimal 3 kali per pembayaran.",
      ].join("\n"),
    },
    {
      id: "pantau-order",
      audience: "buyer",
      icon: "file_text",
      cardTitle: "Pantau pesanan",
      title: "Cara memantau pesanan",
      summary: "Status pesanan diperbarui otomatis di dashboard.",
      keywords: "pantau status order pesanan tracking progres",
      markdown:
        "Semua pesanan tercatat di menu **Pesanan saya**. Status diperbarui saat prosesnya berubah, mulai dari verifikasi pembayaran, pengerjaan, pengiriman hasil, hingga penyelesaian.",
    },
    {
      id: "unduh",
      audience: "buyer",
      icon: "download",
      cardTitle: "Unduh produk",
      title: "Cara mengunduh produk",
      summary: "Kuota 5 kali unduh, masa aktif 365 hari.",
      keywords: "unduh download kuota masa aktif akses file kode lisensi",
      markdown: [
        "- Akses unduhan atau kode muncul di menu **Produk saya** setelah pembayaran diverifikasi.",
        "- Kuota default adalah 5 kali unduh dengan masa aktif 365 hari sejak akses terbit.",
        "- Setiap aktivitas unduhan dicatat sistem demi keamanan akun Anda.",
      ].join("\n"),
    },
    {
      id: "revisi",
      audience: "buyer",
      icon: "rotate_ccw",
      cardTitle: "Minta revisi",
      title: "Cara meminta revisi",
      summary: "Jatah revisi mengikuti kesepakatan jasa.",
      keywords: "revisi perbaikan hasil paket jasa",
      markdown:
        "Ajukan revisi dari halaman progres pesanan saat hasil pengerjaan dikirim. Jumlah revisi gratis mengikuti kesepakatan jasa yang dipilih; permintaan di luar lingkup atau batas revisi memerlukan kesepakatan tambahan.",
    },
    {
      id: "refund",
      audience: "buyer",
      icon: "refresh_ccw",
      cardTitle: "Ajukan refund",
      title: "Cara mengajukan refund",
      summary: "Refund parsial dimungkinkan dengan persetujuan admin.",
      keywords: "refund pengembalian dana uang batal",
      markdown:
        "Ajukan refund dari halaman pesanan dengan menuliskan alasan yang jelas. Refund parsial dimungkinkan dan memerlukan persetujuan admin. Total refund atas satu pesanan tidak melebihi total yang sudah dibayar, dan refund produk digital akan mencabut akses unduhan terkait.",
    },
    {
      id: "dukungan",
      audience: "buyer",
      icon: "life_buoy",
      cardTitle: "Hubungi dukungan",
      title: "Cara menghubungi dukungan",
      summary: "Lewat pesanan terkait atau toko resmi Ebrystore.",
      keywords: "kontak dukungan bantuan support komplain chat admin",
      markdown: [
        "- Untuk masalah pesanan, buka pesanan terkait di **Pesanan saya** agar riwayat kasusnya terlihat langsung oleh tim kami.",
        "- Untuk pertanyaan umum, kunjungi profil **Ebrystore Official** dari katalog atau hubungi kanal dukungan resmi yang tertera.",
      ].join("\n"),
    },
    {
      id: "seller-buka-toko",
      audience: "seller",
      icon: "store",
      cardTitle: "Buka toko seller",
      title: "Cara membuka toko di Ebrystore",
      summary: "Daftar akun, lengkapi profil toko, lalu mulai berjualan.",
      keywords: "seller buka toko jualan daftar verifikasi profil toko",
      markdown: [
        "1. Daftar atau masuk akun melalui halaman **Masuk**.",
        "2. Lengkapi nama, slug, dan deskripsi toko Anda lewat menu Seller di web Ebrystore.",
        "3. Setelah toko aktif, halaman toko Anda dapat dikunjungi pembeli lengkap dengan daftar produk dan jasa yang tersedia.",
      ].join("\n"),
    },
    {
      id: "seller-publikasi",
      audience: "seller",
      icon: "package_plus",
      cardTitle: "Tayangkan produk & jasa",
      title: "Cara menayangkan produk dan jasa",
      summary: "Tulis detail jelas; setiap jasa ditinjau admin sebelum tayang.",
      keywords: "seller upload produk digital jasa moderasi review admin harga variasi",
      markdown: [
        "- Untuk produk digital, unggah berkas dan tentukan harga serta variasi bila diperlukan.",
        "- Untuk jasa seller, lengkapi ruang lingkup, pengecualian, durasi pengerjaan, dan batas revisi agar ekspektasi pembeli jelas sejak awal.",
        "- Setiap jasa seller ditinjau admin terlebih dahulu sebelum tayang di katalog publik.",
      ].join("\n"),
    },
    {
      id: "seller-chat-pesanan",
      audience: "seller",
      icon: "messages_square",
      cardTitle: "Chat & kelola pesanan",
      title: "Menangani chat pembeli dan pesanan masuk",
      summary: "Diskusikan kebutuhan di Chat dan kirim hasil lewat dashboard.",
      keywords: "seller chat pembeli pesanan order kirim hasil revisi",
      markdown:
        "Pembeli dapat menghubungi toko Anda sebelum memesan. Saat pesanan masuk, pantau statusnya di dashboard seller, kirim hasil pekerjaan sesuai durasi yang disepakati, dan tanggapi permintaan revisi dalam batas kesepakatan jasa.",
    },
    {
      id: "seller-saldo",
      audience: "seller",
      icon: "wallet",
      cardTitle: "Saldo & pendapatan",
      title: "Saldo toko dan pencairan pendapatan",
      summary: "Pendapatan masuk ke saldo toko setelah pembeli menerima hasil.",
      keywords: "seller saldo pendapatan withdraw pencairan rekening dana ditahan escrow",
      markdown:
        "Dana pembayaran pembeli ditahan sistem selama pengerjaan jasa berlangsung. Pendapatan baru dicatat ke saldo toko setelah pembeli menerima hasil atau transaksi dinyatakan selesai, kemudian dapat dipantau dan ditarik lewat menu keuangan toko.",
    },
  ],
};

export async function handleMobileSlice3Route(
  request: Request,
  path: string,
  method: string,
  url: URL,
  h: MobileSlice3Helpers,
): Promise<Response | null> {
  /* ------------------- Device Push Tokens ------------------- */
  if (path === "/api/mobile/v1/devices/push-token") {
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);

    const sb = auth.context.supabase as unknown as {
      from: (table: string) => any;
    };

    if (method === "POST") {
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = pushTokenRegisterSchema.safeParse(bodyRes.body);
      if (!parsed.success) return h.err("INVALID_INPUT", "Token perangkat tidak valid.", 400);

      const { error } = await sb.from("user_push_tokens").upsert(
        {
          user_id: auth.context.userId,
          token: parsed.data.token,
          platform: parsed.data.platform,
          app_version: parsed.data.appVersion ?? null,
          device_label: parsed.data.deviceLabel ?? null,
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "user_id,token" },
      );
      if (error) {
        if (error.code === "42P01") {
          return h.err(
            "PUSH_MIGRATION_PENDING",
            "Layanan notifikasi perangkat sedang disiapkan di server.",
            503,
          );
        }
        return h.err("PUSH_TOKEN_FAILED", "Gagal mendaftarkan token notifikasi.", 503);
      }
      return h.ok({ registered: true });
    }

    if (method === "DELETE") {
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = pushTokenDeleteSchema.safeParse(bodyRes.body);
      if (!parsed.success) return h.err("INVALID_INPUT", "Token perangkat tidak valid.", 400);

      const { error } = await sb
        .from("user_push_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", auth.context.userId)
        .eq("token", parsed.data.token);
      if (error && error.code !== "42P01") {
        return h.err("PUSH_TOKEN_FAILED", "Gagal mencabut token notifikasi.", 503);
      }
      return h.ok({ revoked: true });
    }

    return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
  }

  /* ------------------- Services Catalog & Detail ------------------- */
  if (path === "/api/mobile/v1/services") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const limited = await h.checkPublicRateLimit(request);
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const parsed = servicesListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return h.err("INVALID_QUERY", "Parameter layanan tidak valid.", 400);

    const { readCatalogCategories } = await import("./public-catalog.server");
    const { readPublicMarketplaceServices } = await import("./marketplace-service-catalog.server");
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();

    const loadPlatform = async () => {
      if (parsed.data.kind === "seller") {
        return { items: [], total: 0, nextPage: null as number | null };
      }
      let categoryId: string | null = null;
      if (parsed.data.category) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", parsed.data.category)
          .maybeSingle();
        categoryId = cat?.id ?? null;
        if (!categoryId) return { items: [], total: 0, nextPage: null as number | null };
      }
      const from = parsed.data.page * parsed.data.pageSize;
      const to = from + parsed.data.pageSize - 1;
      let query = supabase
        .from("services")
        .select(
          "id, name, slug, short_description, thumbnail_url, category:categories!services_category_id_fkey(slug, name), service_packages(id, name, price, estimated_days, free_revisions, is_active)",
          { count: "exact" },
        )
        .eq("status", "published")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      const term = parsed.data.q ? escapeLike(parsed.data.q) : "";
      if (term) query = query.or(`name.ilike.%${term}%,short_description.ilike.%${term}%`);
      if (categoryId)
        query = query.or(`academic_category_id.eq.${categoryId},category_id.eq.${categoryId}`);
      const { data: rows, count } = await query;
      const items = (rows ?? []).map((r: any) => {
        const pkgs = (r.service_packages ?? []).filter((p: any) => p.is_active !== false);
        const minPrice = pkgs.length ? Math.min(...pkgs.map((p: any) => Number(p.price))) : 0;
        const minDays = pkgs.length
          ? Math.min(...pkgs.map((p: any) => Number(p.estimated_days ?? 1)))
          : 1;
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          shortDescription: r.short_description ?? null,
          thumbnailUrl: r.thumbnail_url ?? null,
          category: r.category ?? null,
          startingPrice: minPrice,
          minEstimatedDays: minDays,
          packageCount: pkgs.length,
        };
      });
      const total = count ?? items.length;
      return {
        items,
        total,
        nextPage:
          items.length === parsed.data.pageSize && (parsed.data.page + 1) * parsed.data.pageSize < total
            ? parsed.data.page + 1
            : null,
      };
    };

    const loadSeller = async () => {
      if (parsed.data.kind === "platform") {
        return { items: [], total: 0, nextPage: null as number | null };
      }
      const res = await readPublicMarketplaceServices({
        q: parsed.data.q,
        category: parsed.data.category,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      });
      return {
        items: res.items.map((item) => ({
          ...item,
          media: item.media.map((m) => ({ ...m, url: serviceMediaUrl(m.path) })),
        })),
        total: res.total,
        nextPage: res.nextPage,
      };
    };

    const loadAll = async () => {
      const [categoriesRes, platform, seller] = await Promise.all([
        readCatalogCategories({ kind: "service" }),
        loadPlatform(),
        loadSeller(),
      ]);
      return {
        categories: categoriesRes.items ?? [],
        platformServices: platform.items,
        platformTotal: platform.total,
        platformNextPage: platform.nextPage,
        marketplaceServices: seller.items,
        marketplaceTotal: seller.total,
        marketplaceNextPage: seller.nextPage,
      };
    };

    const qNorm = (parsed.data.q ?? "").trim().toLowerCase();
    const payload =
      process.env.VITEST || qNorm.length > 40
        ? await loadAll()
        : await getOrLoad(
            "mobile:services",
            `${parsed.data.kind}|${parsed.data.category ?? ""}|${qNorm}|${parsed.data.page}|${parsed.data.pageSize}`,
            20_000,
            loadAll,
            { maxEntries: 64 },
          );

    return (h.okPublic ?? h.ok)(payload, 20, 60);
  }

  const platformDetailMatch = /^\/api\/mobile\/v1\/services\/platform\/([^/]+)$/.exec(path);
  if (
    platformDetailMatch &&
    !["quote", "orders", "attachments"].includes(platformDetailMatch[1])
  ) {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const slugRes = slugSchema.safeParse(decodeURIComponent(platformDetailMatch[1]));
    if (!slugRes.success) return h.err("INVALID_QUERY", "Slug layanan tidak valid.", 400);

    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { data: row, error } = await supabase
      .from("services")
      .select(
        "id, name, slug, short_description, description, thumbnail_url, requirements_note, order_capacity, supported_education_levels, supported_outputs, supported_citation_styles, requires_quality_review, allows_attachments, requires_rubric, requires_dataset, default_revision_limit, categories:academic_category_id(slug, name), category:categories!services_category_id_fkey(slug, name), service_packages(id, name, description, price, estimated_days, free_revisions, sla_hours, priority, is_active, sort_order, urgency_supported, quality_review_included, maximum_pages), service_addons(id, name, description, price, is_active, sort_order)",
      )
      .eq("slug", slugRes.data)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return h.err("SERVICE_UNAVAILABLE", "Detail layanan gagal dimuat.", 503);
    if (!row) return h.err("NOT_FOUND", "Layanan tidak ditemukan.", 404);

    const packages = (row.service_packages ?? [])
      .filter((p) => p.is_active !== false)
      .sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.price) - Number(b.price),
      );
    const addons = (row.service_addons ?? [])
      .filter((a) => a.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const { loadStoreCard } = await import("./store-card.server");
    const { seller, sellerStats } = await loadStoreCard(supabase, null).catch(() => ({
      seller: null,
      sellerStats: null,
    }));

    const isAcademic = isAcademicCategorySlug(
      (row.categories as { slug?: string | null } | null)?.slug,
    );

    return (h.okPublic ?? h.ok)(
      {
        service: {
          ...row,
          is_academic: isAcademic,
          service_packages: packages,
          service_addons: addons,
          seller,
          sellerStats,
        },
      },
      20,
      60,
    );
  }

  const sellerQuoteMatch = /^\/api\/mobile\/v1\/services\/seller\/([^/]+)\/quote$/.exec(path);
  if (sellerQuoteMatch) {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const idRes = uuidSchema.safeParse(decodeURIComponent(sellerQuoteMatch[1]));
    if (!idRes.success) return h.err("INVALID_QUERY", "ID jasa tidak valid.", 400);

    const { data: quote, error } = await auth.context.supabase.rpc(
      "quote_marketplace_service_order",
      { _service_id: idRes.data },
    );
    if (error || !quote) {
      return h.err("QUOTE_FAILED", marketplaceOrderError(error?.message ?? ""), 400);
    }
    const rawQuote = quote as Record<string, unknown>;
    const rawMedia = Array.isArray(rawQuote.media) ? rawQuote.media : null;
    const enrichedQuote = rawMedia
      ? {
          ...rawQuote,
          media: rawMedia.map((m: any) =>
            m && typeof m.path === "string" ? { ...m, url: serviceMediaUrl(m.path) } : m,
          ),
        }
      : rawQuote;
    return h.ok({ quote: enrichedQuote });
  }

  const sellerDetailMatch = /^\/api\/mobile\/v1\/services\/seller\/([^/]+)$/.exec(path);
  if (sellerDetailMatch && sellerDetailMatch[1] !== "orders") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const idRes = uuidSchema.safeParse(decodeURIComponent(sellerDetailMatch[1]));
    if (!idRes.success) return h.err("INVALID_QUERY", "ID jasa tidak valid.", 400);

    const { readPublicMarketplaceService } = await import("./marketplace-service-catalog.server");
    const res = await readPublicMarketplaceService(idRes.data);
    if (res.error) return h.err("SERVICE_UNAVAILABLE", res.error, 503);
    if (!res.service) return h.err("NOT_FOUND", "Jasa tidak ditemukan.", 404);

    return h.ok({
      service: {
        ...res.service,
        media: res.service.media.map((m) => ({ ...m, url: serviceMediaUrl(m.path) })),
      },
      related: res.related.map((item) => ({
        ...item,
        media: item.media.map((m) => ({ ...m, url: serviceMediaUrl(m.path) })),
      })),
      stats: res.stats,
    });
  }

  /* ------------------- Platform Service Quote, Attachments & Checkout ------------------- */
  if (path === "/api/mobile/v1/services/platform/quote") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = academicQuoteSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Parameter estimasi harga tidak valid.", 400);

    const tx = await import("./transaction.server");
    const { data: quote, error } = await auth.context.supabase.rpc("quote_academic_order", {
      _service_id: parsed.data.serviceId,
      _package_id: parsed.data.packageId,
      _addon_ids: parsed.data.addonIds,
      _deadline: (parsed.data.deadline ?? null) as unknown as string,
      _reviewer_requested: parsed.data.reviewerRequested,
    });
    if (error) return h.err("QUOTE_FAILED", tx.rpcErrorMessage(error.message), 400);
    return h.ok({ quote });
  }

  if (path === "/api/mobile/v1/services/platform/attachments/upload-url") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "order.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = attachmentUploadUrlSchema.safeParse(bodyRes.body);
    if (!parsed.success) {
      return h.err("INVALID_INPUT", "Data lampiran tidak valid (maksimal 20 MB).", 400);
    }
    const ext = ATTACHMENT_MIME_EXT[parsed.data.mimeType];
    if (!ext) {
      return h.err(
        "INVALID_FILE_TYPE",
        "Format lampiran tidak didukung. Gunakan PDF, DOCX, XLSX, PPTX, ZIP, TXT, CSV, JPG, atau PNG.",
        400,
      );
    }
    const filePath = `${auth.context.userId}/${parsed.data.draftKey}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("academic-order-attachments")
      .createSignedUploadUrl(filePath);
    if (error || !signed) {
      return h.err("UPLOAD_PREP_FAILED", "Gagal menyiapkan unggahan lampiran.", 503);
    }
    return h.ok({ path: filePath, token: signed.token, signedUrl: signed.signedUrl });
  }

  if (path === "/api/mobile/v1/services/platform/attachments/register") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = attachmentRegisterSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Metadata lampiran tidak valid.", 400);
    if (
      !parsed.data.storagePath.startsWith(`${auth.context.userId}/`) ||
      parsed.data.storagePath.includes("..")
    ) {
      return h.err("FORBIDDEN", "Jalur berkas tidak valid.", 403);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folder = parsed.data.storagePath.split("/").slice(0, -1).join("/");
    const filename = parsed.data.storagePath.split("/").pop() ?? "";
    const { data: listing, error: listErr } = await supabaseAdmin.storage
      .from("academic-order-attachments")
      .list(folder, { search: filename });
    const object = (listing ?? []).find((e) => e.name === filename);
    if (listErr || !object) {
      return h.err("FILE_NOT_UPLOADED", "Berkas belum terunggah sepenuhnya. Unggah ulang.", 400);
    }
    const actualSize = Number((object.metadata as { size?: number } | null)?.size ?? 0);
    const actualMime = String((object.metadata as { mimetype?: string } | null)?.mimetype ?? "");
    if (actualSize < 1 || actualSize > 20 * 1024 * 1024) {
      return h.err("INVALID_FILE_SIZE", "Ukuran berkas tidak sesuai batas (maks 20 MB).", 400);
    }

    const { data: row, error } = await auth.context.supabase
      .from("academic_order_attachments")
      .insert({
        draft_key: parsed.data.draftKey,
        uploaded_by: auth.context.userId,
        attachment_type: parsed.data.attachmentType,
        storage_path: parsed.data.storagePath,
        original_name: parsed.data.originalName,
        mime_type: actualMime || parsed.data.mimeType || null,
        file_size: actualSize,
      })
      .select("id, attachment_type, original_name, file_size, created_at")
      .maybeSingle();
    if (error || !row) return h.err("ATTACHMENT_SAVE_FAILED", "Lampiran gagal disimpan.", 503);
    return h.ok({ attachment: row });
  }

  if (path === "/api/mobile/v1/services/platform/attachments") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const draftKeyRes = uuidSchema.safeParse(url.searchParams.get("draftKey") ?? "");
    if (!draftKeyRes.success) return h.err("INVALID_QUERY", "draftKey tidak valid.", 400);
    const { data: rows, error } = await auth.context.supabase
      .from("academic_order_attachments")
      .select("id, attachment_type, original_name, file_size, created_at")
      .eq("draft_key", draftKeyRes.data)
      .eq("uploaded_by", auth.context.userId)
      .is("order_id", null)
      .order("created_at", { ascending: true });
    if (error) return h.err("ATTACHMENT_LIST_FAILED", "Daftar lampiran tidak dapat dimuat.", 503);
    return h.ok({ items: rows ?? [] });
  }

  const deleteAttachmentMatch = /^\/api\/mobile\/v1\/services\/platform\/attachments\/([^/]+)$/.exec(
    path,
  );
  if (
    deleteAttachmentMatch &&
    !["upload-url", "register"].includes(deleteAttachmentMatch[1])
  ) {
    if (method !== "DELETE") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const attIdRes = uuidSchema.safeParse(decodeURIComponent(deleteAttachmentMatch[1]));
    if (!attIdRes.success) return h.err("INVALID_QUERY", "ID lampiran tidak valid.", 400);
    const { data: deleted, error } = await auth.context.supabase
      .from("academic_order_attachments")
      .delete()
      .eq("id", attIdRes.data)
      .eq("uploaded_by", auth.context.userId)
      .is("order_id", null)
      .select("storage_path")
      .maybeSingle();
    if (error) return h.err("ATTACHMENT_DELETE_FAILED", "Lampiran gagal dihapus.", 503);
    if (!deleted) return h.err("NOT_FOUND", "Lampiran tidak ditemukan.", 404);
    if (deleted.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage
        .from("academic-order-attachments")
        .remove([deleted.storage_path])
        .catch(() => {});
    }
    return h.ok({ deleted: true });
  }

  if (path === "/api/mobile/v1/services/platform/orders/general") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "order.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = createGeneralOrderSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Formulir pesanan jasa belum lengkap.", 400);

    const { isFeatureEnabled } = await import("./website-settings.server");
    if (!(await isFeatureEnabled("feature_checkout"))) {
      return h.err("CHECKOUT_DISABLED", "Fitur checkout sedang dinonaktifkan sementara.", 503);
    }
    const text = [
      parsed.data.brief.description,
      parsed.data.brief.deliverables,
      parsed.data.brief.references,
      parsed.data.note,
    ]
      .filter(Boolean)
      .join("\n");
    if (looksLikeSecret(text)) {
      return h.err(
        "SECRET_DETECTED",
        "Brief tampak berisi kata sandi atau token rahasia. Hapus dulu sebelum memesan.",
        400,
      );
    }

    const tx = await import("./transaction.server");
    const dynamicRpc = auth.context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data: result, error } = await dynamicRpc.rpc("create_general_service_order", {
      _service_id: parsed.data.serviceId,
      _package_id: parsed.data.packageId,
      _addon_ids: parsed.data.addonIds,
      _brief: { ...parsed.data.brief, deadline_at: parsed.data.brief.deadline_at || null },
      _no_credential_accepted: parsed.data.noCredentialAccepted,
      _draft_key: parsed.data.draftKey ?? null,
      _idempotency_key: parsed.data.idempotencyKey,
      _customer_note: parsed.data.note ?? null,
    });
    if (error || !result) {
      return h.err("ORDER_CREATE_FAILED", tx.rpcErrorMessage(error?.message ?? ""), 400);
    }
    const r = result as { order_id: string; order_number: string; duplicate?: boolean };
    return h.ok({ orderId: r.order_id, orderNumber: r.order_number, duplicate: Boolean(r.duplicate) });
  }

  if (path === "/api/mobile/v1/services/platform/orders/academic") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "order.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = createAcademicOrderSchema.safeParse(bodyRes.body);
    if (!parsed.success) {
      return h.err("INVALID_INPUT", "Formulir layanan akademik belum lengkap atau tidak valid.", 400);
    }

    const { isFeatureEnabled, readServerSetting } = await import("./website-settings.server");
    for (const flag of ["feature_checkout", "feature_academic_services"]) {
      if (!(await isFeatureEnabled(flag))) {
        return h.err("FEATURE_DISABLED", "Fitur ini sedang dinonaktifkan sementara oleh admin.", 503);
      }
    }
    const requireIntegrity = (await readServerSetting("academic_integrity_confirmation")) !== false;
    if (requireIntegrity && !parsed.data.integrityAccepted) {
      return h.err(
        "INTEGRITY_REQUIRED",
        "Konfirmasi integritas akademik wajib disetujui sebelum memesan.",
        400,
      );
    }

    const tx = await import("./transaction.server");
    const { data: result, error } = await auth.context.supabase.rpc("create_academic_order", {
      _service_id: parsed.data.serviceId,
      _package_id: parsed.data.packageId,
      _addon_ids: parsed.data.addonIds,
      _academic: parsed.data.academic,
      _scope_flags: parsed.data.scopeFlags,
      _reviewer_requested: parsed.data.reviewerRequested,
      _integrity_accepted: parsed.data.integrityAccepted,
      _no_credential_accepted: parsed.data.noCredentialAccepted,
      _draft_key: (parsed.data.draftKey ?? null) as unknown as string,
      _idempotency_key: parsed.data.idempotencyKey,
      _customer_note: (parsed.data.note ?? null) as unknown as string,
    });
    if (error || !result) {
      return h.err("ORDER_CREATE_FAILED", tx.rpcErrorMessage(error?.message ?? ""), 400);
    }
    const r = result as {
      order_id: string;
      order_number: string;
      duplicate?: boolean;
      urgency_level?: string;
    };
    return h.ok({
      orderId: r.order_id,
      orderNumber: r.order_number,
      duplicate: Boolean(r.duplicate),
      urgencyLevel: r.urgency_level ?? null,
    });
  }

  /* ------------------- Seller Service Checkout ------------------- */
  if (path === "/api/mobile/v1/services/seller/orders") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "order.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const rawBody = (bodyRes.body ?? {}) as Record<string, unknown>;
    const useCredit = rawBody.useCredit === true;
    const { useCredit: _ignoredUseCredit, ...checkoutInput } = rawBody;
    const parsed = marketplaceServiceCheckoutSchema.safeParse(checkoutInput);
    if (!parsed.success) {
      return h.err(
        "INVALID_INPUT",
        "Isi kebutuhan minimal 10 karakter dan setujui kesepakatan jasa.",
        400,
      );
    }

    const { data: result, error } = await auth.context.supabase.rpc(
      "create_marketplace_service_order",
      {
        _service_id: parsed.data.serviceId,
        _idempotency_key: parsed.data.idempotencyKey,
        _expected_version: parsed.data.expectedVersion,
        _expected_total: parsed.data.expectedTotal,
        _requirements: parsed.data.requirements,
        _agreement_accepted: parsed.data.agreementAccepted,
      },
    );
    if (error || !result) {
      const stale = Boolean(error?.message?.includes("STALE_QUOTE"));
      return h.err(
        stale ? "STALE_QUOTE" : "ORDER_CREATE_FAILED",
        marketplaceOrderError(error?.message ?? ""),
        stale ? 409 : 400,
      );
    }
    const r = result as { order_id: string; order_number: string; duplicate?: boolean };
    let creditUsed = 0;
    let amountDue: number | null = null;
    let creditWarning: string | null = null;
    if (useCredit) {
      const { data: creditRes, error: creditErr } = await auth.context.supabase.rpc(
        "apply_credit_to_order",
        {
          _order_id: r.order_id,
          _max_credit: null as unknown as number,
        },
      );
      if (creditErr) {
        creditWarning =
          "Pesanan dibuat, tetapi saldo gagal diterapkan otomatis. Kamu bisa menerapkan saldo di halaman pembayaran.";
      } else if (creditRes) {
        creditUsed = Number((creditRes as { credit_used?: number }).credit_used ?? 0);
        amountDue = Number((creditRes as { amount_due?: number }).amount_due ?? 0);
      }
    }
    return h.ok({
      orderId: r.order_id,
      orderNumber: r.order_number,
      duplicate: Boolean(r.duplicate),
      ...(useCredit ? { creditUsed, amountDue } : {}),
      ...(creditWarning ? { creditWarning } : {}),
    });
  }

  /* ------------------- Buyer Service Order Detail & Actions ------------------- */
  const serviceOrderMatch =
    /^\/api\/mobile\/v1\/orders\/([^/]+)\/service(?:\/(accept|revision|extension|complaint|cancel-overdue))?$/.exec(
      path,
    );
  if (serviceOrderMatch) {
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const orderIdRes = uuidSchema.safeParse(decodeURIComponent(serviceOrderMatch[1]));
    if (!orderIdRes.success) return h.err("INVALID_QUERY", "ID pesanan tidak valid.", 400);
    const orderId = orderIdRes.data;
    const subAction = serviceOrderMatch[2];

    if (!subAction) {
      if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const { data: order } = await auth.context.supabase
        .from("orders")
        .select("id, order_number, order_type, status, total, paid_at, completed_at, created_at, customer_note")
        .eq("id", orderId)
        .eq("user_id", auth.context.userId)
        .maybeSingle();
      if (!order) return h.err("ORDER_NOT_FOUND", "Pesanan tidak ditemukan.", 404);

      if (order.order_type === "marketplace_service") {
        const [contract, deliveries, events] = await Promise.all([
          auth.context.supabase
            .from("marketplace_service_orders")
            .select("*")
            .eq("order_id", order.id)
            .maybeSingle(),
          auth.context.supabase
            .from("marketplace_service_deliveries")
            .select("id, order_id, version, kind, url, note, summary, original_name, mime_type, file_size, created_at")
            .eq("order_id", order.id)
            .order("version", { ascending: false }),
          auth.context.supabase
            .from("marketplace_service_events")
            .select("id, order_id, event_type, actor_role, payload, created_at")
            .eq("order_id", order.id)
            .order("id", { ascending: true }),
        ]);
        return h.ok({
          kind: "marketplace_service",
          order,
          contract: contract.data ?? null,
          deliveries: deliveries.data ?? [],
          events: events.data ?? [],
        });
      }

      if (order.order_type === "service") {
        const [assignment, progress, results, revisions, serviceDetail] = await Promise.all([
          auth.context.supabase
            .from("operator_assignments")
            .select(
              "id, operator_id, status, assigned_at, accepted_at, started_at, completed_at, deadline_at",
            )
            .eq("order_id", order.id)
            .order("assigned_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          auth.context.supabase
            .from("job_progress")
            .select("id, percent, note, is_public, created_at")
            .eq("order_id", order.id)
            .order("created_at", { ascending: false }),
          auth.context.supabase
            .from("job_results")
            .select("id, version, summary, delivery_note, result_url, status, submitted_at, reviewed_at")
            .eq("order_id", order.id)
            .order("version", { ascending: false }),
          auth.context.supabase
            .from("job_revisions")
            .select("id, sequence, reason, status, is_chargeable, created_at, resolved_at")
            .eq("order_id", order.id)
            .order("sequence", { ascending: false }),
          auth.context.supabase
            .from("service_order_details")
            .select(
              "package_snapshot, addons_snapshot, requirements_note, estimated_days, revision_allowance, internal_deadline",
            )
            .eq("order_id", order.id)
            .maybeSingle(),
        ]);
        let operatorName: string | null = null;
        if (assignment.data?.operator_id) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: op } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", assignment.data.operator_id)
            .maybeSingle();
          operatorName = op?.full_name ?? null;
        }
        return h.ok({
          kind: "platform_service",
          order,
          assignment: assignment.data ?? null,
          operatorName,
          progress: progress.data ?? [],
          results: results.data ?? [],
          revisions: revisions.data ?? [],
          serviceDetail: serviceDetail.data ?? null,
        });
      }

      return h.err("NOT_SERVICE_ORDER", "Pesanan ini bukan pesanan jasa.", 400);
    }

    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const limited = await checkUserRate(auth.context.userId, "order.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const rawBody = (bodyRes.body ?? {}) as Record<string, unknown>;

    const { data: order } = await auth.context.supabase
      .from("orders")
      .select("id, order_type")
      .eq("id", orderId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();
    if (!order) return h.err("ORDER_NOT_FOUND", "Pesanan tidak ditemukan.", 404);

    if (order.order_type === "service") {
      const tx = await import("./transaction.server");
      if (subAction === "accept") {
        const { error } = await auth.context.supabase.rpc("review_job_result", {
          _order_id: orderId,
          _decision: "approve",
          _reason: undefined,
        });
        if (error) return h.err("ACTION_FAILED", tx.rpcErrorMessage(error.message), 400);
        return h.ok({ updated: true });
      }
      if (subAction === "revision") {
        const reason = typeof rawBody.reason === "string" ? rawBody.reason.trim() : "";
        if (reason.length < 5) return h.err("INVALID_INPUT", "Alasan revisi minimal 5 karakter.", 400);
        const { error } = await auth.context.supabase.rpc("review_job_result", {
          _order_id: orderId,
          _decision: "revision",
          _reason: reason,
        });
        if (error) return h.err("ACTION_FAILED", tx.rpcErrorMessage(error.message), 400);
        return h.ok({ updated: true });
      }
      return h.err("INVALID_ACTION", "Aksi ini khusus untuk pesanan jasa seller.", 400);
    }

    if (subAction === "accept") {
      const parsed = marketplaceServiceAcceptSchema.safeParse({
        orderId,
        deliveryId: rawBody.deliveryId,
      });
      if (!parsed.success) return h.err("INVALID_INPUT", "ID hasil pekerjaan tidak valid.", 400);
      const { error } = await auth.context.supabase.rpc("accept_service_delivery", {
        _order_id: parsed.data.orderId,
        _delivery_id: parsed.data.deliveryId,
      });
      if (error) return h.err("ACTION_FAILED", marketplaceOrderError(error.message), 400);
      return h.ok({ updated: true });
    }

    if (subAction === "revision") {
      const parsed = marketplaceServiceRevisionSchema.safeParse({
        orderId,
        deliveryId: rawBody.deliveryId,
        reason: rawBody.reason,
      });
      if (!parsed.success) {
        return h.err("INVALID_INPUT", "Alasan revisi minimal 10 karakter.", 400);
      }
      const { error } = await auth.context.supabase.rpc("request_service_revision", {
        _order_id: parsed.data.orderId,
        _delivery_id: parsed.data.deliveryId,
        _reason: parsed.data.reason,
      });
      if (error) return h.err("ACTION_FAILED", marketplaceOrderError(error.message), 400);
      return h.ok({ updated: true });
    }

    if (subAction === "extension") {
      const parsed = marketplaceServiceExtensionResponseSchema.safeParse({
        orderId,
        approve: rawBody.approve,
      });
      if (!parsed.success) return h.err("INVALID_INPUT", "Keputusan perpanjangan tidak valid.", 400);
      const { error } = await auth.context.supabase.rpc("respond_service_extension", {
        _order_id: parsed.data.orderId,
        _approve: parsed.data.approve,
      });
      if (error) return h.err("ACTION_FAILED", marketplaceOrderError(error.message), 400);
      return h.ok({ updated: true });
    }

    if (subAction === "complaint") {
      const parsed = marketplaceServiceComplaintSchema.safeParse({
        orderId,
        reason: rawBody.reason,
        ...(rawBody.deliveryId ? { deliveryId: rawBody.deliveryId } : {}),
      });
      if (!parsed.success) {
        return h.err("INVALID_INPUT", "Alasan komplain minimal 10 karakter.", 400);
      }
      const { error } = await auth.context.supabase.rpc("open_service_complaint", {
        _order_id: parsed.data.orderId,
        _reason: parsed.data.reason,
        _delivery_id: parsed.data.deliveryId ?? undefined,
      });
      if (error) return h.err("ACTION_FAILED", marketplaceOrderError(error.message), 400);
      return h.ok({ updated: true });
    }

    if (subAction === "cancel-overdue") {
      const parsed = marketplaceServiceCancelOverdueSchema.safeParse({
        orderId,
        reason: typeof rawBody.reason === "string" ? rawBody.reason : "",
      });
      if (!parsed.success) return h.err("INVALID_INPUT", "Data pembatalan tidak valid.", 400);
      const { error } = await auth.context.supabase.rpc("cancel_overdue_service_order", {
        _order_id: parsed.data.orderId,
        _reason: parsed.data.reason || undefined,
      });
      if (error) return h.err("ACTION_FAILED", marketplaceOrderError(error.message), 400);
      return h.ok({ updated: true });
    }
  }

  const deliveryDownloadMatch =
    /^\/api\/mobile\/v1\/orders\/service-deliveries\/([^/]+)\/download$/.exec(path);
  if (deliveryDownloadMatch) {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const delIdRes = uuidSchema.safeParse(decodeURIComponent(deliveryDownloadMatch[1]));
    if (!delIdRes.success) return h.err("INVALID_QUERY", "ID berkas tidak valid.", 400);

    const { data: delivery } = await auth.context.supabase
      .from("marketplace_service_deliveries")
      .select("id, order_id, kind, storage_path, original_name")
      .eq("id", delIdRes.data)
      .maybeSingle();
    if (!delivery || delivery.kind !== "file" || !delivery.storage_path) {
      return h.err("NOT_FOUND", "Berkas hasil pekerjaan tidak ditemukan.", 404);
    }
    const { data: allowed } = await auth.context.supabase.rpc("is_service_order_buyer", {
      _order_id: delivery.order_id,
    });
    if (allowed !== true) {
      return h.err("FORBIDDEN", "Tidak berhak mengunduh berkas ini.", 403);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("service-deliveries")
      .createSignedUrl(
        delivery.storage_path,
        300,
        delivery.original_name ? { download: delivery.original_name } : undefined,
      );
    if (error || !signed) {
      return h.err("DOWNLOAD_UNAVAILABLE", "Gagal menyiapkan tautan unduhan berkas.", 503);
    }
    return h.ok({
      url: signed.signedUrl,
      filename: delivery.original_name || "hasil-jasa",
    });
  }

  /* ------------------- Wallet & Top-Up ------------------- */
  if (path === "/api/mobile/v1/wallet") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);

    const { loadPaymentMethods } = await import("./transaction.server");
    const [balRes, ledgerRes, methodsCfg, flags, pendingRes] = await Promise.all([
      auth.context.supabase.rpc("get_my_credit_balance"),
      auth.context.supabase
        .from("credit_ledger")
        .select("id, direction, amount, source_type, reference, note, created_at")
        .eq("user_id", auth.context.userId)
        .order("created_at", { ascending: false })
        .limit(40),
      loadTopupMethodsConfig(),
      loadPaymentMethods(),
      (auth.context.supabase as any)
        .from("credit_topups")
        .select("id, topup_number, amount, expires_at, method_snapshot, proof_submitted_at, status")
        .eq("user_id", auth.context.userId)
        .eq("provider", "manual")
        .eq("status", "waiting_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const pendingRow = pendingRes?.data;
    return h.ok({
      balance: Number(balRes.data ?? 0),
      ledger: ledgerRes.data ?? [],
      qrisAvailable: Boolean(flags.qris),
      manualMethods: methodsCfg.methods,
      pendingManualTopup: pendingRow
        ? {
            id: String(pendingRow.id),
            topupNumber: String(pendingRow.topup_number),
            amount: Number(pendingRow.amount),
            expiresAt: String(pendingRow.expires_at ?? ""),
            method: pendingRow.method_snapshot as CustomPaymentMethod,
            proofSubmitted: Boolean(pendingRow.proof_submitted_at),
            proofSubmittedAt: (pendingRow.proof_submitted_at as string | null) ?? null,
          }
        : null,
    });
  }

  if (path === "/api/mobile/v1/wallet/topup/qris") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "topup.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = qrisTopupSchema.safeParse(bodyRes.body);
    if (!parsed.success) {
      return h.err("INVALID_INPUT", "Nominal isi saldo minimal Rp10.000 dan maksimal Rp1.000.000.", 400);
    }

    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) return h.err("QRIS_UNAVAILABLE", "Pembayaran QRIS belum dikonfigurasi.", 503);

    const { data: topup, error } = await auth.context.supabase.rpc("create_credit_topup", {
      _amount: parsed.data.amount,
    });
    if (error || !topup) {
      return h.err("TOPUP_FAILED", "Isi saldo tidak dapat dibuat. Coba lagi.", 400);
    }
    const row = topup as { id: string; topup_number: string };
    const created = await sumopod.createQrisPayment(cfg, String(row.topup_number), parsed.data.amount);
    if (!created) {
      return h.err("PROVIDER_ERROR", "QRIS sedang tidak dapat dibuat. Coba lagi sebentar lagi.", 502);
    }
    const qr = await sumopod.fetchQrPayload(created.paymentLinkUrl);
    const qris = {
      providerPaymentId: created.paymentId,
      payUrl: created.paymentLinkUrl,
      amount: created.netAmount || parsed.data.amount,
      fee: created.fee,
      total: created.amount || parsed.data.amount,
      expiredAt:
        qr?.expiresAt ?? created.expiresAt ?? new Date(Date.now() + 60 * 60_000).toISOString(),
      ...(qr?.qrString ? { qrString: qr.qrString } : {}),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: attachError } = await supabaseAdmin.rpc("attach_credit_topup_qris", {
      _topup_id: row.id,
      _provider: "sumopod",
      _provider_payment_id: created.paymentId,
      _payment_url: qris.payUrl,
      _qr_reference: JSON.stringify(qris),
    });
    if (attachError) {
      return h.err("TOPUP_ATTACH_FAILED", "QRIS dibuat namun gagal disimpan. Coba lagi.", 503);
    }
    return h.ok({
      topupId: String(row.id),
      topupNumber: String(row.topup_number),
      qris,
    });
  }

  if (path === "/api/mobile/v1/wallet/topup/qris/check") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = topupIdSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "ID isi saldo tidak valid.", 400);

    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) return h.err("QRIS_UNAVAILABLE", "Pembayaran QRIS belum dikonfigurasi.", 503);

    const { data: topup } = await auth.context.supabase
      .from("credit_topups")
      .select("id, status, amount, provider_payment_id, qr_reference")
      .eq("id", parsed.data.topupId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();
    if (!topup) return h.err("NOT_FOUND", "Isi saldo tidak ditemukan.", 404);
    if (topup.status === "paid") return h.ok({ status: "paid" });
    if (topup.status !== "waiting_payment") return h.ok({ status: String(topup.status) });

    let providerId = topup.provider_payment_id as string | null;
    if (!providerId && topup.qr_reference) {
      try {
        providerId = (JSON.parse(topup.qr_reference) as { providerPaymentId?: string })
          .providerPaymentId ?? null;
      } catch {
        providerId = null;
      }
    }
    if (!providerId) return h.ok({ status: "waiting_payment" });

    const detail = await sumopod.getPaymentStatus(cfg, providerId);
    if (!detail) return h.ok({ status: "waiting_payment" });
    if (!["completed", "paid", "success", "settled"].includes(detail.status.toLowerCase())) {
      return h.ok({ status: detail.status });
    }

    const { settleCreditTopup } = await import("./credit-topup.server");
    const settled = await settleCreditTopup(String(topup.id), providerId, Number(topup.amount));
    if (!settled.ok) {
      return h.err("SETTLE_FAILED", "Pembayaran terdeteksi, namun gagal diproses.", 500);
    }
    return h.ok({ status: "paid" });
  }

  if (path === "/api/mobile/v1/wallet/topup/manual") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "topup.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = manualTopupSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Nominal atau metode isi saldo tidak valid.", 400);

    const { methods, deadlineHours } = await loadTopupMethodsConfig();
    const selectedMethod = methods.find((m) => m.id === parsed.data.methodId);
    if (!selectedMethod) return h.err("METHOD_UNAVAILABLE", "Metode pembayaran tidak tersedia.", 404);

    const { data: topup, error } = await auth.context.supabase.rpc("create_credit_topup", {
      _amount: parsed.data.amount,
    });
    if (error || !topup) return h.err("TOPUP_FAILED", "Isi saldo tidak dapat dibuat.", 400);

    const row = topup as { id: string; topup_number: string };
    const expiresAt = new Date(Date.now() + deadlineHours * 3_600_000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updErr } = await (supabaseAdmin as any)
      .from("credit_topups")
      .update({ provider: "manual", method_snapshot: selectedMethod, expires_at: expiresAt })
      .eq("id", row.id)
      .eq("user_id", auth.context.userId)
      .eq("status", "waiting_payment");
    if (updErr) {
      await (supabaseAdmin as any).from("credit_topups").update({ status: "cancelled" }).eq("id", row.id);
      return h.err("TOPUP_FAILED", "Isi saldo gagal disiapkan.", 503);
    }
    return h.ok({
      topup: {
        id: String(row.id),
        topupNumber: String(row.topup_number),
        amount: parsed.data.amount,
        expiresAt,
        method: selectedMethod,
        proofSubmitted: false,
      },
    });
  }

  if (path === "/api/mobile/v1/wallet/topup/manual/proof-upload-url") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "payment.proof");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = topupProofPrepSchema.safeParse(bodyRes.body);
    if (!parsed.success) {
      return h.err("INVALID_INPUT", "Format atau ukuran bukti transfer tidak valid (maks 5 MB).", 400);
    }

    const { data: topup } = await (auth.context.supabase as any)
      .from("credit_topups")
      .select("id, status, provider, expires_at, proof_submitted_at")
      .eq("id", parsed.data.topupId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();
    if (!topup || topup.provider !== "manual" || topup.status !== "waiting_payment") {
      return h.err("PROOF_NOT_ALLOWED", "Isi saldo tidak menerima bukti transfer.", 409);
    }
    if (topup.expires_at && new Date(topup.expires_at).getTime() <= Date.now()) {
      return h.err("TOPUP_EXPIRED", "Batas waktu pembayaran isi saldo sudah berakhir.", 409);
    }
    if (topup.proof_submitted_at) {
      return h.err("ALREADY_SUBMITTED", "Bukti transfer sudah dikirim dan menunggu verifikasi.", 409);
    }
    const filePath = `${auth.context.userId}/topup-${topup.id}/${crypto.randomUUID()}.${PROOF_EXT[parsed.data.mimeType]}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUploadUrl(filePath);
    if (error || !signed) return h.err("UPLOAD_PREP_FAILED", "Gagal menyiapkan unggahan.", 503);
    return h.ok({ path: filePath, token: signed.token, signedUrl: signed.signedUrl });
  }

  if (path === "/api/mobile/v1/wallet/topup/manual/submit") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "payment.proof");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = topupProofSubmitSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Data bukti transfer tidak valid.", 400);
    if (
      !parsed.data.filePath.startsWith(`${auth.context.userId}/topup-${parsed.data.topupId}/`) ||
      parsed.data.filePath.includes("..")
    ) {
      return h.err("FORBIDDEN", "Berkas bukti tidak valid.", 403);
    }

    const { rpcErrorMessage } = await import("./transaction.server");
    const { error } = await (auth.context.supabase as any).rpc("submit_manual_topup_proof", {
      _topup_id: parsed.data.topupId,
      _file_path: parsed.data.filePath,
      _sender_name: parsed.data.senderName,
    });
    if (error) return h.err("PROOF_SUBMIT_FAILED", rpcErrorMessage(error.message), 400);
    return h.ok({ submitted: true });
  }

  const manualTopupStatusMatch = /^\/api\/mobile\/v1\/wallet\/topup\/manual\/([^/]+)$/.exec(path);
  if (
    manualTopupStatusMatch &&
    !["proof-upload-url", "submit"].includes(manualTopupStatusMatch[1])
  ) {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const idRes = uuidSchema.safeParse(decodeURIComponent(manualTopupStatusMatch[1]));
    if (!idRes.success) return h.err("INVALID_QUERY", "ID isi saldo tidak valid.", 400);
    const { data: row, error } = await (auth.context.supabase as any)
      .from("credit_topups")
      .select(
        "id, topup_number, status, amount, expires_at, proof_submitted_at, review_note, paid_at, method_snapshot",
      )
      .eq("id", idRes.data)
      .eq("user_id", auth.context.userId)
      .maybeSingle();
    if (error) return h.err("TOPUP_STATUS_UNAVAILABLE", "Status isi saldo gagal dimuat.", 503);
    if (!row) return h.err("NOT_FOUND", "Isi saldo tidak ditemukan.", 404);
    return h.ok({
      id: String(row.id),
      topupNumber: String(row.topup_number ?? ""),
      status: String(row.status ?? "waiting_payment"),
      amount: Number(row.amount ?? 0),
      expiresAt: String(row.expires_at ?? ""),
      proofSubmitted: Boolean(row.proof_submitted_at),
      proofSubmittedAt: (row.proof_submitted_at as string | null) ?? null,
      reviewNote: (row.review_note as string | null) ?? null,
      paidAt: (row.paid_at as string | null) ?? null,
      method: (row.method_snapshot as CustomPaymentMethod | null) ?? null,
    });
  }

  /* ------------------- Saved (Liked Products & Followed Stores) ------------------- */
  if (path === "/api/mobile/v1/social/saved") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);

    const { readPresenceMap } = await import("./store-presence");
    const [follows, likes, presence] = await Promise.all([
      auth.context.supabase
        .from("store_follows")
        .select("created_at, stores(id, name, slug, logo_url, is_platform)")
        .eq("user_id", auth.context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      auth.context.supabase
        .from("product_likes")
        .select(
          "created_at, digital_products(id, name, slug, short_description, thumbnail_url, price, discount_price, sold_count, store_id, stores(name, slug, logo_url, is_platform))",
        )
        .eq("user_id", auth.context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      readPresenceMap(auth.context.supabase),
    ]);
    if (follows.error || likes.error) {
      return h.err("SAVED_UNAVAILABLE", "Daftar tersimpan tidak dapat dimuat.", 503);
    }
    return h.ok({
      stores: (follows.data ?? [])
        .map((r: any) => r.stores)
        .filter(Boolean)
        .map((s: any) => ({ ...s, presence: presence.get(s.id) ?? { online: false, lastSeenAt: null } })),
      products: (likes.data ?? [])
        .map((r: any) => r.digital_products)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          short_description: p.short_description ?? null,
          thumbnail_url: p.thumbnail_url ?? null,
          price: Number(p.price ?? 0),
          discount_price: p.discount_price == null ? null : Number(p.discount_price),
          sold_count: Number(p.sold_count ?? 0),
          store_name: p.stores?.name ?? (p.store_id ? null : "Ebrystore"),
          store_slug: p.stores?.slug ?? null,
          store_logo_url: p.stores?.logo_url ?? null,
          is_official: !p.store_id || Boolean(p.stores?.is_platform),
          store_presence: presence.get(p.store_id ?? null),
        })),
    });
  }

  /* ------------------- Editorial: Articles & Legal/Help ------------------- */
  if (path === "/api/mobile/v1/articles") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const limited = await h.checkPublicRateLimit(request);
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const parsed = articlesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return h.err("INVALID_QUERY", "Parameter artikel tidak valid.", 400);

    const { page, pageSize } = parsed.data;
    const loadArticles = async () => {
      const { createPublicClient } = await import("./supabase-public.server");
      const supabase = createPublicClient();
      let query = supabase
        .from("articles")
        .select(
          "id, title, slug, excerpt, cover_url, tags, reading_minutes, author_name, published_at, view_count",
          { count: "exact" },
        )
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      const term = parsed.data.q ? escapeLike(parsed.data.q) : "";
      if (term) query = query.or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`);
      if (parsed.data.tag) query = query.contains("tags", [parsed.data.tag]);

      const { data: rows, error, count } = await query;
      if (error) {
        if (error.code === "PGRST103" || /range not satisfiable/i.test(error.message ?? "")) {
          return { error: null, payload: { items: [], total: count ?? 0, page, nextPage: null } };
        }
        return { error: "ARTICLES_UNAVAILABLE" as const, payload: null };
      }
      const items = rows ?? [];
      const total = count ?? items.length;
      return {
        error: null,
        payload: {
          items,
          total,
          page,
          nextPage: items.length === pageSize && (page + 1) * pageSize < total ? page + 1 : null,
        },
      };
    };

    const qNorm = (parsed.data.q ?? "").trim().toLowerCase();
    const res =
      process.env.VITEST || qNorm.length > 40
        ? await loadArticles()
        : await getOrLoad(
            "mobile:articles",
            `${qNorm}|${parsed.data.tag ?? ""}|${page}|${pageSize}`,
            30_000,
            loadArticles,
            { maxEntries: 32, shouldCache: (v) => v.error === null },
          );
    if (res.error || !res.payload) {
      return h.err("ARTICLES_UNAVAILABLE", "Artikel tidak dapat dimuat.", 503);
    }
    return (h.okPublic ?? h.ok)(res.payload, 30, 120);
  }

  const articleMatch = /^\/api\/mobile\/v1\/articles\/([^/]+)$/.exec(path);
  if (articleMatch) {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const slugRes = slugSchema.safeParse(decodeURIComponent(articleMatch[1]));
    if (!slugRes.success) return h.err("INVALID_QUERY", "Slug artikel tidak valid.", 400);

    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { data: article, error } = await supabase
      .from("articles")
      .select(
        "id, title, slug, excerpt, cover_url, tags, reading_minutes, author_name, published_at, view_count, content",
      )
      .eq("slug", slugRes.data)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return h.err("ARTICLE_UNAVAILABLE", "Artikel tidak dapat dimuat.", 503);
    if (!article) return h.err("NOT_FOUND", "Artikel tidak ditemukan.", 404);

    const { data: related } = await supabase
      .from("articles")
      .select(
        "id, title, slug, excerpt, cover_url, tags, reading_minutes, author_name, published_at, view_count",
      )
      .eq("status", "published")
      .is("deleted_at", null)
      .neq("id", article.id)
      .order("published_at", { ascending: false })
      .limit(3);

    return (h.okPublic ?? h.ok)({ article, related: related ?? [] }, 30, 120);
  }

  if (path === "/api/mobile/v1/content/legal") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    return (h.okPublic ?? h.ok)(LEGAL_AND_HELP_CONTENT, 300, 600);
  }

  return null;
}

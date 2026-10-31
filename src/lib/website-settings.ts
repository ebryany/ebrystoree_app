/**
 * Registry pengaturan website Ebrystore.
 * Satu-satunya sumber kebenaran untuk key, tipe, nilai default, sifat publik,
 * dan aturan validasi. Dipakai bersama oleh server function dan UI admin.
 */

import { validatePaymentMethods } from "./payment-methods";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "email"
  | "url"
  | "phone"
  | "list"
  | "banners"
  | "nav"
  | "payment_methods";

export type SettingField = {
  key: string;
  label: string;
  type: FieldType;
  default: unknown;
  isPublic: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  optional?: boolean;
  /** Nilai tidak pernah dikirim utuh ke audit log. */
  sensitive?: boolean;
  /** Perubahan memerlukan konfirmasi eksplisit di UI. */
  confirm?: string;
  readOnly?: boolean;
  /** Subjudul pengelompokan di dalam bagian; field tanpa group tampil lebih dulu. */
  group?: string;
  /**
   * Nilai ditegakkan oleh constraint database atau konfigurasi storage, sehingga
   * tidak dapat diubah dari halaman ini. Ditandai jujur ke admin.
   */
  enforcedInDatabase?: boolean;
};

export type SettingSection = {
  id: string;
  label: string;
  description: string;
  permission: string;
  fields: SettingField[];
};

export type NavItem = {
  label: string;
  url: string;
  location: NavLocation;
  sort_order: number;
  is_active: boolean;
  open_in_new_tab: boolean;
  required_auth_state: "any" | "guest" | "authenticated";
};

export type NavLocation =
  "header" | "footer_product" | "footer_service" | "footer_help" | "footer_legal";

export const NAV_LOCATIONS: { value: NavLocation; label: string }[] = [
  { value: "header", label: "Header" },
  { value: "footer_product", label: "Footer — Produk" },
  { value: "footer_service", label: "Footer — Layanan" },
  { value: "footer_help", label: "Footer — Bantuan" },
  { value: "footer_legal", label: "Footer — Legal" },
];

/** Link legal wajib: tidak boleh dihapus/dinonaktifkan dari halaman pengaturan. */
export const PROTECTED_NAV_URLS = ["/syarat-ketentuan", "/kebijakan-privasi", "/kebijakan-refund"];

export const DEFAULT_NAV: NavItem[] = [
  n("Produk Digital", "/produk", "header", 1),
  n("Bantuan Tugas", "/layanan", "header", 2),
  n("Bantuan", "/bantuan", "header", 3),
  n("Artikel", "/artikel", "header", 4),
  n("Produk digital", "/produk", "footer_product", 1),
  n("Artikel", "/artikel", "footer_product", 2),
  n("Bantuan Tugas", "/layanan", "footer_service", 1),
  n("Cara kerja", "/#cara-kerja", "footer_service", 2),
  n("Pusat bantuan", "/bantuan", "footer_help", 1),
  n("Pesanan saya", "/dashboard", "footer_help", 2),
  n("Syarat & ketentuan", "/syarat-ketentuan", "footer_legal", 1),
  n("Kebijakan privasi", "/kebijakan-privasi", "footer_legal", 2),
  n("Kebijakan refund", "/kebijakan-refund", "footer_legal", 3),
];

function n(label: string, url: string, location: NavLocation, sort_order: number): NavItem {
  return {
    label,
    url,
    location,
    sort_order,
    is_active: true,
    open_in_new_tab: false,
    required_auth_state: "any",
  };
}

const TIMEZONES = ["Asia/Makassar", "Asia/Jakarta", "Asia/Jayapura"].map((v) => ({
  value: v,
  label: v,
}));

export const SETTING_SECTIONS: SettingSection[] = [
  {
    id: "umum",
    label: "Umum",
    description: "Identitas dasar website yang dipakai header, footer, dan metadata.",
    permission: "settings.website.update",
    fields: [
      {
        key: "store_name",
        label: "Nama website",
        type: "text",
        default: "Ebrystore",
        isPublic: true,
        maxLength: 60,
      },
      {
        key: "site_business_name",
        label: "Nama bisnis",
        type: "text",
        default: "Ebrystore",
        isPublic: true,
        maxLength: 80,
      },
      {
        key: "site_tagline",
        label: "Tagline",
        type: "text",
        default: "Produk digital & pendampingan akademik",
        isPublic: true,
        maxLength: 90,
      },
      {
        key: "site_description",
        label: "Deskripsi singkat",
        type: "textarea",
        default:
          "Produk digital dan bantuan tugas kuliah dalam satu tempat, dengan progres yang bisa dipantau.",
        isPublic: true,
        maxLength: 300,
      },
      {
        key: "site_language",
        label: "Bahasa default",
        type: "select",
        default: "id",
        isPublic: true,
        options: [{ value: "id", label: "Indonesia" }],
      },
      {
        key: "site_timezone",
        label: "Timezone",
        type: "select",
        default: "Asia/Makassar",
        isPublic: true,
        options: TIMEZONES,
      },
      {
        key: "site_date_format",
        label: "Format tanggal",
        type: "select",
        default: "dd MMM yyyy",
        isPublic: true,
        options: ["dd MMM yyyy", "dd/MM/yyyy", "yyyy-MM-dd"].map((v) => ({ value: v, label: v })),
      },
      {
        key: "site_time_format",
        label: "Format waktu",
        type: "select",
        default: "HH:mm",
        isPublic: true,
        options: [
          { value: "HH:mm", label: "24 jam (HH:mm)" },
          { value: "hh:mm a", label: "12 jam (hh:mm AM/PM)" },
        ],
      },
      {
        key: "currency_default",
        label: "Mata uang",
        type: "select",
        default: "IDR",
        isPublic: true,
        options: [{ value: "IDR", label: "IDR — Rupiah" }],
      },
      {
        key: "site_status",
        label: "Status website",
        type: "select",
        default: "live",
        isPublic: true,
        options: [
          { value: "live", label: "Live" },
          { value: "soft_launch", label: "Soft launch" },
        ],
      },
      {
        key: "site_primary_email",
        label: "Email utama",
        type: "email",
        default: "halo@ebrystore.id",
        isPublic: true,
      },
    ],
  },
  {
    id: "branding",
    label: "Branding",
    description: "Logo, favicon, gambar bagikan, dan warna aksen.",
    permission: "settings.branding.update",
    fields: [
      {
        key: "site_logo_url",
        label: "Logo utama",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_logo_dark_url",
        label: "Logo mode gelap",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_favicon_url",
        label: "Favicon",
        type: "url",
        default: "/favicon.ico",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_square_logo_url",
        label: "Logo kotak",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_og_image_url",
        label: "Gambar Open Graph default",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_accent_color",
        label: "Warna accent",
        type: "color",
        default: "#0f8f86",
        isPublic: true,
        help: "Kontras terhadap teks putih diperiksa saat menyimpan.",
      },
      {
        key: "site_background_color",
        label: "Warna background",
        type: "color",
        default: "#ffffff",
        isPublic: true,
      },
      {
        key: "site_brand_short",
        label: "Nama brand pendek",
        type: "text",
        default: "Ebry",
        isPublic: true,
        maxLength: 20,
      },
      {
        key: "home_banner_image_url",
        label: "Banner home utama (desktop)",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
        help: "Kosong berarti banner nonaktif. JPG, PNG, WEBP, atau AVIF maksimal 3 MB.",
      },
      {
        key: "home_banner_mobile_image_url",
        label: "Banner home mobile",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
        help: "Opsional. Kosong memakai gambar utama.",
      },
      {
        key: "home_banner_alt",
        label: "Deskripsi banner utama",
        type: "text",
        default: "Banner Ebrystore",
        isPublic: true,
        maxLength: 200,
        help: "Tuliskan pesan penting pada gambar agar bisa dibaca pembaca layar.",
      },
      {
        key: "home_banner_slides",
        label: "Banner tambahan",
        type: "banners",
        default: [],
        isPublic: true,
        help: "Maksimal lima banner tambahan. Urutan mengikuti daftar; slider tidak berganti otomatis.",
      },
      {
        key: "home_banner_position_x",
        label: "Fokus horizontal banner (%)",
        type: "number",
        default: 50,
        isPublic: true,
        min: 0,
        max: 100,
      },
      {
        key: "home_banner_position_y",
        label: "Fokus vertikal banner (%)",
        type: "number",
        default: 50,
        isPublic: true,
        min: 0,
        max: 100,
      },
    ],
  },
  {
    id: "kontak",
    label: "Kontak",
    description:
      "Informasi kontak yang ditampilkan pada footer, bantuan, dan instruksi pembayaran.",
    permission: "settings.contact.update",
    fields: [
      {
        key: "site_support_email",
        label: "Email dukungan",
        type: "email",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_whatsapp",
        label: "Nomor WhatsApp",
        type: "phone",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_phone",
        label: "Nomor telepon",
        type: "phone",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_address",
        label: "Alamat",
        type: "textarea",
        default: "",
        isPublic: true,
        optional: true,
        maxLength: 200,
      },
      {
        key: "site_operating_hours",
        label: "Jam operasional",
        type: "text",
        default: "Senin–Sabtu, 09.00–21.00 WITA",
        isPublic: true,
        optional: true,
      },
      {
        key: "site_help_cta_label",
        label: "Teks tombol bantuan",
        type: "text",
        default: "Hubungi kami",
        isPublic: true,
        maxLength: 30,
      },
      {
        key: "site_help_url",
        label: "URL bantuan",
        type: "url",
        default: "/bantuan",
        isPublic: true,
      },
      {
        key: "manual_payment_holder",
        label: "Nama pemilik pembayaran manual",
        type: "text",
        default: "REDACTED",
        isPublic: false,
        maxLength: 60,
      },
      {
        key: "manual_payment_number",
        label: "Nomor pembayaran manual",
        type: "phone",
        default: "REDACTED",
        isPublic: false,
        sensitive: true,
      },
    ],
  },
  {
    id: "navigasi",
    label: "Navigasi",
    description: "Item menu header dan footer yang dibaca langsung oleh website publik.",
    permission: "settings.navigation.update",
    fields: [
      {
        key: "site_nav_items",
        label: "Item navigasi",
        type: "nav",
        default: DEFAULT_NAV,
        isPublic: true,
      },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    description: "Metadata default. Halaman tertentu tetap dapat menimpanya.",
    permission: "settings.seo.update",
    fields: [
      {
        key: "seo_default_title",
        label: "Meta title default",
        type: "text",
        default: "Ebrystore — Produk Digital & Pendampingan Akademik",
        isPublic: true,
        maxLength: 70,
      },
      {
        key: "seo_title_template",
        label: "Title template",
        type: "text",
        default: "%s — Ebrystore",
        isPublic: true,
        maxLength: 60,
      },
      {
        key: "seo_default_description",
        label: "Meta description default",
        type: "textarea",
        default:
          "Beli produk digital yang langsung terkirim dan pesan bantuan tugas kuliah dengan progres terpantau.",
        isPublic: true,
        maxLength: 170,
      },
      {
        key: "seo_keywords",
        label: "Keywords",
        type: "list",
        default: [],
        isPublic: true,
        optional: true,
      },
      {
        key: "seo_canonical_base",
        label: "Canonical base URL",
        type: "url",
        default: "https://app.ebrystore.my.id",
        isPublic: true,
      },
      {
        key: "seo_robots",
        label: "Robots policy",
        type: "select",
        default: "index",
        isPublic: true,
        options: [
          { value: "index", label: "Index website" },
          { value: "noindex", label: "Noindex website" },
        ],
        confirm: "Noindex membuat website hilang dari hasil pencarian. Lanjutkan?",
      },
      {
        key: "seo_og_title",
        label: "Open Graph title",
        type: "text",
        default: "Ebrystore",
        isPublic: true,
        maxLength: 70,
      },
      {
        key: "seo_og_description",
        label: "Open Graph description",
        type: "textarea",
        default: "Produk digital dan pendampingan akademik dengan progres terpantau.",
        isPublic: true,
        maxLength: 170,
      },
      {
        key: "seo_og_image",
        label: "Open Graph image",
        type: "url",
        default: "",
        isPublic: true,
        optional: true,
      },
      {
        key: "seo_twitter_card",
        label: "Tipe kartu Twitter/X",
        type: "select",
        default: "summary_large_image",
        isPublic: true,
        options: [
          { value: "summary", label: "summary" },
          { value: "summary_large_image", label: "summary_large_image" },
        ],
      },
      {
        key: "seo_google_verification",
        label: "Google verification",
        type: "text",
        default: "",
        isPublic: true,
        optional: true,
        maxLength: 120,
      },
      {
        key: "seo_bing_verification",
        label: "Bing verification",
        type: "text",
        default: "",
        isPublic: true,
        optional: true,
        maxLength: 120,
      },
    ],
  },
  {
    id: "storefront",
    label: "Storefront",
    description: "Tampilan katalog pada halaman publik.",
    permission: "settings.commerce.update",
    fields: [
      {
        key: "storefront_show_products",
        label: "Tampilkan produk digital",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "storefront_show_services",
        label: "Tampilkan layanan akademik",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "storefront_featured_products",
        label: "Jumlah produk pilihan di Home",
        type: "number",
        default: 4,
        isPublic: true,
        min: 0,
        max: 12,
      },
      {
        key: "storefront_featured_services",
        label: "Jumlah layanan pilihan di Home",
        type: "number",
        default: 3,
        isPublic: true,
        min: 0,
        max: 12,
      },
      {
        key: "storefront_default_sort",
        label: "Urutan katalog default",
        type: "select",
        default: "newest",
        isPublic: true,
        options: [
          { value: "newest", label: "Terbaru" },
          { value: "price_asc", label: "Harga terendah" },
          { value: "price_desc", label: "Harga tertinggi" },
          { value: "name", label: "Nama" },
          { value: "manual", label: "Urutan manual" },
        ],
      },
      {
        key: "storefront_show_price",
        label: "Tampilkan harga",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "storefront_show_estimate",
        label: "Tampilkan estimasi pengerjaan",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "storefront_show_revisions",
        label: "Tampilkan jumlah revisi",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "storefront_show_empty_products",
        label: "Tampilkan seksi produk kosong",
        type: "boolean",
        default: false,
        isPublic: true,
      },
      {
        key: "storefront_show_empty_services",
        label: "Tampilkan seksi layanan kosong",
        type: "boolean",
        default: false,
        isPublic: true,
      },
    ],
  },
  {
    id: "akademik",
    label: "Layanan akademik",
    description: "Penamaan publik dan aturan dasar pendampingan akademik.",
    permission: "settings.commerce.update",
    fields: [
      {
        key: "academic_public_name",
        label: "Nama publik layanan",
        type: "text",
        default: "Bantuan Tugas",
        isPublic: true,
        maxLength: 40,
      },
      {
        key: "academic_formal_title",
        label: "Judul formal",
        type: "text",
        default: "Pendampingan Akademik",
        isPublic: true,
        maxLength: 60,
      },
      {
        key: "academic_operator_label",
        label: "Label operator",
        type: "text",
        default: "Pendamping Akademik",
        isPublic: true,
        maxLength: 40,
      },
      {
        key: "academic_policy_version",
        label: "Versi kebijakan integritas",
        type: "text",
        default: "integrity-v1",
        isPublic: true,
        maxLength: 30,
        help: "Pesanan lama tetap memakai snapshot versi saat pemesanan.",
      },
      {
        key: "academic_integrity_confirmation",
        label: "Konfirmasi integritas aktif",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "academic_scope_screening",
        label: "Scope screening aktif",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "academic_quality_review",
        label: "Quality review aktif",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "academic_default_revisions",
        label: "Jumlah revisi default",
        type: "number",
        default: 2,
        isPublic: true,
        min: 0,
        max: 20,
      },
      {
        key: "academic_default_sla_hours",
        label: "SLA default (jam)",
        type: "number",
        default: 48,
        isPublic: true,
        min: 1,
        max: 720,
      },
      {
        key: "academic_max_upload_mb",
        label: "Batas unggahan lampiran (MB)",
        type: "number",
        default: 20,
        isPublic: true,
        min: 1,
        max: 200,
      },
      {
        key: "academic_allowed_formats",
        label: "Format lampiran diizinkan",
        type: "list",
        default: ["pdf", "docx", "xlsx", "pptx", "zip", "png", "jpg"],
        isPublic: true,
      },
    ],
  },
  {
    id: "transaksi",
    label: "Order & pembayaran",
    description: "Aturan transaksi baru. Pesanan lama tetap memakai snapshot lamanya.",
    permission: "settings.payment.update",
    fields: [
      {
        key: "order_expiry_hours",
        label: "Kedaluwarsa pesanan (jam)",
        type: "number",
        default: 24,
        isPublic: true,
        min: 1,
        max: 168,
      },
      {
        key: "manual_payment_deadline_hours",
        label: "Durasi pembayaran manual (jam)",
        type: "number",
        default: 24,
        isPublic: true,
        min: 1,
        max: 168,
      },
      {
        key: "qris_expiry_minutes",
        label: "Durasi QRIS (menit)",
        type: "number",
        default: 30,
        isPublic: true,
        min: 5,
        max: 1440,
      },
      {
        key: "download_limit_default",
        label: "Batas unduh produk digital",
        type: "number",
        default: 5,
        isPublic: true,
        min: 1,
        max: 100,
      },
      {
        key: "download_validity_days",
        label: "Masa akses produk (hari)",
        type: "number",
        default: 365,
        isPublic: true,
        min: 1,
        max: 3650,
      },
      {
        key: "order_review_deadline_hours",
        label: "Batas review hasil (jam)",
        type: "number",
        default: 72,
        isPublic: true,
        min: 1,
        max: 720,
      },
      {
        key: "order_auto_complete",
        label: "Auto-completion aktif",
        type: "boolean",
        default: false,
        isPublic: true,
      },
      {
        key: "order_auto_complete_hours",
        label: "Waktu auto-completion (jam)",
        type: "number",
        default: 72,
        isPublic: true,
        min: 1,
        max: 720,
      },
      {
        key: "refund_window_days",
        label: "Refund window (hari)",
        type: "number",
        default: 7,
        isPublic: true,
        min: 0,
        max: 90,
        confirm:
          "Mengubah refund window memengaruhi pengajuan refund untuk transaksi baru. Lanjutkan?",
      },
      {
        key: "order_min_amount",
        label: "Minimum nominal order (Rp)",
        type: "number",
        default: 0,
        isPublic: true,
        min: 0,
        max: 100000000,
      },
      {
        key: "admin_fee",
        label: "Biaya admin (Rp)",
        type: "number",
        default: 2500,
        isPublic: true,
        min: 0,
        max: 1000000,
      },
      {
        key: "order_number_prefix",
        label: "Prefix nomor order",
        type: "text",
        default: "EBS",
        isPublic: false,
        maxLength: 8,
      },
      {
        key: "invoice_number_prefix",
        label: "Prefix invoice",
        type: "text",
        default: "INV",
        isPublic: false,
        maxLength: 8,
      },
      {
        key: "manual_payment_active",
        label: "Pembayaran manual aktif",
        type: "boolean",
        default: true,
        isPublic: true,
        help: "Transfer manual ke rekening toko. Matikan bila hanya ingin memakai QRIS.",
      },
      {
        key: "qris_enabled",
        label: "QRIS (SumoPod) aktif",
        type: "boolean",
        default: true,
        isPublic: true,
        help: "Saklar utama pembayaran QRIS otomatis. Bila dimatikan, checkout hanya menawarkan transfer manual.",
      },
      {
        key: "qris_payment_active",
        label: "QRIS aktif (nama lama)",
        type: "boolean",
        default: true,
        isPublic: true,
        help: 'Dipertahankan untuk kompatibilitas. Saklar yang dipakai sistem adalah "QRIS (SumoPod) aktif" di atas.',
      },
      {
        key: "custom_payment_methods",
        label: "Metode pembayaran custom",
        type: "payment_methods",
        default: [],
        isPublic: false,
        sensitive: true,
        group: "Metode pembayaran custom",
        help: "Rekening bank / e-wallet tujuan transfer. Metode bertanda Top up muncul di menu isi saldo; pembayaran diverifikasi manual oleh admin.",
        confirm:
          "Mengubah metode pembayaran memengaruhi rekening tujuan transfer pengguna. Pastikan nomor dan nama pemilik benar. Lanjutkan?",
      },
      {
        key: "topup_manual_deadline_hours",
        label: "Batas transfer top up manual (jam)",
        type: "number",
        default: 24,
        isPublic: false,
        min: 1,
        max: 72,
        group: "Metode pembayaran custom",
      },
    ],
  },
  {
    id: "notifikasi",
    label: "Notifikasi",
    description:
      "Kanal dan jenis notifikasi. Saklar email di bawah berlaku global; pengguna tetap bisa mematikannya sendiri di pengaturan akun.",
    permission: "settings.website.update",
    fields: [
      {
        key: "notify_inapp_enabled",
        label: "Notifikasi in-app aktif",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_email_enabled",
        label: "Email transaksi aktif",
        type: "boolean",
        default: true,
        isPublic: false,
        help: "Saklar utama email otomatis. Matikan untuk menghentikan SEMUA email transaksi tanpa mengubah kredensial SMTP.",
      },
      {
        key: "notify_order_created",
        label: "Email: order dibuat",
        type: "boolean",
        default: true,
        isPublic: false,
        help: "Instruksi pembayaran dan batas waktu.",
      },
      {
        key: "notify_payment_verified",
        label: "Email: pembayaran diterima",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_order_completed",
        label: "Email: pesanan selesai",
        type: "boolean",
        default: true,
        isPublic: false,
        help: "Produk digital selesai dan akses terbit.",
      },
      {
        key: "notify_service_delivered",
        label: "Email: hasil jasa dikirim",
        type: "boolean",
        default: true,
        isPublic: false,
        help: "Pembeli diberi tahu hasil siap ditinjau.",
      },
      {
        key: "notify_service_accepted",
        label: "Email: hasil jasa diterima",
        type: "boolean",
        default: true,
        isPublic: false,
        help: "Pembeli dan penjual diberi tahu transaksi selesai.",
      },
      {
        key: "notify_refund_updated",
        label: "Email: refund selesai",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_operator_assigned",
        label: "Operator ditugaskan",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_progress_updated",
        label: "Progres diperbarui",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_draft_ready",
        label: "Draft tersedia",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_revision_done",
        label: "Revisi selesai",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_result_ready",
        label: "Hasil akhir tersedia",
        type: "boolean",
        default: true,
        isPublic: false,
      },
      {
        key: "notify_sender_email",
        label: "Email pengirim",
        type: "email",
        default: "",
        isPublic: false,
        optional: true,
        help: "Kosong berarti memakai SMTP_FROM dari konfigurasi server.",
      },
      {
        key: "notify_sender_name",
        label: "Nama pengirim",
        type: "text",
        default: "Ebrystore",
        isPublic: false,
        maxLength: 60,
      },
      {
        key: "notify_reply_to",
        label: "Reply-to",
        type: "email",
        default: "",
        isPublic: false,
        optional: true,
        help: "Alamat yang menerima balasan pembeli. Kosong berarti sama dengan email pengirim.",
      },
      {
        key: "notify_test_recipient",
        label: "Email tujuan uji",
        type: "email",
        default: "",
        isPublic: false,
        optional: true,
        help: 'Dipakai tombol "Kirim email uji" di halaman ini. Kosong berarti memakai email akun admin yang sedang masuk.',
      },
    ],
  },
  {
    id: "fitur",
    label: "Fitur",
    description: "Feature flag. Backend ikut menolak operasi baru saat flag dimatikan.",
    permission: "settings.features.update",
    fields: [
      {
        key: "feature_digital_products",
        label: "Produk digital",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "feature_academic_services",
        label: "Pendampingan akademik",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "feature_registration",
        label: "Registrasi pengguna",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "feature_checkout",
        label: "Checkout",
        type: "boolean",
        default: true,
        isPublic: true,
        confirm:
          "Mematikan checkout menghentikan pesanan baru. Pesanan lama tetap dapat dibuka. Lanjutkan?",
      },
      {
        key: "feature_manual_payment",
        label: "Pembayaran manual",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      { key: "feature_qris", label: "QRIS", type: "boolean", default: true, isPublic: true },
      {
        key: "feature_realtime_tracking",
        label: "Realtime tracking",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      { key: "feature_revision", label: "Revisi", type: "boolean", default: true, isPublic: true },
      { key: "feature_refund", label: "Refund", type: "boolean", default: true, isPublic: true },
      {
        key: "feature_quality_review",
        label: "Quality review",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "feature_promo_banner",
        label: "Promo banner",
        type: "boolean",
        default: false,
        isPublic: true,
      },
      {
        key: "feature_home_faq",
        label: "FAQ di Home",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "feature_home_tracking_preview",
        label: "Preview tracking di Home",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "feature_manual_payout",
        label: "Payout manual seller",
        type: "boolean",
        default: false,
        isPublic: true,
        confirm:
          "Mengaktifkan payout manual berarti seller dapat mengajukan tarik saldo dan finance memproses transfer bank nyata. Pastikan legal & operational readiness sudah disetujui. Lanjutkan?",
      },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description:
      "Aturan jasa seller, escrow, moderasi, dan kebijakan toko. Default setiap nilai sama dengan perilaku yang berjalan sekarang, sehingga tidak ada perubahan sampai Anda mengubahnya.",
    permission: "settings.marketplace.update",
    fields: [
      /* ----- Media & berkas jasa ----- */
      {
        key: "marketplace_media_max",
        label: "Maksimal media per jasa",
        type: "number",
        default: 5,
        isPublic: true,
        min: 1,
        max: 10,
        group: "Media & berkas jasa",
        help: "Jumlah gambar dan video yang boleh dilampirkan seller pada satu jasa.",
      },
      {
        key: "marketplace_image_max_mb",
        label: "Ukuran maksimal gambar (MB)",
        type: "number",
        default: 5,
        isPublic: true,
        min: 1,
        max: 20,
        group: "Media & berkas jasa",
        help: "Batas unggah gambar media jasa.",
      },
      {
        key: "marketplace_video_max_mb",
        label: "Ukuran maksimal video (MB)",
        type: "number",
        default: 25,
        isPublic: true,
        min: 1,
        max: 100,
        group: "Media & berkas jasa",
        help: "Batas unggah video media jasa.",
      },
      {
        key: "marketplace_delivery_max_mb",
        label: "Ukuran maksimal berkas hasil (MB)",
        type: "number",
        default: 25,
        isPublic: true,
        min: 1,
        max: 100,
        group: "Media & berkas jasa",
        help: "Batas berkas yang dikirim seller sebagai hasil pekerjaan.",
      },
      {
        key: "marketplace_bucket_limits",
        label: "Batas bucket storage",
        type: "text",
        default: "ditegakkan database",
        isPublic: false,
        readOnly: true,
        enforcedInDatabase: true,
        group: "Media & berkas jasa",
        help: "Batas bucket ditegakkan di konfigurasi storage, bukan dari halaman ini. Perubahan memerlukan migration.",
      },

      /* ----- Aturan jasa ----- */
      {
        key: "marketplace_max_duration_days",
        label: "Durasi jasa maksimal (hari)",
        type: "number",
        default: 365,
        isPublic: true,
        min: 1,
        max: 3650,
        group: "Aturan jasa",
        help: "Batas durasi pengerjaan yang boleh dicantumkan seller pada kesepakatan.",
      },
      {
        key: "marketplace_min_requirements_chars",
        label: "Panjang minimum kebutuhan pembeli (karakter)",
        type: "number",
        default: 10,
        isPublic: true,
        min: 10,
        max: 500,
        group: "Aturan jasa",
      },
      {
        key: "marketplace_max_active_services",
        label: "Batas jasa aktif per toko",
        type: "number",
        default: 0,
        isPublic: true,
        min: 0,
        max: 500,
        group: "Aturan jasa",
        help: "0 berarti tanpa batas. Dihitung dari jasa berstatus disetujui.",
      },
      {
        key: "marketplace_store_products_per_page",
        label: "Produk per halaman di toko",
        type: "number",
        default: 48,
        isPublic: true,
        min: 8,
        max: 96,
        group: "Aturan jasa",
      },

      /* ----- Escrow & pencairan ----- */
      {
        key: "marketplace_hold_hours",
        label: "Dana ditahan setelah hasil dikirim (jam)",
        type: "number",
        default: 72,
        isPublic: true,
        min: 0,
        max: 720,
        group: "Escrow & pencairan",
        help: "Lama dana ditahan sebelum dapat dilepas ke seller setelah pembeli menerima hasil.",
      },
      {
        key: "marketplace_service_response_hours",
        label: "Batas respons seller atas kebutuhan (jam)",
        type: "number",
        default: 24,
        isPublic: true,
        min: 1,
        max: 168,
        group: "Escrow & pencairan",
        help: "Dihitung sejak pesanan jasa dibayar. Tidak direspons sampai batas ini = pesanan batal dan dana kembali ke saldo pembeli.",
      },
      {
        key: "marketplace_service_fee_bps",
        label: "Komisi platform jasa (basis poin)",
        type: "number",
        default: 0,
        isPublic: true,
        min: 0,
        max: 5000,
        group: "Escrow & pencairan",
        help: "1000 basis poin = 10% dari nilai jasa. Dipotong saat dana dilepas ke seller; berlaku untuk pelepasan berikutnya.",
      },
      {
        key: "marketplace_auto_release",
        label: "Terima otomatis hasil jasa",
        type: "boolean",
        default: false,
        isPublic: true,
        group: "Escrow & pencairan",
        help: "Bila aktif, hasil jasa dianggap diterima dan dana seller dilepas setelah jendela tinjau berakhir tanpa revisi atau komplain. Pembeli diingatkan sebelumnya.",
        confirm:
          "Mengubah terima otomatis memengaruhi kapan dana seller dilepas tanpa penerimaan eksplisit pembeli. Lanjutkan?",
      },
      {
        key: "marketplace_auto_release_hours",
        label: "Jendela tinjau pembeli (jam)",
        type: "number",
        default: 168,
        isPublic: true,
        min: 1,
        max: 720,
        group: "Escrow & pencairan",
        help: "Dihitung sejak hasil dikirim. Berlaku untuk hasil yang dikirim setelah perubahan; hanya bila terima otomatis aktif.",
      },
      {
        key: "marketplace_min_payout",
        label: "Minimum penarikan bruto (Rp)",
        type: "number",
        default: 5000,
        isPublic: true,
        min: 0,
        max: 10000000,
        group: "Escrow & pencairan",
        help: "Nominal penarikan terkecil yang boleh diajukan; juga syarat minimum saldo tersedia.",
      },
      {
        key: "marketplace_withdrawal_fee_bps",
        label: "Fee penarikan (basis poin)",
        type: "number",
        default: 1500,
        isPublic: true,
        min: 0,
        max: 5000,
        group: "Escrow & pencairan",
        help: "1500 basis poin = 15% dari nominal bruto. Fee dikunci saat pengajuan dibuat dan tidak berlaku retroaktif.",
      },

      /* ----- Moderasi ----- */
      {
        key: "marketplace_require_moderation",
        label: "Jasa wajib moderasi sebelum tayang",
        type: "boolean",
        default: true,
        isPublic: true,
        group: "Moderasi",
        confirm:
          "Mematikan moderasi membuat jasa seller dapat tayang tanpa peninjauan. Lanjutkan hanya bila kebijakan ini disetujui.",
      },
      {
        key: "marketplace_moderation_target_hours",
        label: "Target waktu review (jam)",
        type: "number",
        default: 24,
        isPublic: false,
        min: 1,
        max: 336,
        group: "Moderasi",
        help: "Target internal; dipakai untuk memantau antrean moderasi.",
      },

      /* ----- Kebijakan seller ----- */
      {
        key: "marketplace_seller_auto_approve",
        label: "Seller baru langsung aktif",
        type: "boolean",
        default: false,
        isPublic: true,
        group: "Kebijakan seller",
        help: "Bila mati, toko baru menunggu persetujuan admin sebelum dapat menjual.",
        confirm:
          "Mengaktifkan ini berarti toko baru langsung dapat menjual tanpa peninjauan admin. Lanjutkan?",
      },
      {
        key: "marketplace_edit_approved_resets",
        label: "Edit jasa disetujui mengembalikan ke draft",
        type: "boolean",
        default: true,
        isPublic: false,
        group: "Kebijakan seller",
        help: "Bila aktif, perubahan pada jasa yang sudah tayang harus melewati moderasi ulang.",
      },

      /* ----- Refund & sengketa ----- */
      {
        key: "marketplace_complaint_window_hours",
        label: "Batas pengajuan komplain (jam setelah hasil dikirim)",
        type: "number",
        default: 168,
        isPublic: true,
        min: 1,
        max: 720,
        group: "Refund & sengketa",
        help: "Setelah batas ini, komplain tidak lagi dapat diajukan.",
      },
      {
        key: "marketplace_partial_refund",
        label: "Refund sebagian didukung",
        type: "boolean",
        default: false,
        isPublic: true,
        group: "Refund & sengketa",
        help: "Bila mati, keputusan admin hanya melanjutkan pekerjaan atau refund penuh.",
      },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Mode perawatan untuk pengunjung. Admin, webhook, dan health check tetap jalan.",
    permission: "settings.maintenance.update",
    fields: [
      {
        key: "maintenance_active",
        label: "Maintenance aktif",
        type: "boolean",
        default: false,
        isPublic: true,
        confirm: "Pengunjung akan melihat halaman maintenance. Admin tetap dapat masuk. Lanjutkan?",
      },
      {
        key: "maintenance_title",
        label: "Judul",
        type: "text",
        default: "Sedang perawatan",
        isPublic: true,
        maxLength: 80,
      },
      {
        key: "maintenance_message",
        label: "Pesan",
        type: "textarea",
        default: "Kami sedang melakukan pemeliharaan singkat. Silakan kembali beberapa saat lagi.",
        isPublic: true,
        maxLength: 300,
      },
      {
        key: "maintenance_eta",
        label: "Estimasi selesai",
        type: "text",
        default: "",
        isPublic: true,
        optional: true,
        maxLength: 60,
      },
      {
        key: "maintenance_allow_admin",
        label: "Izinkan admin",
        type: "boolean",
        default: true,
        isPublic: true,
        readOnly: true,
      },
      {
        key: "maintenance_allow_operator",
        label: "Izinkan operator",
        type: "boolean",
        default: true,
        isPublic: true,
      },
      {
        key: "maintenance_excluded_routes",
        label: "Route yang dikecualikan",
        type: "list",
        default: ["/auth", "/admin", "/api"],
        isPublic: true,
        help: "Route pembayaran/webhook (/api) dan health check tidak pernah diblokir.",
      },
    ],
  },
];

export const ALL_FIELDS: SettingField[] = SETTING_SECTIONS.flatMap((s) => s.fields);
export const FIELD_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));
export const PUBLIC_KEYS = ALL_FIELDS.filter((f) => f.isPublic).map((f) => f.key);

export function sectionById(id: string) {
  return SETTING_SECTIONS.find((s) => s.id === id) ?? null;
}

export function defaultsFor(keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const field = FIELD_BY_KEY.get(key);
    if (field) out[key] = field.default;
  }
  return out;
}

export const PUBLIC_DEFAULTS = defaultsFor(PUBLIC_KEYS);

/* ----------------------------- Validasi ----------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const TOKEN_RE = /^[A-Za-z0-9._~-]{0,120}$/;

export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+62")) return `0${digits.slice(3)}`;
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  return digits;
}

export function isSafeUrl(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (/^(javascript|data|vbscript|file):/i.test(v)) return false;
  if (v.startsWith("/") || v.startsWith("#")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

/**
 * Aset banner hanya menerima path canonical hasil unggahan server:
 * /api/public/catalog-image/branding/home/<UUID>.<ext>. Bukan validator navigasi;
 * jauh lebih ketat daripada isSafeUrl karena nilai ini dipakai sebagai background.
 */
const BANNER_URL_PREFIX = "/api/public/catalog-image/branding/home/";
const BANNER_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|avif)$/i;

export function isBannerAssetUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(BANNER_URL_PREFIX)) return false;
  return BANNER_PATH_RE.test(value.slice(BANNER_URL_PREFIX.length));
}

export function bannerAssetUrl(value: unknown): string {
  return isBannerAssetUrl(value) ? value : "";
}

export type HomeBannerSlide = { imageUrl: string; mobileUrl: string; alt: string };

export function validateBannerSlides(raw: unknown): ValidationResult {
  if (!Array.isArray(raw) || raw.length > 5)
    return { ok: false, error: "Maksimal lima banner tambahan." };
  const slides: HomeBannerSlide[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object")
      return { ok: false, error: "Format banner tidak valid." };
    const { imageUrl, mobileUrl, alt } = entry as Record<string, unknown>;
    if (!isBannerAssetUrl(imageUrl) || (mobileUrl !== "" && !isBannerAssetUrl(mobileUrl)))
      return { ok: false, error: "Gambar banner harus berasal dari unggahan admin." };
    if (typeof alt !== "string" || !alt.trim() || alt.trim().length > 200)
      return { ok: false, error: "Deskripsi setiap banner wajib diisi, maksimal 200 karakter." };
    slides.push({ imageUrl, mobileUrl: mobileUrl as string, alt: alt.trim() });
  }
  return { ok: true, value: slides };
}

export function homeBannerSlides(settings: Record<string, unknown>): HomeBannerSlide[] {
  const main = bannerAssetUrl(settings.home_banner_image_url);
  const extra = validateBannerSlides(settings.home_banner_slides ?? []);
  return [
    ...(main
      ? [
          {
            imageUrl: main,
            mobileUrl: bannerAssetUrl(settings.home_banner_mobile_image_url),
            alt:
              typeof settings.home_banner_alt === "string" && settings.home_banner_alt.trim()
                ? settings.home_banner_alt.trim().slice(0, 200)
                : "Banner Ebrystore",
          },
        ]
      : []),
    ...(extra.ok ? (extra.value as HomeBannerSlide[]) : []),
  ];
}

/** Focal point dibaca dari nilai tersimpan yang bisa malformed; jatuh ke 50 dengan aman. */
export function clampBannerPosition(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function validateBannerAssetUrl(raw: unknown, label: string, optional?: boolean): ValidationResult {
  const v = String(raw ?? "").trim();
  if (!v) return optional ? { ok: true, value: "" } : { ok: false, error: `${label} wajib diisi.` };
  if (!isBannerAssetUrl(v))
    return { ok: false, error: `${label} harus path aset banner hasil unggahan.` };
  return { ok: true, value: v };
}

function validateBannerPosition(raw: unknown, label: string): ValidationResult {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (typeof raw === "string" && !text)
    return { ok: false, error: `${label} harus bilangan bulat 0 sampai 100.` };
  const num = typeof raw === "number" ? raw : Number(text);
  if (!Number.isInteger(num) || !Number.isFinite(num))
    return { ok: false, error: `${label} harus bilangan bulat 0 sampai 100.` };
  if (num < 0 || num > 100) return { ok: false, error: `${label} harus 0 sampai 100.` };
  return { ok: true, value: num };
}

/** Luminansi relatif untuk pemeriksaan kontras terhadap teks putih. */
export function contrastWithWhite(hex: string) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return 1.05 / (L + 0.05);
}

export type ValidationResult = { ok: true; value: unknown } | { ok: false; error: string };

export function validateNavItems(raw: unknown): ValidationResult {
  if (!Array.isArray(raw)) return { ok: false, error: "Format navigasi tidak valid." };
  if (raw.length > 40) return { ok: false, error: "Maksimal 40 item navigasi." };
  const items: NavItem[] = [];
  for (const entry of raw as NavItem[]) {
    const label = String(entry?.label ?? "").trim();
    const url = String(entry?.url ?? "").trim();
    if (!label) return { ok: false, error: "Label item navigasi wajib diisi." };
    if (label.length > 40)
      return { ok: false, error: `Label "${label}" terlalu panjang (maks 40).` };
    if (!isSafeUrl(url))
      return { ok: false, error: `URL "${url || "(kosong)"}" tidak valid atau tidak aman.` };
    if (!NAV_LOCATIONS.some((l) => l.value === entry?.location))
      return { ok: false, error: "Lokasi navigasi tidak dikenal." };
    items.push({
      label,
      url,
      location: entry.location,
      sort_order: Number.isFinite(entry?.sort_order) ? Number(entry.sort_order) : 99,
      is_active: Boolean(entry?.is_active),
      open_in_new_tab: Boolean(entry?.open_in_new_tab),
      required_auth_state: ["any", "guest", "authenticated"].includes(
        entry?.required_auth_state as string,
      )
        ? entry.required_auth_state
        : "any",
    });
  }
  for (const url of PROTECTED_NAV_URLS) {
    if (!items.some((i) => i.url === url && i.is_active))
      return { ok: false, error: `Link legal ${url} wajib tetap ada dan aktif.` };
  }
  return { ok: true, value: items };
}

export function validateField(field: SettingField, raw: unknown): ValidationResult {
  switch (field.type) {
    case "boolean":
      return { ok: true, value: Boolean(raw) };
    case "number": {
      if (field.key.startsWith("home_banner_position_"))
        return validateBannerPosition(raw, field.label);
      const num = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(num)) return { ok: false, error: `${field.label} harus berupa angka.` };
      if (field.min !== undefined && num < field.min)
        return { ok: false, error: `${field.label} minimal ${field.min}.` };
      if (field.max !== undefined && num > field.max)
        return { ok: false, error: `${field.label} maksimal ${field.max}.` };
      return { ok: true, value: Math.round(num) };
    }
    case "select": {
      const v = String(raw ?? "");
      if (!field.options?.some((o) => o.value === v))
        return { ok: false, error: `${field.label} tidak valid.` };
      return { ok: true, value: v };
    }
    case "color": {
      const v = String(raw ?? "").trim();
      if (!HEX_RE.test(v))
        return { ok: false, error: `${field.label} harus format heksadesimal (#0f8f86).` };
      if (field.key === "site_accent_color" && contrastWithWhite(v) < 3)
        return {
          ok: false,
          error: "Warna accent terlalu terang: kontras terhadap teks putih di bawah 3:1.",
        };
      return { ok: true, value: v.toLowerCase() };
    }
    case "email": {
      const v = String(raw ?? "").trim();
      if (!v)
        return field.optional
          ? { ok: true, value: "" }
          : { ok: false, error: `${field.label} wajib diisi.` };
      if (!EMAIL_RE.test(v)) return { ok: false, error: `${field.label} bukan email yang valid.` };
      return { ok: true, value: v.toLowerCase() };
    }
    case "phone": {
      const v = normalizePhone(String(raw ?? ""));
      if (!v)
        return field.optional
          ? { ok: true, value: "" }
          : { ok: false, error: `${field.label} wajib diisi.` };
      if (v.length < 8 || v.length > 20) return { ok: false, error: `${field.label} tidak valid.` };
      return { ok: true, value: v };
    }
    case "url": {
      const v = String(raw ?? "").trim();
      if (field.key.startsWith("home_banner_"))
        return validateBannerAssetUrl(raw, field.label, field.optional);
      if (!v)
        return field.optional
          ? { ok: true, value: "" }
          : { ok: false, error: `${field.label} wajib diisi.` };
      if (!isSafeUrl(v)) return { ok: false, error: `${field.label} bukan URL yang aman.` };
      return { ok: true, value: v };
    }
    case "list": {
      const arr = Array.isArray(raw)
        ? raw.map((v) => String(v))
        : String(raw ?? "")
            .split(",")
            .map((v) => v.trim());
      const clean = arr.filter(Boolean).slice(0, 40);
      if (!clean.length && !field.optional)
        return { ok: false, error: `${field.label} wajib diisi.` };
      return { ok: true, value: clean };
    }
    case "banners":
      return validateBannerSlides(raw);
    case "nav":
      return validateNavItems(raw);
    case "payment_methods":
      return validatePaymentMethods(raw);
    default: {
      let v = String(raw ?? "").trim();
      v = v.replace(/<[^>]*>/g, "");
      if (!v && !field.optional) return { ok: false, error: `${field.label} wajib diisi.` };
      if (field.maxLength && v.length > field.maxLength)
        return { ok: false, error: `${field.label} maksimal ${field.maxLength} karakter.` };
      if (
        (field.key === "seo_google_verification" || field.key === "seo_bing_verification") &&
        !TOKEN_RE.test(v)
      )
        return { ok: false, error: `${field.label} hanya boleh berisi token verifikasi.` };
      return { ok: true, value: v };
    }
  }
}

export function redact(field: SettingField, value: unknown) {
  return field.sensitive ? "[REDACTED]" : value;
}

export function navFor(items: NavItem[] | undefined, location: NavLocation) {
  return (items ?? DEFAULT_NAV)
    .filter((i) => i.location === location && i.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

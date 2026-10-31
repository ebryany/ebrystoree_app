import { z } from "zod";

export const MARKETPLACE_SERVICE_CHECKOUT_ENABLED = true;

export const marketplaceServiceCheckoutSchema = z
  .object({
    serviceId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    expectedTotal: z.number().int().min(1).max(2_000_000_000),
    requirements: z.string().trim().min(10).max(5000),
    agreementAccepted: z.literal(true),
  })
  .strict();

export const marketplaceServiceAgreementSchema = z
  .object({
    scope: z.string().trim().min(10).max(5000),
    exclusions: z.string().trim().min(3).max(5000),
    deliverable: z.string().trim().min(3).max(5000),
    requirements: z.string().trim().min(3).max(5000),
    durationDays: z.number().int().positive().max(2_147_483_647),
    revisionLimit: z.number().int().min(0).max(2_147_483_647),
  })
  .strict();

export const MARKETPLACE_SERVICE_MEDIA_MAX = 5;
export const MARKETPLACE_SERVICE_IMAGE_MAX_BYTES = 5_242_880;
export const MARKETPLACE_SERVICE_VIDEO_MAX_BYTES = 26_214_400;

export const MARKETPLACE_SERVICE_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
] as const;

export type MarketplaceServiceMediaKind = "image" | "video";

/** Satu entri media listing; path selalu di bucket service-media. */
export const marketplaceServiceMediaSchema = z
  .object({
    kind: z.enum(["image", "video"]),
    path: z
      .string()
      .trim()
      .min(5)
      .max(400)
      .startsWith("service-media/")
      .refine((value) => !value.includes(".."), { message: "Path media tidak valid." }),
    alt: z.string().trim().min(1).max(160),
    mime: z.enum(MARKETPLACE_SERVICE_MEDIA_MIME_TYPES),
    size: z.number().int().min(1).max(MARKETPLACE_SERVICE_VIDEO_MAX_BYTES),
  })
  .strict()
  .refine(
    (value) =>
      value.kind === "video"
        ? value.mime.startsWith("video/") && value.size <= MARKETPLACE_SERVICE_VIDEO_MAX_BYTES
        : value.mime.startsWith("image/") && value.size <= MARKETPLACE_SERVICE_IMAGE_MAX_BYTES,
    { message: "Jenis media tidak cocok dengan format atau ukurannya." },
  );

export type MarketplaceServiceMedia = z.infer<typeof marketplaceServiceMediaSchema>;

/** URL publik media dari path storage (bucket privat, dilayani lewat proxy). */
export function serviceMediaUrl(path: string): string {
  const relative = path.startsWith("service-media/") ? path.slice("service-media/".length) : path;
  return `/api/public/service-media/${relative}`;
}

export const marketplaceServiceMediaListSchema = z
  .array(marketplaceServiceMediaSchema)
  .max(MARKETPLACE_SERVICE_MEDIA_MAX)
  .refine((items) => new Set(items.map((item) => item.path)).size === items.length, {
    message: "Media yang sama tidak boleh dipakai dua kali.",
  });

export const marketplaceServiceDraftSchema = z
  .object({
    id: z.string().uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: z.string().trim().min(3).max(160),
    categoryId: z.string().uuid(),
    price: z.number().int().min(1).max(1_000_000_000),
    agreement: marketplaceServiceAgreementSchema,
    media: marketplaceServiceMediaListSchema.default([]),
  })
  .strict()
  .refine((value) => Boolean(value.id) === Boolean(value.expectedVersion), {
    message: "Versi listing diperlukan saat mengubah draft.",
  });

export const marketplaceServiceActionSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    action: z.enum(["submit", "archive", "approve", "reject"]),
    reason: z.string().trim().max(1000).default(""),
  })
  .strict()
  .refine((value) => !["approve", "reject"].includes(value.action) || value.reason.length >= 5, {
    message: "Alasan moderasi minimal 5 karakter.",
  });

export type MarketplaceServiceAgreement = z.infer<typeof marketplaceServiceAgreementSchema>;
export type MarketplaceServiceDraft = z.infer<typeof marketplaceServiceDraftSchema>;
export type MarketplaceServiceAction = z.infer<typeof marketplaceServiceActionSchema>;
export type MarketplaceServiceListing = {
  id: string;
  store_id: string;
  category_id: string;
  name: string;
  price: number;
  agreement: MarketplaceServiceAgreement;
  media: MarketplaceServiceMedia[];
  status: "draft" | "in_review" | "approved" | "rejected" | "archived";
  version: number;
  moderation_note: string | null;
  created_at: string;
};

export type PublicMarketplaceService = {
  id: string;
  name: string;
  price: number;
  agreement: MarketplaceServiceAgreement;
  media: MarketplaceServiceMedia[];
  store: {
    name: string;
    slug: string;
    id?: string;
    logo_url?: string | null;
    presence?: import("./store-presence").StorePresence;
  };
  category: { name: string; slug: string };
};

export const marketplaceServiceStatusLabels: Record<MarketplaceServiceListing["status"], string> = {
  draft: "Draft",
  in_review: "Menunggu moderasi",
  approved: "Disetujui untuk katalog",
  rejected: "Perlu perbaikan",
  archived: "Diarsipkan",
};

export type MarketplaceServiceWorkState =
  | "awaiting_requirements"
  | "in_progress"
  | "delivered"
  | "revision_requested"
  | "accepted"
  | "complaint_open"
  | "refunded";

export const marketplaceServiceWorkStateLabels: Record<MarketplaceServiceWorkState, string> = {
  awaiting_requirements: "Menunggu persetujuan requirements",
  in_progress: "Sedang dikerjakan",
  delivered: "Hasil dikirim, menunggu peninjauan",
  revision_requested: "Revisi diminta",
  accepted: "Diterima pembeli",
  complaint_open: "Komplain ditinjau admin",
  refunded: "Dana dikembalikan",
};

export type MarketplaceServiceDelivery = {
  id: string;
  order_id: string;
  version: number;
  kind: "link" | "note" | "file";
  url: string | null;
  note: string | null;
  summary: string;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type MarketplaceServiceEvent = {
  id: number;
  order_id: string;
  event_type: string;
  actor_role: "buyer" | "seller" | "admin" | "system";
  payload: Record<string, any>;
  created_at: string;
};

export type MarketplaceServiceOrderContract = {
  order_id: string;
  service_id: string;
  store_id: string;
  agreement: MarketplaceServiceAgreement;
  agreement_version: number;
  requirements: Record<string, any> | null;
  requirements_version: number;
  requirements_approved_at: string | null;
  ready_at: string | null;
  due_at: string | null;
  revision_limit: number;
  revision_used: number;
  latest_delivery_id: string | null;
  accepted_delivery_id: string | null;
  accepted_at: string | null;
  work_state: MarketplaceServiceWorkState;
  complaint_open: boolean;
  /** Batas seller menyetujui/menolak kebutuhan; lewat = refund otomatis. */
  seller_response_due_at: string | null;
  /** Batas pembeli meninjau hasil; lewat = diterima otomatis. */
  review_due_at: string | null;
  extension_requested_days: number | null;
  extension_reason: string | null;
  extension_requested_at: string | null;
  extension_count: number;
};

export type MarketplaceServiceOrderRow = {
  order_id: string;
  order_number: string;
  order_status: string;
  total: number;
  paid_at: string | null;
  work_state: MarketplaceServiceWorkState;
  complaint_open: boolean;
  due_at: string | null;
  revision_used: number;
  revision_limit: number;
  requirements_approved_at: string | null;
  accepted_at: string | null;
  service_name: string;
  seller_response_due_at: string | null;
  review_due_at: string | null;
  extension_requested_days: number | null;
};

/** Batas pengajuan perpanjangan tenggat; sama dengan CHECK di database. */
export const MARKETPLACE_SERVICE_EXTENSION_MAX_DAYS = 14;

export const marketplaceServiceRejectSchema = z
  .object({ orderId: z.string().uuid(), reason: z.string().trim().min(10).max(1000) })
  .strict();

export const marketplaceServiceExtensionRequestSchema = z
  .object({
    orderId: z.string().uuid(),
    days: z.number().int().min(1).max(MARKETPLACE_SERVICE_EXTENSION_MAX_DAYS),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export const marketplaceServiceExtensionResponseSchema = z
  .object({ orderId: z.string().uuid(), approve: z.boolean() })
  .strict();

export const marketplaceServiceCancelOverdueSchema = z
  .object({ orderId: z.string().uuid(), reason: z.string().trim().max(1000).default("") })
  .strict();

export type SellerServiceOrderDetail = {
  order: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    paid_at: string | null;
    created_at: string;
  };
  contract: MarketplaceServiceOrderContract;
  service_name: string;
  deliveries: MarketplaceServiceDelivery[];
  events: MarketplaceServiceEvent[];
};

export const marketplaceServiceRevisionSchema = z
  .object({
    orderId: z.string().uuid(),
    deliveryId: z.string().uuid(),
    reason: z.string().trim().min(10).max(5000),
  })
  .strict();

export const marketplaceServiceAcceptSchema = z
  .object({ orderId: z.string().uuid(), deliveryId: z.string().uuid() })
  .strict();

export const marketplaceServiceComplaintSchema = z
  .object({
    orderId: z.string().uuid(),
    reason: z.string().trim().min(10).max(5000),
    deliveryId: z.string().uuid().optional(),
  })
  .strict();

export const MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES = 26_214_400;

/** Format artifact yang diterima; cerminan manifest bucket service-deliveries. */
export const MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES = [
  "application/pdf",
  "application/zip",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const marketplaceServiceDeliverySchema = z
  .object({
    orderId: z.string().uuid(),
    kind: z.enum(["link", "note", "file"]),
    url: z
      .string()
      .trim()
      .max(2000)
      .regex(/^https:\/\//)
      .refine((value) => !/^https:\/\/[^/@]*@/.test(value), {
        message: "URL tidak boleh memuat kredensial.",
      })
      .optional(),
    note: z.string().trim().min(3).max(5000).optional(),
    storagePath: z
      .string()
      .trim()
      .min(5)
      .max(400)
      .refine((value) => !value.includes(".."), { message: "Path berkas tidak valid." })
      .optional(),
    originalName: z.string().trim().min(1).max(255).optional(),
    mimeType: z.enum(MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES).optional(),
    fileSize: z.number().int().min(1).max(MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES).optional(),
    summary: z.string().trim().min(3).max(5000),
  })
  .strict()
  .refine(
    (value) =>
      (value.kind === "link" && Boolean(value.url)) ||
      (value.kind === "note" && Boolean(value.note)) ||
      (value.kind === "file" &&
        Boolean(value.storagePath) &&
        Boolean(value.originalName) &&
        Boolean(value.mimeType) &&
        Boolean(value.fileSize)),
    {
      message:
        "Delivery link wajib URL HTTPS, delivery note wajib catatan, delivery berkas wajib metadata lengkap.",
    },
  );

export const marketplaceServiceResolutionSchema = z
  .object({
    orderId: z.string().uuid(),
    decision: z.enum(["resume", "refund"]),
    reason: z.string().trim().min(5).max(5000),
  })
  .strict();

export type MarketplaceServiceRevision = z.infer<typeof marketplaceServiceRevisionSchema>;
export type MarketplaceServiceAccept = z.infer<typeof marketplaceServiceAcceptSchema>;
export type MarketplaceServiceComplaint = z.infer<typeof marketplaceServiceComplaintSchema>;
export type MarketplaceServiceDeliveryInput = z.infer<typeof marketplaceServiceDeliverySchema>;
export type MarketplaceServiceResolution = z.infer<typeof marketplaceServiceResolutionSchema>;

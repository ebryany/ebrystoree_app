import { z } from "zod";
import { clientIpFrom } from "./client-ip.server";
import { canSubmitManualProof, PROOF_MAX_BYTES, PROOF_MIME_TYPES } from "./manual-payment";
import type { MobileAuthContext, MobileAuthResult } from "./mobile-auth.server";
import { enforceRateLimit } from "./rate-limit.server";
import { isFeatureEnabled } from "./website-settings.server";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const PROOF_MIME_EXT: Record<(typeof PROOF_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const PAYABLE_SUMOPOD = ["waiting_payment", "pending", "rejected", "processing"];
const PAYABLE_SHOPEEPAY = ["waiting_payment", "pending"];

const cartValidateSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            variantId: z.string().uuid().nullable().optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

const createDigitalOrderSchema = z
  .object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
    quantity: z.number().int().min(1).max(10).default(1),
    idempotencyKey: z.string().min(8).max(64),
    note: z.string().trim().max(500).optional(),
    useCredit: z.boolean().optional(),
  })
  .strict();

const ordersListQuerySchema = z
  .object({
    filter: z
      .enum(["all", "digital", "service", "unpaid", "active", "completed", "cancelled"])
      .default("all"),
    page: z.coerce.number().int().min(1).max(500).default(1),
  })
  .strict();

const applyCreditSchema = z
  .object({
    maxCredit: z.number().int().min(0).optional(),
  })
  .strict();

const cancelOrderSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
  })
  .strict();

const refundOrderSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

const paymentStartSchema = z
  .object({
    paymentId: z.string().uuid(),
    refresh: z.boolean().optional(),
  })
  .strict();

const paymentCheckSchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

const manualProofUploadSchema = z
  .object({
    paymentId: z.string().uuid(),
    mimeType: z.enum(PROOF_MIME_TYPES),
    sizeBytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
  })
  .strict();

const manualProofSubmitSchema = z
  .object({
    paymentId: z.string().uuid(),
    filePath: z.string().min(3).max(300),
    originalFilename: z.string().min(1).max(200),
    mimeType: z.enum(PROOF_MIME_TYPES),
    sizeBytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
    senderName: z.string().trim().min(2).max(100),
    amountClaimed: z.number().int().min(0),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .max(24)
      .regex(/^[0-9+\-\s()]*$/, "Nomor telepon tidak valid")
      .optional()
      .or(z.literal("")),
    emailNotificationsEnabled: z.boolean().optional(),
  })
  .strict();

const avatarUploadSchema = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
    sizeBytes: z.number().int().min(1).max(AVATAR_MAX_BYTES),
  })
  .strict();

const avatarSaveSchema = z
  .object({
    avatarUrl: z
      .string()
      .trim()
      .max(300)
      .regex(/^\/api\/public\/avatar\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]{2,5}$/, "URL avatar tidak valid")
      .or(z.literal("")),
  })
  .strict();

const uuidSchema = z.string().uuid();

type StoredQris = {
  providerPaymentId: string;
  payUrl: string;
  amount: number;
  fee: number;
  total: number;
  expiredAt: string;
  qrString?: string;
};

type VariantRow = { id: string; name: string; price: number; discount_price: number | null };

function resolvePrice(price: unknown, discount: unknown) {
  const basePrice = Number(price);
  const discountPrice = Number(discount);
  const hasDiscount =
    discount != null &&
    Number.isFinite(discountPrice) &&
    discountPrice > 0 &&
    discountPrice < basePrice;
  return { price: hasDiscount ? discountPrice : basePrice, basePrice, hasDiscount };
}

function parseSumopodQr(value: string | null): StoredQris | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.provider === "shopeepay") return null;
    if (parsed && typeof parsed.payUrl === "string" && typeof parsed.expiredAt === "string") {
      return parsed as StoredQris;
    }
  } catch {
    return null;
  }
  return null;
}

export type MobileCommerceHelpers = {
  ok: (data: unknown, status?: number) => Response;
  err: (code: string, message: string, status: number) => Response;
  readJsonBody: (
    request: Request,
  ) => Promise<{ ok: true; body: unknown } | { ok: false; response: Response }>;
  requireAuth: (request: Request) => Promise<MobileAuthResult>;
  checkPublicRateLimit: (request: Request) => Promise<{ error: string } | null>;
  checkFeature?: (key: string) => Promise<boolean>;
  checkUserRateLimit?: (
    userId: string,
    bucket: "order.create" | "payment.proof" | "refund.request" | "qris.create" | "qris.check",
  ) => Promise<{ error: string } | null>;
  validateCart?: (
    items: z.infer<typeof cartValidateSchema>["items"],
  ) => Promise<{ items: unknown[]; error: string | null }>;
};

async function defaultValidateCart(items: z.infer<typeof cartValidateSchema>["items"]) {
  if (items.length === 0) return { items: [], error: null };
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();

  const productIds = [...new Set(items.map((it) => it.productId))];
  const { data: rows, error } = await supabase
    .from("digital_products")
    .select(
      "id, name, slug, thumbnail_url, price, discount_price, status, deleted_at, delivery_mode, store_id, stores(id, name, slug, status), product_variants(id, name, price, discount_price)",
    )
    .in("id", productIds);

  if (error) {
    return { items: [], error: "Keranjang tidak dapat diperiksa. Coba lagi." };
  }

  const found = new Map((rows ?? []).map((row: any) => [row.id, row]));
  const resolved = items.map(({ productId, variantId }) => {
    const variantKey = variantId ?? null;
    const row: any = found.get(productId);
    if (!row) {
      return { productId, variantId: variantKey, available: false, reason: "PRODUCT_GONE" };
    }

    const store = row.stores as { id: string; name: string; slug: string; status: string } | null;
    const variants: VariantRow[] =
      (row.delivery_mode ?? "shared") === "shared" ? (row.product_variants ?? []) : [];
    const variant = variantKey ? variants.find((v) => v.id === variantKey) : undefined;

    const unavailableReason =
      row.deleted_at !== null
        ? "PRODUCT_GONE"
        : row.status !== "published"
          ? "NOT_PUBLISHED"
          : store && store.status !== "active"
            ? "STORE_INACTIVE"
            : variantKey && !variant
              ? "VARIANT_GONE"
              : !variantKey && variants.length > 0
                ? "VARIANT_REQUIRED"
                : null;

    const pricing = variant
      ? resolvePrice(variant.price, variant.discount_price)
      : resolvePrice(row.price, row.discount_price);

    return {
      productId: row.id as string,
      variantId: variant?.id ?? variantKey,
      variantName: variant?.name ?? null,
      name: row.name as string,
      slug: row.slug as string,
      thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
      storeId: store?.id ?? null,
      storeName: store?.name ?? null,
      storeSlug: store?.slug ?? null,
      deliveryMode: (row.delivery_mode as string | null) ?? "shared",
      ...pricing,
      available: unavailableReason === null,
      reason: unavailableReason,
    };
  });

  return { items: resolved, error: null };
}

async function resolveAvatarSignedUrl(
  ctx: MobileAuthContext,
  avatarUrl: string | null | undefined,
): Promise<string | null> {
  if (!avatarUrl || !avatarUrl.startsWith("/api/public/avatar/")) return null;
  const path = avatarUrl.slice("/api/public/avatar/".length);
  if (!path) return null;
  const { data } = await ctx.supabase.storage.from("avatars").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function handleMobileCommerceRoute(
  request: Request,
  path: string,
  method: string,
  url: URL,
  h: MobileCommerceHelpers,
): Promise<Response | null> {
  const checkFeature = h.checkFeature ?? isFeatureEnabled;
  const checkUserRate = h.checkUserRateLimit ?? enforceRateLimit;

  if (path === "/api/mobile/v1/cart/validate") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const limited = await h.checkPublicRateLimit(request);
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = cartValidateSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Isi keranjang tidak valid.", 400);
    const res = await (h.validateCart ?? defaultValidateCart)(parsed.data.items);
    if (res.error) return h.err("CART_UNAVAILABLE", res.error, 503);
    return h.ok({ items: res.items });
  }

  if (path === "/api/mobile/v1/dashboard/summary") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const { supabase: sb, userId: uid } = auth.context;
    const count = (q: any) => q.select("id", { count: "exact", head: true });

    const [
      total,
      awaiting,
      review,
      active,
      done,
      entitlements,
      refunds,
      unreadNotif,
      creditBal,
      recentRes,
    ] = await Promise.all([
      count(sb.from("orders")).eq("user_id", uid),
      count(sb.from("orders")).eq("user_id", uid).eq("status", "awaiting_payment"),
      count(sb.from("orders")).eq("user_id", uid).eq("status", "payment_under_review"),
      count(sb.from("orders"))
        .eq("user_id", uid)
        .in("status", [
          "paid",
          "waiting_assignment",
          "assigned",
          "queued",
          "in_progress",
          "waiting_customer_review",
        ]),
      count(sb.from("orders")).eq("user_id", uid).eq("status", "completed"),
      count(sb.from("digital_entitlements")).eq("user_id", uid).is("revoked_at", null),
      count(sb.from("refunds"))
        .eq("customer_id", uid)
        .in("status", [
          "requested",
          "under_review",
          "information_requested",
          "approved",
          "processing",
        ]),
      count(sb.from("notifications")).eq("recipient_id", uid).is("read_at", null),
      sb.rpc("get_my_credit_balance"),
      sb
        .from("orders")
        .select(
          "id, order_number, order_type, status, total, created_at, order_items(name_snapshot)",
        )
        .eq("user_id", uid)
        .not("status", "in", "(completed,cancelled,refunded)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    return h.ok({
      totalOrders: total.count ?? 0,
      awaitingPayment: awaiting.count ?? 0,
      underReview: review.count ?? 0,
      activeOrders: active.count ?? 0,
      completedOrders: done.count ?? 0,
      entitlements: entitlements.count ?? 0,
      activeRefunds: refunds.count ?? 0,
      unreadNotifications: unreadNotif.count ?? 0,
      creditBalance: Number(creditBal.data ?? 0),
      recentOrders: recentRes.data ?? [],
    });
  }

  if (path === "/api/mobile/v1/credit") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const sb = auth.context.supabase;
    const [{ data: balance, error: balErr }, { data: entries, error: ledErr }] = await Promise.all([
      sb.rpc("get_my_credit_balance"),
      sb
        .from("credit_ledger")
        .select("id, direction, amount, source_type, reference, note, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (balErr || ledErr) return h.err("CREDIT_UNAVAILABLE", "Saldo tidak dapat dimuat.", 503);
    return h.ok({ balance: Number(balance ?? 0), items: entries ?? [] });
  }

  if (path === "/api/mobile/v1/orders/digital") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    if (
      !(await checkFeature("feature_checkout")) ||
      !(await checkFeature("feature_digital_products"))
    ) {
      return h.err(
        "FEATURE_DISABLED",
        "Fitur checkout produk digital sedang dinonaktifkan sementara.",
        403,
      );
    }
    const limited = await checkUserRate(auth.context.userId, "order.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = createDigitalOrderSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "Data checkout produk tidak valid.", 400);

    const { rpcErrorMessage } = await import("./transaction.server");
    const { data: result, error } = await auth.context.supabase.rpc("create_digital_order", {
      _product_id: parsed.data.productId,
      _quantity: parsed.data.quantity,
      _idempotency_key: parsed.data.idempotencyKey,
      _customer_note: parsed.data.note ?? undefined,
      _variant_id: parsed.data.variantId ?? undefined,
    });
    if (error) {
      return h.err("ORDER_CREATE_FAILED", rpcErrorMessage(error.message), 400);
    }

    const created = result as { order_id: string; order_number: string; duplicate: boolean };
    let creditUsed = 0;
    let amountDue: number | null = null;
    if (parsed.data.useCredit) {
      const { data: creditRes } = await auth.context.supabase.rpc("apply_credit_to_order", {
        _order_id: created.order_id,
        _max_credit: null as unknown as number,
      });
      if (creditRes) {
        creditUsed = Number((creditRes as { credit_used?: number }).credit_used ?? 0);
        amountDue = Number((creditRes as { amount_due?: number }).amount_due ?? 0);
      }
    }

    return h.ok(
      {
        orderId: created.order_id,
        orderNumber: created.order_number,
        duplicate: Boolean(created.duplicate),
        creditUsed,
        amountDue,
      },
      201,
    );
  }

  if (path === "/api/mobile/v1/orders") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const parsed = ordersListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success)
      return h.err("INVALID_QUERY", "Parameter filter pesanan tidak valid.", 400);

    const { supabase: sb, userId: uid } = auth.context;
    const size = 15;
    const from = (parsed.data.page - 1) * size;
    let query = sb
      .from("orders")
      .select(
        "id, order_number, order_type, status, total, credit_used, amount_due, created_at, order_items(name_snapshot, quantity), payments(status, id)",
        { count: "exact" },
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(from, from + size - 1);

    if (parsed.data.filter === "digital") query = query.eq("order_type", "digital_product");
    else if (parsed.data.filter === "service")
      query = query.in("order_type", ["service", "marketplace_service"]);
    else if (parsed.data.filter === "unpaid")
      query = query.in("status", ["awaiting_payment", "payment_under_review"]);
    else if (parsed.data.filter === "active")
      query = query.in("status", [
        "paid",
        "waiting_assignment",
        "assigned",
        "queued",
        "in_progress",
      ]);
    else if (parsed.data.filter === "completed") query = query.eq("status", "completed");
    else if (parsed.data.filter === "cancelled")
      query = query.in("status", ["cancelled", "refunded"]);

    const { data: rows, count, error } = await query;
    if (error) return h.err("ORDERS_UNAVAILABLE", "Daftar pesanan tidak dapat dimuat.", 503);
    const total = count ?? 0;
    const hasMore = from + (rows?.length ?? 0) < total;
    return h.ok({ items: rows ?? [], total, page: parsed.data.page, hasMore });
  }

  const orderActionMatch =
    /^\/api\/mobile\/v1\/orders\/([^/]+)\/(apply-credit|confirm-receipt|cancel|refund)$/.exec(path);
  if (orderActionMatch) {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const orderIdRes = uuidSchema.safeParse(decodeURIComponent(orderActionMatch[1]));
    if (!orderIdRes.success) return h.err("INVALID_QUERY", "ID pesanan tidak valid.", 400);
    const orderId = orderIdRes.data;
    const action = orderActionMatch[2];
    const { rpcErrorMessage } = await import("./transaction.server");

    if (action === "apply-credit") {
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = applyCreditSchema.safeParse(bodyRes.body);
      if (!parsed.success) return h.err("INVALID_INPUT", "Nominal saldo tidak valid.", 400);
      const { data: result, error } = await auth.context.supabase.rpc("apply_credit_to_order", {
        _order_id: orderId,
        _max_credit: (parsed.data.maxCredit ?? null) as unknown as number,
      });
      if (error) return h.err("CREDIT_APPLY_FAILED", rpcErrorMessage(error.message), 400);
      const r = result as { credit_used: number; amount_due: number; duplicate: boolean };
      return h.ok({
        creditUsed: Number(r.credit_used ?? 0),
        amountDue: Number(r.amount_due ?? 0),
        duplicate: Boolean(r.duplicate),
      });
    }

    if (action === "confirm-receipt") {
      const { error } = await auth.context.supabase.rpc("confirm_digital_receipt", {
        _order_id: orderId,
      });
      if (error) return h.err("CONFIRM_RECEIPT_FAILED", rpcErrorMessage(error.message), 400);
      try {
        const { dispatchEmails } = await import("./email-dispatch.server");
        await dispatchEmails(5);
      } catch {
        // Email retry is handled by scheduled cron.
      }
      return h.ok({ confirmed: true });
    }

    if (action === "cancel") {
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = cancelOrderSchema.safeParse(bodyRes.body);
      if (!parsed.success)
        return h.err("INVALID_INPUT", "Alasan pembatalan minimal 5 karakter.", 400);
      const { error } = await auth.context.supabase.rpc("cancel_own_order", {
        _order_id: orderId,
        _reason: parsed.data.reason,
      });
      if (error) return h.err("CANCEL_FAILED", rpcErrorMessage(error.message), 400);
      return h.ok({ cancelled: true });
    }

    if (action === "refund") {
      if (!(await checkFeature("feature_refund"))) {
        return h.err("FEATURE_DISABLED", "Pengajuan refund sedang dinonaktifkan sementara.", 403);
      }
      const limited = await checkUserRate(auth.context.userId, "refund.request");
      if (limited) return h.err("RATE_LIMITED", limited.error, 429);
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = refundOrderSchema.safeParse(bodyRes.body);
      if (!parsed.success) return h.err("INVALID_INPUT", "Alasan refund minimal 10 karakter.", 400);
      const { error } = await auth.context.supabase.rpc("request_refund", {
        _order_id: orderId,
        _reason: parsed.data.reason,
      });
      if (error) return h.err("REFUND_FAILED", rpcErrorMessage(error.message), 400);
      return h.ok({ requested: true });
    }
  }

  const orderDetailMatch = /^\/api\/mobile\/v1\/orders\/([^/]+)$/.exec(path);
  if (orderDetailMatch) {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const orderIdRes = uuidSchema.safeParse(decodeURIComponent(orderDetailMatch[1]));
    if (!orderIdRes.success) return h.err("INVALID_QUERY", "ID pesanan tidak valid.", 400);

    const sb = auth.context.supabase;
    const { data: order, error } = await sb
      .from("orders")
      .select(
        "id, order_number, order_type, status, subtotal, discount_total, admin_fee, total, credit_used, amount_due, customer_note, expired_at, paid_at, completed_at, cancelled_at, cancellation_reason, created_at",
      )
      .eq("id", orderIdRes.data)
      .eq("user_id", auth.context.userId)
      .maybeSingle();

    if (error || !order) return h.err("ORDER_NOT_FOUND", "Pesanan tidak ditemukan.", 404);

    const tx = await import("./transaction.server");
    const [
      items,
      invoice,
      payments,
      histories,
      entitlements,
      refunds,
      receiptRes,
      manualAccount,
      instruction,
      methods,
    ] = await Promise.all([
      sb
        .from("order_items")
        .select("id, name_snapshot, unit_price, quantity, total, item_type")
        .eq("order_id", order.id),
      sb
        .from("invoices")
        .select("invoice_number, status, issued_at, due_at, paid_at, total")
        .eq("order_id", order.id)
        .maybeSingle(),
      sb
        .from("payments")
        .select(
          "id, payment_number, status, method, provider, expected_amount, paid_amount, expired_at, paid_at, reupload_count, qr_reference, payment_url",
        )
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
      sb
        .from("order_status_histories")
        .select("previous_status, new_status, public_note, actor_type, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      sb
        .from("digital_entitlements")
        .select("id, product_id, download_limit, download_count, valid_until, revoked_at")
        .eq("order_id", order.id),
      sb
        .from("refunds")
        .select("refund_number, amount, status, reason, created_at")
        .eq("order_id", order.id),
      sb.rpc("get_my_digital_receipt", { _order_id: order.id }),
      tx.loadManualAccount(),
      tx.loadPaymentInstruction(sb),
      tx.loadPaymentMethods(),
    ]);

    return h.ok({
      order,
      items: items.data ?? [],
      invoice: invoice.data ?? null,
      payments: payments.data ?? [],
      histories: histories.data ?? [],
      entitlements: entitlements.data ?? [],
      refunds: refunds.data ?? [],
      digitalReceipt: receiptRes.error ? null : (receiptRes.data ?? null),
      manualAccount,
      instruction: instruction.instruction,
      qrisAvailable: methods.qris,
      shopeepayAvailable: methods.shopeepay,
      manualAvailable: methods.manual,
    });
  }

  if (path === "/api/mobile/v1/payments/qris/start") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "qris.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = paymentStartSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "ID pembayaran tidak valid.", 400);

    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) {
      return h.err(
        "QRIS_UNAVAILABLE",
        "Pembayaran QRIS belum dikonfigurasi. Gunakan transfer manual.",
        503,
      );
    }

    const { data: payment, error } = await auth.context.supabase
      .from("payments")
      .select(
        "id, payment_number, status, provider, method, expected_amount, qr_reference, payment_url, order_id",
      )
      .eq("id", parsed.data.paymentId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();

    if (error || !payment) return h.err("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
    if (payment.status === "paid") return h.err("ALREADY_PAID", "Pembayaran ini sudah lunas.", 409);
    if (!PAYABLE_SUMOPOD.includes(payment.status)) {
      return h.err("INVALID_PAYMENT_STATE", "Status pembayaran tidak mengizinkan QRIS.", 409);
    }

    const amount = Number(payment.expected_amount);
    const existing = parseSumopodQr(payment.qr_reference);
    if (
      !parsed.data.refresh &&
      existing?.qrString &&
      new Date(existing.expiredAt).getTime() > Date.now() + 60_000
    ) {
      return h.ok({ qris: existing, payUrl: existing.payUrl });
    }

    const orderRef =
      parsed.data.refresh || existing
        ? `${payment.payment_number}-${Date.now().toString(36)}`
        : payment.payment_number;

    const created = await sumopod.createQrisPayment(cfg, orderRef, amount);
    if (!created)
      return h.err("PROVIDER_ERROR", "Gagal membuat QRIS. Coba lagi sebentar lagi.", 502);

    const qr = await sumopod.fetchQrPayload(created.paymentLinkUrl);
    const { readNumberSetting } = await import("./website-settings.server");
    const expiryMinutes = Math.max(5, await readNumberSetting("qris_expiry_minutes"));
    const qris: StoredQris = {
      providerPaymentId: created.paymentId,
      payUrl: created.paymentLinkUrl,
      amount: created.netAmount || amount,
      fee: created.fee,
      total: created.amount || amount,
      expiredAt:
        qr?.expiresAt ??
        created.expiresAt ??
        new Date(Date.now() + expiryMinutes * 60_000).toISOString(),
      ...(qr?.qrString ? { qrString: qr.qrString } : {}),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        provider: "sumopod",
        method: "qris",
        qr_reference: JSON.stringify(qris),
        payment_url: qris.payUrl,
        external_transaction_id: created.paymentId,
      })
      .eq("id", payment.id)
      .eq("status", payment.status)
      .eq("provider", payment.provider)
      .eq("method", payment.method)
      .eq("expected_amount", payment.expected_amount)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return h.err("PAYMENT_CONFLICT", "Status pembayaran berubah. Muat ulang pesanan.", 409);
    }
    return h.ok({ qris, payUrl: qris.payUrl });
  }

  if (path === "/api/mobile/v1/payments/qris/check") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = paymentCheckSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "ID pembayaran tidak valid.", 400);

    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) return h.err("QRIS_UNAVAILABLE", "Pembayaran QRIS belum dikonfigurasi.", 503);

    const { data: payment } = await auth.context.supabase
      .from("payments")
      .select("id, payment_number, status, expected_amount, qr_reference, external_transaction_id")
      .eq("id", parsed.data.paymentId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();

    if (!payment) return h.err("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
    if (payment.status === "paid") return h.ok({ status: "paid" });

    const stored = parseSumopodQr(payment.qr_reference);
    const providerId =
      stored?.providerPaymentId ?? (payment.external_transaction_id as string | null);
    if (!providerId) return h.ok({ status: "pending" });

    const detail = await sumopod.getPaymentStatus(cfg, providerId);
    if (!detail) {
      const { data: fresh } = await auth.context.supabase
        .from("payments")
        .select("status")
        .eq("id", payment.id)
        .maybeSingle();
      return h.ok({ status: fresh?.status === "paid" ? "paid" : "pending" });
    }
    if (!["completed", "paid", "success", "settled"].includes(detail.status.toLowerCase())) {
      return h.ok({ status: detail.status });
    }
    const settled = await sumopod.settleSumopodPayment(
      payment.id,
      providerId,
      Number(payment.expected_amount),
    );
    if (!settled.ok) {
      return h.err(
        "SETTLE_FAILED",
        "Pembayaran terdeteksi, namun gagal diproses. Hubungi admin.",
        500,
      );
    }
    return h.ok({ status: "paid" });
  }

  if (path === "/api/mobile/v1/payments/shopeepay/start") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);

    const sp = await import("./shopeepay.server");
    const cfg = sp.shopeepayConfig();
    const { loadPaymentMethods } = await import("./transaction.server");
    if (!cfg || !(await loadPaymentMethods()).shopeepay) {
      return h.err(
        "SHOPEEPAY_UNAVAILABLE",
        "ShopeePay QRIS belum aktif. Gunakan metode lain.",
        503,
      );
    }
    const limited = await checkUserRate(auth.context.userId, "qris.create");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = paymentStartSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "ID pembayaran tidak valid.", 400);

    const { data: payment, error } = await auth.context.supabase
      .from("payments")
      .select(
        "id, payment_number, status, provider, method, expected_amount, expired_at, qr_reference, order_id",
      )
      .eq("id", parsed.data.paymentId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();

    if (error || !payment) return h.err("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
    if (payment.status === "paid") return h.err("ALREADY_PAID", "Pembayaran ini sudah lunas.", 409);
    if (!PAYABLE_SHOPEEPAY.includes(payment.status)) {
      return h.err("INVALID_PAYMENT_STATE", "Status pembayaran tidak mengizinkan QRIS.", 409);
    }

    const { data: order } = await auth.context.supabase
      .from("orders")
      .select("status")
      .eq("id", payment.order_id)
      .maybeSingle();
    if (order?.status !== "awaiting_payment") {
      return h.err("INVALID_ORDER_STATE", "Pesanan tidak lagi menunggu pembayaran.", 409);
    }

    const amount = Number(payment.expected_amount);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return h.err("INVALID_AMOUNT", "Nominal tagihan tidak valid.", 400);
    }
    const paymentDeadline = payment.expired_at ? new Date(payment.expired_at).getTime() : null;
    if (paymentDeadline !== null && paymentDeadline <= Date.now() + 60_000) {
      return h.err("PAYMENT_EXPIRED", "Batas waktu pembayaran sudah lewat.", 409);
    }

    const existing = sp.parseStoredQr(payment.qr_reference);
    if (
      !parsed.data.refresh &&
      existing &&
      existing.amount === amount &&
      new Date(existing.expiredAt).getTime() > Date.now() + 60_000
    ) {
      return h.ok({
        qris: {
          payUrl: existing.payUrl,
          amount: existing.amount,
          fee: existing.fee,
          total: existing.total,
          expiredAt: existing.expiredAt,
          qrString: existing.qrString,
          reference: existing.partnerReferenceNo,
        },
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("provider", "shopeepay")
      .eq("payment_id", payment.id)
      .eq("event_type", "qr.issued");
    const attempt = count ?? 0;
    if (attempt >= 20) {
      return h.err(
        "QR_LIMIT_REACHED",
        "Terlalu banyak QRIS dibuat untuk tagihan ini. Hubungi admin.",
        429,
      );
    }

    const ref = sp.buildPartnerReference(payment.payment_number, attempt);
    const reserved = await sp.recordShopeepayEvent({
      eventId: sp.issuedEventId(ref),
      paymentId: payment.id,
      eventType: "qr.issued",
      signatureValid: true,
      payloadHash: null,
      status: "received",
      details: {
        amount,
        currency: "IDR",
        paymentStatus: "pending",
        metadata: { partnerReferenceNo: ref },
      },
    });
    if (reserved !== "inserted") {
      return h.err("QR_IN_PROGRESS", "QRIS sedang dibuat. Tunggu sebentar lalu muat ulang.", 409);
    }

    const validUntil = new Date(
      Math.min(
        Date.now() + cfg.validitySeconds * 1000,
        paymentDeadline ?? Number.POSITIVE_INFINITY,
      ),
    );
    const created = await sp.createDynamicQr(cfg, { partnerReferenceNo: ref, amount, validUntil });
    if (!created) {
      await supabaseAdmin
        .from("payment_events")
        .update({
          processing_status: "failed",
          processed_at: new Date().toISOString(),
          error: "generate failed",
        })
        .eq("provider", "shopeepay")
        .eq("external_event_id", sp.issuedEventId(ref));
      return h.err("PROVIDER_ERROR", "Gagal membuat QRIS ShopeePay. Coba lagi sebentar lagi.", 502);
    }

    const references = [...new Set([...(existing?.references ?? []), ref])];
    const stored = {
      provider: "shopeepay" as const,
      partnerReferenceNo: ref,
      references,
      qrString: created.qrContent,
      amount,
      fee: 0,
      total: amount,
      expiredAt: validUntil.toISOString(),
      payUrl: created.qrUrl ?? "",
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        provider: "shopeepay",
        method: "qris",
        qr_reference: JSON.stringify(stored),
        payment_url: stored.payUrl || null,
      })
      .eq("id", payment.id)
      .eq("status", payment.status)
      .eq("provider", payment.provider)
      .eq("method", payment.method)
      .eq("expected_amount", payment.expected_amount)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      await sp.invalidateQr(cfg, ref, "payment changed");
      await supabaseAdmin
        .from("payment_events")
        .update({
          processing_status: "rejected",
          processed_at: new Date().toISOString(),
          error: "payment changed before store",
        })
        .eq("provider", "shopeepay")
        .eq("external_event_id", sp.issuedEventId(ref));
      return h.err("PAYMENT_CONFLICT", "Status pembayaran berubah. Muat ulang pesanan.", 409);
    }

    await supabaseAdmin
      .from("payment_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        error: null,
      })
      .eq("provider", "shopeepay")
      .eq("external_event_id", sp.issuedEventId(ref));

    if (existing && existing.partnerReferenceNo !== ref) {
      await sp.invalidateQr(cfg, existing.partnerReferenceNo, "regenerated");
    }

    return h.ok({
      qris: {
        payUrl: stored.payUrl,
        amount: stored.amount,
        fee: stored.fee,
        total: stored.total,
        expiredAt: stored.expiredAt,
        qrString: stored.qrString,
        reference: stored.partnerReferenceNo,
      },
    });
  }

  if (path === "/api/mobile/v1/payments/shopeepay/check") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = paymentCheckSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "ID pembayaran tidak valid.", 400);

    const { data: payment } = await auth.context.supabase
      .from("payments")
      .select("id, payment_number, status, expected_amount, qr_reference")
      .eq("id", parsed.data.paymentId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();
    if (!payment) return h.err("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
    if (payment.status === "paid") return h.ok({ status: "paid" });

    const sp = await import("./shopeepay.server");
    const cfg = sp.shopeepayConfig();
    if (!cfg) return h.ok({ status: "unavailable" });
    const limited = await checkUserRate(auth.context.userId, "qris.check");
    if (limited) return h.ok({ status: "pending" });

    const outcome = await sp.verifyAndSettle(cfg, payment);
    const stored = sp.parseStoredQr(payment.qr_reference);
    const state = sp.buyerStateFor(outcome, stored?.expiredAt ?? null);
    if (state === "failed") {
      return h.ok({
        status: state,
        message:
          "Pembayaran terdeteksi tetapi tidak sesuai tagihan. Tim Ebrystore akan memeriksanya.",
      });
    }
    return h.ok({ status: state });
  }

  if (path === "/api/mobile/v1/payments/manual/proof-upload-url") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "payment.proof");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = manualProofUploadSchema.safeParse(bodyRes.body);
    if (!parsed.success) {
      return h.err(
        "INVALID_INPUT",
        "Format atau ukuran file bukti transfer tidak valid (maks 5 MB).",
        400,
      );
    }

    const { loadManualAccount } = await import("./transaction.server");
    const account = await loadManualAccount();
    if (
      !account.active ||
      account.method.toLowerCase() !== "dana" ||
      !account.number.trim() ||
      !account.holder.trim()
    ) {
      return h.err("MANUAL_UNAVAILABLE", "Pembayaran manual sedang tidak tersedia.", 503);
    }

    const { data: payment } = await auth.context.supabase
      .from("payments")
      .select("id, provider, method, status, expired_at, reupload_count, orders!inner(status)")
      .eq("id", parsed.data.paymentId)
      .eq("user_id", auth.context.userId)
      .maybeSingle();

    if (
      !payment ||
      !canSubmitManualProof(
        payment as any,
        (payment as any).orders.status,
        Date.now(),
        account.reuploadLimit,
      )
    ) {
      return h.err("PROOF_NOT_ALLOWED", "Pembayaran tidak mengizinkan unggah bukti manual.", 409);
    }

    const filePath = `${auth.context.userId}/${parsed.data.paymentId}/${crypto.randomUUID()}.${PROOF_MIME_EXT[parsed.data.mimeType]}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUploadUrl(filePath);
    if (error || !signed) {
      return h.err("UPLOAD_PREP_FAILED", "Gagal menyiapkan unggahan bukti. Coba lagi.", 503);
    }
    return h.ok({ path: filePath, token: signed.token, signedUrl: signed.signedUrl });
  }

  if (path === "/api/mobile/v1/payments/manual/submit") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const limited = await checkUserRate(auth.context.userId, "payment.proof");
    if (limited) return h.err("RATE_LIMITED", limited.error, 429);

    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = manualProofSubmitSchema.safeParse(bodyRes.body);
    if (!parsed.success)
      return h.err("INVALID_INPUT", "Data bukti pembayaran manual tidak valid.", 400);

    const { rpcErrorMessage } = await import("./transaction.server");
    const { data: result, error } = await auth.context.supabase.rpc("submit_payment_proof", {
      _payment_id: parsed.data.paymentId,
      _file_path: parsed.data.filePath,
      _original_filename: parsed.data.originalFilename,
      _mime_type: parsed.data.mimeType,
      _size_bytes: parsed.data.sizeBytes,
      _sender_name: parsed.data.senderName,
      _amount_claimed: parsed.data.amountClaimed,
      _note: parsed.data.note ?? undefined,
    });
    if (error) return h.err("PROOF_SUBMIT_FAILED", rpcErrorMessage(error.message), 400);
    return h.ok({ result });
  }

  if (path === "/api/mobile/v1/entitlements") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const { data, error } = await auth.context.supabase
      .from("digital_entitlements")
      .select(
        "id, download_limit, download_count, valid_until, revoked_at, file_version, order_id, digital_products(name, thumbnail_url, slug, delivery_mode, code_kind)",
      )
      .eq("user_id", auth.context.userId)
      .order("created_at", { ascending: false });
    if (error) return h.err("LIBRARY_UNAVAILABLE", "Pustaka produk tidak dapat dimuat.", 503);
    return h.ok({ items: data ?? [] });
  }

  const entitlementMatch = /^\/api\/mobile\/v1\/entitlements\/([^/]+)\/(download|stock-code)$/.exec(
    path,
  );
  if (entitlementMatch) {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const entIdRes = uuidSchema.safeParse(decodeURIComponent(entitlementMatch[1]));
    if (!entIdRes.success) return h.err("INVALID_QUERY", "ID produk tidak valid.", 400);
    const tx = await import("./transaction.server");

    if (entitlementMatch[2] === "download") {
      const ip = clientIpFrom((name) => request.headers.get(name));
      const ua = request.headers.get("user-agent") ?? null;
      const { data: result, error } = await auth.context.supabase.rpc("consume_download", {
        _entitlement_id: entIdRes.data,
        _ip: ip ?? undefined,
        _ua: ua ?? undefined,
      });
      if (error) return h.err("DOWNLOAD_DENIED", tx.rpcErrorMessage(error.message), 400);
      const payload = result as { storage_path: string; filename: string; remaining: number };
      const signed = await tx.signedUrl(
        "product-files",
        payload.storage_path,
        300,
        payload.filename,
      );
      if (!signed)
        return h.err("DOWNLOAD_UNAVAILABLE", "Tautan unduhan gagal dibuat. Coba lagi.", 503);
      return h.ok({ url: signed, filename: payload.filename, remaining: payload.remaining });
    }

    const { data: result, error } = await auth.context.supabase.rpc("get_my_stock_code", {
      _entitlement_id: entIdRes.data,
    });
    if (error) return h.err("STOCK_CODE_DENIED", tx.rpcErrorMessage(error.message), 400);
    return h.ok({ code: (result as { code: string }).code });
  }

  if (path === "/api/mobile/v1/notifications") {
    if (method !== "GET") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const { data, error } = await auth.context.supabase
      .from("notifications")
      .select("id, type, title, message, related_type, related_id, read_at, created_at")
      .eq("recipient_id", auth.context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return h.err("NOTIFICATIONS_UNAVAILABLE", "Notifikasi tidak dapat dimuat.", 503);
    const items = data ?? [];
    const unreadCount = items.filter((n) => !n.read_at).length;
    return h.ok({ items, unreadCount });
  }

  if (path === "/api/mobile/v1/notifications/read-all") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const { error } = await auth.context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", auth.context.userId)
      .is("read_at", null);
    if (error) return h.err("NOTIFICATIONS_UPDATE_FAILED", "Gagal menandai notifikasi.", 503);
    return h.ok({ updated: true });
  }

  const notifReadMatch = /^\/api\/mobile\/v1\/notifications\/([^/]+)\/read$/.exec(path);
  if (notifReadMatch) {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const idRes = uuidSchema.safeParse(decodeURIComponent(notifReadMatch[1]));
    if (!idRes.success) return h.err("INVALID_QUERY", "ID notifikasi tidak valid.", 400);
    const { error } = await auth.context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", idRes.data)
      .eq("recipient_id", auth.context.userId);
    if (error) return h.err("NOTIFICATIONS_UPDATE_FAILED", "Gagal menandai notifikasi.", 503);
    return h.ok({ updated: true });
  }

  if (path === "/api/mobile/v1/profile") {
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);

    if (method === "GET") {
      const { data, error } = await auth.context.supabase
        .from("profiles")
        .select("id, full_name, phone, email, avatar_url, created_at, email_notifications_enabled")
        .eq("id", auth.context.userId)
        .maybeSingle();
      if (error || !data) return h.err("PROFILE_UNAVAILABLE", "Profil tidak dapat dimuat.", 503);
      const avatarSignedUrl = await resolveAvatarSignedUrl(auth.context, data.avatar_url);
      return h.ok({
        profile: {
          ...data,
          avatar_signed_url: avatarSignedUrl,
        },
      });
    }

    if (method === "PATCH") {
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = updateProfileSchema.safeParse(bodyRes.body);
      if (!parsed.success) return h.err("INVALID_INPUT", "Data profil tidak valid.", 400);
      const { error } = await auth.context.supabase
        .from("profiles")
        .update({
          full_name: parsed.data.fullName,
          phone: parsed.data.phone || null,
          ...(parsed.data.emailNotificationsEnabled === undefined
            ? {}
            : { email_notifications_enabled: parsed.data.emailNotificationsEnabled }),
        })
        .eq("id", auth.context.userId);
      if (error) return h.err("PROFILE_UPDATE_FAILED", "Profil gagal disimpan.", 503);
      return h.ok({ updated: true });
    }

    return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
  }

  if (path === "/api/mobile/v1/profile/avatar-upload-url") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = avatarUploadSchema.safeParse(bodyRes.body);
    if (!parsed.success) {
      return h.err("INVALID_INPUT", "Format atau ukuran foto profil tidak valid (maks 2 MB).", 400);
    }
    const ext = AVATAR_MIME_EXT[parsed.data.mimeType];
    const filePath = `${auth.context.userId}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUploadUrl(filePath);
    if (error || !signed) {
      return h.err("UPLOAD_PREP_FAILED", "Gagal menyiapkan unggahan foto profil.", 503);
    }
    return h.ok({
      path: filePath,
      token: signed.token,
      signedUrl: signed.signedUrl,
      avatarUrl: `/api/public/avatar/${filePath}`,
    });
  }

  if (path === "/api/mobile/v1/profile/avatar") {
    if (method !== "POST") return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const bodyRes = await h.readJsonBody(request);
    if (!bodyRes.ok) return bodyRes.response;
    const parsed = avatarSaveSchema.safeParse(bodyRes.body);
    if (!parsed.success) return h.err("INVALID_INPUT", "URL avatar tidak valid.", 400);
    if (
      parsed.data.avatarUrl &&
      !parsed.data.avatarUrl.startsWith(`/api/public/avatar/${auth.context.userId}/`)
    ) {
      return h.err("FORBIDDEN", "URL avatar tidak sesuai pemilik akun.", 403);
    }
    const { error } = await auth.context.supabase
      .from("profiles")
      .update({ avatar_url: parsed.data.avatarUrl || null })
      .eq("id", auth.context.userId);
    if (error) return h.err("PROFILE_UPDATE_FAILED", "Foto profil gagal disimpan.", 503);
    return h.ok({ updated: true });
  }

  return null;
}

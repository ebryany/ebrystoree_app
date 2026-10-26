import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderMonitoring = {
  order_id: string;
  order_number: string;
  order_status: string;
  paid_at: string | null;
  receipt_status: "pending" | "accepted" | null;
  accepted_at: string | null;
  queue: "delivery_blocked" | "awaiting_receipt" | "refund_active" | "other";
  waiting_since: string | null;
  items: {
    item_id: string;
    product_id: string | null;
    name: string;
    delivery_mode: string;
    ready: boolean;
  }[];
  funds: {
    store_id: string;
    store_name: string | null;
    item_total: number;
    held_receipt: number;
    released_total: number;
    refunded_total: number;
    refund_reserved: number;
    released_at: string | null;
  }[];
  refunds: {
    id: string;
    number: string;
    status: string;
    amount: number | null;
    created_at: string;
    processed_at: string | null;
  }[];
};

type MonitoringList = {
  items: OrderMonitoring[];
  total: number;
  counts: Record<"delivery_blocked" | "awaiting_receipt" | "refund_active", number>;
  observed_at: string;
};

const scope = z.enum(["seller", "admin"]);

export const listOrderMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        scope,
        filter: z
          .enum(["all", "actions", "delivery_blocked", "awaiting_receipt", "refund_active"])
          .default("actions"),
        page: z.number().int().min(1).max(100000).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as SupabaseClient).rpc(
      "list_order_monitoring",
      {
        _scope: data.scope,
        _filter: data.filter,
        _page: data.page,
      },
    );
    if (error || !result)
      throw new Error("Monitoring pesanan tidak dapat dimuat. Coba muat ulang.");
    return result as unknown as MonitoringList;
  });

export const getOrderMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ scope, id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as SupabaseClient).rpc(
      "get_order_monitoring",
      {
        _scope: data.scope,
        _order_id: data.id,
      },
    );
    if (error || !result)
      throw new Error("Detail penerimaan dan dana tidak dapat dimuat. Coba muat ulang.");
    return result as unknown as OrderMonitoring;
  });

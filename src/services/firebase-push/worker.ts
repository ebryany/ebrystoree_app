/**
 * Dedicated, isolated Firebase Push Realtime Worker (`ebrystore-push-worker`).
 *
 * Penempatan khusus:
 * - Berjalan sebagai proses systemd terpisah dari proses web utama (`ebrystore` / `ebrystore-worker2`).
 * - Membaca kredensial Firebase secara eksklusif dari environment worker (`/etc/ebrystore/firebase-push.env`).
 * - Mendengarkan perubahan realtime Supabase Postgres (`notifications` + `product_inquiry_messages`)
 *   lalu mengirim push interaktif via FCM HTTP v1 dalam hitungan sub-detik, disertai safety sweep berkala.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { readFcmConfig } from "./config";
import {
  dispatchChatMessagePush,
  dispatchPendingPushNotifications,
  dispatchSingleNotification,
  type ChatMessagePushRow,
  type NotificationPushRow,
} from "./dispatcher";

const SWEEP_INTERVAL_MS = Math.max(
  15_000,
  Number(process.env["PUSH_SWEEP_INTERVAL_MS"] ?? 60_000),
);

function logInfo(event: string, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "ebrystore-push-worker",
      level: "info",
      event,
      ...(extra ?? {}),
    }),
  );
}

function logError(event: string, err: unknown) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "ebrystore-push-worker",
      level: "error",
      event,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
}

async function main() {
  const supabaseUrl = process.env["SUPABASE_URL"]?.trim() ?? "";
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    logError("missing_supabase_config", "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const fcmCfg = readFcmConfig();
  if (!fcmCfg) {
    logInfo("fcm_not_configured", {
      note: "Set FCM_SERVICE_ACCOUNT_PATH or FCM_SERVICE_ACCOUNT_JSON to enable live FCM push.",
    });
  } else {
    logInfo("fcm_configured", { projectId: fcmCfg.projectId });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  const channel = supabase
    .channel("ebrystore-firebase-push-worker")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const row = payload.new as NotificationPushRow | undefined;
        if (!row?.id || !row?.recipient_id) return;
        void dispatchSingleNotification(row, { admin: supabase })
          .then((res) => {
            if (res.sent > 0 || res.failed > 0) {
              logInfo("push_notif_dispatched", {
                notificationId: row.id,
                type: row.type,
                sent: res.sent,
                failed: res.failed,
              });
            }
          })
          .catch((err) => logError("push_notif_error", err));
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "product_inquiry_messages" },
      (payload) => {
        const row = payload.new as ChatMessagePushRow | undefined;
        if (!row?.id || !row?.inquiry_id) return;
        void dispatchChatMessagePush(row, { admin: supabase })
          .then((res) => {
            if (res.sent > 0 || res.failed > 0) {
              logInfo("push_chat_dispatched", {
                messageId: row.id,
                inquiryId: row.inquiry_id,
                sent: res.sent,
                failed: res.failed,
              });
            }
          })
          .catch((err) => logError("push_chat_error", err));
      },
    )
    .subscribe((status) => {
      logInfo("realtime_channel_status", { status });
    });

  // Safety sweep agar notifikasi yang tertinggal saat reconnect tetap terkirim.
  const timer = setInterval(() => {
    void dispatchPendingPushNotifications(50)
      .then((res) => {
        if (res.sent > 0 || res.failed > 0) {
          logInfo("push_sweep_completed", res);
        }
      })
      .catch((err) => logError("push_sweep_error", err));
  }, SWEEP_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    logInfo("worker_shutdown", { signal });
    clearInterval(timer);
    await supabase.removeChannel(channel).catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();

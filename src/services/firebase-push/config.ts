import { existsSync, readFileSync } from "node:fs";

export type FcmServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

export type PushCategoryKey = "orders" | "payments" | "chat" | "wallet" | "store" | "promo";

export type PushPreferences = {
  orders: boolean;
  payments: boolean;
  chat: boolean;
  wallet: boolean;
  store: boolean;
  promo: boolean;
  muted: boolean;
};

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  orders: true,
  payments: true,
  chat: true,
  wallet: true,
  store: true,
  promo: true,
  muted: false,
};

export function normalizePushPreferences(raw: unknown): PushPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PUSH_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  return {
    orders: typeof obj["orders"] === "boolean" ? obj["orders"] : true,
    payments: typeof obj["payments"] === "boolean" ? obj["payments"] : true,
    chat: typeof obj["chat"] === "boolean" ? obj["chat"] : true,
    wallet: typeof obj["wallet"] === "boolean" ? obj["wallet"] : true,
    store: typeof obj["store"] === "boolean" ? obj["store"] : true,
    promo: typeof obj["promo"] === "boolean" ? obj["promo"] : true,
    muted: typeof obj["muted"] === "boolean" ? obj["muted"] : false,
  };
}

function parseServiceAccountJson(raw: string): FcmServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        projectId: parsed.project_id.trim(),
        clientEmail: parsed.client_email.trim(),
        privateKey: parsed.private_key.replace(/\\n/g, "\n").trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Membaca kredensial Service Account Firebase dari lingkungan khusus worker/server.
 * Urutan prioritas:
 * 1. `FCM_SERVICE_ACCOUNT_PATH` (file JSON privat chmod 600 di VPS)
 * 2. `FCM_SERVICE_ACCOUNT_JSON` (inline JSON di environment)
 * 3. Kombinasi `FCM_PROJECT_ID` + `FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY`
 */
export function readFcmConfig(): FcmServiceAccount | null {
  const filePath = process.env["FCM_SERVICE_ACCOUNT_PATH"]?.trim();
  if (filePath && existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, "utf8");
      const fromFile = parseServiceAccountJson(content);
      if (fromFile) return fromFile;
    } catch {
      return null;
    }
  }

  const rawJson = process.env["FCM_SERVICE_ACCOUNT_JSON"]?.trim();
  if (rawJson) {
    const fromJson = parseServiceAccountJson(rawJson);
    if (fromJson) return fromJson;
  }

  const projectId = process.env["FCM_PROJECT_ID"]?.trim();
  const clientEmail = process.env["FCM_CLIENT_EMAIL"]?.trim();
  const privateKey = process.env["FCM_PRIVATE_KEY"]?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

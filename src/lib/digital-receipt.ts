export type DigitalReceipt = {
  status: "pending" | "accepted";
  accepted_at: string | null;
  can_confirm: boolean;
  items: { item_id: string; name: string; delivery_mode: string; ready: boolean }[];
};

export function stockCodeUrl(code: string): string | null {
  try {
    const url = new URL(code);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

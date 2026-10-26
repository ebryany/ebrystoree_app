export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export function proofFileError(file: { size: number; type: string }): string | null {
  if (!(PROOF_MIME_TYPES as readonly string[]).includes(file.type))
    return "Bukti harus JPG, PNG, WEBP, atau PDF.";
  if (file.size < 1 || file.size > PROOF_MAX_BYTES)
    return "Ukuran bukti harus 1 byte sampai 5 MiB.";
  return null;
}

export function isManualPayment(payment: { provider: string; method: string }) {
  return payment.provider === "manual" && payment.method === "dana";
}

export function canSubmitManualProof(
  payment: {
    provider: string;
    method: string;
    status: string;
    expired_at: string | null;
    reupload_count: number;
  },
  orderStatus: string,
  now = Date.now(),
  reuploadLimit = 3,
) {
  return (
    isManualPayment(payment) &&
    orderStatus === "awaiting_payment" &&
    ["waiting_payment", "rejected"].includes(payment.status) &&
    payment.reupload_count <= reuploadLimit &&
    (!payment.expired_at || new Date(payment.expired_at).getTime() > now)
  );
}

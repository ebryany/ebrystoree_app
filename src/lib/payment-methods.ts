/**
 * Metode pembayaran custom (transfer bank, e-wallet, dll.) yang diatur admin di
 * Pengaturan Website. Disimpan sebagai satu setting JSON `custom_payment_methods`.
 * Nomor rekening tidak publik: hanya dikirim ke pengguna login lewat server fn.
 */

export type PaymentMethodType = "bank" | "ewallet" | "other";

export type CustomPaymentMethod = {
  id: string;
  type: PaymentMethodType;
  name: string;
  account_number: string;
  account_holder: string;
  instruction: string;
  is_active: boolean;
  for_topup: boolean;
};

export const PAYMENT_METHOD_TYPES: { value: PaymentMethodType; label: string }[] = [
  { value: "bank", label: "Transfer bank" },
  { value: "ewallet", label: "E-wallet" },
  { value: "other", label: "Lainnya" },
];

export const MAX_PAYMENT_METHODS = 12;

const ID_RE = /^[a-z0-9-]{1,40}$/;
const NUMBER_RE = /^[0-9 .\-+]{4,40}$/;

export function newPaymentMethodId() {
  return `pm-${Math.random().toString(36).slice(2, 10)}`;
}

function clean(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, max);
}

export function validatePaymentMethods(
  raw: unknown,
): { ok: true; value: CustomPaymentMethod[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Daftar metode pembayaran tidak valid." };
  if (raw.length > MAX_PAYMENT_METHODS)
    return { ok: false, error: `Maksimal ${MAX_PAYMENT_METHODS} metode pembayaran.` };

  const seen = new Set<string>();
  const out: CustomPaymentMethod[] = [];
  for (const [index, item] of raw.entries()) {
    const n = index + 1;
    const id = clean(item?.id, 40);
    if (!ID_RE.test(id) || seen.has(id)) return { ok: false, error: `Metode #${n}: ID tidak valid.` };
    seen.add(id);
    const type = PAYMENT_METHOD_TYPES.some((t) => t.value === item?.type) ? item.type : null;
    if (!type) return { ok: false, error: `Metode #${n}: jenis tidak valid.` };
    const name = clean(item?.name, 40);
    if (name.length < 2) return { ok: false, error: `Metode #${n}: nama wajib diisi.` };
    const account_number = clean(item?.account_number, 40);
    if (!NUMBER_RE.test(account_number))
      return { ok: false, error: `${name}: nomor rekening/akun tidak valid.` };
    const account_holder = clean(item?.account_holder, 60);
    if (account_holder.length < 2) return { ok: false, error: `${name}: nama pemilik wajib diisi.` };
    out.push({
      id,
      type,
      name,
      account_number,
      account_holder,
      instruction: clean(item?.instruction, 300),
      is_active: Boolean(item?.is_active),
      for_topup: Boolean(item?.for_topup),
    });
  }
  return { ok: true, value: out };
}

export function parsePaymentMethods(raw: unknown): CustomPaymentMethod[] {
  const result = validatePaymentMethods(raw);
  return result.ok ? result.value : [];
}

/**
 * Stok berupa akun (bukan file). Satu akun disimpan sebagai satu baris
 * product_stock_codes.code berformat JSON agar memakai alur klaim kode yang ada.
 */
export type StockAccount = { login: string; password: string; note?: string };

export type CodeKind = "code" | "account";

export function encodeAccount(account: StockAccount): string {
  const note = account.note?.trim();
  return JSON.stringify({
    login: account.login.trim(),
    password: account.password.trim(),
    ...(note ? { note } : {}),
  });
}

export function decodeAccount(value: string): StockAccount | null {
  if (!value.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StockAccount>;
    if (typeof parsed.login !== "string" || typeof parsed.password !== "string") return null;
    return {
      login: parsed.login,
      password: parsed.password,
      note: typeof parsed.note === "string" ? parsed.note : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Satu akun per baris: `email|password` atau `email|password|catatan`.
 * Pemisah `:` juga diterima bila tidak ada `|`. Baris tidak valid dikembalikan
 * agar penjual tahu baris mana yang dilewati.
 */
export function parseAccountLines(text: string): { accounts: StockAccount[]; invalid: number[] } {
  const accounts: StockAccount[] = [];
  const invalid: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    let login: string | undefined;
    let password: string | undefined;
    let note: string | undefined;
    if (line.includes("|")) {
      const [a, b, ...rest] = line.split("|").map((p) => p.trim());
      login = a;
      password = b;
      note = rest.join(" | ").trim() || undefined;
    } else {
      // Pemisah ":" hanya dipotong sekali agar password boleh mengandung ":".
      const at = line.indexOf(":");
      if (at > 0) {
        login = line.slice(0, at).trim();
        password = line.slice(at + 1).trim();
      }
    }
    if (!login || !password) {
      invalid.push(index + 1);
      return;
    }
    accounts.push({ login, password, note });
  });
  return { accounts, invalid };
}

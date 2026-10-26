/**
 * Kebijakan penarikan saldo seller — rumus bersama untuk preview UI dan test.
 *
 * Server tetap satu-satunya sumber kebenaran: RPC request_withdrawal menghitung
 * ulang fee dan menolak nominal yang tidak valid. Fungsi di sini HARUS identik
 * dengan rumus di migration (CHECK constraint withdrawals + perhitungan RPC):
 * pembagian integer half-up (gross*bps + 5000) / 10000.
 */

export const WITHDRAWAL_MIN_PAYOUT_DEFAULT = 5000;
export const WITHDRAWAL_FEE_BPS_DEFAULT = 1500;
export const WITHDRAWAL_FEE_BPS_MAX = 5000;

/** Fee penarikan (half-up) dalam rupiah utuh, identik dengan bigint division di PostgreSQL. */
export function withdrawalFee(gross: number, feeBps: number): number {
  return Math.floor((gross * feeBps + 5000) / 10000);
}

/** Neto yang diterima seller setelah fee. */
export function withdrawalNet(gross: number, feeBps: number): number {
  return gross - withdrawalFee(gross, feeBps);
}

export function clampFeeBps(feeBps: number): number {
  return Math.min(Math.max(Math.round(feeBps), 0), WITHDRAWAL_FEE_BPS_MAX);
}

/**
 * Helper server-only untuk top-up saldo: settle lewat RPC service-role.
 * Dipakai checkCreditTopup (server fn) dan webhook SumoPod. RPC-nya sendiri
 * idempoten; aman dipanggil dari dua jalur.
 */

export async function settleCreditTopup(
  topupId: string,
  providerRef: string,
  paidAmount: number,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("settle_credit_topup", {
    _topup_id: topupId,
    _provider: "sumopod",
    _provider_ref: providerRef,
    _paid_amount: paidAmount,
  });
  if (error) {
    console.error("[topup] settle gagal:", error.message);
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, result: data };
}

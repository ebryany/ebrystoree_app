import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, Upload } from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { formatRupiah } from "@/lib/format";
import {
  cancelPoRequest,
  deliverPoResult,
  getPoProofUrl,
  getPoRequest,
  respondPoQuote,
  sendPoMessage,
  submitPoProof,
  submitPoQuote,
  verifyPoPayment,
} from "@/lib/po.functions";

export const PO_STATUS_LABEL: Record<string, string> = {
  submitted: "Menunggu penawaran",
  quoted: "Penawaran dikirim",
  quote_rejected: "Penawaran ditolak",
  dp_waiting: "Menunggu DP",
  in_progress: "Sedang dikerjakan",
  delivered: "Hasil terkirim, menunggu pelunasan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const PAY_STATUS_LABEL: Record<string, string> = {
  pending: "Belum dibayar",
  submitted: "Bukti sedang diperiksa",
  verified: "Terverifikasi",
  rejected: "Bukti ditolak",
};

const STAGE_LABEL: Record<string, string> = { dp: "Uang muka (DP)", final: "Pelunasan" };

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function formatTime(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function PoThread({ id, mode }: { id: string; mode: "customer" | "staff" }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const fetchRequest = useServerFn(getPoRequest);
  const postMessage = useServerFn(sendPoMessage);
  const respondQuote = useServerFn(respondPoQuote);
  const uploadProof = useServerFn(submitPoProof);
  const cancelRequest = useServerFn(cancelPoRequest);
  const postQuote = useServerFn(submitPoQuote);
  const verifyPayment = useServerFn(verifyPoPayment);
  const deliver = useServerFn(deliverPoResult);
  const proofUrl = useServerFn(getPoProofUrl);

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [quoteTotal, setQuoteTotal] = useState("");
  const [quoteDp, setQuoteDp] = useState("50");
  const [quoteNote, setQuoteNote] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [senderName, setSenderName] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["po-request", id],
    queryFn: () => fetchRequest({ data: { id } }),
  });

  useRealtimeRefresh({
    channel: `po-${id}`,
    tables: ["po_messages", "po_payments", "custom_orders"],
    keys: [["po-request", id], ["po-list"], ["po-admin-list"]],
  });

  const messages = (data?.messages ?? []) as any[];
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  if (isPending) return <AdminLoading />;
  if (error || !data?.request) return <ErrorState onRetry={() => void refetch()} />;

  const request = data.request as any;
  const payments = (data.payments ?? []) as any[];
  const status = request.status as string;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Aksi gagal.");
        return false;
      }
      toast.success(successMsg);
      await queryClient.invalidateQueries({ queryKey: ["po-request", id] });
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    const body = message.trim();
    if (body.length < 1) return;
    const ok = await run(() => postMessage({ data: { requestId: id, body } }) as any, "Pesan terkirim.");
    if (ok) setMessage("");
  }

  async function handleProof(paymentId: string, file: File) {
    if (!user) return;
    if (file.size > MAX_PROOF_BYTES) {
      toast.error("Ukuran berkas maksimal 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Format bukti harus JPG, PNG, WEBP, atau PDF.");
      return;
    }
    if (senderName.trim().length < 2) {
      toast.error("Isi nama pengirim transfer dulu.");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase().slice(0, 5) ?? "bin";
    const path = `${user.id}/po-${paymentId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (uploadError) {
      toast.error("Bukti gagal diunggah. Coba lagi.");
      return;
    }
    await run(
      () => uploadProof({ data: { paymentId, filePath: path, senderName: senderName.trim() } }) as any,
      "Bukti pembayaran terkirim.",
    );
  }

  async function openProof(paymentId: string) {
    const result = await proofUrl({ data: { paymentId } });
    if (!result.url) {
      toast.error("Bukti belum tersedia.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{request.request_number}</p>
            <h1 className="mt-1 text-lg font-bold sm:text-xl">{request.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Dibuat {formatTime(request.created_at)}
              {mode === "staff" && data.customerName ? ` • ${data.customerName}` : ""}
            </p>
          </div>
          <StatusPill value={status} label={PO_STATUS_LABEL[status] ?? status} />
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{request.description}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Estimasi budget</dt>
            <dd className="font-semibold">{request.budget_estimate ? formatRupiah(request.budget_estimate) : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tenggat diinginkan</dt>
            <dd className="font-semibold">
              {request.deadline_at ? new Date(request.deadline_at).toLocaleDateString("id-ID") : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Nilai penawaran</dt>
            <dd className="font-semibold">{request.quoted_total ? formatRupiah(request.quoted_total) : "-"}</dd>
          </div>
        </dl>
        {request.reference_url ? (
          <a
            href={request.reference_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium text-accent underline"
          >
            Lihat referensi
          </a>
        ) : null}
      </header>

      {/* Penawaran */}
      {mode === "customer" && status === "quoted" ? (
        <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="text-sm font-semibold">Penawaran dari tim</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Total {formatRupiah(request.quoted_total)} • DP {request.dp_percent}% ={" "}
            {formatRupiah(request.dp_amount)}
          </p>
          {request.quote_note ? <p className="mt-2 text-sm">{request.quote_note}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => respondQuote({ data: { requestId: id, accept: true } }) as any, "Penawaran disetujui.")}
            >
              Setujui & bayar DP
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => respondQuote({ data: { requestId: id, accept: false } }) as any, "Penawaran ditolak.")}
            >
              Tolak penawaran
            </Button>
          </div>
        </section>
      ) : null}

      {mode === "staff" && (status === "submitted" || status === "quote_rejected") ? (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-semibold">Kirim penawaran</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="po-total">Total harga (Rp)</Label>
              <Input id="po-total" inputMode="numeric" value={quoteTotal} onChange={(e) => setQuoteTotal(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="po-dp">Persen DP</Label>
              <Input id="po-dp" inputMode="numeric" value={quoteDp} onChange={(e) => setQuoteDp(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="po-note">Catatan penawaran</Label>
            <Textarea id="po-note" value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} rows={3} />
          </div>
          <Button
            className="mt-3"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  postQuote({
                    data: {
                      requestId: id,
                      total: Number(quoteTotal) || 0,
                      dpPercent: Number(quoteDp) || 50,
                      note: quoteNote.trim() || undefined,
                    },
                  }) as any,
                "Penawaran terkirim.",
              )
            }
          >
            Kirim penawaran
          </Button>
        </section>
      ) : null}

      {mode === "staff" && status === "in_progress" ? (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-semibold">Kirim hasil pekerjaan</h2>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="po-result-note">Catatan hasil</Label>
              <Textarea id="po-result-note" rows={3} value={resultNote} onChange={(e) => setResultNote(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="po-result-url">Tautan hasil (opsional)</Label>
              <Input id="po-result-url" value={resultUrl} onChange={(e) => setResultUrl(e.target.value)} placeholder="https://" />
            </div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    deliver({
                      data: { requestId: id, note: resultNote.trim() || undefined, resultUrl: resultUrl.trim() },
                    }) as any,
                  "Hasil dikirim ke pelanggan.",
                )
              }
            >
              Kirim hasil
            </Button>
          </div>
        </section>
      ) : null}

      {/* Pembayaran */}
      {payments.length ? (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-semibold">Pembayaran</h2>
          {mode === "customer" ? (
            <div className="mt-3">
              <Label htmlFor="po-sender">Nama pengirim transfer</Label>
              <Input id="po-sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
              <p className="mt-2 text-xs text-muted-foreground">
                Transfer DANA 087782462607 (FEBRYANUS TAMBING), lalu unggah bukti di bawah.
              </p>
            </div>
          ) : null}
          <ul className="mt-3 space-y-3">
            {payments.map((pay) => (
              <li key={pay.id} className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{STAGE_LABEL[pay.stage] ?? pay.stage}</p>
                    <p className="text-sm text-muted-foreground">{formatRupiah(pay.amount)}</p>
                  </div>
                  <StatusPill value={pay.status} label={PAY_STATUS_LABEL[pay.status] ?? pay.status} />
                </div>
                {pay.reject_reason ? (
                  <p className="mt-2 text-xs text-destructive">Ditolak: {pay.reject_reason}</p>
                ) : null}

                {mode === "customer" && pay.status !== "verified" ? (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-accent">
                    <Upload className="size-4" aria-hidden="true" />
                    {pay.proof_path ? "Ganti bukti transfer" : "Unggah bukti transfer"}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleProof(pay.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}

                {mode === "staff" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pay.proof_path ? (
                      <Button size="sm" variant="outline" onClick={() => void openProof(pay.id)}>
                        Lihat bukti
                      </Button>
                    ) : null}
                    {pay.status === "submitted" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => verifyPayment({ data: { paymentId: pay.id, decision: "approve" } }) as any,
                              "Pembayaran diverifikasi.",
                            )
                          }
                        >
                          Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                verifyPayment({
                                  data: { paymentId: pay.id, decision: "reject", reason: "Bukti tidak sesuai" },
                                }) as any,
                              "Bukti ditolak.",
                            )
                          }
                        >
                          Tolak
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {request.result_note || request.result_url ? (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-5">
          <h2 className="text-sm font-semibold">Hasil pekerjaan</h2>
          {request.result_note ? <p className="mt-2 whitespace-pre-wrap text-sm">{request.result_note}</p> : null}
          {request.result_url ? (
            <a
              href={request.result_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-accent underline"
            >
              Buka hasil
            </a>
          ) : null}
        </section>
      ) : null}

      {/* Chat */}
      <section className="rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Diskusi</h2>
        </div>
        <div ref={listRef} className="max-h-[420px] space-y-3 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pesan.</p>
          ) : (
            messages.map((msg) => {
              const mine = msg.sender_id === user?.id && !msg.is_system;
              return (
                <div key={msg.id} className={msg.is_system ? "text-center" : mine ? "flex justify-end" : "flex"}>
                  {msg.is_system ? (
                    <p className="mx-auto max-w-md rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      {msg.body}
                    </p>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                        mine ? "bg-accent text-accent-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                      <p className={`mt-1 text-[11px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                        {msg.sender_role === "customer" ? "Pelanggan" : "Tim Ebrystore"} • {formatTime(msg.created_at)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-border/70 p-4">
          <Textarea
            aria-label="Tulis pesan"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tulis pesan untuk tim…"
            disabled={status === "cancelled"}
          />
          <Button size="icon" disabled={busy || status === "cancelled" || !message.trim()} onClick={() => void handleSend()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="sr-only">Kirim</span>
          </Button>
        </div>
      </section>

      {mode === "customer" && !["completed", "cancelled", "delivered"].includes(status) ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              () => cancelRequest({ data: { requestId: id, reason: "Dibatalkan oleh pelanggan" } }) as any,
              "Permintaan dibatalkan.",
            )
          }
        >
          Batalkan permintaan
        </Button>
      ) : null}
    </div>
  );
}

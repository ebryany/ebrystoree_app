import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Link2,
  Loader2,
  Package,
  Paperclip,
  Send,
} from "lucide-react";

import { formatDateTime } from "@/components/admin/tx-ui";
import { ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  approveServiceRequirements,
  getSellerServiceOrder,
  prepareServiceDeliveryUpload,
  rejectServiceRequirements,
  requestServiceExtension,
  submitServiceDelivery,
} from "@/lib/marketplace-service.functions";
import {
  MARKETPLACE_SERVICE_EXTENSION_MAX_DAYS,
  MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES,
  MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES,
  marketplaceServiceWorkStateLabels,
  type MarketplaceServiceDelivery,
  type MarketplaceServiceOrderRow,
  type SellerServiceOrderDetail,
} from "@/lib/marketplace-service";
import {
  serviceOrderPhaseDeadline,
  serviceOrderNextAction,
  serviceOrderWorkStateHint,
  type ServiceOrderNextAction,
} from "@/lib/seller-service-order-ui";
import { ORDER_STATUS_LABEL } from "@/lib/transaction-labels";

const NEXT_ACTION_STYLE: Record<ServiceOrderNextAction["tone"], string> = {
  action: "border-accent/40 bg-accent/8 text-foreground",
  waiting: "border-border bg-surface text-muted-foreground",
  danger: "border-destructive/40 bg-destructive/5 text-foreground",
  done: "border-success/40 bg-success/8 text-foreground",
};

const NEXT_ACTION_ICON: Record<ServiceOrderNextAction["tone"], typeof Clock> = {
  action: Send,
  waiting: Clock,
  danger: AlertTriangle,
  done: CheckCircle2,
};

const DEADLINE_STYLE = {
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  soon: "border-warning/50 bg-warning/15 text-warning-foreground",
  normal: "border-border bg-surface text-muted-foreground",
} as const;

const DELIVERY_KIND_META: Record<
  MarketplaceServiceDelivery["kind"],
  { label: string; icon: typeof Link2 }
> = {
  link: { label: "Tautan", icon: Link2 },
  note: { label: "Catatan", icon: FileText },
  file: { label: "Berkas", icon: Paperclip },
};

/** Satu kartu kerja: kepala, langkah berikutnya, metadata, lalu detail berlapis. */
export function ServiceOrderCard({
  row,
  index,
  isExpanded,
  onToggle,
}: {
  row: MarketplaceServiceOrderRow;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const next = serviceOrderNextAction(row);
  const deadline = serviceOrderPhaseDeadline(row, Date.now());
  const NextIcon = NEXT_ACTION_ICON[next.tone];

  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : index * 0.04 }}
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border bg-card",
        next.tone === "danger" ? "border-destructive/40" : "border-border",
      )}
      aria-label={`Pesanan ${row.order_number}`}
    >
      {/* Kepala: identitas dan status, agar kartu bisa dipindai cepat. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
        <span className="break-all font-mono text-xs font-semibold text-foreground">
          {row.order_number}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill
            value={row.work_state}
            kind="raw"
            label={marketplaceServiceWorkStateLabels[row.work_state]}
          />
          {row.complaint_open ? (
            <StatusPill value="disputed" kind="raw" label="Komplain aktif" />
          ) : null}
        </div>
      </div>
      <p className="px-4 pt-1 text-[11px] text-muted-foreground">
        {ORDER_STATUS_LABEL[row.order_status] ?? row.order_status}
        {row.paid_at ? ` · dibayar ${formatDateTime(row.paid_at)}` : ""}
      </p>

      {/* Langkah berikutnya: satu pertanyaan yang dijawab tanpa membuka detail. */}
      <div
        className={cn(
          "mx-4 my-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
          NEXT_ACTION_STYLE[next.tone],
        )}
      >
        <NextIcon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            next.tone === "action"
              ? "text-accent"
              : next.tone === "danger"
                ? "text-destructive"
                : next.tone === "done"
                  ? "text-success"
                  : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{next.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{next.hint}</p>
        </div>
      </div>

      {/* Isi: jasa, nilai, tenggat, revisi. */}
      <div className="min-w-0 space-y-2 px-4">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="min-w-0 break-words text-sm font-semibold leading-snug">
            {row.service_name}
          </h2>
          <span className="shrink-0 text-sm font-bold tabular-nums text-price">
            {formatRupiah(Number(row.total))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {deadline ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                DEADLINE_STYLE[deadline.tone],
              )}
            >
              <Clock className="size-3" aria-hidden="true" />
              {deadline.label}
            </span>
          ) : null}
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            Revisi {row.revision_used}/{row.revision_limit}
          </span>
          {row.extension_requested_days ? (
            <span className="rounded-full border border-warning/50 bg-warning/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warning-foreground">
              Perpanjangan +{row.extension_requested_days} hari menunggu pembeli
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {serviceOrderWorkStateHint[row.work_state]}
        </p>
        <button
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {isExpanded ? "Tutup" : "Detail"}
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-200", isExpanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-border"
          >
            <div className="bg-surface/40 p-4">
              <SellerServiceOrderDetail orderId={row.order_id} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

/** Detail berlapis: aksi dulu, lalu kebutuhan pembeli, agreement, riwayat hasil. */
function SellerServiceOrderDetail({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getSellerServiceOrder);
  const approveRequirements = useServerFn(approveServiceRequirements);
  const submitDeliveryFn = useServerFn(submitServiceDelivery);
  const rejectFn = useServerFn(rejectServiceRequirements);
  const extensionFn = useServerFn(requestServiceExtension);
  const [feedback, setFeedback] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["seller-service-order", orderId],
    queryFn: () => fetchDetail({ data: { orderId } }),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["seller-service-order", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["my-service-orders"] }),
    ]);
  };
  const approve = useMutation({
    mutationFn: (input: { orderId: string }) => approveRequirements({ data: input }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok ? "Requirements disetujui. Tenggat pengerjaan mulai berjalan." : result.error,
      );
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Persetujuan requirements gagal. Coba lagi."),
  });
  const deliver = useMutation({
    mutationFn: (input: {
      orderId: string;
      kind: "link" | "note" | "file";
      url?: string;
      note?: string;
      storagePath?: string;
      originalName?: string;
      mimeType?: (typeof MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES)[number];
      fileSize?: number;
      summary: string;
    }) => submitDeliveryFn({ data: input }),
    onSuccess: async (result) => {
      setFeedback(result.ok ? "Hasil pekerjaan terkirim ke pembeli." : result.error);
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Pengiriman hasil gagal. Coba lagi."),
  });
  const reject = useMutation({
    mutationFn: (input: { orderId: string; reason: string }) => rejectFn({ data: input }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok ? "Pesanan ditolak. Dana dikembalikan penuh ke saldo pembeli." : result.error,
      );
      if (result.ok) {
        setRejectOpen(false);
        await invalidate();
      }
    },
    onError: () => setFeedback("Penolakan gagal diproses. Coba lagi."),
  });
  const extension = useMutation({
    mutationFn: (input: { orderId: string; days: number; reason: string }) =>
      extensionFn({ data: input }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok
          ? "Pengajuan perpanjangan dikirim. Tenggat berubah setelah pembeli menyetujui."
          : result.error,
      );
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Pengajuan perpanjangan gagal. Coba lagi."),
  });

  if (isPending)
    return (
      <div className="space-y-2" role="status" aria-label="Memuat detail pesanan">
        <span className="sr-only">Memuat detail pesanan…</span>
        <div className="h-3 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    );
  if (error)
    return (
      <ErrorState
        title="Detail gagal dimuat"
        description={error.message}
        onRetry={() => void refetch()}
      />
    );
  const detail = data?.detail as SellerServiceOrderDetail | null;
  if (!detail)
    return (
      <p className="text-sm text-muted-foreground">
        Detail pesanan tidak ditemukan pada toko Anda.
      </p>
    );

  const contract = detail.contract;
  const canStart =
    detail.order.status === "paid" &&
    contract.work_state === "awaiting_requirements" &&
    !contract.complaint_open;
  const canDeliver =
    detail.order.status === "paid" &&
    ["in_progress", "revision_requested"].includes(contract.work_state) &&
    !contract.complaint_open;

  return (
    <div className="space-y-5">
      {feedback ? (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {feedback}
        </p>
      ) : null}

      {/* 1. Aksi yang perlu dilakukan sekarang. */}
      {canStart ? (
        <section className="rounded-xl border border-accent/40 bg-accent/8 p-3.5">
          <h3 className="text-sm font-semibold">Setujui atau tolak kebutuhan</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Tenggat pengerjaan dihitung sejak Anda menyetujui.
            {contract.seller_response_due_at
              ? ` Respons sebelum ${formatDateTime(contract.seller_response_due_at)}; lewat dari itu pesanan batal otomatis dan dana kembali ke pembeli.`
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={approve.isPending || reject.isPending}
              onClick={() => approve.mutate({ orderId })}
            >
              {approve.isPending ? "Memproses…" : "Setujui & mulai kerjakan"}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              aria-expanded={rejectOpen}
              disabled={approve.isPending || reject.isPending}
              onClick={() => setRejectOpen((open) => !open)}
            >
              Tolak pesanan
            </Button>
          </div>
          {rejectOpen ? (
            <ReasonForm
              id={`reject-${orderId}`}
              label="Alasan menolak (dikirim ke pembeli)"
              hint="Dana pembeli dikembalikan penuh ke saldo Ebrystore. Tindakan ini tidak dapat dibatalkan."
              submitLabel="Tolak & kembalikan dana"
              pending={reject.isPending}
              destructive
              onSubmit={(reason) => reject.mutate({ orderId, reason })}
            />
          ) : null}
        </section>
      ) : null}

      {canDeliver && contract.extension_requested_at ? (
        <p className="rounded-xl border border-warning/50 bg-warning/15 p-3.5 text-sm">
          Pengajuan perpanjangan +{contract.extension_requested_days} hari menunggu jawaban pembeli.
        </p>
      ) : null}

      {canDeliver ? (
        <DeliveryForm
          orderId={orderId}
          pending={deliver.isPending}
          onSubmit={(input) => deliver.mutate({ orderId, ...input })}
        />
      ) : null}

      {canDeliver && !contract.extension_requested_at && contract.extension_count < 2 ? (
        <ExtensionForm
          orderId={orderId}
          pending={extension.isPending}
          onSubmit={(days, reason) => extension.mutate({ orderId, days, reason })}
        />
      ) : null}

      {/* 2. Kebutuhan pembeli: yang harus dipenuhi. */}
      <section className="rounded-xl border border-border bg-card p-3.5">
        <h3 className="text-sm font-semibold">Kebutuhan pembeli</h3>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">
          {contract.requirements?.note ?? "Kebutuhan belum tersedia."}
        </p>
      </section>

      {/* 3. Agreement terlipat: rujukan, bukan bacaan pertama. */}
      <details className="rounded-xl border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3.5 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <span>Agreement yang disetujui pembeli</span>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {contract.agreement.durationDays} hari · revisi {contract.revision_used}/
            {contract.revision_limit}
          </span>
        </summary>
        <dl className="space-y-3 border-t border-border p-3.5 text-sm">
          {(
            [
              ["Scope", contract.agreement.scope],
              ["Di luar scope", contract.agreement.exclusions],
              ["Hasil", contract.agreement.deliverable],
              ["Data dari pembeli", contract.agreement.requirements],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="font-medium text-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap break-words text-muted-foreground">{value}</dd>
            </div>
          ))}
          <div className="text-xs tabular-nums text-muted-foreground">
            {contract.requirements_approved_at
              ? `Requirements disetujui ${formatDateTime(contract.requirements_approved_at)}`
              : "Requirements belum disetujui."}
            {contract.due_at ? ` · tenggat ${formatDateTime(contract.due_at)}` : ""}
          </div>
        </dl>
      </details>

      {/* 4. Riwayat hasil: apa yang sudah dikirim. */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold">Hasil terkirim</h3>
        {detail.deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada hasil yang dikirim.</p>
        ) : (
          <ol className="space-y-2">
            {detail.deliveries.map((delivery) => {
              const meta = DELIVERY_KIND_META[delivery.kind];
              const Icon = meta.icon;
              return (
                <li
                  key={delivery.id}
                  className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-selected text-accent">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tabular-nums">
                      Versi {delivery.version} · {meta.label}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(delivery.created_at)}
                    </p>
                    {delivery.summary ? (
                      <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                        {delivery.summary}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function ReasonForm({
  id,
  label,
  hint,
  submitLabel,
  pending,
  destructive = false,
  onSubmit,
}: {
  id: string;
  label: string;
  hint: string;
  submitLabel: string;
  pending: boolean;
  destructive?: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setValidation("Alasan minimal 10 karakter.");
      return;
    }
    setValidation("");
    onSubmit(reason.trim());
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-border pt-3">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={1000}
        aria-invalid={validation ? true : undefined}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      {validation ? (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      ) : null}
      <Button
        type="submit"
        variant={destructive ? "destructive" : "default"}
        className="min-h-11"
        disabled={pending}
      >
        {pending ? "Memproses…" : submitLabel}
      </Button>
    </form>
  );
}

/** Ajukan tambahan hari; tenggat baru berlaku setelah pembeli menyetujui. */
function ExtensionForm({
  orderId,
  pending,
  onSubmit,
}: {
  orderId: string;
  pending: boolean;
  onSubmit: (days: number, reason: string) => void;
}) {
  const [days, setDays] = useState(2);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(days) || days < 1 || days > MARKETPLACE_SERVICE_EXTENSION_MAX_DAYS) {
      setValidation(`Tambahan 1 sampai ${MARKETPLACE_SERVICE_EXTENSION_MAX_DAYS} hari.`);
      return;
    }
    if (reason.trim().length < 10) {
      setValidation("Alasan minimal 10 karakter.");
      return;
    }
    setValidation("");
    onSubmit(days, reason.trim());
  }
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3.5 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        Butuh waktu tambahan?
      </summary>
      <form onSubmit={submit} className="space-y-3 border-t border-border p-3.5">
        <p className="text-xs text-muted-foreground">
          Pembeli memutuskan. Bila tenggat lewat tanpa hasil, pembeli bisa membatalkan dengan refund
          penuh. Maksimal 2 kali per pesanan.
        </p>
        <div className="space-y-2">
          <Label htmlFor={`ext-days-${orderId}`}>Tambahan hari</Label>
          <Input
            id={`ext-days-${orderId}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MARKETPLACE_SERVICE_EXTENSION_MAX_DAYS}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="min-h-11 w-28"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`ext-reason-${orderId}`}>Alasan untuk pembeli</Label>
          <Textarea
            id={`ext-reason-${orderId}`}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
          />
        </div>
        {validation ? (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        ) : null}
        <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>
          {pending ? "Mengirim…" : "Ajukan perpanjangan"}
        </Button>
      </form>
    </details>
  );
}

const DELIVERY_KINDS = [
  { value: "link", label: "Tautan", icon: Link2 },
  { value: "note", label: "Catatan", icon: FileText },
  { value: "file", label: "Berkas", icon: Paperclip },
] as const;

function DeliveryForm({
  orderId,
  pending,
  onSubmit,
}: {
  orderId: string;
  pending: boolean;
  onSubmit: (input: {
    kind: "link" | "note" | "file";
    url?: string;
    note?: string;
    storagePath?: string;
    originalName?: string;
    mimeType?: (typeof MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES)[number];
    fileSize?: number;
    summary: string;
  }) => void;
}) {
  const [kind, setKind] = useState<"link" | "note" | "file">("link");
  const [validation, setValidation] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const prepareUpload = useServerFn(prepareServiceDeliveryUpload);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const summary = String(form.get("summary") ?? "").trim();
    if (summary.length < 3) {
      setValidation("Ringkasan hasil minimal 3 karakter.");
      return;
    }
    if (kind === "link") {
      const url = String(form.get("url") ?? "").trim();
      if (!/^https:\/\//.test(url) || /^https:\/\/[^/@]*@/.test(url)) {
        setValidation("URL wajib HTTPS tanpa kredensial di dalamnya.");
        return;
      }
      setValidation("");
      onSubmit({ kind, url, summary });
      return;
    }
    if (kind === "note") {
      const note = String(form.get("note") ?? "").trim();
      if (note.length < 3) {
        setValidation("Catatan hasil minimal 3 karakter.");
        return;
      }
      setValidation("");
      onSubmit({ kind, note, summary });
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setValidation("Pilih berkas hasil yang akan dikirim.");
      return;
    }
    if (file.size > MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES) {
      setValidation("Ukuran berkas maksimal 25 MB.");
      return;
    }
    if (!(MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES as readonly string[]).includes(file.type)) {
      setValidation("Format berkas tidak didukung. Gunakan PDF, dokumen, gambar, atau arsip.");
      return;
    }
    setUploading(true);
    const prep = await prepareUpload({
      data: {
        orderId,
        mimeType: file.type as (typeof MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES)[number],
        sizeBytes: file.size,
        originalName: file.name.slice(0, 255),
      },
    });
    if (!prep.ok) {
      setUploading(false);
      setValidation(prep.error);
      return;
    }
    const { error } = await supabase.storage
      .from("service-deliveries")
      .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      setValidation("Berkas gagal diunggah. Periksa koneksi lalu coba lagi.");
      return;
    }
    setValidation("");
    onSubmit({
      kind: "file",
      storagePath: prep.path,
      originalName: file.name.slice(0, 255),
      mimeType: file.type as (typeof MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES)[number],
      fileSize: file.size,
      summary,
    });
  }

  const busy = pending || uploading;
  return (
    <form
      onSubmit={submit}
      className="space-y-3.5 rounded-xl border border-accent/40 bg-card p-3.5"
    >
      <div>
        <h3 className="text-sm font-semibold">Kirim hasil pekerjaan</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pilih satu cara pengiriman, lalu isi ringkasan untuk pembeli.
        </p>
      </div>
      <fieldset disabled={busy} className="min-w-0 space-y-3.5">
        <legend className="sr-only">Jenis hasil</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
          {DELIVERY_KINDS.map((entry) => {
            const Icon = entry.icon;
            const active = kind === entry.value;
            return (
              <label
                key={entry.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-ring",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="jasa-delivery-kind"
                  value={entry.value}
                  checked={active}
                  onChange={() => setKind(entry.value)}
                  className="sr-only"
                />
                <Icon className="size-3.5" aria-hidden="true" />
                {entry.label}
              </label>
            );
          })}
        </div>

        {kind === "link" ? (
          <div className="space-y-2">
            <Label htmlFor="jasa-delivery-url">URL hasil (HTTPS, tanpa kredensial)</Label>
            <Input
              id="jasa-delivery-url"
              name="url"
              type="url"
              required
              maxLength={2000}
              placeholder="https://"
              className="min-h-11"
            />
          </div>
        ) : null}

        {kind === "note" ? (
          <div className="space-y-2">
            <Label htmlFor="jasa-delivery-note">Catatan hasil</Label>
            <Textarea
              id="jasa-delivery-note"
              name="note"
              rows={3}
              required
              minLength={3}
              maxLength={5000}
            />
          </div>
        ) : null}

        {kind === "file" ? (
          <div className="space-y-2">
            <Label htmlFor="jasa-delivery-file">Berkas hasil (maksimal 25 MB)</Label>
            <Input
              id="jasa-delivery-file"
              ref={fileRef}
              type="file"
              accept={MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES.join(",")}
              className="min-h-11"
            />
            <p className="text-xs text-muted-foreground">
              PDF, dokumen, gambar, atau arsip. Berkas disimpan privat dan hanya dapat diunduh
              pembeli pesanan ini.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="jasa-delivery-summary">Ringkasan untuk pembeli</Label>
          <Textarea
            id="jasa-delivery-summary"
            name="summary"
            rows={2}
            required
            minLength={3}
            maxLength={5000}
          />
        </div>

        {validation ? (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        ) : null}

        <Button type="submit" className="min-h-11" disabled={busy}>
          {uploading ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              Mengunggah berkas…
            </>
          ) : pending ? (
            "Mengirim…"
          ) : (
            <>
              <Package className="mr-1.5 size-4" aria-hidden="true" />
              Kirim hasil
            </>
          )}
        </Button>
      </fieldset>
    </form>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Save,
  Send,
  Server,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clearSmtpConfig,
  getEmailStatus,
  saveSmtpConfig,
  sendTestEmail,
} from "@/lib/email-admin.functions";

/**
 * Panel email di pengaturan admin: status, konfigurasi SMTP, dan uji kirim.
 *
 * Keputusan dan alasannya:
 * - Admin bisa mengganti provider SMTP sendiri (host, port, kredensial) tanpa
 *   menyentuh file server. Ini yang membuat sistem tidak terkunci pada satu
 *   provider.
 * - Password TIDAK pernah dikirim balik ke browser. Kolom password selalu
 *   kosong; mengosongkannya berarti mempertahankan yang tersimpan, supaya admin
 *   bisa mengubah host/port tanpa mengetik ulang rahasia.
 * - Konfigurasi dari database menimpa environment; menghapusnya mengembalikan
 *   ke environment, jadi tidak ada risiko email mati mendadak.
 * - Tombol uji memakai kerangka dan template asli supaya yang diuji sama dengan
 *   yang diterima pembeli.
 */

const PROVIDER_PRESET = [
  { label: "SumoPod", host: "smtp.sumopod.com", port: 587, secure: false },
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, secure: false },
  { label: "Brevo", host: "smtp-relay.brevo.com", port: 587, secure: false },
  { label: "Mailjet", host: "in-v3.mailjet.com", port: 587, secure: false },
  { label: "Resend", host: "smtp.resend.com", port: 465, secure: true },
];

export function EmailHealthPanel() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getEmailStatus);
  const sendTest = useServerFn(sendTestEmail);
  const saveConfig = useServerFn(saveSmtpConfig);
  const clearConfig = useServerFn(clearSmtpConfig);

  const [testRecipient, setTestRecipient] = useState("");
  const [form, setForm] = useState({
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    from: "",
    replyTo: "",
  });
  const [formOpen, setFormOpen] = useState(false);

  const { data, isPending, refetch } = useQuery({
    queryKey: ["email-status"],
    queryFn: () => fetchStatus({}),
    staleTime: 15_000,
  });

  // Isi form dari status server (tanpa password — memang tidak pernah dikirim).
  const status = data as any;
  useEffect(() => {
    if (!status || status.forbidden) return;
    setForm((prev) => ({
      ...prev,
      host: status.host ?? "",
      port: status.port ?? 587,
      secure: status.secure ?? false,
      user: status.user ?? "",
      from: status.from ?? "",
      replyTo: status.replyTo ?? "",
    }));
  }, [status]);

  const testMutation = useMutation({
    mutationFn: () => sendTest({ data: { recipient: testRecipient.trim() || undefined } }),
    onSuccess: (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Email uji gagal dikirim.");
        return;
      }
      toast.success(`Email uji terkirim ke ${res.recipient}.`);
      void refetch();
    },
    onError: () => toast.error("Email uji gagal dikirim."),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveConfig({
        data: {
          host: form.host.trim(),
          port: Number(form.port),
          secure: form.secure,
          user: form.user.trim(),
          password: form.password || undefined,
          from: form.from.trim(),
          replyTo: form.replyTo.trim() || undefined,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Konfigurasi gagal disimpan.");
        return;
      }
      toast.success("Konfigurasi SMTP tersimpan.");
      setForm((prev) => ({ ...prev, password: "" }));
      await qc.invalidateQueries({ queryKey: ["email-status"] });
      void refetch();
    },
    onError: () => toast.error("Konfigurasi gagal disimpan."),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearConfig({}),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Gagal menghapus konfigurasi.");
        return;
      }
      toast.success("Konfigurasi SMTP dihapus. Sistem kembali memakai kredensial server.");
      setForm((prev) => ({ ...prev, password: "" }));
      await qc.invalidateQueries({ queryKey: ["email-status"] });
      void refetch();
    },
  });

  if (isPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Memeriksa status email…
      </div>
    );
  }
  if (status?.forbidden) return null;

  const lastFailure = (status.recent ?? []).find((r: any) => r.status === "failed");

  return (
    <section
      aria-labelledby="email-health-heading"
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      {/* Status */}
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
            status.ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning-foreground"
          }`}
        >
          <Mail className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="email-health-heading" className="text-sm font-bold text-foreground">
            Status pengiriman email
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {status.ready
              ? `Aktif lewat ${status.host} port ${status.port}${
                  status.source === "database" ? " (diatur dari halaman ini)" : " (dari server)"
                }.`
              : "SMTP belum dikonfigurasi. Isi konfigurasi di bawah untuk mengaktifkan email."}
          </p>
        </div>
      </div>

      {/* Ringkasan pengiriman */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Terkirim", value: status.summary?.sent ?? 0, tone: "text-success" },
          { label: "Gagal", value: status.summary?.failed ?? 0, tone: "text-destructive" },
          { label: "Dilewati", value: status.summary?.skipped ?? 0, tone: "text-muted-foreground" },
          {
            label: "Menunggu",
            value: status.summary?.pending ?? 0,
            tone: "text-warning-foreground",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className={`mt-1 text-lg font-bold tabular-nums ${item.tone}`}>{item.value}</dd>
          </div>
        ))}
      </dl>

      {lastFailure ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-foreground">Kegagalan terakhir</p>
            <p className="mt-0.5 break-words text-muted-foreground">
              {lastFailure.template}: {lastFailure.error ?? "tanpa pesan"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Tombol uji */}
      <div className="space-y-2 border-t border-border pt-4">
        <Label htmlFor="email-test-recipient" className="text-xs font-semibold">
          Kirim email uji
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="email-test-recipient"
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="Kosongkan untuk memakai email akun Anda"
            className="min-h-11 min-w-0 flex-1 sm:max-w-xs"
          />
          <Button
            type="button"
            className="min-h-11"
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {testMutation.isPending ? "Mengirim…" : "Kirim email uji"}
          </Button>
        </div>
      </div>

      {/* Konfigurasi SMTP */}
      <div className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-semibold text-foreground">Konfigurasi SMTP</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
            aria-controls="smtp-form"
          >
            {formOpen ? "Tutup" : "Ubah konfigurasi"}
          </Button>
        </div>

        {formOpen ? (
          <div id="smtp-form" className="mt-3 space-y-4">
            {/* Preset provider supaya tidak perlu mengetik host manual. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Provider umum</Label>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_PRESET.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        host: preset.host,
                        port: preset.port,
                        secure: preset.secure,
                      }))
                    }
                    className="min-h-10 rounded-lg border border-border bg-surface px-3 text-xs font-medium transition-colors hover:border-accent/50 hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Memilih provider hanya mengisi host dan port. Kredensial tetap milik akun Anda.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host">Host</Label>
                <Input
                  id="smtp-host"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="smtp.contoh.com"
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                  className="min-h-11 tabular-nums"
                />
              </div>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3">
              <Switch
                checked={form.secure}
                onCheckedChange={(v) => setForm({ ...form, secure: v })}
                aria-label="TLS langsung"
              />
              <span className="text-xs">
                <span className="block font-medium text-foreground">TLS langsung (port 465)</span>
                <span className="text-muted-foreground">
                  Matikan untuk port 587. Sebagian provider menolak STARTTLS.
                </span>
              </span>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-user">Username</Label>
              <Input
                id="smtp-user"
                value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
                autoComplete="off"
                className="min-h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">Password</Label>
              <Input
                id="smtp-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Kosongkan untuk mempertahankan yang tersimpan"
                autoComplete="new-password"
                className="min-h-11"
              />
              <p className="text-xs text-muted-foreground">
                Disimpan terenkripsi di database. Tidak pernah ditampilkan kembali setelah disimpan.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from">Email pengirim</Label>
                <Input
                  id="smtp-from"
                  type="email"
                  value={form.from}
                  onChange={(e) => setForm({ ...form, from: e.target.value })}
                  placeholder="noreply@domain.com"
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-reply">Reply-to (opsional)</Label>
                <Input
                  id="smtp-reply"
                  type="email"
                  value={form.replyTo}
                  onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                  placeholder="Kosongkan bila sama dengan pengirim"
                  className="min-h-11"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-11"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="mr-1.5 size-4" aria-hidden="true" />
                )}
                {saveMutation.isPending ? "Menyimpan…" : "Simpan konfigurasi"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
              >
                <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
                Hapus, pakai kredensial server
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Menghapus konfigurasi tidak mematikan email bila server masih punya kredensial di
              environment.
            </p>
          </div>
        ) : null}
      </div>

      {/* Riwayat singkat */}
      {status.recent?.length ? (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-foreground">10 pengiriman terakhir</p>
          <ul className="space-y-1.5">
            {status.recent.slice(0, 6).map((row: any, index: number) => (
              <li key={index} className="flex items-center gap-2 text-xs">
                {row.status === "sent" ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <AlertTriangle
                    className="size-3.5 shrink-0 text-warning-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {row.template}
                  {row.error ? ` — ${row.error}` : ""}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("id-ID", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

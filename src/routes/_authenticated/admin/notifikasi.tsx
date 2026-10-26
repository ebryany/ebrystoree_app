import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Check, Loader2, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, EmptyRow, ForbiddenState } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABELS } from "@/lib/admin-nav";
import {
  NOTIF_TYPES,
  listBroadcastHistory,
  searchNotificationRecipients,
  sendAdminNotification,
} from "@/lib/notifications-admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/notifikasi")({
  head: () => ({
    meta: [
      { title: "Kirim Notifikasi — Admin Ebrystore" },
      { name: "description", content: "Kirim pengumuman dan notifikasi ke pengguna Ebrystore." },
      { property: "og:title", content: "Kirim Notifikasi — Admin Ebrystore" },
      { property: "og:description", content: "Broadcast pengumuman ke pelanggan Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminNotifikasi,
});

const ROLE_OPTIONS = ["customer", "operator", "support", "finance", "admin", "super_admin"] as const;

function AdminNotifikasi() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendAdminNotification);
  const searchFn = useServerFn(searchNotificationRecipients);
  const historyFn = useServerFn(listBroadcastHistory);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("announcement");
  const [audience, setAudience] = useState<"all" | "role" | "users">("all");
  const [role, setRole] = useState<string>("customer");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string; email: string }[]>([]);

  const history = useQuery({ queryKey: ["broadcast-history"], queryFn: () => historyFn({}) });
  const recipients = useQuery({
    queryKey: ["broadcast-recipients", query],
    queryFn: () => searchFn({ data: { search: query } }),
    enabled: audience === "users",
  });

  const mutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          title,
          message,
          type,
          audience,
          role: audience === "role" ? role : null,
          userIds: audience === "users" ? selected.map((s) => s.id) : undefined,
        },
      }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error("Anda tidak berhak mengirim notifikasi.");
      if (!res?.ok) return toast.error(res?.error ?? "Notifikasi gagal dikirim.");
      toast.success(`Notifikasi terkirim ke ${res.recipients} penerima.`);
      setTitle("");
      setMessage("");
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["broadcast-history"] });
      queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    },
    onError: () => toast.error("Notifikasi gagal dikirim."),
  });

  const valid = useMemo(() => {
    if (title.trim().length < 3 || message.trim().length < 3) return false;
    if (audience === "users" && selected.length === 0) return false;
    return true;
  }, [title, message, audience, selected]);

  if ((history.data as any)?.forbidden) return <ForbiddenState permission="notifications.broadcast" />;

  const items = (recipients.data as any)?.items ?? [];

  function toggleUser(u: { id: string; name: string; email: string }) {
    setSelected((prev) => (prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]));
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Notifikasi"
        title="Kirim Notifikasi"
        description="Pengumuman akan muncul sebagai pop-up dan lonceng notifikasi di dashboard pengguna secara realtime."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="notif-title">Judul</Label>
              <Input
                id="notif-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Promo layanan akademik akhir bulan"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notif-message">Pesan</Label>
              <Textarea
                id="notif-message"
                value={message}
                maxLength={1000}
                rows={5}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tulis isi pengumuman dengan jelas dan singkat."
              />
              <p className="text-xs text-muted-foreground">{message.length}/1000 karakter</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid min-w-0 gap-2">
                <Label>Jenis</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIF_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label>Penerima</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua pengguna</SelectItem>
                    <SelectItem value="role">Berdasarkan peran</SelectItem>
                    <SelectItem value="users">Pengguna terpilih</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {audience === "role" ? (
              <div className="grid gap-2">
                <Label>Peran</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audience === "users" ? (
              <div className="grid gap-2">
                <Label htmlFor="notif-search">Cari pengguna</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="notif-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nama atau email"
                    className="pl-9"
                  />
                </div>
                {selected.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((s) => (
                      <Badge key={s.id} variant="secondary" className="gap-1">
                        {s.name}
                        <button type="button" onClick={() => toggleUser(s)} aria-label={`Hapus ${s.name}`}>
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {recipients.isPending ? (
                    <li className="p-4 text-sm text-muted-foreground">Memuat pengguna…</li>
                  ) : items.length === 0 ? (
                    <li className="p-4 text-sm text-muted-foreground">Tidak ada pengguna cocok.</li>
                  ) : (
                    items.map((u: any) => {
                      const active = selected.some((s) => s.id === u.id);
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => toggleUser(u)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                              active && "bg-accent/10",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{u.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                            </span>
                            {active ? <Check className="size-4 shrink-0 text-accent" aria-hidden="true" /> : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {audience === "all"
                  ? "Dikirim ke seluruh pengguna terdaftar."
                  : audience === "role"
                    ? `Dikirim ke semua ${ROLE_LABELS[role] ?? role}.`
                    : `${selected.length} pengguna dipilih.`}
              </p>
              <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="gap-2">
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                Kirim notifikasi
              </Button>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BellRing className="size-4 text-accent" aria-hidden="true" />
              Pratinjau pop-up pengguna
            </h2>
            <div className="mt-3 rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">
                {NOTIF_TYPES.find((t) => t.value === type)?.label ?? "Pengumuman"}
              </p>
              <p className="mt-1 font-semibold leading-snug">{title || "Judul pengumuman"}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {message || "Isi pesan akan tampil di sini."}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              Riwayat pengiriman
            </h2>
            <div className="mt-3">
              {history.isPending ? (
                <AdminLoading label="Memuat riwayat…" />
              ) : history.error ? (
                <AdminError />
              ) : ((history.data as any)?.items ?? []).length === 0 ? (
                <EmptyRow message="Belum ada pengumuman terkirim." />
              ) : (
                <ul className="space-y-2">
                  {((history.data as any).items as any[]).map((h) => (
                    <li key={h.id} className="rounded-xl border border-border p-3">
                      <p className="truncate text-sm font-medium">{h.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {h.recipients} penerima ·{" "}
                        {h.audience === "all" ? "Semua" : h.audience === "role" ? (ROLE_LABELS[h.role] ?? h.role) : "Terpilih"} ·{" "}
                        {new Date(h.createdAt).toLocaleString("id-ID")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

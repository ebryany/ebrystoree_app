import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, MessageSquarePlus } from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { EmptyState, ErrorState } from "@/components/ebry/states";
import { PO_STATUS_LABEL } from "@/components/po/po-thread";
import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { createPoRequest, listMyPoRequests } from "@/lib/po.functions";

export const Route = createFileRoute("/_authenticated/dashboard/po/")({
  head: () => ({
    meta: [
      { title: "Pesan Produk Custom (PO) — Ebrystore" },
      {
        name: "description",
        content: "Ajukan permintaan produk custom lewat sistem PO Ebrystore: diskusi, penawaran, DP, lalu pelunasan.",
      },
      { property: "og:title", content: "Pesan Produk Custom (PO) — Ebrystore" },
      { property: "og:description", content: "Kirim permintaan custom dan diskusi langsung dengan tim." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PoListPage,
});

function PoListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listMyPoRequests);
  const create = useServerFn(createPoRequest);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");

  const { data, isPending, error, refetch } = useQuery({ queryKey: ["po-list"], queryFn: () => fetchList({}) });

  async function submit() {
    if (title.trim().length < 5 || description.trim().length < 20) {
      toast.error("Judul minimal 5 karakter dan deskripsi minimal 20 karakter.");
      return;
    }
    setBusy(true);
    const result = await create({
      data: {
        title: title.trim(),
        description: description.trim(),
        budgetEstimate: budget ? Number(budget) : undefined,
        deadlineAt: deadline ? new Date(deadline).toISOString() : undefined,
        referenceUrl: referenceUrl.trim(),
      },
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Permintaan ${result.requestNumber} dikirim.`);
    await queryClient.invalidateQueries({ queryKey: ["po-list"] });
    void navigate({ to: "/dashboard/po/$id", params: { id: result.id } });
  }

  const items = (data?.items ?? []) as any[];

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-accent/10 via-card to-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">Pesan produk custom (PO)</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Ceritakan kebutuhan Anda, tim kami balas lewat chat dan kirim penawaran. Bayar DP dulu, lunasi setelah
              hasil dikirim.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            <MessageSquarePlus className="mr-1.5 size-4" aria-hidden="true" />
            {open ? "Tutup formulir" : "Ajukan PO baru"}
          </Button>
        </div>
      </header>

      {open ? (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-semibold">Detail permintaan</h2>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="po-title">Judul permintaan</Label>
              <Input id="po-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Template PPT sidang custom" />
            </div>
            <div>
              <Label htmlFor="po-desc">Deskripsi kebutuhan</Label>
              <Textarea
                id="po-desc"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan detail: jumlah halaman, gaya desain, format berkas, dan hal penting lain."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="po-budget">Estimasi budget (Rp)</Label>
                <Input id="po-budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="po-deadline">Tenggat diinginkan</Label>
                <Input id="po-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="po-ref">Tautan referensi (opsional)</Label>
              <Input id="po-ref" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://" />
            </div>
            <Button disabled={busy} onClick={() => void submit()}>
              Kirim permintaan
            </Button>
          </div>
        </section>
      ) : null}

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Belum ada permintaan PO"
          description="Ajukan permintaan produk custom dan diskusikan langsung dengan tim Ebrystore."
          action={<Button size="sm" onClick={() => setOpen(true)}>Ajukan PO baru</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{item.request_number}</p>
                  <p className="mt-1 truncate font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.quoted_total ? `Penawaran ${formatRupiah(item.quoted_total)}` : "Menunggu penawaran tim"}
                  </p>
                </div>
                <StatusPill value={item.status} label={PO_STATUS_LABEL[item.status] ?? item.status} />
              </div>
              <Button asChild size="sm" variant="outline" className="mt-4 w-full">
                <Link to="/dashboard/po/$id" params={{ id: item.id }}>
                  Buka diskusi
                  <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessagesSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { createProductInquiry } from "@/lib/inquiries.functions";

const QUICK = [
  "Apakah jasa ini bisa untuk kebutuhan saya?",
  "Berapa lama pengerjaannya?",
  "Apakah bisa diskusi dulu sebelum pesan?",
];

/**
 * Tombol chat untuk kartu jasa.
 *
 * Alasan desain:
 * - Pertanyaan tentang jasa biasanya muncul sebelum memesan, jadi tombol chat
 *   diletakkan berdampingan dengan "Pesan jasa", bukan disembunyikan.
 * - Percakapan memakai sistem inquiry yang sudah ada (product_inquiries dengan
 *   service_id), sehingga penjual membalas dari menu Chat yang sama dan pembeli
 *   menerima balasan di dashboard — tidak ada kanal baru yang perlu dipantau.
 * - Pengguna yang belum masuk diarahkan ke halaman masuk, membawa konteks balik
 *   ke layanan, bukan diam-diam gagal.
 */
export function ServiceChatButton({
  serviceId,
  serviceName,
  storeName,
  className,
}: {
  serviceId: string;
  serviceName: string;
  storeName?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const create = useServerFn(createProductInquiry);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(QUICK[0]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = body.trim();
    if (text.length < 3) {
      toast.error("Tulis pertanyaanmu dulu ya.");
      return;
    }
    setBusy(true);
    const result = await create({
      data: { serviceId, subject: `Tanya jasa: ${serviceName}`.slice(0, 160), body: text },
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success("Pertanyaan terkirim. Penjual akan membalas di chat.");
    navigate({ to: "/dashboard/chat/$id", params: { id: result.id } });
  }

  if (!loading && !user) {
    return (
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => navigate({ to: "/auth", search: { next: "/layanan" } })}
      >
        <MessagesSquare className="size-4" aria-hidden="true" />
        Chat
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <MessagesSquare className="size-4" aria-hidden="true" />
          Chat
        </Button>
      </DialogTrigger>
      <DialogContent surface="glass">
        <DialogHeader>
          <DialogTitle>Tanya tentang {serviceName}</DialogTitle>
          <DialogDescription>
            Kirim pertanyaan ke {storeName ? `penjual ${storeName}` : "penjual"}. Balasan muncul di
            menu Chat pada dashboard kamu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setBody(q)}
                className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="service-inquiry-body">Pertanyaan</Label>
            <Textarea
              id="service-inquiry-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Contoh: Apakah bisa menyesuaikan kebutuhan saya?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Kirim pertanyaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

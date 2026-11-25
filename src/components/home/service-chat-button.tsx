"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { createProductInquiry, findMyStoreThread } from "@/lib/inquiries.functions";

const QUICK = [
  "Apakah jasa ini bisa untuk kebutuhan saya?",
  "Berapa lama pengerjaannya?",
  "Apakah bisa diskusi dulu sebelum pesan?",
];

/**
 * Tombol chat untuk kartu jasa.
 * Jika pembeli sudah memiliki percakapan terbuka dengan toko/jasa yang sama,
 * langsung melanjutkan thread tersebut agar tidak membuat duplikat.
 */
export function ServiceChatButton({
  serviceId,
  serviceName,
  storeName,
  className,
  iconOnly = false,
}: {
  serviceId: string;
  serviceName: string;
  storeName?: string;
  className?: string;
  /** Hanya ikon (kartu ringkas); label tetap terbaca pembaca layar. */
  iconOnly?: boolean;
}) {
  const label = iconOnly ? (
    <>
      <MessagesSquare className="size-4" aria-hidden="true" />
      <span className="sr-only">Chat penjual</span>
    </>
  ) : (
    <>
      <MessagesSquare className="size-4" aria-hidden="true" />
      Chat
    </>
  );
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const create = useServerFn(createProductInquiry);
  const findThread = useServerFn(findMyStoreThread);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(QUICK[0]);
  const [busy, setBusy] = useState(false);

  const existing = useQuery({
    queryKey: ["my-store-thread", user?.id ?? "anon", "service", serviceId],
    queryFn: () => findThread({ data: { serviceId } }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

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

  if (user && existing.data?.id) {
    const threadId = existing.data.id;
    return (
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => navigate({ to: "/dashboard/chat/$id", params: { id: threadId } })}
      >
        {label}
      </Button>
    );
  }

  if (!loading && !user) {
    return (
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => navigate({ to: "/auth", search: { next: "/layanan" } })}
      >
        {label}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          {label}
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

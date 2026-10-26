import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageCircleQuestion } from "lucide-react";

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
  "Apakah produk ini masih tersedia?",
  "Berapa lama proses pengirimannya?",
  "Apakah bisa request versi lain?",
];

export function ProductInquiryButton({
  productId,
  productName,
  isSellerProduct = false,
  className,
  variant = "outline",
}: {
  productId: string;
  productName: string;
  isSellerProduct?: boolean;
  className?: string;
  variant?: "outline" | "secondary" | "ghost";
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
      data: { productId, subject: `Tanya produk: ${productName}`.slice(0, 160), body: text },
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success(isSellerProduct ? "Pertanyaan terkirim. Penjual akan membalas di chat." : "Pertanyaan terkirim. Tim kami akan membalas di chat.");
    navigate({ to: "/dashboard/chat/$id", params: { id: result.id } });
  }

  if (!loading && !user) {
    return (
      <Button
        variant={variant}
        className={className}
        onClick={() => navigate({ to: "/auth", search: { next: "/produk" } })}
      >
        <MessageCircleQuestion className="size-4" aria-hidden="true" />
        Tanya ketersediaan
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <MessageCircleQuestion className="size-4" aria-hidden="true" />
          Tanya ketersediaan
        </Button>
      </DialogTrigger>
      <DialogContent surface="glass">
        <DialogHeader>
          <DialogTitle>Tanya tentang {productName}</DialogTitle>
          <DialogDescription>
            Kirim pertanyaan ke {isSellerProduct ? "penjual" : "tim Ebrystore"}. Balasan muncul di menu Chat pada dashboard kamu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setBody(q)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="inquiry-body">Pertanyaan</Label>
            <Textarea
              id="inquiry-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Contoh: Apakah stok produk ini masih ada untuk hari ini?"
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

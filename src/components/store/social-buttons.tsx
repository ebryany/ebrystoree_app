import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Heart, Loader2, MessageCircle, Plus } from "lucide-react";

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
import {
  getMySocialState,
  getProductLikes,
  getStoreSocial,
  toggleProductLike,
  toggleStoreFollow,
} from "@/lib/social.functions";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
export const formatCount = (n: number) => nf.format(n);

function currentPath() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

/** Status ikuti/suka milik user; satu query per halaman (cache dibagi antar tombol). */
function useMySocial(storeId?: string, productId?: string) {
  const { user } = useSession();
  const fetchState = useServerFn(getMySocialState);
  return useQuery({
    queryKey: ["my-social", user?.id ?? "anon", storeId ?? "", productId ?? ""],
    queryFn: () => fetchState({ data: { storeId, productId } }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });
}

export function useStoreSocial(storeId: string) {
  return useQuery({
    queryKey: ["store-social", storeId],
    queryFn: () => getStoreSocial({ data: { storeId } }),
    staleTime: 30_000,
  });
}

export function FollowStoreButton({
  storeId,
  className,
  isOwner = false,
}: {
  storeId: string;
  className?: string;
  isOwner?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const mine = useMySocial(storeId);
  const toggle = useServerFn(toggleStoreFollow);
  const following = mine.data?.following ?? false;

  const mutation = useMutation({
    mutationFn: () => toggle({ data: { storeId } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      queryClient.setQueryData(
        ["my-social", user?.id ?? "anon", storeId, ""],
        (prev: { following: boolean; liked: boolean } | undefined) => ({
          liked: prev?.liked ?? false,
          following: r.following,
        }),
      );
      queryClient.setQueryData(["store-social", storeId], (prev: any) =>
        prev?.social ? { social: { ...prev.social, followers: r.followers } } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["my-follows-likes"] });
      toast.success(
        r.following ? "Kamu mengikuti toko ini. Produk barunya akan dikabarkan." : "Berhenti mengikuti toko.",
      );
    },
    onError: () => toast.error("Gagal memperbarui. Coba lagi."),
  });

  if (isOwner) return null;

  return (
    <Button
      type="button"
      variant={following ? "outline" : "default"}
      aria-pressed={following}
      disabled={mutation.isPending || (Boolean(user) && mine.isPending)}
      className={cn("min-h-11", className)}
      onClick={() => {
        if (!user) {
          navigate({ to: "/auth", search: { next: currentPath() } });
          return;
        }
        mutation.mutate();
      }}
    >
      {mutation.isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : following ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      {following ? "Mengikuti" : "Ikuti"}
    </Button>
  );
}

export function LikeProductButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const mine = useMySocial(undefined, productId);
  const counts = useQuery({
    queryKey: ["product-likes", productId],
    queryFn: () => getProductLikes({ data: { productId } }),
    staleTime: 30_000,
  });
  const toggle = useServerFn(toggleProductLike);
  const liked = mine.data?.liked ?? false;
  const likes = counts.data?.likes ?? 0;

  const mutation = useMutation({
    mutationFn: () => toggle({ data: { productId } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      queryClient.setQueryData(
        ["my-social", user?.id ?? "anon", "", productId],
        (prev: { following: boolean; liked: boolean } | undefined) => ({
          following: prev?.following ?? false,
          liked: r.liked,
        }),
      );
      queryClient.setQueryData(["product-likes", productId], { likes: r.likes });
      queryClient.invalidateQueries({ queryKey: ["my-follows-likes"] });
      queryClient.invalidateQueries({ queryKey: ["store-social"] });
    },
    onError: () => toast.error("Gagal memperbarui. Coba lagi."),
  });

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Batal suka produk ini" : "Suka produk ini"}
      disabled={mutation.isPending}
      onClick={() => {
        if (!user) {
          navigate({ to: "/auth", search: { next: currentPath() } });
          return;
        }
        mutation.mutate();
      }}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-60",
        liked ? "text-destructive" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart
        className={cn("size-5 transition-transform", liked && "scale-110 fill-current")}
        aria-hidden="true"
      />
      <span>
        Disukai <span className="tabular-nums">({formatCount(likes)})</span>
      </span>
    </button>
  );
}

const STORE_QUICK = [
  "Halo, apakah ada produk yang bisa direkomendasikan?",
  "Apakah bisa request produk custom?",
  "Kapan restock produk berikutnya?",
];

/**
 * Chat langsung ke toko dari halaman profil toko. Thread masuk ke inbox
 * seller pemilik toko; untuk toko resmi masuk ke inbox admin/support.
 */
export function StoreChatButton({
  storeId,
  storeName,
  isPlatform,
  isOwner = false,
  className,
}: {
  storeId: string;
  storeName: string;
  isPlatform: boolean;
  isOwner?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const { user } = useSession();
  const create = useServerFn(createProductInquiry);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(STORE_QUICK[0]);
  const [busy, setBusy] = useState(false);

  if (isOwner) return null;

  async function submit() {
    const text = body.trim();
    if (text.length < 3) {
      toast.error("Tulis pesanmu dulu ya.");
      return;
    }
    setBusy(true);
    try {
      const result = await create({
        data: { storeId, subject: `Chat toko: ${storeName}`.slice(0, 160), body: text },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(isPlatform ? "Pesan terkirim ke tim Ebrystore." : "Pesan terkirim ke penjual.");
      navigate({ to: "/dashboard/chat/$id", params: { id: result.id } });
    } catch {
      toast.error("Pesan gagal dikirim. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const trigger = (
    <Button
      type="button"
      variant="outline"
      className={cn("min-h-11", className)}
      onClick={
        user
          ? undefined
          : () => navigate({ to: "/auth", search: { next: currentPath() } })
      }
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      Chat
    </Button>
  );

  if (!user) return trigger;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent surface="glass">
        <DialogHeader>
          <DialogTitle>Chat dengan {storeName}</DialogTitle>
          <DialogDescription>
            {isPlatform
              ? "Pesan dibalas tim Ebrystore. Balasan muncul di menu Chat pada dashboard kamu."
              : "Pesan dikirim ke penjual. Balasan muncul di menu Chat pada dashboard kamu."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {STORE_QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setBody(q)}
                className="min-h-9 rounded-full border border-border px-3 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="store-chat-body">Pesan</Label>
            <Textarea
              id="store-chat-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="min-h-11">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Kirim pesan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

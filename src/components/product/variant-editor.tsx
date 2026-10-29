import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  listProductVariants,
  saveProductVariants,
  type EditableVariant,
} from "@/lib/product-variants.functions";

type Row = {
  key: string;
  id?: string;
  name: string;
  price: string;
  discount: string;
  active: boolean;
};

const MAX_VARIANTS = 20;
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 10);

function toRows(items: EditableVariant[]): Row[] {
  return items.map((v) => ({
    key: v.id ?? crypto.randomUUID(),
    id: v.id,
    name: v.name,
    price: String(v.price),
    discount: v.discount_price == null ? "" : String(v.discount_price),
    active: v.is_active,
  }));
}

/**
 * Editor variasi produk (nama + harga + diskon). Disimpan sekaligus lewat RPC
 * `set_product_variants`; server yang menegakkan kepemilikan & reset moderasi.
 * Hanya untuk mode kirim "shared".
 */
export function ProductVariantEditor({
  productId,
  deliveryMode,
  moderationNotice = false,
  onSaved,
}: {
  productId: string;
  deliveryMode: string | null | undefined;
  /** Tampilkan peringatan bahwa perubahan memicu moderasi ulang (produk seller). */
  moderationNotice?: boolean;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const fetchVariants = useServerFn(listProductVariants);
  const save = useServerFn(saveProductVariants);
  const supported = (deliveryMode ?? "shared") === "shared";

  const { data, isPending } = useQuery({
    queryKey: ["product-variants", productId],
    queryFn: () => fetchVariants({ data: { productId } }),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.items) {
      setRows(toRows(data.items));
      setDirty(false);
    }
  }, [data]);

  const update = (key: string, patch: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const move = (index: number, delta: number) => {
    setRows((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const variants = rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        name: r.name.trim(),
        price: Number(r.price || 0),
        discount_price: r.discount ? Number(r.discount) : null,
        is_active: r.active,
      }));
      for (const v of variants) {
        if (!v.name) throw new Error("Nama variasi wajib diisi.");
        if (v.discount_price !== null && v.discount_price >= v.price)
          throw new Error(`Diskon "${v.name}" harus lebih kecil dari harga normal.`);
      }
      return save({ data: { productId, variants } });
    },
    onSuccess: async (res) => {
      if (!res.ok) return toast.error(res.error);
      toast.success("Variasi disimpan.");
      await qc.invalidateQueries({ queryKey: ["product-variants", productId] });
      onSaved?.();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Variasi gagal disimpan."),
  });

  if (!supported) {
    return (
      <section className="space-y-2 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Variasi</h2>
        <p className="text-sm text-muted-foreground">
          Variasi hanya tersedia untuk mode pengiriman <strong>Berkas bersama</strong>. Produk
          stok unik dan kode/link memakai satu stok per produk.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`variasi-${productId}`}
      className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div>
        <h2 id={`variasi-${productId}`} className="text-base font-semibold">
          Variasi
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Contoh: 1 Bulan, 3 Bulan, 12 Bulan. Bila ada variasi aktif, pembeli wajib memilih salah
          satu dan harga produk utama tidak dipakai. Kosongkan untuk menjual tanpa variasi.
          {moderationNotice ? " Perubahan variasi membuat produk ditinjau ulang admin." : null}
        </p>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Memuat variasi…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada variasi.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="space-y-3 rounded-xl border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor={`v-name-${r.key}`}>Nama variasi</Label>
                  <Input
                    id={`v-name-${r.key}`}
                    value={r.name}
                    maxLength={60}
                    placeholder="1 Bulan"
                    onChange={(e) => update(r.key, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`v-price-${r.key}`}>Harga (Rp)</Label>
                  <Input
                    id={`v-price-${r.key}`}
                    value={r.price}
                    inputMode="numeric"
                    onChange={(e) => update(r.key, { price: digits(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`v-disc-${r.key}`}>Harga diskon</Label>
                  <Input
                    id={`v-disc-${r.key}`}
                    value={r.discount}
                    inputMode="numeric"
                    placeholder="Opsional"
                    onChange={(e) => update(r.key, { discount: digits(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <Switch
                    checked={r.active}
                    onCheckedChange={(active) => update(r.key, { active })}
                  />
                  {r.active ? "Aktif" : "Disembunyikan"}
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Naikkan ${r.name || "variasi"}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Turunkan ${r.name || "variasi"}`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Hapus ${r.name || "variasi"}`}
                    onClick={() => {
                      setRows((list) => list.filter((x) => x.key !== r.key));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={rows.length >= MAX_VARIANTS}
          onClick={() => {
            setRows((list) => [
              ...list,
              { key: crypto.randomUUID(), name: "", price: "", discount: "", active: true },
            ]);
            setDirty(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> Tambah variasi
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Menyimpan…" : "Simpan variasi"}
        </Button>
      </div>
    </section>
  );
}

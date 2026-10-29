import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAX_PAYMENT_METHODS,
  PAYMENT_METHOD_TYPES,
  newPaymentMethodId,
  type CustomPaymentMethod,
} from "@/lib/payment-methods";

export function PaymentMethodsEditor({
  value,
  disabled,
  onChange,
}: {
  value: CustomPaymentMethod[];
  disabled: boolean;
  onChange: (next: CustomPaymentMethod[]) => void;
}) {
  const update = (index: number, patch: Partial<CustomPaymentMethod>) =>
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const move = (index: number, dir: -1 | 1) => {
    const next = [...value];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () =>
    onChange([
      ...value,
      {
        id: newPaymentMethodId(),
        type: "bank",
        name: "",
        account_number: "",
        account_holder: "",
        instruction: "",
        is_active: true,
        for_topup: true,
      },
    ]);

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Belum ada metode pembayaran custom.
        </p>
      ) : null}

      {value.map((m, index) => {
        const base = `pm-${m.id}`;
        return (
          <div key={m.id} className="rounded-lg border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">
                {m.name || `Metode ${index + 1}`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Naikkan urutan"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9"
                  disabled={disabled || index === value.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Turunkan urutan"
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 text-destructive"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  aria-label={`Hapus ${m.name || "metode"}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-type`}>Jenis</Label>
                <Select
                  value={m.type}
                  disabled={disabled}
                  onValueChange={(v) => update(index, { type: v as CustomPaymentMethod["type"] })}
                >
                  <SelectTrigger id={`${base}-type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-name`}>Nama bank / e-wallet</Label>
                <Input
                  id={`${base}-name`}
                  placeholder="BCA, BRI, DANA, GoPay"
                  maxLength={40}
                  value={m.name}
                  disabled={disabled}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-number`}>Nomor rekening / akun</Label>
                <Input
                  id={`${base}-number`}
                  inputMode="numeric"
                  maxLength={40}
                  value={m.account_number}
                  disabled={disabled}
                  onChange={(e) => update(index, { account_number: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-holder`}>Nama pemilik</Label>
                <Input
                  id={`${base}-holder`}
                  maxLength={60}
                  value={m.account_holder}
                  disabled={disabled}
                  onChange={(e) => update(index, { account_holder: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${base}-instruction`}>Instruksi (opsional)</Label>
                <Textarea
                  id={`${base}-instruction`}
                  rows={2}
                  maxLength={300}
                  value={m.instruction}
                  disabled={disabled}
                  onChange={(e) => update(index, { instruction: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Switch
                  checked={m.is_active}
                  disabled={disabled}
                  onCheckedChange={(v) => update(index, { is_active: v })}
                />
                Aktif
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Switch
                  checked={m.for_topup}
                  disabled={disabled}
                  onCheckedChange={(v) => update(index, { for_topup: v })}
                />
                Tersedia untuk top up saldo
              </label>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled || value.length >= MAX_PAYMENT_METHODS}
        onClick={add}
      >
        <Plus className="size-4" aria-hidden="true" /> Tambah metode
      </Button>
    </div>
  );
}

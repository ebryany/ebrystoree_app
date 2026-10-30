import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { encodeAccount, parseAccountLines, type CodeKind } from "@/lib/account-stock";

/**
 * Input stok produk mode kode. Untuk akun: satu akun lewat kolom, atau banyak
 * akun sekaligus (satu per baris). Hasilnya string siap kirim ke ingest.
 */
export function StockInput({
  kind,
  pending,
  onSubmit,
}: {
  kind: CodeKind;
  pending: boolean;
  onSubmit: (codes: string[]) => Promise<boolean>;
}) {
  const [bulk, setBulk] = useState(kind === "code");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [text, setText] = useState("");

  async function submitSingle() {
    if (!login.trim() || !password.trim()) {
      toast.error("Isi email/username dan password akun.");
      return;
    }
    const ok = await onSubmit([encodeAccount({ login, password, note })]);
    if (ok) {
      setLogin("");
      setPassword("");
      setNote("");
    }
  }

  async function submitBulk() {
    let codes: string[];
    if (kind === "account") {
      const { accounts, invalid } = parseAccountLines(text);
      if (invalid.length) {
        toast.error(`Baris ${invalid.join(", ")} tidak sesuai format email|password.`);
        return;
      }
      codes = accounts.map(encodeAccount);
    } else {
      codes = text
        .split(/[\n,;]+/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
    if (codes.length === 0) {
      toast.error(kind === "account" ? "Masukkan minimal satu akun." : "Masukkan minimal satu kode.");
      return;
    }
    if (codes.length > 500) {
      toast.error("Maksimal 500 stok per kirim.");
      return;
    }
    if (await onSubmit(codes)) setText("");
  }

  if (kind === "account" && !bulk) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="stock-login">Email / username</Label>
            <Input
              id="stock-login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="off"
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock-password">Password</Label>
            <Input
              id="stock-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={300}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-note">
            Catatan <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Input
            id="stock-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Mis. profil 2, PIN 1234, jangan ganti password"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={pending} onClick={() => void submitSingle()}>
            {pending ? "Menyimpan…" : "Tambah akun"}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setBulk(true)}>
            Tempel banyak akun
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="stock-bulk">{kind === "account" ? "Daftar akun" : "Kode stok"}</Label>
        <Textarea
          id="stock-bulk"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="font-mono text-sm"
          placeholder={
            kind === "account"
              ? "Satu akun per baris:\nemail1@gmail.com|password1\nemail2@gmail.com|password2|profil 2"
              : "Paste kode, satu per baris:\nABC-123-XYZ\nDEF-456-UVW"
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {kind === "account"
          ? "Format: email|password atau email|password|catatan. Satu baris = satu stok untuk satu pembeli."
          : "Pisahkan kode dengan baris baru, koma, atau titik koma. Duplikat otomatis dilewati."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={pending || !text.trim()}
          onClick={() => void submitBulk()}
        >
          {pending ? "Menyimpan…" : kind === "account" ? "Tambah semua akun" : "Tambah kode stok"}
        </Button>
        {kind === "account" ? (
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setBulk(false)}>
            Isi satu akun
          </Button>
        ) : null}
      </div>
    </div>
  );
}

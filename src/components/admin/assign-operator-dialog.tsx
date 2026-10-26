import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { assignOperator, listOperators } from "@/lib/fulfillment.functions";

export function AssignOperatorDialog({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const [operatorId, setOperatorId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const fetchOperators = useServerFn(listOperators);
  const assign = useServerFn(assignOperator);

  const { data } = useQuery({
    queryKey: ["assignable-operators"],
    queryFn: () => fetchOperators(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      assign({ data: { orderId, operatorId, deadline: deadline || null, note: note.trim() || null } }),
    onSuccess: async (result: any) => {
      if (!result.ok) return toast.error(result.error);
      toast.success("Operator berhasil ditugaskan.");
      setOpen(false);
      setOperatorId("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["order-fulfillment", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["pending-assignment"] });
      await queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
    },
    onError: () => toast.error("Penugasan gagal. Coba lagi."),
  });

  const operators = (data as any)?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Tugaskan operator</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tugaskan operator</DialogTitle>
          <DialogDescription>
            Order {orderNumber} akan berpindah ke status “Sudah ditugaskan” dan operator menerima notifikasi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="operator">Operator</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger id="operator" className="mt-1">
                <SelectValue placeholder="Pilih operator" />
              </SelectTrigger>
              <SelectContent>
                {operators.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} · {o.roles.join(", ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(data as any)?.forbidden ? (
              <p className="mt-1 text-xs text-destructive">Anda tidak punya izin orders.assign.</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="deadline">Deadline internal (opsional)</Label>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="assign-note">Catatan internal (opsional)</Label>
            <Textarea
              id="assign-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
              placeholder="Instruksi khusus untuk operator"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={!operatorId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Menugaskan…" : "Tugaskan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

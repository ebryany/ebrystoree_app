import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  useCan,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ROLE_LABELS } from "@/lib/admin-nav";
import { changeUserRole, listAdminUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/pengguna")({
  head: () => ({
    meta: [
      { title: "Pengguna & Peran — Admin Ebrystore" },
      { name: "description", content: "Cari pengguna, lihat peran, serta beri atau cabut peran dengan audit penuh." },
      { property: "og:title", content: "Pengguna & Peran — Admin Ebrystore" },
      { property: "og:description", content: "Manajemen pengguna dan peran Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPengguna,
});

const PAGE_SIZE = 10;
const ROLES = ["customer", "operator", "support", "finance", "admin", "super_admin"] as const;

function AdminPengguna() {
  const qc = useQueryClient();
  const canManage = useCan("roles.manage");

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{
    userId: string;
    label: string;
    role: string;
    action: "assign" | "remove";
  } | null>(null);
  const [draftRole, setDraftRole] = useState<Record<string, string>>({});

  const fetchUsers = useServerFn(listAdminUsers);
  const change = useServerFn(changeUserRole);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-users", search, role, page],
    queryFn: () => fetchUsers({ data: { search, role: role as any, page, pageSize: PAGE_SIZE } }),
  });

  const mutation = useMutation({
    mutationFn: (payload: { userId: string; role: string; action: "assign" | "remove" }) =>
      change({ data: payload as any }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      setPending(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-audit"] });
      void qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal mengubah peran."),
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Pengguna & Peran"
        title="Pengguna & peran"
        description="Cari berdasarkan nama atau email, lalu kelola peran. Semua perubahan tercatat di audit log."
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value.slice(0, 120));
          }}
          placeholder="Cari nama atau email…"
          aria-label="Cari pengguna"
        />
        <Select
          value={role}
          onValueChange={(v) => {
            setPage(1);
            setRole(v);
          }}
        >
          <SelectTrigger aria-label="Filter peran">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua peran</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <AdminError />
      ) : data.forbidden ? (
        <ForbiddenState permission={data.permission} />
      ) : data.error ? (
        <AdminError message={data.error} />
      ) : data.items.length === 0 ? (
        <EmptyRow message="Tidak ada pengguna yang cocok." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pengguna</TableHead>
                  <TableHead>Peran</TableHead>
                  {canManage ? <TableHead className="text-right">Kelola peran</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((u: any) => (
                  <TableRow key={u.userId}>
                    <TableCell className="max-w-72">
                      <p className="truncate font-medium">{u.fullName ?? "(tanpa nama)"}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email ?? u.userId}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          u.roles.map((r: string) => (
                            <Badge key={r} variant={r === "super_admin" ? "default" : "secondary"}>
                              {ROLE_LABELS[r] ?? r}
                              {canManage ? (
                                <button
                                  type="button"
                                  aria-label={`Cabut peran ${r}`}
                                  className="ml-1 opacity-70 hover:opacity-100"
                                  onClick={() =>
                                    setPending({
                                      userId: u.userId,
                                      label: u.email ?? u.userId,
                                      role: r,
                                      action: "remove",
                                    })
                                  }
                                >
                                  <Minus className="size-3" aria-hidden="true" />
                                </button>
                              ) : null}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={draftRole[u.userId] ?? ""}
                            onValueChange={(v) => setDraftRole({ ...draftRole, [u.userId]: v })}
                          >
                            <SelectTrigger className="w-36" aria-label={`Pilih peran untuk ${u.email ?? u.userId}`}>
                              <SelectValue placeholder="Pilih peran" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!draftRole[u.userId]}
                            onClick={() =>
                              setPending({
                                userId: u.userId,
                                label: u.email ?? u.userId,
                                role: draftRole[u.userId]!,
                                action: "assign",
                              })
                            }
                          >
                            <Plus className="mr-1 size-4" aria-hidden="true" />
                            Beri
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "assign" ? "Berikan peran?" : "Cabut peran?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Peran <strong>{pending ? (ROLE_LABELS[pending.role] ?? pending.role) : ""}</strong>{" "}
              {pending?.action === "assign" ? "akan diberikan kepada" : "akan dicabut dari"} {pending?.label}. Perubahan
              ini dicatat di audit log. Super admin terakhir tidak dapat dicabut dan Anda tidak dapat mengubah peran
              akun sendiri.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pending && mutation.mutate({ userId: pending.userId, role: pending.role, action: pending.action })
              }
            >
              Konfirmasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/admin-nav";
import { getPermissionMatrix, setRolePermission } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/izin")({
  head: () => ({
    meta: [
      { title: "Matriks Izin — Admin Ebrystore" },
      { name: "description", content: "Kelola izin granular per peran untuk dashboard admin Ebrystore." },
      { property: "og:title", content: "Matriks Izin — Admin Ebrystore" },
      { property: "og:description", content: "Pengaturan RBAC granular Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminIzin,
});

function AdminIzin() {
  const qc = useQueryClient();
  const canManage = useCan("permissions.manage");
  const fetchMatrix = useServerFn(getPermissionMatrix);
  const setPerm = useServerFn(setRolePermission);

  const { data, isPending, error } = useQuery({ queryKey: ["admin-permissions"], queryFn: () => fetchMatrix({}) });

  const mutation = useMutation({
    mutationFn: (payload: { role: string; permissionKey: string; enabled: boolean }) => setPerm({ data: payload as any }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      void qc.invalidateQueries({ queryKey: ["admin-permissions"] });
      void qc.invalidateQueries({ queryKey: ["my-access"] });
      void qc.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal memperbarui izin."),
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Matriks Izin"
        title="Matriks izin per peran"
        description="Izin super admin dikunci sistem. Anda tidak dapat mengubah izin peran milik sendiri."
      />

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <AdminError />
      ) : data.forbidden ? (
        <ForbiddenState permission={data.permission} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">Izin</TableHead>
                {data.roles.map((r: string) => (
                  <TableHead key={r} className="text-center text-xs">
                    {ROLE_LABELS[r] ?? r}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.permissions.map((p: any) => (
                <TableRow key={p.key}>
                  <TableCell className="align-top">
                    <p className="font-medium">
                      {p.key}
                      {p.is_transactional ? (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Slice 2
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </TableCell>
                  {data.roles.map((r: string) => {
                    const enabled =
                      r === "super_admin" ||
                      data.mapping.some((m: any) => m.role === r && m.permission_key === p.key);
                    return (
                      <TableCell key={r} className="text-center">
                        <Checkbox
                          checked={enabled}
                          disabled={!canManage || r === "super_admin" || mutation.isPending}
                          aria-label={`${p.key} untuk ${r}`}
                          onCheckedChange={(v) =>
                            mutation.mutate({ role: r, permissionKey: p.key, enabled: v === true })
                          }
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
} from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditLogs } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — Admin Ebrystore" },
      { name: "description", content: "Riwayat tindakan admin Ebrystore: siapa, apa, kapan, dan perubahan datanya." },
      { property: "og:title", content: "Audit Log — Admin Ebrystore" },
      { property: "og:description", content: "Jejak audit dashboard admin Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAudit,
});

const PAGE_SIZE = 15;

function AdminAudit() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const fetchLogs = useServerFn(listAuditLogs);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-audit", search, page],
    queryFn: () => fetchLogs({ data: { search, page, pageSize: PAGE_SIZE } }),
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Audit Log"
        title="Audit log"
        description="Catatan tindakan sensitif: aktor, aksi, entitas, data sebelum/sesudah, dan waktu."
      />

      <Input
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value.slice(0, 120));
        }}
        placeholder="Cari aksi, contoh: product.update"
        aria-label="Cari audit log"
      />

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <AdminError />
      ) : data.forbidden ? (
        <ForbiddenState permission={data.permission} />
      ) : data.error ? (
        <AdminError message={data.error} />
      ) : data.items.length === 0 ? (
        <EmptyRow message="Belum ada catatan audit." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead>Aktor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{a.action}</Badge>
                      {a.reason ? <p className="mt-1 text-xs text-muted-foreground">{a.reason}</p> : null}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <p className="truncate text-sm">{a.entity_type}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.entity_id ?? "-"}</p>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <p className="truncate text-xs text-muted-foreground">{a.actor_role ?? "-"}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.ip ?? ""}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

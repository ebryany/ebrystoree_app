import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Phone, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Initial,
  Pager,
  SearchField,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { formatDateTime } from "@/components/admin/tx-ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/pengguna")({
  head: () => ({
    meta: [
      { title: "Pengguna & Peran — Admin Ebrystore" },
      {
        name: "description",
        content: "Cari pengguna, lihat peran, serta beri atau cabut peran dengan audit penuh.",
      },
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

/** Warna peran: staf ditonjolkan, pelanggan netral. */
function roleClass(role: string) {
  if (role === "super_admin") return "border-foreground bg-foreground text-background";
  if (role === "admin") return "border-accent/40 bg-accent/10 text-accent";
  if (role === "customer") return "border-border bg-muted text-muted-foreground";
  return "border-info/30 bg-info/10 text-info";
}

type PendingChange = {
  userId: string;
  label: string;
  role: string;
  action: "assign" | "remove";
};

function AdminPengguna() {
  const qc = useQueryClient();
  const canManage = useCan("roles.manage");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [draftRole, setDraftRole] = useState<Record<string, string>>({});

  // Debounce agar tidak memanggil server di setiap ketukan.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim().slice(0, 120));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchUsers = useServerFn(listAdminUsers);
  const change = useServerFn(changeUserRole);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-users", search, role, page],
    queryFn: () => fetchUsers({ data: { search, role: role as any, page, pageSize: PAGE_SIZE } }),
  });

  const mutation = useMutation({
    mutationFn: (payload: { userId: string; role: string; action: "assign" | "remove" }) =>
      change({ data: payload as any }),
    onSuccess: (res: any, payload) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      setPending(null);
      setDraftRole((d) => ({ ...d, [payload.userId]: "" }));
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-audit"] });
      void qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal mengubah peran."),
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        crumb="Pengguna & Peran"
        title="Pengguna & peran"
        description="Cari berdasarkan nama atau email, lalu kelola peran. Semua perubahan tercatat di audit log."
      />

      <SearchField
        id="user-search"
        label="Cari pengguna"
        value={searchInput}
        onChange={setSearchInput}
        placeholder="Cari nama atau email…"
      />
      <StatusTabs
        label="Filter peran"
        value={role}
        onChange={(v) => {
          setRole(v);
          setPage(1);
        }}
        options={[
          { value: "all", label: "Semua" },
          ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r })),
        ]}
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
        <EmptyRow message="Tidak ada pengguna yang cocok." />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Daftar pengguna">
            {data.items.map((u: any) => {
              const label = u.email ?? u.userId;
              const available = ROLES.filter((r) => !u.roles.includes(r));
              const isStaff = u.roles.some((r: string) => r !== "customer");
              return (
                <li
                  key={u.userId}
                  className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Initial name={u.fullName ?? u.email} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        <span className="truncate">{u.fullName ?? "(tanpa nama)"}</span>
                        {isStaff ? (
                          <ShieldCheck className="size-4 shrink-0 text-accent" aria-label="Staf" />
                        ) : null}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{u.email ?? u.userId}</span>
                        </span>
                        {u.phone ? (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                            {u.phone}
                          </span>
                        ) : null}
                        <span className="tabular-nums">
                          Bergabung {formatDateTime(u.createdAt)}
                        </span>
                      </div>

                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Peran">
                        {u.roles.length === 0 ? (
                          <li className="text-xs text-muted-foreground">Belum punya peran</li>
                        ) : (
                          u.roles.map((r: string) => (
                            <li
                              key={r}
                              className={cn(
                                "inline-flex items-center rounded-full border text-xs font-semibold",
                                roleClass(r),
                                canManage ? "py-0 pl-2.5 pr-0.5" : "px-2.5 py-1",
                              )}
                            >
                              {ROLE_LABELS[r] ?? r}
                              {canManage ? (
                                <button
                                  type="button"
                                  aria-label={`Cabut peran ${ROLE_LABELS[r] ?? r} dari ${label}`}
                                  className="grid size-8 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                                  onClick={() =>
                                    setPending({
                                      userId: u.userId,
                                      label,
                                      role: r,
                                      action: "remove",
                                    })
                                  }
                                >
                                  <X className="size-3.5" aria-hidden="true" />
                                </button>
                              ) : null}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>

                  {canManage && available.length > 0 ? (
                    <div className="flex gap-2 lg:w-64 lg:shrink-0">
                      <Select
                        value={draftRole[u.userId] ?? ""}
                        onValueChange={(v) => setDraftRole({ ...draftRole, [u.userId]: v })}
                      >
                        <SelectTrigger
                          className="min-h-11 min-w-0 flex-1"
                          aria-label={`Pilih peran untuk ${label}`}
                        >
                          <SelectValue placeholder="Tambah peran" />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="min-h-11 shrink-0"
                        disabled={!draftRole[u.userId]}
                        onClick={() =>
                          setPending({
                            userId: u.userId,
                            label,
                            role: draftRole[u.userId]!,
                            action: "assign",
                          })
                        }
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        Beri
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
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
              {pending?.action === "assign" ? "akan diberikan kepada" : "akan dicabut dari"}{" "}
              {pending?.label}. Perubahan ini dicatat di audit log. Super admin terakhir tidak dapat
              dicabut dan Anda tidak dapat mengubah peran akun sendiri.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className={
                pending?.action === "remove"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={mutation.isPending}
              onClick={(e) => {
                // Tahan dialog sampai server menjawab, supaya error tetap terlihat konteksnya.
                e.preventDefault();
                if (pending)
                  mutation.mutate({
                    userId: pending.userId,
                    role: pending.role,
                    action: pending.action,
                  });
              }}
            >
              {mutation.isPending
                ? "Memproses…"
                : pending?.action === "remove"
                  ? "Cabut peran"
                  : "Berikan peran"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

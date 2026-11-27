import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Loader2 } from "lucide-react";

import { ThreadsProfileView } from "@/components/threads/threads-profile-view";
import { useSession } from "@/hooks/use-session";
import {
  getPublicCreatorProfile,
  getSocialBootstrap,
} from "@/lib/social-threads.functions";

export const Route = createFileRoute("/_authenticated/dashboard/profil")({
  head: () => ({
    meta: [
      { title: "Profil Threads Saya | Ebrystore" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyThreadsProfilePage,
});

function MyThreadsProfilePage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const bootstrapFn = useServerFn(getSocialBootstrap);
  const profileFn = useServerFn(getPublicCreatorProfile);

  const bootstrapQ = useQuery({
    queryKey: ["social-bootstrap"],
    queryFn: () => bootstrapFn({}),
    staleTime: 60_000,
  });

  const handle = bootstrapQ.data?.me?.handle;

  const profileQ = useQuery({
    queryKey: ["my-threads-profile", handle ?? ""],
    queryFn: () => profileFn({ data: { handle: handle! } }),
    enabled: Boolean(handle),
  });

  if (bootstrapQ.isPending || (Boolean(handle) && profileQ.isPending)) {
    return (
      <div className="mx-auto flex max-w-[640px] items-center justify-center py-20 text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        Memuat profil Threads...
      </div>
    );
  }

  const creator = profileQ.data?.creator ?? bootstrapQ.data?.me ?? null;
  if (!creator) {
    return (
      <div className="mx-auto max-w-[640px] space-y-3 rounded-3xl border border-border bg-card p-10 text-center">
        <AtSign className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Profil belum tersedia</p>
        <Link
          to="/dashboard"
          className="inline-flex min-h-10 items-center rounded-xl bg-foreground px-4 text-xs font-bold text-background"
        >
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const sessionAvatar =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;

  return (
    <ThreadsProfileView
      creator={{ ...creator, avatarUrl: creator.avatarUrl || sessionAvatar, isSelf: true }}
      threads={profileQ.data?.threads ?? []}
      replies={profileQ.data?.replies ?? []}
      reels={profileQ.data?.reels ?? []}
      products={profileQ.data?.products ?? []}
      services={profileQ.data?.services ?? []}
      isAuthenticated
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: ["my-threads-profile"] });
        void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
      }}
    />
  );
}

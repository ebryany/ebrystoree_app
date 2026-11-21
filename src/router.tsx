import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteError } from "./components/route-fallback";

export const getRouter = () => {
  const isServer = typeof window === "undefined";
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data dashboard sudah disegarkan lewat realtime, jadi tidak perlu
        // refetch tiap kali pindah tab atau fokus balik ke jendela.
        staleTime: 60_000,
        // Di SSR, gcTime WAJIB Infinity agar TanStack Query tidak menjadwalkan
        // setTimeout 10 menit per request yang menahan QueryClient di RAM Node.js.
        gcTime: isServer ? Infinity : 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: isServer ? 0 : 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Muat kode + data rute saat link di-hover/disentuh, jadi klik terasa instan.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: () => <RouteError />,
  });

  return router;
};

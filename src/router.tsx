import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteError } from "./components/route-fallback";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data dashboard sudah disegarkan lewat realtime, jadi tidak perlu
        // refetch tiap kali pindah tab atau fokus balik ke jendela.
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
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

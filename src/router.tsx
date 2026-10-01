import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After an update or server restart, an open tab can request page code that no longer
// exists. Reload once to fetch the fresh version instead of showing a blank screen.
if (typeof window !== "undefined") {
  const reloadOnce = () => {
    const key = "ol-stale-reload";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  };
  window.addEventListener("vite:preloadError", (e) => { e.preventDefault(); reloadOnce(); });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
    if (/dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(msg)) {
      e.preventDefault();
      reloadOnce();
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

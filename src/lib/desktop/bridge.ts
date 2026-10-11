import { isDesktop } from "@/lib/edition";

/**
 * Wraps a server function so the desktop app answers it from the local file instead of the
 * cloud. Pages keep calling the same function; on the web nothing changes.
 */
export function desktopAware<F>(name: string, serverFn: F): F {
  const call = (opts?: { data?: unknown }) => {
    if (!isDesktop()) return (serverFn as unknown as (o?: unknown) => Promise<unknown>)(opts);
    return import("@/lib/desktop/local-api").then((m) => m.callLocal(name, opts?.data));
  };
  return Object.assign(call, serverFn) as F;
}

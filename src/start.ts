import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// A browser that closes a page mid-load makes Node's HTTP server emit "aborted" on the
// request stream, outside any middleware. Swallow only that case so it can't surface as a crash.
function isAbort(e: unknown): boolean {
  for (let c: unknown = e, i = 0; c && i < 5; i++) {
    if (
      c instanceof Error &&
      (c.name === "AbortError" ||
        c.message === "aborted" ||
        c.message === "This operation was aborted" ||
        (c as { code?: string }).code === "ECONNRESET")
    )
      return true;
    c = (c as { cause?: unknown }).cause;
  }
  return false;
}
const g = globalThis as {
  process?: { on?: (ev: string, fn: (e: unknown) => void) => void };
  __olAbortGuard?: boolean;
};
if (typeof window === "undefined" && g.process?.on && !g.__olAbortGuard) {
  g.__olAbortGuard = true;
  g.process.on("unhandledRejection", (e) => {
    if (!isAbort(e)) console.error(e);
  });
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Walk the cause chain: the framework wraps the socket's "aborted" error.
    let interrupted = false;
    let current: unknown = error;
    for (let depth = 0; current && depth < 5; depth++) {
      if (
        current instanceof Error &&
        (current.name === "AbortError" ||
          current.message === "aborted" ||
          current.message === "This operation was aborted" ||
          (current as { code?: string }).code === "ECONNRESET")
      ) {
        interrupted = true;
        break;
      }
      current = (current as { cause?: unknown }).cause;
    }
    if (interrupted) {
      // The browser navigated away before the response finished. This is a
      // normal cancelled request, not an application crash or error page.
      return new Response(null, { status: 499 });
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));

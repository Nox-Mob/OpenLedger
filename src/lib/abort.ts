/** True when an error (or anything in its cause chain) means the browser closed the request mid-load. */
export function isAbort(e: unknown): boolean {
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

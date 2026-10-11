/**
 * Which edition is running. Desktop builds set VITE_EDITION=desktop (npm run dev:desktop /
 * build:desktop); the Tauri runtime check is a fallback for hand-run builds.
 */
export function isDesktop(): boolean {
  if (import.meta.env["VITE_EDITION"] === "desktop") return true;
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The single local person on desktop. Fixed so local records keep one stable owner. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

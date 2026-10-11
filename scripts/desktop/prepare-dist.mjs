// Copies the static desktop build into desktop-dist/ for Tauri.
// The SPA build writes its page as _shell.html (dist/client locally, .output/public on
// some hosts); Tauri opens index.html, so without this the window stays blank.
import { cpSync, existsSync, rmSync, renameSync } from "node:fs";

const from = ["dist/client", ".output/public"].find(
  (d) => existsSync(`${d}/_shell.html`) || existsSync(`${d}/index.html`),
);
if (!from) {
  console.error("Desktop build output not found (looked in dist/client and .output/public).");
  process.exit(1);
}
rmSync("desktop-dist", { recursive: true, force: true });
cpSync(from, "desktop-dist", { recursive: true });
if (!existsSync("desktop-dist/index.html"))
  renameSync("desktop-dist/_shell.html", "desktop-dist/index.html");
console.log(`Desktop files ready in desktop-dist/ (from ${from}).`);

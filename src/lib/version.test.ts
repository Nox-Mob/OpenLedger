// The app version stamped into backups must match package.json and the changelog.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";

describe("app version", () => {
  it("is a plain x.y.z version", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("matches package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.version).toBe(APP_VERSION);
  });
  it("is newer than every released changelog version", () => {
    const released = [
      ...readFileSync("CHANGELOG.md", "utf8").matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm),
    ];
    const num = (v: string) =>
      v
        .split(".")
        .map(Number)
        .reduce((a, b) => a * 1000 + b, 0);
    for (const [, v] of released) expect(num(APP_VERSION)).toBeGreaterThanOrEqual(num(v!));
  });
});

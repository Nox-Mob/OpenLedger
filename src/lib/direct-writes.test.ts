// Ratchet: server functions should call services, not write tables directly. Files not
// yet migrated are listed with their current count; the count may only go down. When a
// file reaches zero, remove it from the list. New server-function files start at zero.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED: Record<string, number> = {
  "funds.functions.ts": 3,
  "import.functions.ts": 2,
  "legal.functions.ts": 1,
  "members.functions.ts": 2,
  "org.functions.ts": 2,
  "taxonomy.functions.ts": 2,
};

describe("server functions do not write tables directly", () => {
  const dir = join(__dirname);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".functions.ts"))) {
    it(f, () => {
      const src = readFileSync(join(dir, f), "utf8");
      const n = (src.match(/\.(insert|update|delete|upsert)\(/g) ?? []).length;
      expect(n).toBeLessThanOrEqual(ALLOWED[f] ?? 0);
    });
  }
});

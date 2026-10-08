// Server functions must not write tables directly: org data changes go through a shared
// service or audited_write, so the change and its history are saved together.
// The only exception is a cloud-only record that isn't part of an organization's books
// (sign-in profile, legal acceptance, AI usage meter, deleted-org log). Each such write
// needs a `// cloud-only-write: <reason>` comment on one of the two lines above it.
// CI runs this test on every push as its own step; keep it, and keep the exceptions short.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WRITE = /\.(insert|update|delete|upsert)\(/;
const MARK = /\/\/ cloud-only-write: \S/;

/** Line numbers with an unmarked direct table write. */
function unmarkedWrites(src: string): number[] {
  const lines = src.split("\n");
  const bad: number[] = [];
  lines.forEach((l, i) => {
    if (WRITE.test(l) && !MARK.test(lines[i - 1] ?? "") && !MARK.test(lines[i - 2] ?? ""))
      bad.push(i + 1);
  });
  return bad;
}

describe("server functions do not write tables directly", () => {
  const dir = join(__dirname);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".functions.ts"))) {
    it(f, () => {
      expect(unmarkedWrites(readFileSync(join(dir, f), "utf8")), `${f} lines`).toEqual([]);
    });
  }

  it("flags an unmarked write and accepts a marked one", () => {
    expect(unmarkedWrites('db.from("x").insert({})')).toEqual([1]);
    expect(unmarkedWrites('// cloud-only-write: profile\ndb.from("x").insert({})')).toEqual([]);
  });
});

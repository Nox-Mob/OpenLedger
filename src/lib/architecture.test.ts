// Structural boundary checks (reads the code's syntax tree, so multi-line and
// re-wrapped calls are caught too). The fast text check in direct-writes.test.ts stays.
//  1. Server functions never write a table directly, unless marked cloud-only.
//  2. Screens and components never write tables directly at all.
//  3. The privileged admin client is only loaded by approved server files.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const WRITES = new Set(["insert", "update", "delete", "upsert"]);
const MARK = /\/\/ cloud-only-write: \S/;
const ADMIN_ALLOWED = new Set([
  "lib/audit.ts",
  "lib/members.functions.ts",
  "lib/import.functions.ts",
  "lib/backup.functions.ts",
  "lib/backup-export.server.ts",
  "lib/restore.server.ts",
  "lib/legal.functions.ts",
  "lib/org.functions.ts",
  "integrations/supabase/client.server.ts",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** True when a call chain like x.from("t")...insert(...) starts with .from(). */
function chainHasFrom(e: ts.Expression): boolean {
  while (
    ts.isCallExpression(e) ||
    ts.isPropertyAccessExpression(e) ||
    ts.isParenthesizedExpression(e)
  ) {
    if (ts.isParenthesizedExpression(e)) {
      e = e.expression;
      continue;
    }
    if (
      ts.isCallExpression(e) &&
      ts.isPropertyAccessExpression(e.expression) &&
      e.expression.name.text === "from"
    )
      return true;
    e = ts.isCallExpression(e) ? e.expression : e.expression;
  }
  return false;
}

export function tableWrites(src: string, name = "x.ts"): { line: number; marked: boolean }[] {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true);
  const lines = src.split("\n");
  const out: { line: number; marked: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      WRITES.has(n.expression.name.text) &&
      chainHasFrom(n.expression.expression)
    ) {
      const start = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
      const at = sf.getLineAndCharacterOfPosition(n.expression.name.getStart(sf)).line;
      const near = lines.slice(Math.max(0, start - 2), at + 1).join("\n");
      out.push({ line: at + 1, marked: MARK.test(near) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function loadsAdminClient(src: string): boolean {
  return /client\.server["']/.test(src);
}

const all = files(ROOT).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));

describe("architecture boundaries", () => {
  it("server functions only write tables when marked cloud-only", () => {
    const bad = all
      .filter((f) => f.rel.endsWith(".functions.ts"))
      .flatMap((f) =>
        tableWrites(f.src, f.rel)
          .filter((w) => !w.marked)
          .map((w) => `${f.rel}:${w.line}`),
      );
    expect(bad).toEqual([]);
  });

  it("screens and components never write tables", () => {
    const bad = all
      .filter((f) => f.rel.startsWith("routes/") || f.rel.startsWith("components/"))
      .flatMap((f) => tableWrites(f.src, f.rel).map((w) => `${f.rel}:${w.line}`));
    expect(bad).toEqual([]);
  });

  it("only approved server files load the admin client", () => {
    const bad = all
      .filter((f) => loadsAdminClient(f.src) && !ADMIN_ALLOWED.has(f.rel))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("catches multi-line, re-wrapped and marked writes correctly", () => {
    expect(tableWrites('db\n  .from("a")\n  .select("x")\n  .eq("id", 1)\n  .update({})')).toEqual([
      { line: 5, marked: false },
    ]);
    expect(tableWrites('await (db.from("a")).insert({})')).toHaveLength(1);
    expect(tableWrites('// cloud-only-write: profile\ndb.from("p").upsert({})')[0]!.marked).toBe(
      true,
    );
    expect(tableWrites("list.delete(1); map.update(x)")).toEqual([]);
    expect(loadsAdminClient('await import("@/integrations/supabase/client.server")')).toBe(true);
  });
});

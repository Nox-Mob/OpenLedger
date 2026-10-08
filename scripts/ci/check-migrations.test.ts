// The migration safety check must catch top-level data loss but allow the same words
// inside function bodies, which only run when called.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/ci/check-migrations.mjs");

function run(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  mkdirSync(join(dir, "supabase/migrations"), { recursive: true });
  for (const [n, sql] of Object.entries(files))
    writeFileSync(join(dir, "supabase/migrations", n), sql);
  try {
    return { ok: true, out: execFileSync("node", [SCRIPT], { cwd: dir, encoding: "utf8" }) };
  } catch (e: any) {
    return { ok: false, out: String(e.stdout) + String(e.stderr) };
  }
}

const fn = (body: string) =>
  `CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN ${body} END; $$;`;

describe("check-migrations", () => {
  it("passes a function whose body deletes rows", () => {
    expect(run({ "20260101000000_f.sql": fn("DELETE FROM public.x WHERE id = 1;") }).ok).toBe(true);
  });
  it("passes a named dollar-quoted body", () => {
    const sql = "CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN DELETE FROM x; END $fn$ LANGUAGE plpgsql;";
    expect(run({ "20260101000000_f.sql": sql }).ok).toBe(true);
  });
  it("fails a top-level DELETE FROM", () => {
    const r = run({ "20260101000000_d.sql": "DELETE FROM public.accounts;" });
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/data-destroying/);
  });
  it("fails a top-level DELETE after a function body", () => {
    const r = run({ "20260101000000_d.sql": fn("SELECT 1;") + "\nDELETE FROM public.accounts;" });
    expect(r.ok).toBe(false);
  });
  it("fails TRUNCATE and DROP TABLE", () => {
    expect(run({ "20260101000000_t.sql": "TRUNCATE public.accounts;" }).ok).toBe(false);
    expect(run({ "20260101000000_t.sql": "DROP TABLE public.accounts;" }).ok).toBe(false);
  });
  it("ignores destructive words in comments", () => {
    expect(run({ "20260101000000_c.sql": "-- DELETE FROM accounts\nSELECT 1;" }).ok).toBe(true);
  });
  it("fails a table without GRANTs and a bad file name", () => {
    const t = "CREATE TABLE public.t (id uuid); ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;";
    expect(run({ "20260101000000_t.sql": t }).out).toMatch(/GRANT/);
    expect(run({ "bad.sql": "SELECT 1;" }).out).toMatch(/name must look like/);
  });
});

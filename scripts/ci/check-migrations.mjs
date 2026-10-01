// Static checks on supabase/migrations. Report only — never edits files.
// Fails (with a reason per finding) when a public table is created without GRANTs or RLS,
// or when a migration file name is out of order / malformed.
import { readdirSync, readFileSync } from "node:fs";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const all = files.map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n").toLowerCase();
const errors = [];

for (const f of files) {
  if (!/^\d{14}_[\w-]+\.sql$/.test(f)) errors.push(`${f}: name must look like YYYYMMDDHHMMSS_description.sql`);
  const sql = readFileSync(`${dir}/${f}`, "utf8").toLowerCase();
  const code = sql.replace(/--[^\n]*/g, "");
  for (const bad of [/\btruncate\b(?!\s*on)/, /\bdelete\s+from\b/, /\bdrop\s+table\b/, /\bdrop\s+schema\b/])
    if (bad.test(code.replace(/revoke[^;]*;/g, "")))
      errors.push(`${f}: contains a data-destroying command (${bad.source}). Migrations must never delete real data on startup.`);
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?"?(\w+)"?\s*\(/g)) {
    const t = m[1];
    if (!new RegExp(`grant [^;]+ on (table )?(public\\.)?${t}\\b[^;]* to `).test(all))
      errors.push(`${f}: table "${t}" has no GRANT — the app will get "permission denied" at runtime.`);
    if (!new RegExp(`alter table (public\\.)?${t} enable row level security`).test(all))
      errors.push(`${f}: table "${t}" has no row level security — other organizations could read it.`);
  }
}

if (errors.length) {
  for (const e of errors) console.log(`::error::${e}`);
  console.error(`\n${errors.length} migration problem(s) found. Fix them in a new migration; CI does not change files.`);
  process.exit(1);
}
console.log(`Checked ${files.length} migrations: every public table has GRANTs and row level security.`);

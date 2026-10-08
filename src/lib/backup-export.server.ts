import type { PlainRow, UntypedDb } from "./db";
// Backup reads shared by the signed export handler and its roundtrip regression tests.
const PAGE = 1000;
type PageRow = Record<string, unknown>;
async function all(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: PageRow[] | null; error: { message: string } | null }>,
): Promise<PageRow[]> {
  const out: PageRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const ORG_TABLES = [
  // order matches domain/backup TABLES minus entries/transaction_tags
  "accounts",
  "categories",
  "tags",
  "projects",
  "funds",
  "transactions",
  "import_batches",
  "import_profiles",
  "bank_transactions",
  "reconciliations",
  "period_closes",
  "pledges",
  "pledge_payments",
  "budgets",
  "user_roles",
  "audit_log",
] as const;

export async function readBackupData(db: UntypedDb, orgId: string) {
  const { data: org, error } = await db.from("organizations").select("*").eq("id", orgId).single();
  if (error) throw new Error(error.message);
  const tables: Record<string, PlainRow[]> = {};
  for (const t of ORG_TABLES)
    tables[t] = await all((f, to) =>
      db.from(t).select("*").eq("org_id", orgId).order("id").range(f, to),
    );
  tables["entries"] = (
    await all((f, to) =>
      db
        .from("entries")
        .select("*, transactions!inner(org_id)")
        .eq("transactions.org_id", orgId)
        .order("id")
        .range(f, to),
    )
  ).map(({ transactions: _t, ...e }: PageRow) => e);
  tables["transaction_tags"] = (
    await all((f, to) =>
      db
        .from("transaction_tags")
        .select("*, transactions!inner(org_id)")
        .eq("transactions.org_id", orgId)
        .order("transaction_id")
        .range(f, to),
    )
  ).map(({ transactions: _t, ...e }: PageRow) => e);
  return { organization: org, tables };
}

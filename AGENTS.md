<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md — OpenLedgerApp

- Double-entry: ≥2 entries, sum=0, both signs (deferred trigger; void exempt). amount_cents >0 debit, <0 credit.
- DB-enforced immutability: transactions only posted→void; entries only reconciliation_id; bank rows are evidence (FITID/hash+row_seq; link must match amount/account).
- Void: idempotent, blocked by completed reconciliation, unticks/unlinks in-progress evidence.
- Reconciliation finish needs difference=0 (DB trigger); completed ones lock entries.
- Audit rows only via writeAudit() (src/lib/audit.ts, service role); no user INSERT.
- Org data: requireSupabaseAuth + assertCan + member RLS; settings/accounts admin-only.
- Terminology is presentation-only; reports/PDFs use org level only.
- Accounts: catalog-based, archive never delete.
- Dates YYYY-MM-DD in org.timezone; never toISOString.
- Reports: pure math; retained earnings derived; year-end close is virtual (no closing tx; legacy source='closing' excluded).
- Currency: two-decimal only, frozen once transactions exist.
- Idempotency keys: one per form submit; `bank:<id>`, `opening:<acct>:...`.
- AI PDF: org opt-in, upload ack, limits, balance or acceptMismatch.
- Legal acceptance append-only/versioned; U.S.-first; no GDPR claim.
- Demo: demo@demo.org / demo1234, manual dev seed only.
- CI, tests and migration-safety rules: see scripts/ci/AGENTS.md.
- Server functions: use createServerFn().validator(), never deprecated .inputValidator().
- Routing: public website owns `/`; the existing authenticated dashboard lives at `/ledger` so public visitors never need a session to read the website.
- Release notes: `CHANGELOG.md` is the single source for the public changelog; describe planned work in the blueprint/roadmap, not as shipped releases.

- Domain rules: accounting invariants live in pure src/lib/domain/ (no storage imports) and run before every write; DB triggers are a backup, so a future SQLite edition gets the same guarantees.
- IDs: every new record gets an app-generated UUID (newId()), never a DB default, so identity survives future offline sync.
- Storage ports: data access goes through interfaces in src/lib/ports/ using models from src/lib/domain/models.ts (no DB types); adapters implement them so cloud and desktop share app code.
- Adapters/services: workflows live in src/lib/services/ (ports only); server functions do auth + assertCan, then call a service with createSupabaseRepositories(context.supabase). src/lib/adapters/memory is the reference adapter for tests and future SQLite parity.
- Desktop storage: src/lib/adapters/sqlite implements the ports over a minimal SqlDriver (Tauri plugin-sql in the shell, sql.js in tests); its schema.ts migrations are append-only and mirror Postgres guards. Every adapter must pass src/lib/adapters/contract.test.ts. See docs/desktop.md.
- Funds: fund balances and the restricted/unrestricted split are derived from fund-tagged ledger rows in src/lib/domain/funds.ts; releases are a balanced Net Assets to Net Assets transaction (source 'release') so total equity never changes.
- Members: organizations.created_by is the owner; invite links store only a SHA-256 hash of the token and are claimed atomically before the role is granted.
- Budgets/exports/history: cloud-only server functions for now (no port yet); budgets table keeps one row per account+period with a stable app-generated ID (update, never replace), and every export escapes formula-looking text via src/lib/export.ts.
- Backups: Ed25519-signed manifest (key derived from server secret BACKUP_SIGNING_SEED) over chained per-row SHA-256 table digests (src/lib/domain/backup.ts); unsigned/changed files are refused. Restore only creates a new org with new IDs, re-runs domain checks, writes via the caller's RLS client, and rolls back by deleting the new org on failure.
- Backup export reads live in a server-only helper shared with roundtrip tests, so pagination and organization scoping are tested without mocking TanStack RPC; persistence doubles do not replace database RLS/trigger CI checks.
- Org delete relies on deferrable "no action" FKs and a balance trigger that skips deleted transactions; keep new cascading FKs deferrable.

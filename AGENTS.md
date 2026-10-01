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

# AGENTS.md — Open Ledger

- Double-entry enforced in createTransaction + deferred DB trigger: posted tx needs ≥2 entries, sum=0, ≥1 debit and ≥1 credit (void exempt). Never bypass.
- amount_cents >0 debit, <0 credit; displayBalance() flips credit-normal types.
- Never edit entries in place: void + recreate (audit trail).
- Bank imports are evidence only (bank_transactions.transaction_id link, SHA-256 fingerprint dedup (FITID wins; content hash includes row_seq so identical rows in one file both import)); import_batch undoable until a row posts.
- Terminology is presentation-only: org level + term_overrides; screens add user overrides, reports/PDFs use org only.
- All org data via requireSupabaseAuth server fns in src/lib/*.functions.ts; RLS by org membership. Org settings/account setup admin-only (requireOrgAdmin) and audit-logged.
- Sample data: one shared login demo@demo.org / demo1234 (member of Acme + Riverside only); /auth hint shows on DEV/preview only; never add real orgs to it.
- Reconciliation stamps entries.reconciliation_id; finish needs difference=0; completed ones lock entries via triggers.
- Starter accounts come from src/lib/account-catalog.ts (onboarding wizard + Settings → Accounts); accounts with entries can't be removed.
- Dates are YYYY-MM-DD strings; use src/lib/dates.ts ("today" = todayISO(now, org.timezone), UTC-only math). Never toISOString a transaction date.
- Report math lives in src/lib/report-math.ts (pure, tested); balance sheet rolls prior fiscal years into retained earnings / net assets.
- Void: blocked if in a completed reconciliation; idempotent (posted→void only); unticks in-progress stamps and unlinks bank rows.
- Tests: bunx vitest run <files>; tenant isolation SQL in supabase/tests/tenant_isolation.sql.
- Double-post: transactions.idempotency_key unique per org; forms send one key per submission, bank posts use `bank:<id>`. Keep both.
- Sample data lives only in supabase/seed/demo.sql (run by hand on dev/test DBs); never seed in migrations.

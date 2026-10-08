# Plan: road to v1.0

Based on the security and controls review and the 1.0 feature review. Both say: keep the current design, no rewrite, and make 1.0 about trust (correct books, reconciliation, nonprofit funds, permissions, recovery) rather than a long feature list.

1.0 is the **web edition** (cloud and self-hosted). Desktop ships separately, only when its native storage is proven.

## Review findings and how each is handled

| Finding | Action | Release |
| --- | --- | --- |
| .env is tracked in Git | Keep it (Lovable needs it). It only holds public keys. Add a CI check that fails if any private key shape ever appears in it; document why it is tracked | v0.0.6 |
| Prove "change and history roll back together" everywhere | Add a failure test for every remaining high-impact change: member removal, ownership transfer, org delete, invite claim, settings | v0.0.6 |
| Direct-write check is text matching only | Add a code-structure rule that also catches multi-line calls, helper functions and admin-client use outside approved files | v0.0.6 |
| Dev-only packages not audited | Add a separate full audit that reports but does not block | v0.0.6 |
| Architecture doc out of date | Done in this change | now |
| Concurrent requests (double close, double post) | Tests that send the same request twice at once | v0.0.7 |
| SQLite tested with sql.js only | Native driver tests before any desktop release | Desktop track |

## v0.0.6 - Safety and controls

1. Items from the table above marked v0.0.6.
2. Two-step sign-in (MFA), optional per user, admin can require it.
3. Delete my account (blocked while you own an organization).
4. Session safety: removed members lose access right away; password reset tested end to end.
5. Manual keyboard and screen reader walk-through.

## v0.0.7 - Reports people can trust

1. General ledger and account activity reports with running balances.
2. Statement check report (matched and outstanding items).
3. Click any report total to see the transactions behind it.
4. Every report states its period and "cash basis", and exports to CSV, Excel and PDF.
5. Fund balance and fund activity reports.
6. Speed at 10,000 to 50,000 ledger lines.

## v0.0.8 - Periods and roles

1. Month close with warnings (unreconciled accounts, open statement checks); audited reopen by an admin.
2. Treasurer/bookkeeper role added to the permissions table (between admin and member).
3. Plain-language errors for the common failures (unbalanced, period closed, statement off, bad backup, no permission).

## v0.0.9 - Everyday use

1. Transaction templates and recurring drafts (never auto-posted).
2. Search and filters across transactions.
3. Budget vs actual for funds and projects; board report package (one PDF).
4. Guided first-run checklist; support and diagnostics page (version, database type, last backup).

## v0.1.0 to v0.9.x - Hardening

- Self-hosted installer and tested upgrade from the previous release.
- Backup restore tested across versions.
- Real users (non-accountants) complete common tasks with the docs.
- Security disclosure policy and contact published.

## v1.0 release gates (all required)

1. Accounting correctness: every report ties to the ledger.
2. Security and permissions: isolation, authorization and membership changes covered by automated tests.
3. Import and statement checks work end to end on a real statement.
4. Backup and recovery: full restore works; a failed restore changes nothing.
5. Clean install and upgrade both work.
6. A non-accountant can do common tasks.
7. Support, privacy and vulnerability-reporting pages published.

## Left out of 1.0

Bank feeds, invoices and bills, payroll, multi-currency, desktop and cloud sync, donor CRM, custom report builder, consolidation across organizations. AI statement reading stays opt-in and never posts by itself.

## Technical details

- .env check: CI step greps `.env` for `service_role`, `sb_secret_`, and JWT payloads with role service_role; fails if found.
- Structural direct-write rule: a custom ESLint rule (AST) over `src/lib/*.functions.ts` and `src/routes/**` flagging `.from(...).insert|update|delete|upsert` chains and `client.server` imports outside an allowlist; existing regex test stays.
- Atomicity tests use the memory adapter plus new `supabase/tests/*.sql` checks with a forced failure after the data step.
- Treasurer role needs a new `app_role` enum value (additive migration) and new CAPABILITIES rows pinned by test.
- Month close reuses `books_locked_through` and period_closes; reopen goes through audited_write.

# Reviewer findings — implementation plan

Follows the reviewer's suggested order. Each phase ends with a check before the next starts.

## Phase A — Quick, high-risk (items 1–3)
1. **Demo data out of production.** Remove the two demo users, their orgs and all d0e00000-* rows from the shared backend. Move demo seeding to a repeatable dev-only seed script (not a migration) so it can be recreated on a separate test backend. Remove demo buttons/credentials from the sign-in page and confirm nothing credential-like ships in the app bundle.
2. **Tenant isolation proof.** Automated tests that sign in as a user of org A and try to read, change, void and delete org B's transactions, entries, bank rows, reconciliations, members and audit log — all must fail. Review every server function using the admin client for an explicit membership check, and every SECURITY DEFINER function. Confirm audit log has no change/delete permissions at all.
3. **.env hygiene.** Add .env to .gitignore, stop tracking it, scan history for secret-looking values; report anything that needs rotating.

## Phase B — Correctness (items 4, 5, 7)
4. **Dates.** Audit all date handling; introduce a single date helper that works on YYYY-MM-DD strings only. Tests run under a non-UTC timezone near midnight and fiscal-year edges.
5. **Report invariants.** Move report math into pure, testable functions and add tests: assets = liabilities + equity (with current-year result), net income = change in equity, trial balance = 0, voids excluded everywhere (reports, dashboard, projects, funds, reconciliation), non-January fiscal years. Add a trial balance report.
7. **Void rules.** Block voiding a transaction in a completed statement check (message: reopen first). Voiding unlinks its bank row back to "unmatched". Transfers void as one unit. Voiding an already-voided transaction is a no-op server-side.

## Phase C — Integrity and access (items 8, 10, 11, 12)
8. **Imports.** Add a within-file row sequence to CSV fingerprints (FITID stays primary for OFX). Parser tests for (1,234.56), European formats, currency symbols, split debit/credit columns, sign flip toggle, BOM/Latin-1, blank and summary rows, file-size limit. PDF: rows must add up from opening to closing balance or posting is blocked; PDF text treated as untrusted in the AI prompt.
10. **Role matrix.** Define admin / member / viewer permissions for every action (create, void, import, reconcile, reports, accounts, settings), enforce in every server function, test each. Last admin cannot be demoted or removed, enforced in the database.
11. **Double-submit.** Idempotency key per form submission stored on transactions (unique), buttons disabled while saving; row-level guards for concurrent void/reconcile.
12. **Accounts.** Once an account has entries, its type is locked. Replace delete with archive for used accounts.

## Phase D — In parallel (items 9, 13, then 6)
9. **Legal and consent.** Terms, Privacy and "not tax, legal or accounting advice" pages; an explicit opt-in before the first PDF is sent for AI reading, with the provider disclosed.
13. **Sign-in hygiene.** Confirm email verification, password reset page, leaked-password protection, rate limits; test Google + email with the same address.
6. **Closed periods.** Org setting "books locked through" (admin, audit-logged), enforced by database trigger on posting/voiding; admin override logged. Year-end: net income shown as retained earnings (business) or net assets (nonprofit) via automatic rollup in the balance sheet.

## Phase E — Tier 2 pulled forward (14, 15, 17)
- **14 Nonprofit funds:** with/without donor restriction split on the statement of activities, "release from restriction" transaction type, pledges/grants receivable, warning when a restricted fund goes negative.
- **15 Exports:** CSV and XLSX for register and every report (formula-injection escaping); full organization backup file and restore.
- **17 Tests + CI:** consolidate the tests from phases A–C into one suite plus a GitHub Actions workflow.

## Later (remaining Tier 2 and Tier 3)
Invites/member removal/ownership transfer/deletion (16), budgets entry (18), MFA (19), "cash basis" label on every report (20 — small, will do with phase B), audit log viewer and monitoring (21), performance at 10k–50k entries with server-side paging (22), then items 23–32 as small cleanups.

## Technical notes
- Tenant and role tests run against the backend with two throwaway test users created and removed by the test itself.
- Report math extracted from `reports.functions.ts` into a pure module for unit tests.
- New columns: `transactions.idempotency_key` (unique per org), `organizations.books_locked_through`, `accounts.is_active` reused for archive.
- Last-admin and closed-period rules live in database triggers so direct API calls can't bypass them.
- Decision needed: removing demo accounts means no one-click demo on preview anymore unless a separate test backend is set up.

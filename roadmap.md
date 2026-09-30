# Open Ledger V0.0.1 — Roadmap

- [x] 1. Enable Lovable Cloud + email auth + Google sign-in
- [x] 2. Schema migration: orgs, roles, accounts, transactions, entries (balanced-entry trigger), categories, tags, projects, funds, bank_transactions (dedup fingerprint), audit_log — RLS + grants
- [x] 3. Auth page + onboarding with default chart of accounts (nonprofit/business)
- [x] 4. Double-entry server functions + New Transaction flows (Money In / Money Out / Transfer / Advanced)
- [x] 5. Accounts (with opening balances), transactions register (expandable entries, void), categories/tags/projects/funds UI
- [x] 6. CSV bank import with dedup + post-to-ledger review
- [x] 7. Reports: income statement / statement of activities, balance sheet, project budget-vs-actual
- [x] 8. Terminology toggle (simplified vs accounting) in Settings
- [x] 9. Build verified clean; public flow verified (redirect to /auth, sign-in page renders)

## Blocked
- End-to-end test of signed-in pages: needs the first real user to sign up (no auth users exist yet, so no test session can be minted). After the user signs up, verify: onboarding → create transaction → reports.

## Deferred (from plan)
- Accrual basis switching, invoices/bills, bank feeds API, receipt attachments, budgets module, reconciliation UI, exports

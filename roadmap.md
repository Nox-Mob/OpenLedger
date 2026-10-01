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

- [x] 10. Dev-only demo account (demo@openledger.dev) with seeded org, chart of accounts, 3 months of transactions, projects, funds, and unlinked bank rows; dev-only sign-in button on /auth; verified end-to-end in browser (dashboard, transactions, accounts, reports, import, projects)

## Notes
- Demo data lives in the shared backend, so the demo credentials would work on the published site too if typed manually — the button is hidden in production, but wipe the demo rows before real production use.

## Deferred (from plan)
- Accrual basis switching, invoices/bills, bank feeds API, receipt attachments, budgets module, reconciliation UI, exports
- [x] 11. Second demo account (nonprofit, "Riverside Community Kitchen") with restricted funds + donation/grant sample data; dev-only sign-in button; "/onboarding" exposed as "New organization" in the sidebar for all users

## Org settings depth (from competitor screenshot)
- [ ] Settings area with sections: Organization Profile, Users & Roles, Preferences
- [ ] Org profile fields: name, type, currency, fiscal year start
- [ ] Users & Roles: list members, change roles (admin-only)
- [ ] Verify current org settings save flow in browser (in progress)

## Step 12 — Deeper organization settings (done)
- [x] Settings area restructured with sub-navigation (Organization profile / Users & roles / Your preferences)
- [x] Org profile: name, type, currency, fiscal year start month (admin-only, audit-logged)
- [x] Users & roles: member list with roles, admin-only role changes (can't demote yourself)
- [x] Migration: organizations.currency + fiscal_year_start_month
- Deferred from competitor screenshot: branding, custom domain, locations, taxes, automation, subscriptions — revisit per-user demand
- [x] Money In type picker for nonprofits: Donation vs Fundraising Sale vs Other; auto-selects matching revenue account; "Fundraising Sales" added to default nonprofit chart + demo org
- [x] Wording (plain vs accounting) is now an organization-wide setting: organizations.terminology column, admin-editable under Settings > Organization profile; AppShell + PDFs use org terminology; Acme demo set to accounting

## Step 13 — Bank import v2 + reconciliation (done)
- [x] CSV column mapping + saved layouts, OFX/QFX, PDF (AI-read, reviewed), row-level errors/duplicates, import batches with undo, statement period + balances
- [x] Reconciliation: simple (auto-match) and full (tick) modes, history, reopen (admin), audit trail, lock on completion
- Deferred: Plaid / automatic bank feeds

## Step 14 — Reviewer findings (see plan)
### Phase A — quick, high-risk (today)
- [x] 0. Delete the "Test" organization and all its data
- [x] 1. Replace two demo logins with one sample-data account (demo@demo.org) holding both demo orgs; demo org can never see real orgs; no credentials in client bundle
- [x] 2. Tenant isolation: stranger reads/changes/deletes 0 rows on all 15 tables, self-join + audit delete blocked (supabase/tests/tenant_isolation.sql); no admin client in app code
- [x] 3. .env already untracked + gitignored; history scan found no secrets
### Phase B — correctness
- [x] 4. Date/timezone safety (no new Date()/toISOString on transaction_date); boundary tests
- [x] 5. Report invariant tests (A=L+E, NI=Δequity, trial balance=0, voids excluded, fiscal year)
- [x] 7. Void vs reconciliation/bank link/transfer/double-void rules
### Phase C — integrity & access
- [x] 8. Import correctness (row-seq fingerprint, amount formats, PDF balance check, encoding, size limits)
- [x] 10. Role authorization matrix + last-admin protection server-side
- [x] 11. Double-submit / concurrency guards (idempotency keys — done as part of F)
- [x] 12. Archive/reactivate accounts instead of deleting them; account type lock is done
### Phase D — parallel
- [x] 9. U.S.-first legal release: separate hosted/self-hosted Terms and Privacy placeholders, versioned acceptance at signup/updates, and once-per-version "not advice" notice; GDPR deferred
- [x] 13. Auth hygiene (verification, reset, rate limits, Google/email same address, 8+ char password w/ upper/lower/number/symbol + HIBP)
- [x] 6. Lock-books-through date + year-end close
### Tier 2 (pull forward: 14, 15, 17)
- [ ] 14. Nonprofit fund accounting (restricted net assets, releases, pledges, negative fund warning)
- [ ] 15. CSV/XLSX exports + org backup/restore (formula-injection escaping)
- [x] 17. Automated test suite + CI
- [ ] 16. Invites, remove member, transfer ownership, org/account deletion
- [ ] 18. Budgets entry  - [ ] 19. MFA  - [ ] 20. "Cash basis" labels; A/R, A/P later
- [ ] 21. Observability + audit log viewer + backups  - [ ] 22. Performance at 10k–50k entries
### Tier 3
- [ ] 23–32. Roadmap cleanup, README, org switcher, terminology note, empty/error states, a11y, input validation, currency rules, undo wording, catalog duplicate protection

## 15. Reviewer security findings (Oct 2026)
- [x] A. Self-grant admin blocked (DB policy + creator trigger)
- [x] B. DB-enforced immutability, last-admin, audit actor, reconcile reopen, account type lock, cross-org refs
- [x] Password reset page
- [x] C. Pagination / SQL aggregation past 1,000 rows
- [x] D. Strict amount parsing (decimal comma, >2 decimals, hex) + import locale + tests
- [x] E. Dedup row-sequence fingerprint
- [x] F. Double-post guards (postBankTransaction conditional update, idempotency key)
- [x] G. Demo seed moved out of migrations into supabase/seed/demo.sql (manual, dev/test only)
- [x] H. PDF AI opt-in, balance validation, per-user rate limit
- [ ] Reduce 114 legacy `any` types (lint warnings) and run `bun run format` once to clear formatting backlog
- [ ] Startup/restart must never delete or reset real data (audit migrations, seeds, scripts, CI for destructive SQL)

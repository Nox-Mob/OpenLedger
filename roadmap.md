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

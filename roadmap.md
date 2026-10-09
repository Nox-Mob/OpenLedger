# OpenLedgerApp — Roadmap

## Road to v1.0 (plan approved 2026-10-08)

- v0.0.6 Safety and controls (done, ready to release): [x] .env public-keys-only CI check, [x] report-only full dependency audit, [x] architecture doc refresh, [x] rollback tests for member removal, ownership transfer, org delete, invite claim, settings, [x] structural direct-write rule, [x] MFA, [x] delete my account, [x] session safety (removed members, MFA sessions), [x] keyboard walk-through (focus order, visible focus), [x] release checklist. Open: screen reader pass by a person; password reset email can only be checked by hand
- v0.0.7 Reports people can trust: DONE early (general ledger, account activity, statement check report, drill-down, cash basis labels, fund reports, 50k speed test). Still open: concurrency tests (double post, double close).
- v0.0.8 Periods and roles: month close and audited reopen, treasurer role, plain-language errors
- v0.0.9 Everyday use: templates and recurring drafts, search, fund/project budgets, board package, first-run checklist, diagnostics page
- v0.1 to v0.9 Hardening: installer, upgrade tests, cross-version restore, user testing, disclosure policy
- v1.0 gates: accounting correctness, security tests, real-statement import, backup recovery, install and upgrade, non-accountant usability, support and disclosure pages. Desktop is a separate track.

## v0.0.4 - Stability and foundations (released 2026-10-07)

- [x] History save failures now fail the request instead of reporting success
- [x] 1a. Postings and voids saved atomically with their history (all storage options)
- [x] 1b. Remaining audited changes (settings, members, budgets, statement checks, imports, accounts, pledge status) saved atomically via audited_write
- [x] 2a. History kinds column (change, ledger, system) with backfill
- [x] 2b. History page filter by kind
- [x] 3. Remaining workflows behind shared code: every organization-data write goes through a service or audited_write; direct-writes check runs as its own CI step.
- [x] 4. Declarative role capability table
- [x] 5. Contract tests: tenant isolation, history, rollback, backup roundtrip; yearly scenario tests with golden totals
- [x] 6a. npm is the only package manager (bun.lock removed)
- [x] 6b. Dependency review (docs/dependencies.md), pin core versions, clear loose-type warnings in backup code
- [x] 7. Backup format v3 (app version, attachments slot; v2 still restores)
- [x] 8. docs/architecture.md

## v0.0.3 - Funds, members, exports, budgets, observability (released 2026-10-07)

- [x] 14. Nonprofit fund accounting (restricted net assets, releases, pledges, negative fund warning)
- [x] 16. Invites, remove member, transfer ownership, org deletion (account deletion still open)
- [x] Server functions use `.validator()` everywhere (no deprecated `.inputValidator()` left)
- [x] 15. CSV/XLSX exports + signed full backup + restore into a new org (formula-injection escaping)
- [x] 18. Budgets: yearly or monthly per income/expense account, budget vs actual
- [x] 21. Observability: admin history (audit log) viewer
- [x] Clarify the restore file picker and confirmation name; test a moderately sized signed export and restore (1,500 transactions, persistence double; live database guards remain covered separately).

## Future (unscheduled, not assigned to a version)

- Local desktop edition: Tauri + embedded SQLite, offline use, no Docker/Node/internet for end users. Groundwork (ports, SQLite adapter, contract tests) exists; packaging needs a Rust toolchain. Do not advertise desktop installers as available.
- Optional sync between desktop and cloud (chained history log, signed uploads, server re-check).
- Self-hosted installer: ask cloud-hosted versus self-hosted backend, clone source, write ignored local configuration, optionally provision Docker, apply migrations safely, build/start app.
- Distribution goal: free local desktop, self-hosted community edition, managed cloud. Cloud pricing and donations undecided.

## Open backlog

- [ ] 19. MFA - [ ] 20. "Cash basis" labels; A/R, A/P later - [ ] 22. Performance at 10k–50k entries
- [ ] Account deletion (part of 16)
- [ ] Budgets, exports and history behind the ports for desktop
- [ ] 23–32 leftovers: README refresh, terminology note, currency rules, undo wording (switcher, page states, a11y, input checks, catalog protection done in v0.0.5)
- Deferred: accrual basis, invoices/bills, bank feeds (Plaid), receipt attachments

## Shipped

- v0.0.2 (public website, changelog, rename, dark mode, desktop-ready foundations: domain rules, ports, Supabase/memory/SQLite adapters, app-generated IDs)
- v0.0.1 (2026-10-01): double-entry ledger, imports, reconciliation, reports, roles, legal, CI. See CHANGELOG.md.

## Notes

- Demo login (demo@demo.org) is signed out automatically on published sites unless VITE_ALLOW_DEMO_LOGIN=true.

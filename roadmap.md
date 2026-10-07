# OpenLedgerApp — Roadmap

## v0.0.3 — Funds, members, exports, budgets, observability (in progress)
- [x] 14. Nonprofit fund accounting (restricted net assets, releases, pledges, negative fund warning)
- [x] 16. Invites, remove member, transfer ownership, org deletion (account deletion still open)
- [x] Server functions use `.validator()` everywhere (no deprecated `.inputValidator()` left)
- [x] 15. CSV/XLSX exports + full JSON backup (formula-injection escaping). Restore still open
- [x] 18. Budgets: yearly or monthly per income/expense account, budget vs actual
- [x] 21. Observability: admin history (audit log) viewer

## Future (unscheduled, not assigned to a version)
- Local desktop edition: Tauri + embedded SQLite, offline use, no Docker/Node/internet for end users. Groundwork (ports, SQLite adapter, contract tests) exists; packaging needs a Rust toolchain. Do not advertise desktop installers as available.
- Optional sync between desktop and cloud (chained history log, signed uploads, server re-check).
- Self-hosted installer: ask cloud-hosted versus self-hosted backend, clone source, write ignored local configuration, optionally provision Docker, apply migrations safely, build/start app.
- Distribution goal: free local desktop, self-hosted community edition, managed cloud. Cloud pricing and donations undecided.

## Open backlog
- [ ] 19. MFA  - [ ] 20. "Cash basis" labels; A/R, A/P later  - [ ] 22. Performance at 10k–50k entries
- [ ] Account deletion (part of 16)
- [ ] Restore from backup; budgets, exports and history behind the ports for desktop
- [ ] 23–32. README, org switcher, terminology note, empty/error states, a11y, input validation, currency rules, undo wording, catalog duplicate protection
- [ ] Reduce legacy `any` types (non-blocking warnings)
- Deferred: accrual basis, invoices/bills, bank feeds (Plaid), receipt attachments

## Shipped
- v0.0.2 (public website, changelog, rename, dark mode, desktop-ready foundations: domain rules, ports, Supabase/memory/SQLite adapters, app-generated IDs)
- v0.0.1 (2026-10-01): double-entry ledger, imports, reconciliation, reports, roles, legal, CI. See CHANGELOG.md.

## Notes
- Demo login (demo@demo.org) is signed out automatically on published sites unless VITE_ALLOW_DEMO_LOGIN=true.

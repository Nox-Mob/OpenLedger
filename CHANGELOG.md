# Changelog

Notable changes to OpenLedgerApp are recorded here. This project follows the structure of Keep a Changelog. Pre-1.0 software remains under active development.

## [Unreleased]

### Added

- Fund accounting for nonprofits: restricted and unrestricted funds, fund balances, net assets with and without donor restrictions, and releases from restriction.
- Pledges: record promised gifts, take payments, and write off what will not arrive.
- Invite links: admins create single use links with a role that expire after 7 days, and can revoke them.
- Members can be removed, anyone except the owner can leave, owners can transfer ownership to another admin, and owners can delete an organization after typing its name.
- Budgets: set a yearly or monthly budget for each income and expense account and compare it to actual results.
- Exports: reports and all transactions download as CSV or Excel, with protection against spreadsheet formula tricks.
- Full backup: admins can download one file with everything in an organization. Restore is not available yet.
- History: admins can browse who changed what and when, under Settings.

## [0.0.2] - 2026-10-06

### Added
- High-contrast dark mode with a toggle in the website header and the app sidebar. It remembers your choice and follows the system preference on first visit.
- Public website explaining OpenLedgerApp's purpose, limitations, and development status.
- Clear distinction between available self-hosted web source and planned desktop and managed-cloud editions.
- Getting-started page linking to the source archive on GitHub (the app source, without the public website).
- Product blueprint for v0.0.3 desktop-ready foundations and later optional synchronization.

### Changed
- Groundwork for the future desktop edition: a local SQLite storage option with the same bookkeeping protections, tested against the same rules as the cloud app (not yet packaged as an app).
- Statement checks, reports, organization settings, books lock and year-end close now run in the same shared, storage-independent code, ready for the future desktop edition.
- Every new record (organizations, accounts, statement checks, year-end closes, import batches, history entries, categories) now gets its ID from the app instead of the database.
- Discarding a statement check now requires permission to edit the books.
- Bookkeeping rules and save/void workflows now run in shared, storage-independent code, so future desktop and self-hosted editions behave the same as the cloud app.
- App name standardized to OpenLedgerApp across screens, legal notices, reports, and documentation.
- Page titles use OpenLedgerApp for home and Page Name - OpenLedgerApp elsewhere.
- Public home is now `/`; the existing authenticated dashboard is at `/ledger`.
- Public website does not advertise or link the development preview or shared demo.
- Consistent section spacing across the website and app.

### Removed
- Marketing strips and eyebrow badges above headlines on the public website.
- Legal mailing address from legal notices; contact is by email only.
- Em dashes and en dashes from all user-facing copy.

## [0.0.1] - 2026-10-01

Initial usable web foundation.

### Added
- Organization-scoped double-entry accounting, chart of accounts, opening balances, and transaction register.
- Money in, money out, transfers, and advanced entry flows with duplicate-submit protection.
- CSV, OFX/QFX, and reviewed PDF bank imports; reconciliation and completion locks.
- Income statement, balance sheet, trial balance, project reporting, and PDF exports.
- Business/nonprofit terminology, basic fund tags, projects, and organization settings.
- Member roles, email and Google sign-in, password recovery, and versioned legal acceptance.
- Books-lock dates and virtual year-end close.
- Automated unit tests, database-rule checks, CI, and deployment documentation.

### Security and data integrity
- Balanced-entry enforcement, organization isolation, and permission checks.
- Posted transactions corrected by voiding and re-entry rather than destructive editing.
- Bank evidence protection, account archiving, and reconciliation locks.
- Startup data-safety safeguards and manual development-only sample seeding.

### Known limitations
- Pre-1.0 development software; review results and keep independent backups.
- Fund tags are not full nonprofit fund accounting.
- No standalone desktop installer, automated bank feeds, payroll, or tax filing.

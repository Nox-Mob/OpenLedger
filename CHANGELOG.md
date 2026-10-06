# Changelog

Notable changes to Open Ledger are recorded here. This project follows the structure of Keep a Changelog. Pre-1.0 software remains under active development.

## [Unreleased] — v0.0.2

### Added
- Public website explaining Open Ledger's purpose, limitations, and development status.
- Clear distinction between available self-hosted web source and planned desktop and managed-cloud editions.
- Getting-started page and downloadable development source.
- Public release notes generated from this Markdown changelog.
- Product blueprint for v0.0.3 desktop-ready foundations and later optional synchronization.

### Changed
- Public home is now `/`; the existing authenticated dashboard is at `/ledger`.
- Public website does not advertise or link the development preview or shared demo.

## [0.0.1]

Initial usable web foundation. The exact release date was not recorded here.

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
# OpenLedgerApp — Product blueprint

## v0.0.2: a public home for the project

OpenLedgerApp is open-source double-entry recordkeeping for small businesses, freelancers, and nonprofits. The website explains the need for transparent, approachable accounting without claiming to replace a professional accountant or mature full-service accounting suite.

The public website must explain:
- **Why:** small teams need understandable books and control over their records without enterprise complexity.
- **What it is not:** professional financial/tax/legal advice, automated tax filing, payroll, a bank, or full nonprofit fund accounting. Current funds are basic tags.
- **Current state:** usable pre-1.0 web software under active development, not a finished desktop product. Users must review results and maintain backups.
- **Get started:** source download and the existing cloud-hosted-backend/self-hosted-backend setup instructions. No preview/dev demo link, sample credentials, or demo CTA.
- **Release history:** a public changelog backed by Markdown in the repository.

Keep the existing app available to account holders; the public home does not replace or alter accounting behavior.

## Eventual three-edition model

| Edition | Intended audience | Direction | Availability |
| --- | --- | --- | --- |
| Standalone desktop | Freelancers and solo operators | Free; local to the computer running it; offline | Planned, no installer yet |
| Self-hosted community | Individuals and teams controlling infrastructure | Open-source web app on their own server | Development source available |
| Managed cloud | Teams preferring not to operate a server | Hosted service; pricing to be decided | Current web app is developmental, not a finalized commercial offering |

Optional donations may support the project in the future; there is no donation checkout or promised price today.

## v0.0.3: architecture for future desktop use

Evolve incrementally rather than rewriting the existing application. Separate UI, validation, pure accounting/reporting logic, and application behavior from persistence and infrastructure. Keep PostgreSQL/the current backend as an adapter rather than embedding that dependency into every layer. Define data-access boundaries suitable for a future embedded SQLite adapter.

Investigate Tauri for a native package containing the existing UI. The eventual standalone app should require no Docker, PostgreSQL, Node.js installation, local server setup, or internet connection. Local records, configuration, audit history, and associated files belong on the user's computer.

Preserve stable record identities and a consistent logical model for eventual optional synchronization. Desktop and cloud should share accounting behavior; offline synchronization is a later project, not an immediate deliverable.

## Later deployment convenience

An interactive installer may ask cloud-hosted or self-hosted backend, clone the repository, write ignored `.env.local` overrides, optionally provision Docker, apply migrations without resetting real data, and start the app. This remains planned work.
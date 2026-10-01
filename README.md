# Open Ledger

Open-source, self-hostable double-entry accounting for very small businesses and nonprofits.

- Double-entry is enforced twice: in the app and again by a database trigger (every posted transaction needs at least 2 entries that sum to zero, with at least one debit and one credit).
- Bank imports are evidence only — they never change the ledger until you post them.
- Posted records are never edited in place: void and re-enter, so the audit trail stays intact.
- Every organization's data is isolated by row-level security in the database.

Built with React 19 + TanStack Start (Vite), Tailwind CSS v4, and Supabase (Postgres, Auth, Storage).

---

## Running the sample-data setup file manually

The sample data (the shared `demo@demo.org` / `demo1234` login and its two sample organizations) lives in `supabase/seed/demo.sql`. It is **not** a migration and never runs automatically. To load it into a development or test database:

```sh
psql "$SUPABASE_DB_URL" -f supabase/seed/demo.sql
```

- `$SUPABASE_DB_URL` is the Postgres connection string of your **dev/test** database (on Supabase: Project Settings → Database → Connection string). You need a role that can write to `auth.users` (the `postgres` superuser works).
- The script is re-runnable: every insert uses `ON CONFLICT DO NOTHING`, so running it twice is safe.
- **Never run it against a production database with real users.** It creates a publicly known login.

---

## Self-hosting: full reproduction guide

### 1. Prerequisites

- **Node.js 20+** (or Bun 1.1+). Install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) or [bun.sh](https://bun.sh).
- **Git**.
- A **Supabase project** — either a free project at [supabase.com](https://supabase.com) (easiest) or a [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting) stack. You need: the project URL, the publishable (anon) key, the service-role key, and the database connection string.

### 2. Get the code

```sh
git clone <this-repository-url>
cd <repository-name>
```

### 3. Create the database schema

Apply every migration in `supabase/migrations/`, in filename order (the timestamps in the names define the order):

```sh
for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -f "$f"; done
```

Or use the Supabase CLI:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates all tables, row-level-security policies, grants, triggers, and functions (double-entry validation, immutability guards, last-admin protection, reconciliation locks, etc.).

Optionally verify tenant isolation afterwards:

```sh
psql "$SUPABASE_DB_URL" -f supabase/tests/tenant_isolation.sql
```

### 4. Configure authentication

In your Supabase project (Authentication → Sign In / Providers):

1. Enable **Email** sign-ups.
2. Decide on email confirmation: leave it ON for production (users must confirm their email), or turn it off for a private test instance.
3. (Optional) Enable **Google** sign-in: create OAuth credentials in Google Cloud Console, add them to the Google provider in Supabase, and add your app's URL to the allowed redirect URLs.
4. Under Authentication → URL Configuration, set **Site URL** to your app's public URL (e.g. `https://books.example.com`) and add `https://books.example.com/reset-password` (and your local dev URL) to the redirect allow-list — password-reset emails link back there.

### 5. Set environment variables

Create a `.env` file in the project root (it is git-ignored):

```sh
# Client + server
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable/anon key>

# Server-only (used by server functions)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your publishable/anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service-role key>

# Optional: enables the AI-assisted PDF statement import.
# Without it, CSV/OFX/QFX imports still work; PDF import is disabled.
LOVABLE_API_KEY=<a Lovable AI gateway key>
```

Never commit this file. The service-role key bypasses row-level security — keep it server-side only.

### 6. Install and run

```sh
bun install        # or: npm install
bun run dev        # or: npm run dev
```

Open http://localhost:8080, create your first account on the sign-in page, and the app walks you through creating your first organization (name/type → accounts → display settings).

### 7. (Optional) Load the sample data

On a dev/test database only:

```sh
psql "$SUPABASE_DB_URL" -f supabase/seed/demo.sql
```

Then sign in as `demo@demo.org` / `demo1234` to explore two fully worked example organizations (a business and a nonprofit), including transactions, bank imports, and reconciliations.

### 8. Production build

```sh
bun run build
bun run preview    # serves the production build locally
```

Deploy the build output to any host that runs a Node-compatible server (the app is a TanStack Start SSR app). Set the same environment variables from step 5 in your host's configuration. Make sure your host runs the SSR server, not just static files — server functions (transactions, imports, reports) require it.

### 9. Running the tests

```sh
bun run test               # unit tests: money, terminology, account catalog, reports, dates, parsers, permissions
bun run check:migrations   # every public table has GRANTs + row level security
# Database rules — ONLY against a disposable database (e.g. `supabase db start`):
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bun run test:db
```

The database checks (`supabase/tests/*.sql`) run inside a transaction that always rolls back. They verify tenant isolation (a stranger can't read or change any org table) and ledger invariants (unbalanced/single-entry transactions rejected, entries and posted transactions immutable, voids can't be undone, books lock enforced, no cross-org entries, last admin kept).

### Continuous integration

`.github/workflows/ci.yml` runs on every push, pull request, and weekly. It **only reports** — it never formats, fixes, commits, or pushes. Blocking jobs: unit tests, type check, production build, database rules (on a fresh local database with every migration applied), and high/critical dependency vulnerabilities. Lint is reported but not blocking yet. Each failure explains which rule broke in the run summary and as inline annotations.

---

## Project layout

| Path | What it is |
| --- | --- |
| `src/routes/` | Pages (TanStack Router file-based routing) |
| `src/lib/*.functions.ts` | Server functions — all org data access goes through these |
| `src/lib/report-math.ts` | Pure report calculations (unit-tested) |
| `src/lib/parsers/` | CSV / OFX / QFX / PDF bank-statement parsers |
| `supabase/migrations/` | Database schema, RLS policies, triggers |
| `supabase/seed/demo.sql` | Optional sample data (dev/test only) |
| `supabase/tests/` | SQL-level security tests |
| `AGENTS.md` | Architecture rules and invariants |
| `roadmap.md` | Planned work |

## License

See LICENSE. This is pre-1.0 software — test it with sample data before trusting it with real books.

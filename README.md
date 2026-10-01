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

The app is a server-rendered TanStack Start app: pages **and** server functions (transactions, imports, reports, closing) run on the server. A static-file host alone will not work. All state lives in the database and storage, so app servers are stateless and can be replaced or multiplied freely.

---

## Deploying

### Before any deployment

1. Copy `.env.example` to `.env` (or your host's secret store) and fill it in. `.env` is git-ignored — never commit it. The service-role key is server-only.
2. Apply migrations to the production database (`supabase db push`). Migrations are append-only; never run `supabase/seed/demo.sql` in production.
3. Set Auth → URL Configuration (Site URL + `/reset-password` redirect) to your production domain.
4. Leave `VITE_ALLOW_DEMO_LOGIN` unset.
5. Run the release checklist below.

### Option A — a single server (small office, home lab)

One Linux VM (1 vCPU / 1 GB RAM is enough for a handful of users) plus a hosted Supabase project.

```sh
# on the server
git clone <repo> /opt/open-ledger && cd /opt/open-ledger
cp .env.example .env && nano .env      # fill in values; chmod 600 .env
bun install --frozen-lockfile
bun run build
```

Run it under a process manager so it restarts on crash and boot, e.g. systemd (`/etc/systemd/system/open-ledger.service`):

```ini
[Unit]
Description=Open Ledger
After=network.target

[Service]
WorkingDirectory=/opt/open-ledger
EnvironmentFile=/opt/open-ledger/.env
ExecStart=/usr/local/bin/bun run preview --host 127.0.0.1 --port 8080
Restart=always
User=openledger

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now open-ledger
```

Put a TLS reverse proxy in front (Caddy is simplest — it gets certificates automatically):

```
books.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Updating: `git pull && bun install --frozen-lockfile && supabase db push && bun run build && sudo systemctl restart open-ledger`. Restarting never touches data.

#### Fully self-contained alternative: self-hosted Supabase with Docker Compose

If you don't want any hosted dependency, run Supabase itself on the same machine with Docker Compose. Allow **4 GB+ RAM** (the Supabase stack runs Postgres, Auth, PostgREST, Storage, and more as separate containers).

1. **Install Docker and the Compose plugin** on the server ([docs.docker.com/engine/install](https://docs.docker.com/engine/install/)).
2. **Get the official self-hosting stack.** The fastest way is Supabase's own setup script, which does the whole preparation for you:

   ```sh
   curl -fsSL https://supabase.link/setup.sh | sh
   ```

   The script supports **Linux only** (Debian/Ubuntu and RHEL/CentOS/Fedora) and will:

   - Install prerequisites (`git`, `openssl`, `jq`) and Docker Engine if not already present
   - Sparse-clone the `docker/` directory from the main Supabase repository
   - Create a project directory (`supabase-project` by default) and copy the configuration files into it
   - Record the installed release version in `.supabase-version` for future `update.sh` upgrades
   - Prompt for the main URLs (`SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, `SITE_URL`, `PROXY_DOMAIN`) and write them to `.env`
   - Generate all secrets, including a random `DASHBOARD_PASSWORD`, and the asymmetric JWT signing key pair (it runs `generate-keys.sh` and `add-new-auth-keys.sh`, and enables the matching entries in `docker-compose.yml`)
   - Pull the Docker images

   > Piping a script straight into a shell is a matter of trust. The shortened link points to `setup.sh` — inspect it before running (`curl -fsSL https://supabase.link/setup.sh -o setup.sh`, read it, then `sh setup.sh`), pass `-y` to run non-interactively with default values, or do the whole thing manually:
   >
   > ```sh
   > git clone --depth 1 https://github.com/supabase/supabase
   > cd supabase/docker
   > cp .env.example .env
   > ```
   >
   > The manual path skips the script's conveniences: you generate the secrets and keys yourself (step 4 below) and pull the images with `docker compose pull`.

3. **Log out and back in.** When the script installs Docker for you, it also adds your user to the `docker` group. Log out and back in before continuing — otherwise the `docker` commands below need `sudo`.
4. **Start the stack and view your credentials:**

   ```sh
   cd supabase-project && sh run.sh start
   ```

   View the generated credentials any time via:

   ```sh
   sh run.sh secrets
   ```

   Postgres then listens on port `5432` and the API gateway (Kong) on `8000`. Your project URL is `http://<server-ip>:8000` (or `https://api.books.example.com` if you put a TLS proxy in front — recommended for anything but a home lab).

   On the manual path, instead edit `docker/.env` yourself: set fresh values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, and `DASHBOARD_PASSWORD`, generate the two keys from your `JWT_SECRET` using the tool linked in that file's comments, then `docker compose pull && docker compose up -d`. These replace the keys a hosted project would give you — the publishable key is `ANON_KEY`, the service-role key is `SERVICE_ROLE_KEY`.
5. **Apply the schema.** Point the migration loop from step 3 of the setup guide at the local Postgres:

   ```sh
   export SUPABASE_DB_URL="postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"
   for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -f "$f"; done
   ```

6. **Point the app at it.** In the app's `.env`, use `http://<server-ip>:8000` (or your TLS URL) for `VITE_SUPABASE_URL` / `SUPABASE_URL`, the `ANON_KEY` for the publishable keys, and the `SERVICE_ROLE_KEY` for the service-role key (`sh run.sh secrets` shows both).
7. **Check the auth URLs.** The script prompts for `SITE_URL` and the other public URLs during setup. If your app's URL changes later, update `SITE_URL` and `ADDITIONAL_REDIRECT_URLS` in the project's `.env` (include the `/reset-password` redirect) and restart the auth container (`docker compose restart auth`).
8. **Backups.** The database lives in the `db` container's Postgres volume. Dump it nightly and copy the dump off the machine:

   ```sh
   docker compose exec -T db pg_dump -U postgres postgres | gzip > backup-$(date +%F).sql.gz
   ```

   Schedule this with cron and copy the result to another machine or object storage. Test a restore at least once (`gunzip -c backup.sql.gz | docker compose exec -T db psql -U postgres postgres`).

Updating Supabase later: from the project directory, follow the stack's own `update.sh` (the installed release version is recorded in `.supabase-version`), or on the manual path `git pull` in the supabase checkout, `docker compose pull`, `docker compose up -d`. App updates and Supabase updates are independent; neither touches your data.

### Option B — at scale (many organizations / users)

```text
 users ──> CDN / load balancer (TLS)
              │
     ┌────────┼────────┐
   app #1   app #2   app #N      (stateless, identical env vars)
     └────────┼────────┘
              │
   Supabase: Postgres (+ connection pooler, read replicas)
             Auth, Storage (bank statement files)
```

- **App tier.** The build targets edge/Worker runtimes, so the lowest-effort scale path is Cloudflare Workers (`wrangler deploy`, secrets via `wrangler secret put`). Alternatively build a container image and run N replicas behind a load balancer (Kubernetes, ECS, Fly.io, Render). No sticky sessions needed — auth is a bearer token on every request. Add a `/` health check.
- **Database.** Use a paid Supabase plan (or managed Postgres you operate) with point-in-time recovery enabled. Use the connection pooler for server traffic. Scale compute vertically first; reports already page through rows, so add read replicas only when report traffic dominates.
- **Secrets.** Store keys in the platform's secret manager, not files on disk. Rotate the service-role and publishable keys on a schedule and immediately if one leaks; redeploy the app tier after rotating.
- **Releases.** Let CI (`.github/workflows/ci.yml`) pass, apply migrations first (they are additive, so old app versions keep working), then roll out app replicas gradually.
- **Monitoring & backups.** Ship server logs to a log service, alert on 5xx rates and database CPU/connections, and test restoring a backup at least quarterly.
- **Email.** Configure a custom SMTP provider in Auth so sign-up and password-reset emails aren't rate-limited.

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

| Path                     | What it is                                                |
| ------------------------ | --------------------------------------------------------- |
| `src/routes/`            | Pages (TanStack Router file-based routing)                |
| `src/lib/*.functions.ts` | Server functions — all org data access goes through these |
| `src/lib/report-math.ts` | Pure report calculations (unit-tested)                    |
| `src/lib/parsers/`       | CSV / OFX / QFX / PDF bank-statement parsers              |
| `supabase/migrations/`   | Database schema, RLS policies, triggers                   |
| `supabase/seed/demo.sql` | Optional sample data (dev/test only)                      |
| `supabase/tests/`        | SQL-level security tests                                  |
| `AGENTS.md`              | Architecture rules and invariants                         |
| `roadmap.md`             | Planned work                                              |

## License

See LICENSE. This is pre-1.0 software — test it with sample data before trusting it with real books.

## Before you release

1. `bun run test`, `bun run lint`, `bun run format:check`, `bun run check:migrations` all pass.
2. `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bun run test:db` passes (local throwaway DB only — the script refuses anything else).
3. `python3 scripts/smoke/smoke.py` against a dev server with the demo seed reports "No problems found."
4. Add the operator mailing address and have the Terms and Privacy Policy reviewed by counsel before release.
5. Leave `VITE_ALLOW_DEMO_LOGIN` unset in production so the shared demo login is refused.

**Startup never resets data.** Migrations only ever add to the database; CI rejects any migration containing DELETE, TRUNCATE or DROP TABLE. Restarting the app or the database keeps every organization and transaction. The demo seed refuses to load into a database that has real organizations.

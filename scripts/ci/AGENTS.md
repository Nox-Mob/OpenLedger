# scripts/ci

- Tests: bun run test, bun run check:migrations, DATABASE_URL=... bun run test:db (supabase/tests/*.sql).
- CI is report-only: never auto-fixes/commits; SQL tests end with RAISE 'RESULT k=PASS;...'.
- Startup never resets data: migrations append-only, CI rejects DELETE/TRUNCATE/DROP TABLE; test scripts require a local DB; demo seed refuses DBs with real orgs.

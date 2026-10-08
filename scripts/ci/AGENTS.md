# scripts/ci

- Tests: npm run test, npm run check:direct-writes (own CI step), npm run check:migrations, DATABASE_URL=... npm run test:db (supabase/tests/*.sql).
- CI is report-only: never auto-fixes/commits; SQL tests end with RAISE 'RESULT k=PASS;...'.
- Startup never resets data: migrations append-only, CI rejects DELETE/TRUNCATE/DROP TABLE; test scripts require a local DB; demo seed refuses DBs with real orgs.

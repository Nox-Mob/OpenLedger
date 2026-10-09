# Release checklist

Every item is mandatory before a version is tagged or merged to main. `src/lib/release.test.ts` enforces the ones a machine can check.

1. **Changelog updated.** Move everything under `[Unreleased]` into `## [x.y.z] - YYYY-MM-DD` and leave an empty `[Unreleased]` above it.
2. **Architecture document updated.** `docs/architecture.md` says `Current as of vx.y.z` for the version being released, and its status table matches what shipped.
3. **Version bumped.** `package.json`, `package-lock.json` and `src/lib/version.ts` all show the new version.
4. **Roadmap updated.** The release is marked released with its date; anything not done moves to the next version.
5. **Database changes in both folders.** Every file in `drizzle/migrations` has a matching file in `supabase/migrations` (GitHub builds its test database from the second).
6. **All checks green locally:** `npm run test`, type check, lint, `npx prettier --check .`, `node scripts/ci/check-migrations.mjs`, `npm audit --omit=dev`, build.
7. **All checks green on GitHub**, including the database safety checks, which only run there.
8. **No Bun lock file** (`bun.lock`, `bun.lockb`) in the commit.

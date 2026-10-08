# src/lib/domain

- Backups: format v3 manifest (appVersion, attachments slot; v2 still accepted), Ed25519-signed (key derived from server secret BACKUP_SIGNING_SEED) over chained per-row SHA-256 table digests (src/lib/domain/backup.ts); unsigned/changed files are refused. Restore only creates a new org with new IDs, re-runs domain checks, writes via the caller's RLS client, and rolls back by deleting the new org on failure.
- Backup export reads live in a server-only helper shared with roundtrip tests (no RPC mocking); doubles don't replace DB RLS/trigger CI checks.

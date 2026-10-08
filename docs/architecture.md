# OpenLedgerApp architecture

One accounting application, several storage deployments. Keep it boring: a single app plus Postgres (cloud, self-hosted) or SQLite (desktop). No microservices, queues, caches or extra infrastructure.

```text
React screens (src/routes, src/components)
        |
Server functions (src/lib/*.functions.ts)   sign-in + assertCan only
        |
Services / workflows (src/lib/services)     use ports only
        |
Domain rules (src/lib/domain)               pure, no storage imports
        |
Ports (src/lib/ports)  ->  adapters: supabase | sqlite | memory
```

## Where rules live

- If a rule can be unit-tested without a database, it belongs in `src/lib/domain/` and runs before every write.
- The database enforces what it is best at: foreign keys, uniqueness, RLS, immutability triggers, atomicity. These are a second line of defense, mirrored in the SQLite schema.
- Every adapter must pass `src/lib/adapters/contract.test.ts`.

## History

- Every change must have a history entry. If the entry cannot be saved, the request fails (`writeAudit()` throws).
- Planned (v0.0.4): change and history saved in one atomic step, and history split into change, money and system kinds.

## Identity and sync

- IDs are app-generated UUIDs. Posted transactions are immutable (void and re-post), which makes future event-based sync tractable. Sync is not scheduled.

## Backups

- Signed manifest over chained per-row hashes; restore always creates a new organization and re-runs domain checks. See `src/lib/domain/backup.ts`.

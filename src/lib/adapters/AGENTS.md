# src/lib/adapters

- Desktop storage: src/lib/adapters/sqlite implements the ports over a minimal SqlDriver (Tauri plugin-sql in the shell, sql.js in tests); its schema.ts migrations are append-only and mirror Postgres guards. Every adapter must pass src/lib/adapters/contract.test.ts. See docs/desktop.md.

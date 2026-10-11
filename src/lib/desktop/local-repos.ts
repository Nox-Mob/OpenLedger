import type { Repositories } from "@/lib/ports";

let pending: Promise<Repositories> | null = null;

/** Opens the local SQLite file once per app run (desktop only). */
export function localRepos(): Promise<Repositories> {
  pending ??= (async () => {
    const [{ default: Database }, sqlite] = await Promise.all([
      import("@tauri-apps/plugin-sql"),
      import("@/lib/adapters/sqlite"),
    ]);
    const raw = await Database.load("sqlite:openledgerapp.db");
    const driver = {
      execute: (sql: string, p?: unknown[]) => raw.execute(sql, p),
      select: <T>(sql: string, p?: unknown[]) => raw.select<T[]>(sql, p),
    };
    await sqlite.migrateSqlite(driver as never);
    return sqlite.createSqliteRepositories(driver as never);
  })();
  return pending;
}

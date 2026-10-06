// sql.js (SQLite compiled to WebAssembly) driver. Used by tests; also lets the desktop
// adapter run in a browser for prototyping. The Tauri shell uses plugin-sql instead.
import type { Database } from "sql.js";
import type { SqlDriver, SqlValue } from "./index";

export function sqlJsDriver(db: Database): SqlDriver {
  db.run("PRAGMA foreign_keys = ON");
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      db.run(sql, params);
      return { rowsAffected: db.getRowsModified() };
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const out: T[] = [];
        while (stmt.step()) out.push(stmt.getAsObject() as T);
        return out;
      } finally {
        stmt.free();
      }
    },
  };
}

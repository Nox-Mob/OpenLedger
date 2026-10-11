import Database from "@tauri-apps/plugin-sql";
const raw = await Database.load("sqlite:openledgerapp.db");
const driver = {
  execute: (sql, p) => raw.execute(sql, p),
  select: (sql, p) => raw.select(sql, p),
};
await migrateSqlite(driver);
const repos = createSqliteRepositories(driver);

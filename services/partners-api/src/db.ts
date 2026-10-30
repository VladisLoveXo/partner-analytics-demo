import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

// Any constant shared by all instances: only one of them runs migrations at a time.
const MIGRATION_LOCK_ID = 727_001;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function waitForPostgres(pool: pg.Pool, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

/**
 * Applies migrations/*.sql that are not recorded in schema_migrations yet, each in its own transaction.
 * An advisory lock keeps replicas that start together from running them twice.
 * Returns the names of the files applied by this call.
 */
export async function runMigrations(pool: pg.Pool, dir: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((row) => row.name));
    const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();

    const applied: string[] = [];
    for (const file of files.filter((name) => !done.has(name))) {
      const sql = await readFile(join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

export async function runSqlFile(pool: pg.Pool, file: string): Promise<void> {
  await pool.query(await readFile(file, "utf8"));
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type ClickHouseClient } from "@clickhouse/client";

export interface ClickHouseConfig {
  url: string;
  username: string;
  password: string;
}

export function createClickHouse(config: ClickHouseConfig): ClickHouseClient {
  return createClient({
    url: config.url,
    username: config.username,
    password: config.password,
    request_timeout: 30_000,
  });
}

/** Polls ClickHouse until it answers, for startup ordering in compose and Kubernetes. */
export async function waitForClickHouse(client: ClickHouseClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await client.ping();
    if (result.success) return;
    if (Date.now() > deadline) throw new Error("ClickHouse did not become reachable in time", { cause: result.error });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/**
 * Applies every statement of every *.sql file in `dir`, in file name order.
 * All DDL is written with IF NOT EXISTS, so running it again on a migrated database is a no-op.
 */
export async function runMigrations(client: ClickHouseClient, dir: string): Promise<string[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    for (const statement of splitStatements(await readFile(join(dir, file), "utf8"))) {
      await client.command({ query: statement });
    }
  }
  return files;
}

/** Splits a script on semicolons that end a line and drops comment-only lines. */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement.length > 0);
}

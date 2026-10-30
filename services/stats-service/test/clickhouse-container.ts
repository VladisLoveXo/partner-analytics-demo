import { fileURLToPath } from "node:url";
import type { ClickHouseClient } from "@clickhouse/client";
import { ClickHouseContainer } from "@testcontainers/clickhouse";
import { createClickHouse, runMigrations } from "../src/clickhouse.js";

export const CLICKHOUSE_IMAGE = "clickhouse/clickhouse-server:26.8-alpine";
export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export interface TestClickHouse {
  client: ClickHouseClient;
  stop(): Promise<void>;
}

/** Starts a throwaway ClickHouse and applies the service migrations to it. */
export async function startClickHouse(): Promise<TestClickHouse> {
  const container = await new ClickHouseContainer(CLICKHOUSE_IMAGE).start();
  const client = createClickHouse({
    url: container.getHttpUrl(),
    username: container.getUsername(),
    password: container.getPassword(),
  });
  await runMigrations(client, MIGRATIONS_DIR);
  return {
    client,
    async stop() {
      await client.close();
      await container.stop();
    },
  };
}

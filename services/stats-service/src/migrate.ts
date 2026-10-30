import { fileURLToPath } from "node:url";
import { createClickHouse, runMigrations, waitForClickHouse } from "./clickhouse.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

// Runs as an init container in Kubernetes and before the server in docker compose.
const config = loadConfig();
const log = createLogger(config.logLevel);
const client = createClickHouse(config.clickhouse);

try {
  await waitForClickHouse(client, 60_000);
  const files = await runMigrations(client, fileURLToPath(new URL("../migrations/", import.meta.url)));
  log.info({ files }, "clickhouse migrations applied");
} catch (error) {
  log.error({ err: error }, "clickhouse migrations failed");
  process.exitCode = 1;
} finally {
  await client.close();
}

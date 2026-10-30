import { fileURLToPath } from "node:url";
import { pino } from "pino";
import { loadDatabaseConfig } from "./config.js";
import { createPool, runMigrations, runSqlFile, waitForPostgres } from "./db.js";

// Runs as an init container in Kubernetes and before the server in docker compose.
const config = loadDatabaseConfig();
const log = pino({ level: config.logLevel, base: { service: "partners-api", task: "migrate" } });
const pool = createPool(config.databaseUrl);

try {
  await waitForPostgres(pool, 60_000);
  const applied = await runMigrations(pool, fileURLToPath(new URL("../migrations/", import.meta.url)));
  if (config.seedDemo) await runSqlFile(pool, fileURLToPath(new URL("../seed/demo.sql", import.meta.url)));
  log.info({ applied, seeded: config.seedDemo }, "postgres migrations applied");
} catch (error) {
  log.error({ err: error }, "postgres migrations failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}

import { createClickHouse } from "./clickhouse.js";
import { loadConfig } from "./config.js";
import { createEventsRepo } from "./events-repo.js";
import { createHealthState } from "./health.js";
import { createLogger } from "./logger.js";
import { createGrpcServer } from "./server.js";

const config = loadConfig();
const log = createLogger(config.logLevel);
const clickhouse = createClickHouse(config.clickhouse);
const server = createGrpcServer({
  repo: createEventsRepo(clickhouse),
  health: createHealthState(),
  log,
  chaos: config.chaos,
});

const port = await server.listen(config.port);
log.info({ port, chaos: config.chaos }, "stats-service is listening (gRPC over h2c)");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log.info({ signal }, "shutting down");
    server
      .close({ drainMs: config.shutdownDrainMs })
      .then(() => clickhouse.close())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error({ err: error }, "unclean shutdown");
        process.exit(1);
      });
  });
}

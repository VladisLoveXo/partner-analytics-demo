import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { clientCredentials } from "./token.js";
import { chunk, dayOfTraffic, liveTraffic, pastDays, PARTNERS, type TrafficEvent } from "./traffic.js";

const env = process.env;
const config = {
  apiUrl: env.API_URL ?? "http://localhost:4000",
  tokenUrl: env.TOKEN_URL ?? "http://localhost:8080/realms/partners/protocol/openid-connect/token",
  clientId: env.CLIENT_ID ?? "event-generator",
  clientSecret: env.CLIENT_SECRET ?? "event-generator-secret",
  backfillDays: Number(env.BACKFILL_DAYS ?? 30),
  live: env.LIVE === "true",
  liveIntervalMs: Number(env.LIVE_INTERVAL_MS ?? 5_000),
  liveEventsPerPartner: Number(env.LIVE_EVENTS_PER_PARTNER ?? 10),
  /** Share of batches sent twice with the same key, as a producer that lost the response would do. */
  duplicateRate: Number(env.DUPLICATE_RATE ?? 0.1),
  batchSize: 500,
};

const tokens = clientCredentials(config);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => (stopping = true));

function log(message: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), service: "event-generator", message, ...fields }));
}

class RejectedError extends Error {}

interface SendResult {
  accepted: number;
  replay: boolean;
}

/** Sends one batch. Network errors, 429 and 5xx are retried with backoff, always with the same key. */
async function send(events: TrafficEvent[], key: string): Promise<SendResult> {
  for (let attempt = 1; ; attempt++) {
    let waitMs = Math.min(10_000, 250 * 2 ** (attempt - 1));
    try {
      const response = await fetch(`${config.apiUrl}/api/events`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await tokens.get()}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify({ events }),
      });
      if (response.status === 202) return (await response.json()) as SendResult;
      if (response.status === 401 && attempt === 1) {
        tokens.reset();
        continue;
      }
      if (response.status !== 429 && response.status < 500) {
        throw new RejectedError(`batch ${key} rejected: ${response.status} ${await response.text()}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      if (retryAfter > 0) waitMs = retryAfter * 1000;
      log("batch will be retried", { key, status: response.status, attempt });
    } catch (error) {
      if (error instanceof RejectedError) throw error;
      log("batch will be retried", { key, error: String(error), attempt });
    }
    if (attempt >= 8) throw new Error(`batch ${key} failed after ${attempt} attempts`);
    await sleep(waitMs);
  }
}

async function waitUntilReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await tokens.get();
      if ((await fetch(`${config.apiUrl}/readyz`)).ok) return;
    } catch {
      // Keycloak or partners-api is still starting.
    }
    if (Date.now() > deadline) throw new Error("Keycloak or partners-api did not become ready in time");
    await sleep(2_000);
  }
}

async function backfill(): Promise<void> {
  const days = pastDays(config.backfillDays, Date.now());
  const totals = { events: 0, accepted: 0, resentBatches: 0, replays: 0 };

  for (const day of days) {
    await Promise.all(
      PARTNERS.map(async (partner) => {
        for (const [index, batch] of chunk(dayOfTraffic(partner, day), config.batchSize).entries()) {
          // Deterministic key and events: running the backfill again repeats exactly the same requests.
          const key = `backfill-v1:${partner.id}:${day}:${index}`;
          const result = await send(batch, key);
          totals.events += batch.length;
          totals.accepted += result.accepted;
          if (result.replay) totals.replays++;
          if (Math.random() < config.duplicateRate) {
            totals.resentBatches++;
            if ((await send(batch, key)).replay) totals.replays++;
          }
        }
      }),
    );
    log("day loaded", { day });
  }
  log("backfill finished", { days: days.length, ...totals });
}

async function live(): Promise<void> {
  log("live traffic started", { intervalMs: config.liveIntervalMs });
  while (!stopping) {
    // One batch per tick for all partners: every INSERT is a block in ClickHouse's deduplication window.
    const events = PARTNERS.flatMap((partner) => liveTraffic(partner, Date.now(), config.liveEventsPerPartner));
    const key = `live:${randomUUID()}`;
    try {
      await send(events, key);
      if (Math.random() < config.duplicateRate) await send(events, key);
    } catch (error) {
      log("live batch failed", { key, error: String(error) });
    }
    await sleep(config.liveIntervalMs);
  }
}

try {
  await waitUntilReady(180_000);
  if (config.backfillDays > 0) await backfill();
  if (config.live) await live();
  log("done");
} catch (error) {
  log("generator failed", { error: String(error) });
  process.exitCode = 1;
}

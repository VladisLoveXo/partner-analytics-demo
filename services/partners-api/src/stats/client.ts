import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { Health } from "../gen/grpc/health/v1/health_pb.js";
import { StatsService } from "../gen/stats/v1/stats_pb.js";
import { retryInterceptor, type RetryOptions } from "./retry.js";

export interface StatsClients {
  stats: Client<typeof StatsService>;
  health: Client<typeof Health>;
}

/** Both clients share one HTTP/2 connection to stats-service. */
export function createStatsClients(baseUrl: string, retry: RetryOptions): StatsClients {
  const transport = createGrpcTransport({ baseUrl, interceptors: [retryInterceptor(retry)] });
  return {
    stats: createClient(StatsService, transport),
    health: createClient(Health, transport),
  };
}

import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { Health, HealthCheckResponse_ServingStatus as ServingStatus } from "./gen/grpc/health/v1/health_pb.js";

// docker compose healthcheck: the same grpc.health.v1 call that Kubernetes probes make.
const port = process.env.PORT ?? "50051";
const client = createClient(Health, createGrpcTransport({ baseUrl: `http://127.0.0.1:${port}` }));

try {
  const response = await client.check({}, { timeoutMs: 2_000 });
  process.exit(response.status === ServingStatus.SERVING ? 0 : 1);
} catch {
  process.exit(1);
}

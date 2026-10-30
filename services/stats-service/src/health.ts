import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { HealthCheckResponse_ServingStatus as ServingStatus, type Health } from "./gen/grpc/health/v1/health_pb.js";
import { StatsService } from "./gen/stats/v1/stats_pb.js";

/** Shared flag: the server reports NOT_SERVING while it shuts down, so probes take it out of rotation. */
export interface HealthState {
  serving: boolean;
}

export function createHealthState(): HealthState {
  return { serving: true };
}

// "" asks about the server as a whole, which is what Kubernetes gRPC probes send by default.
const KNOWN_SERVICES = new Set(["", StatsService.typeName]);

export function createHealthHandlers(state: HealthState): Partial<ServiceImpl<typeof Health>> {
  return {
    check(request) {
      if (!KNOWN_SERVICES.has(request.service)) {
        throw new ConnectError(`unknown service ${request.service}`, Code.NotFound);
      }
      return { status: state.serving ? ServingStatus.SERVING : ServingStatus.NOT_SERVING };
    },
  };
}

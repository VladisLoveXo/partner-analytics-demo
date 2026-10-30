import { timestampDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { rangeError } from "./dates.js";
import type { EventKind, EventRow, EventsRepo } from "./events-repo.js";
import { EventType, type Event, type StatsService } from "./gen/stats/v1/stats_pb.js";

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const MAX_BATCH_SIZE = 1000;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const PARTNER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SUB_ID_LENGTH = 64;

export function createStatsHandlers(repo: EventsRepo): ServiceImpl<typeof StatsService> {
  return {
    async ingestEvents(request, context) {
      const key = context.requestHeader.get(IDEMPOTENCY_HEADER);
      if (key === null || !IDEMPOTENCY_KEY.test(key)) {
        throw invalid(`the ${IDEMPOTENCY_HEADER} header is required: 8-128 characters of [A-Za-z0-9._:-]`);
      }
      if (request.events.length === 0 || request.events.length > MAX_BATCH_SIZE) {
        throw invalid(`a batch must contain from 1 to ${MAX_BATCH_SIZE} events`);
      }
      // The same event twice inside one batch would be counted twice by the materialized view.
      const unique = new Map<string, EventRow>();
      request.events.forEach((event, index) => {
        const row = toRow(event, `events[${index}]`);
        if (!unique.has(row.eventId)) unique.set(row.eventId, row);
      });
      await repo.insertBatch([...unique.values()], key, context.signal);
      return { accepted: unique.size };
    },

    async getPartnerDaily(request, context) {
      checkPartnerId(request.partnerId, "partner_id");
      checkRange(request.from, request.to);
      return { days: await repo.dailyStats(request.partnerId, request.from, request.to, context.signal) };
    },

    async listPartnerTotals(request, context) {
      checkRange(request.from, request.to);
      return { partners: await repo.partnerTotals(request.from, request.to, context.signal) };
    },
  };
}

function toRow(event: Event, path: string): EventRow {
  if (!UUID.test(event.eventId)) throw invalid(`${path}.event_id must be a UUID`);
  checkPartnerId(event.partnerId, `${path}.partner_id`);
  if (event.occurredAt === undefined) throw invalid(`${path}.occurred_at is required`);
  if (event.subId.length > MAX_SUB_ID_LENGTH) throw invalid(`${path}.sub_id must not exceed ${MAX_SUB_ID_LENGTH} characters`);
  if (event.revenueMinor < 0n) throw invalid(`${path}.revenue_minor must not be negative`);

  let type: EventKind;
  switch (event.type) {
    case EventType.CLICK:
      if (event.revenueMinor !== 0n) throw invalid(`${path}: a click carries no revenue`);
      type = "click";
      break;
    case EventType.CONVERSION:
      type = "conversion";
      break;
    default:
      throw invalid(`${path}.type must be CLICK or CONVERSION`);
  }

  return {
    eventId: event.eventId.toLowerCase(),
    partnerId: event.partnerId,
    type,
    occurredAt: timestampDate(event.occurredAt),
    revenueMinor: event.revenueMinor,
    subId: event.subId,
  };
}

function checkPartnerId(value: string, field: string): void {
  if (!PARTNER_ID.test(value)) throw invalid(`${field} must match ${PARTNER_ID.source}`);
}

function checkRange(from: string, to: string): void {
  const error = rangeError(from, to);
  if (error !== null) throw invalid(error);
}

function invalid(message: string): ConnectError {
  return new ConnectError(message, Code.InvalidArgument);
}

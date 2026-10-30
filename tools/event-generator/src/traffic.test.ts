import { describe, expect, it } from "vitest";
import { chunk, dayOfTraffic, pastDays, PARTNERS, uuidFrom, createRandom } from "./traffic.js";

const alpha = PARTNERS[0]!;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("dayOfTraffic", () => {
  it("is deterministic, so a repeated backfill sends the very same events", () => {
    expect(dayOfTraffic(alpha, "2026-10-01")).toEqual(dayOfTraffic(alpha, "2026-10-01"));
  });

  it("differs between days and partners", () => {
    const first = dayOfTraffic(alpha, "2026-10-01")[0]?.eventId;
    expect(dayOfTraffic(alpha, "2026-10-02")[0]?.eventId).not.toBe(first);
    expect(dayOfTraffic(PARTNERS[1]!, "2026-10-01")[0]?.eventId).not.toBe(first);
  });

  it("keeps every event inside the day and gives revenue to conversions only", () => {
    const events = dayOfTraffic(alpha, "2026-10-01");

    expect(events.every((event) => event.occurredAt.startsWith("2026-10-01"))).toBe(true);
    expect(events.filter((event) => event.type === "click").every((event) => event.revenueMinor === 0)).toBe(true);
    expect(events.filter((event) => event.type === "conversion").every((event) => event.revenueMinor > 0)).toBe(true);
  });

  it("produces roughly the configured volume and conversion rate", () => {
    const events = dayOfTraffic(alpha, "2026-10-01"); // a Thursday
    const clicks = events.filter((event) => event.type === "click").length;
    const conversions = events.length - clicks;

    expect(clicks).toBeGreaterThan(alpha.clicksPerDay * 0.8);
    expect(clicks).toBeLessThan(alpha.clicksPerDay * 1.2);
    expect(conversions / clicks).toBeGreaterThan(alpha.conversionRate / 2);
    expect(conversions / clicks).toBeLessThan(alpha.conversionRate * 2);
  });
});

describe("helpers", () => {
  it("builds valid version 4 UUIDs", () => {
    const random = createRandom(42);
    for (let i = 0; i < 100; i++) expect(uuidFrom(random)).toMatch(UUID_V4);
  });

  it("lists full past days, oldest first, without today", () => {
    expect(pastDays(3, Date.parse("2026-10-30T15:00:00Z"))).toEqual(["2026-10-27", "2026-10-28", "2026-10-29"]);
  });

  it("splits into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

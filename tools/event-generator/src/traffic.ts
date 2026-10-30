export interface PartnerProfile {
  id: string;
  clicksPerDay: number;
  conversionRate: number;
  averageOrderMinor: number;
  subIds: readonly string[];
}

/** Demo partners: they match seed/demo.sql of partners-api. */
export const PARTNERS: readonly PartnerProfile[] = [
  { id: "alpha", clicksPerDay: 2400, conversionRate: 0.032, averageOrderMinor: 250_000, subIds: ["tg-channel", "seo-blog", "youtube"] },
  { id: "beta", clicksPerDay: 1300, conversionRate: 0.051, averageOrderMinor: 180_000, subIds: ["vk-ads", "email"] },
  { id: "gamma", clicksPerDay: 600, conversionRate: 0.021, averageOrderMinor: 420_000, subIds: ["cashback"] },
];

export interface TrafficEvent {
  eventId: string;
  partnerId: string;
  type: "click" | "conversion";
  occurredAt: string;
  revenueMinor: number;
  subId: string;
}

const DAY_MS = 86_400_000;

/** mulberry32: a tiny seeded PRNG. The same seed always gives the same sequence. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** FNV-1a: turns a text such as "alpha:2026-10-01" into a seed. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A version 4 UUID built from the given random source instead of crypto. */
export function uuidFrom(random: () => number): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Traffic of one partner for one full UTC day. It is deterministic: generating the same day again
 * yields the same event ids, which is what makes a repeated backfill idempotent end to end.
 */
export function dayOfTraffic(partner: PartnerProfile, day: string): TrafficEvent[] {
  const random = createRandom(seedFrom(`${partner.id}:${day}`));
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const weekday = new Date(dayStart).getUTCDay();
  const weekendFactor = weekday === 0 || weekday === 6 ? 0.7 : 1;
  const clicks = Math.round(partner.clicksPerDay * weekendFactor * (0.85 + random() * 0.3));

  const events: TrafficEvent[] = [];
  for (let i = 0; i < clicks; i++) {
    const clickedAt = dayStart + Math.floor(random() * DAY_MS);
    const subId = partner.subIds[Math.floor(random() * partner.subIds.length)] ?? "";
    events.push({ eventId: uuidFrom(random), partnerId: partner.id, type: "click", occurredAt: iso(clickedAt), revenueMinor: 0, subId });

    if (random() < partner.conversionRate) {
      const convertedAt = Math.min(clickedAt + Math.floor(random() * 3_600_000), dayStart + DAY_MS - 1);
      const revenueMinor = Math.round((partner.averageOrderMinor * (0.5 + random())) / 100) * 100;
      events.push({ eventId: uuidFrom(random), partnerId: partner.id, type: "conversion", occurredAt: iso(convertedAt), revenueMinor, subId });
    }
  }
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/** A few seconds of live traffic: random ids, timestamps around now. */
export function liveTraffic(partner: PartnerProfile, now: number, eventsPerPartner: number, random: () => number = Math.random): TrafficEvent[] {
  const events: TrafficEvent[] = [];
  for (let i = 0; i < eventsPerPartner; i++) {
    const subId = partner.subIds[Math.floor(random() * partner.subIds.length)] ?? "";
    const occurredAt = iso(now - Math.floor(random() * 2_000));
    events.push({ eventId: uuidFrom(random), partnerId: partner.id, type: "click", occurredAt, revenueMinor: 0, subId });
    if (random() < partner.conversionRate) {
      const revenueMinor = Math.round((partner.averageOrderMinor * (0.5 + random())) / 100) * 100;
      events.push({ eventId: uuidFrom(random), partnerId: partner.id, type: "conversion", occurredAt, revenueMinor, subId });
    }
  }
  return events;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Full UTC days before today, oldest first. Today is left to the live mode. */
export function pastDays(count: number, now: number): string[] {
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  return Array.from({ length: count }, (_, i) => iso(today - (count - i) * DAY_MS).slice(0, 10));
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

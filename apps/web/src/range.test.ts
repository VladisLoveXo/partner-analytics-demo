import { describe, expect, it } from "vitest";
import { rangeDates } from "./range";

describe("rangeDates", () => {
  const now = new Date("2026-10-30T22:30:00Z");

  it("counts today as the last day of the range", () => {
    expect(rangeDates("7d", now)).toEqual({ from: "2026-10-24", to: "2026-10-30" });
  });

  it("crosses month boundaries", () => {
    expect(rangeDates("30d", now)).toEqual({ from: "2026-10-01", to: "2026-10-30" });
    expect(rangeDates("90d", now)).toEqual({ from: "2026-08-02", to: "2026-10-30" });
  });

  it("uses the UTC date, like the API", () => {
    // 01:30 in Novosibirsk on October 31 is still October 30 in UTC.
    expect(rangeDates("7d", new Date("2026-10-30T18:30:00Z")).to).toBe("2026-10-30");
  });
});

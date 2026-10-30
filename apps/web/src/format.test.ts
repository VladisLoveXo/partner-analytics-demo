import { describe, expect, it } from "vitest";
import { earningsPerClick, formatDay, formatNumber, formatPercent, formatRubles } from "./format";

// Russian number formatting separates groups with a non-breaking space.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("format", () => {
  it("groups thousands the Russian way", () => {
    expect(plain(formatNumber(1234567))).toBe("1 234 567");
  });

  it("shows kopecks as rubles", () => {
    expect(plain(formatRubles(1_250_000))).toBe("12 500 ₽");
  });

  it("formats the conversion rate with two decimals", () => {
    expect(plain(formatPercent(0.0325))).toBe("3,25 %");
  });

  it("shortens dates for the axis", () => {
    expect(formatDay("2026-10-07")).toBe("07.10");
  });

  it("computes earnings per click without dividing by zero", () => {
    expect(earningsPerClick(10_000, 4)).toBe(2_500);
    expect(earningsPerClick(10_000, 0)).toBe(0);
  });
});

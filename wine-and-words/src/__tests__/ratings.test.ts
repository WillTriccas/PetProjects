import { describe, it, expect } from "vitest";
import { aggregate, roundToHalf, formatRating, starBreakdown } from "@/lib/domain/ratings";

describe("roundToHalf", () => {
  it("rounds to the nearest half star", () => {
    expect(roundToHalf(3.2)).toBe(3);
    expect(roundToHalf(3.3)).toBe(3.5);
    expect(roundToHalf(3.76)).toBe(4);
  });

  it("clamps values below 1 and above 5", () => {
    expect(roundToHalf(0)).toBe(1);
    expect(roundToHalf(-3)).toBe(1);
    expect(roundToHalf(7)).toBe(5);
  });
});

describe("formatRating", () => {
  it("always shows one decimal place", () => {
    expect(formatRating(4)).toBe("4.0");
    expect(formatRating(3.5)).toBe("3.5");
  });
});

describe("aggregate", () => {
  it("returns zeroed result for an empty list", () => {
    expect(aggregate([])).toEqual({ average: 0, count: 0, distribution: {} });
  });

  it("computes average, count, and distribution with ties", () => {
    const result = aggregate([4, 4, 5, 3.5, 3.5]);
    expect(result.count).toBe(5);
    // (4+4+5+3.5+3.5)/5 = 4
    expect(result.average).toBe(4);
    expect(result.distribution).toEqual({ "4.0": 2, "5.0": 1, "3.5": 2 });
  });

  it("rounds raw ratings to the nearest half-star before aggregating", () => {
    const result = aggregate([3.24, 3.26]);
    // 3.24 -> 3.0, 3.26 -> 3.5
    expect(result.distribution).toEqual({ "3.0": 1, "3.5": 1 });
    expect(result.average).toBe(3.25);
  });

  it("handles a realistic mixed set with a repeating decimal average", () => {
    const result = aggregate([5, 5, 4, 3]);
    expect(result.average).toBe(4.25);
    expect(result.count).toBe(4);
  });
});

describe("starBreakdown", () => {
  it("buckets ratings into whole stars and computes percentages", () => {
    const breakdown = starBreakdown([5, 5, 4, 4, 4, 3]);
    const five = breakdown.find((b) => b.stars === 5)!;
    const four = breakdown.find((b) => b.stars === 4)!;
    const three = breakdown.find((b) => b.stars === 3)!;
    const two = breakdown.find((b) => b.stars === 2)!;

    expect(five.count).toBe(2);
    expect(four.count).toBe(3);
    expect(three.count).toBe(1);
    expect(two.count).toBe(0);

    // percentages should sum to 100
    const total = breakdown.reduce((sum, b) => sum + b.pct, 0);
    expect(Math.round(total)).toBe(100);
  });

  it("returns all five buckets even when empty", () => {
    const breakdown = starBreakdown([]);
    expect(breakdown).toHaveLength(5);
    expect(breakdown.every((b) => b.count === 0 && b.pct === 0)).toBe(true);
  });

  it("rounds half-star ratings up into the nearest whole-star bucket", () => {
    // 3.5 rounds to bucket 4 via Math.round
    const breakdown = starBreakdown([3.5]);
    const four = breakdown.find((b) => b.stars === 4)!;
    expect(four.count).toBe(1);
  });
});

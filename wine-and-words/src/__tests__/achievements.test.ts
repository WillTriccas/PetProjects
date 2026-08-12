import { describe, it, expect } from "vitest";
import {
  computeStreak,
  findAnniversaries,
  popularMonth,
  computeAchievements,
} from "@/lib/domain/achievements";

describe("computeStreak", () => {
  it("returns 0 for no attended events", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("returns 1 for a single attended event", () => {
    expect(computeStreak([new Date("2024-01-10")])).toBe(1);
  });

  it("counts consecutive monthly meetings as a streak", () => {
    const dates = [
      new Date("2024-01-10"),
      new Date("2024-02-14"),
      new Date("2024-03-12"),
      new Date("2024-04-09"),
    ];
    expect(computeStreak(dates)).toBe(4);
  });

  it("breaks the streak when there is a large gap, counting only the recent run", () => {
    const dates = [
      new Date("2023-01-10"), // long gap before this
      new Date("2024-02-14"),
      new Date("2024-03-12"),
      new Date("2024-04-09"),
    ];
    expect(computeStreak(dates)).toBe(3);
  });

  it("is order-independent (sorts internally)", () => {
    const dates = [
      new Date("2024-04-09"),
      new Date("2024-01-10"),
      new Date("2024-03-12"),
      new Date("2024-02-14"),
    ];
    expect(computeStreak(dates)).toBe(4);
  });
});

describe("findAnniversaries", () => {
  it("detects a 1-year anniversary on the exact date", () => {
    const joined = new Date("2023-06-15T00:00:00Z");
    const now = new Date("2024-06-15T00:00:00Z");
    const result = findAnniversaries(joined, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.years).toBe(1);
    expect(result[0]!.label).toContain("1 Year");
  });

  it("detects an anniversary within a few days window", () => {
    const joined = new Date("2022-03-01T00:00:00Z");
    const now = new Date("2024-03-03T00:00:00Z");
    const result = findAnniversaries(joined, now);
    expect(result.some((a) => a.years === 2)).toBe(true);
  });

  it("returns an empty array when no anniversary is near", () => {
    const joined = new Date("2023-06-15T00:00:00Z");
    const now = new Date("2024-01-01T00:00:00Z");
    expect(findAnniversaries(joined, now)).toEqual([]);
  });

  it("pluralizes the label for multi-year anniversaries", () => {
    const joined = new Date("2020-09-01T00:00:00Z");
    const now = new Date("2024-09-01T00:00:00Z");
    const result = findAnniversaries(joined, now);
    expect(result[0]!.label).toContain("4 Years");
  });
});

describe("popularMonth", () => {
  it("returns null for an empty list", () => {
    expect(popularMonth([])).toBeNull();
  });

  it("finds the month with the most events", () => {
    const dates = [
      new Date("2023-01-05"),
      new Date("2023-03-10"),
      new Date("2023-03-20"),
      new Date("2024-03-01"),
    ];
    const result = popularMonth(dates);
    expect(result).toEqual({ month: "March", count: 3 });
  });

  it("breaks ties by choosing the earlier calendar month", () => {
    const dates = [
      new Date("2023-06-01"), // June
      new Date("2023-02-01"), // February
      new Date("2024-06-01"), // June
      new Date("2024-02-01"), // February
    ];
    // June and February are tied at 2 each; February comes first in the year
    const result = popularMonth(dates);
    expect(result).toEqual({ month: "February", count: 2 });
  });
});

describe("computeAchievements", () => {
  it("returns no achievements for a brand new member", () => {
    const result = computeAchievements({}, 0, 0, 0);
    expect(result).toEqual([]);
  });

  it("unlocks first_event after a single attendance", () => {
    const result = computeAchievements({}, 1, 0, 1);
    expect(result.map((a) => a.id)).toContain("first_event");
  });

  it("unlocks regular and on_a_roll thresholds together", () => {
    const result = computeAchievements({}, 5, 2, 3);
    const ids = result.map((a) => a.id);
    expect(ids).toContain("regular");
    expect(ids).toContain("on_a_roll");
    expect(ids).not.toContain("veteran");
    expect(ids).not.toContain("unstoppable");
  });

  it("unlocks all achievements for a highly active veteran critic", () => {
    const result = computeAchievements({}, 25, 25, 8);
    const ids = result.map((a) => a.id);
    expect(ids).toEqual([
      "first_event",
      "regular",
      "veteran",
      "critic",
      "prolific_critic",
      "on_a_roll",
      "unstoppable",
    ]);
  });
});

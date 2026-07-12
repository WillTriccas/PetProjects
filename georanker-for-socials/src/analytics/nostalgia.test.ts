import { describe, it, expect } from "vitest";
import {
  computeMonthlyChampions,
  computeBridesmaids,
  computeGroupPB,
  findOnThisDay,
  findThisTimeLastMonth,
  pickNostalgiaInterval,
  daysBetweenIso,
  type DayScore,
  type DecidedRound,
} from "./stats.js";
import { formatOnThisDay, formatThisTimeLastMonth } from "./format.js";

const ds = (
  playerId: number,
  displayName: string,
  score: number,
  gameDate: string,
): DayScore => ({ playerId, displayName, score, submittedAt: null, gameDate });

const round = (gameDate: string, winnerPlayerId: number, winnerName: string): DecidedRound => ({
  gameDate,
  winnerPlayerId,
  winnerName,
});

describe("computeMonthlyChampions", () => {
  it("picks the winning-most player per month, oldest first", () => {
    const champs = computeMonthlyChampions([
      round("2026-06-01", 1, "Alice"),
      round("2026-06-02", 1, "Alice"),
      round("2026-06-03", 2, "Bob"),
      round("2026-07-01", 2, "Bob"),
      round("2026-07-02", 2, "Bob"),
      round("2026-07-03", 1, "Alice"),
    ]);
    expect(champs).toHaveLength(2);
    expect(champs[0]).toMatchObject({ month: "2026-06", displayName: "Alice", wins: 2 });
    expect(champs[1]).toMatchObject({ month: "2026-07", displayName: "Bob", wins: 2 });
  });

  it("returns nothing with no rounds", () => {
    expect(computeMonthlyChampions([])).toEqual([]);
  });
});

describe("computeBridesmaids", () => {
  it("counts sole runner-up finishes per player", () => {
    const scores = [
      // Day 1: Alice 100, Bob 90 (sole 2nd), Charlie 50
      ds(1, "Alice", 100, "2026-07-01"),
      ds(2, "Bob", 90, "2026-07-01"),
      ds(3, "Charlie", 50, "2026-07-01"),
      // Day 2: Charlie 100, Bob 80 (sole 2nd), Alice 60
      ds(3, "Charlie", 100, "2026-07-02"),
      ds(2, "Bob", 80, "2026-07-02"),
      ds(1, "Alice", 60, "2026-07-02"),
    ];
    const b = computeBridesmaids(scores);
    expect(b.get(2)?.count).toBe(2); // Bob is the perennial bridesmaid
    expect(b.get(1)).toBeUndefined();
  });

  it("ignores tied runner-up days", () => {
    const scores = [
      ds(1, "Alice", 100, "2026-07-01"),
      ds(2, "Bob", 80, "2026-07-01"),
      ds(3, "Charlie", 80, "2026-07-01"), // tied 2nd → nobody earns it
    ];
    expect(computeBridesmaids(scores).size).toBe(0);
  });
});

describe("computeGroupPB", () => {
  it("finds the day with the highest combined score", () => {
    const scores = [
      ds(1, "Alice", 100, "2026-07-01"),
      ds(2, "Bob", 50, "2026-07-01"),
      ds(1, "Alice", 200, "2026-07-02"),
      ds(2, "Bob", 250, "2026-07-02"),
    ];
    const pb = computeGroupPB(scores);
    expect(pb?.gameDate).toBe("2026-07-02");
    expect(pb?.total).toBe(450);
    expect(pb?.contributors[0]).toMatchObject({ displayName: "Bob", score: 250 });
  });
});

describe("findOnThisDay", () => {
  it("surfaces the same calendar date in a previous year", () => {
    const all = [ds(1, "Alice", 120, "2025-07-12"), ds(2, "Bob", 90, "2025-07-12")];
    const decided = [round("2025-07-12", 1, "Alice")];
    const notes = findOnThisDay(decided, all, "2026-07-12");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ yearsAgo: 1, winnerName: "Alice", topScore: 120 });
  });

  it("ignores dates that aren't a true anniversary", () => {
    const all = [ds(1, "Alice", 120, "2026-06-12")];
    expect(findOnThisDay([], all, "2026-07-12")).toEqual([]);
  });
});

describe("findThisTimeLastMonth", () => {
  it("finds the game nearest one month ago within tolerance", () => {
    const all = [ds(1, "Alice", 111, "2026-06-13"), ds(2, "Bob", 90, "2026-06-13")];
    const decided = [round("2026-06-13", 1, "Alice")];
    const note = findThisTimeLastMonth(decided, all, "2026-07-12");
    expect(note?.gameDate).toBe("2026-06-13");
    expect(note?.winnerName).toBe("Alice");
    expect(note?.topScore).toBe(111);
  });

  it("returns null when nothing is near a month ago", () => {
    const all = [ds(1, "Alice", 100, "2026-07-01")];
    expect(findThisTimeLastMonth([], all, "2026-07-12")).toBeNull();
  });
});

describe("pickNostalgiaInterval", () => {
  it("stays within [30, 62] and centres on ~46", () => {
    expect(pickNostalgiaInterval(() => 0)).toBe(30);
    expect(pickNostalgiaInterval(() => 0.999999)).toBe(62);
    expect(pickNostalgiaInterval(() => 0.5)).toBe(46);
  });
});

describe("daysBetweenIso", () => {
  it("counts whole days between dates", () => {
    expect(daysBetweenIso("2026-07-01", "2026-07-12")).toBe(11);
    expect(daysBetweenIso("2026-07-12", "2026-07-01")).toBe(-11);
  });
});

describe("nostalgia formatting", () => {
  it("formats an on-this-day anniversary", () => {
    const text = formatOnThisDay([
      { gameDate: "2025-07-12", daysAgo: 365, yearsAgo: 1, winnerName: "Alice", topName: "Alice", topScore: 120 },
    ]);
    expect(text).toContain("On this day");
    expect(text).toContain("A year ago today");
    expect(text).toContain("Alice");
  });

  it("formats a this-time-last-month memory", () => {
    const text = formatThisTimeLastMonth({
      gameDate: "2026-06-13",
      daysAgo: 29,
      winnerName: "Bob",
      topName: "Bob",
      topScore: 111,
    });
    expect(text).toContain("This time last month");
    expect(text).toContain("Bob");
    expect(text).toContain("2026-06-13");
  });

  it("returns empty strings when there's nothing to say", () => {
    expect(formatOnThisDay([])).toBe("");
    expect(formatThisTimeLastMonth(null)).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import {
  buildDayReport,
  computeAverages,
  computeForm,
  computeLongestDrought,
  computeStreaks,
  computeWoodenSpoons,
  computeFingerLeague,
  secondsOfDay,
  type DayScore,
  type DecidedRound,
} from "./stats.js";

const ds = (
  playerId: number,
  displayName: string,
  score: number,
  submittedAt: string | null = null,
  gameDate?: string,
): DayScore => ({ playerId, displayName, score, submittedAt, gameDate });

describe("secondsOfDay", () => {
  it("parses a timestamp into seconds since midnight", () => {
    expect(secondsOfDay("2026-07-12 18:23:45")).toBe(18 * 3600 + 23 * 60 + 45);
    expect(secondsOfDay(null)).toBeNull();
    expect(secondsOfDay("no time here")).toBeNull();
  });
});

describe("buildDayReport", () => {
  it("finds top, wooden spoon, margin, fastest and slowest", () => {
    const scores = [
      ds(1, "Alice", 100, "2026-07-12 18:00:00"),
      ds(2, "Bob", 80, "2026-07-12 17:30:00"),
      ds(3, "Charlie", 50, "2026-07-12 19:45:00"),
    ];
    const r = buildDayReport(scores);
    expect(r.topScore).toBe(100);
    expect(r.topHolders.map((h) => h.displayName)).toEqual(["Alice"]);
    expect(r.lowest?.displayName).toBe("Charlie");
    expect(r.margin).toBe(20);
    expect(r.fastest?.displayName).toBe("Bob");
    expect(r.slowest?.displayName).toBe("Charlie");
  });

  it("reports shared top holders and no margin on a tie", () => {
    const r = buildDayReport([ds(1, "Alice", 100), ds(2, "Bob", 100)]);
    expect(r.topHolders).toHaveLength(2);
    expect(r.margin).toBeNull();
  });

  it("ignores missing timestamps for fastest/slowest", () => {
    const r = buildDayReport([ds(1, "Alice", 100), ds(2, "Bob", 80)]);
    expect(r.fastest).toBeNull();
    expect(r.slowest).toBeNull();
  });
});

describe("computeStreaks", () => {
  it("tracks current and longest win streaks", () => {
    const rounds: DecidedRound[] = [
      { gameDate: "2026-07-01", winnerPlayerId: 1, winnerName: "Alice" },
      { gameDate: "2026-07-02", winnerPlayerId: 1, winnerName: "Alice" },
      { gameDate: "2026-07-03", winnerPlayerId: 2, winnerName: "Bob" },
      { gameDate: "2026-07-04", winnerPlayerId: 2, winnerName: "Bob" },
      { gameDate: "2026-07-05", winnerPlayerId: 2, winnerName: "Bob" },
    ];
    const streaks = computeStreaks(rounds);
    const bob = streaks.find((s) => s.playerId === 2)!;
    const alice = streaks.find((s) => s.playerId === 1)!;
    expect(bob.current).toBe(3);
    expect(bob.longest).toBe(3);
    expect(alice.current).toBe(0);
    expect(alice.longest).toBe(2);
  });
});

describe("computeForm", () => {
  it("counts wins within the last 7 days of play", () => {
    const rounds: DecidedRound[] = [
      { gameDate: "2026-07-01", winnerPlayerId: 1, winnerName: "Alice" },
      { gameDate: "2026-07-10", winnerPlayerId: 1, winnerName: "Alice" },
      { gameDate: "2026-07-12", winnerPlayerId: 2, winnerName: "Bob" },
    ];
    const form = computeForm(rounds, 7);
    expect(form.get(1)).toBe(1); // only 2026-07-10 falls in the last 7 days
    expect(form.get(2)).toBe(1);
  });
});

describe("computeAverages", () => {
  it("computes average, best and worst per player", () => {
    const all = [
      ds(1, "Alice", 100, null, "2026-07-01"),
      ds(1, "Alice", 50, null, "2026-07-02"),
      ds(2, "Bob", 60, null, "2026-07-01"),
    ];
    const avgs = computeAverages(all);
    const alice = avgs.find((a) => a.playerId === 1)!;
    expect(alice.average).toBe(75);
    expect(alice.best).toBe(100);
    expect(alice.worst).toBe(50);
    expect(alice.games).toBe(2);
  });
});

describe("computeWoodenSpoons", () => {
  it("only counts a sole last place per day", () => {
    const all = [
      // Day 1: Charlie sole last
      ds(1, "Alice", 100, null, "2026-07-01"),
      ds(2, "Bob", 80, null, "2026-07-01"),
      ds(3, "Charlie", 50, null, "2026-07-01"),
      // Day 2: Bob & Charlie tie for last -> no spoon awarded
      ds(1, "Alice", 100, null, "2026-07-02"),
      ds(2, "Bob", 40, null, "2026-07-02"),
      ds(3, "Charlie", 40, null, "2026-07-02"),
    ];
    const spoons = computeWoodenSpoons(all);
    expect(spoons.get(3)?.count).toBe(1);
    expect(spoons.get(2)).toBeUndefined();
  });
});

describe("computeFingerLeague", () => {
  it("ranks players by average submission time", () => {
    const all = [
      ds(1, "Alice", 100, "2026-07-01 08:00:00", "2026-07-01"),
      ds(2, "Bob", 80, "2026-07-01 22:00:00", "2026-07-01"),
    ];
    const league = computeFingerLeague(all);
    expect(league[0]!.displayName).toBe("Alice");
    expect(league[league.length - 1]!.displayName).toBe("Bob");
  });
});

describe("computeLongestDrought", () => {
  it("finds the longest winless run", () => {
    const rounds: DecidedRound[] = [
      { gameDate: "2026-07-01", winnerPlayerId: 1, winnerName: "Alice" },
      { gameDate: "2026-07-02", winnerPlayerId: 2, winnerName: "Bob" },
      { gameDate: "2026-07-03", winnerPlayerId: 2, winnerName: "Bob" },
      { gameDate: "2026-07-04", winnerPlayerId: 2, winnerName: "Bob" },
      { gameDate: "2026-07-05", winnerPlayerId: 1, winnerName: "Alice" },
    ];
    const drought = computeLongestDrought(rounds);
    expect(drought?.displayName).toBe("Alice");
    expect(drought?.drought).toBe(3);
  });
});

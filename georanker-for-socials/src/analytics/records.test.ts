import { describe, it, expect } from "vitest";
import {
  candidatesFromDayReport,
  evaluateRecords,
  type RecordKey,
} from "./records.js";
import { buildDayReport, type DayScore } from "./stats.js";

const fmt = (n: number) => n.toLocaleString("en-US");

const ds = (
  playerId: number,
  displayName: string,
  score: number,
  submittedAt: string | null = null,
): DayScore => ({ playerId, displayName, score, submittedAt });

describe("candidatesFromDayReport", () => {
  it("derives highest, lowest, margin and time candidates", () => {
    const report = buildDayReport([
      ds(1, "Alice", 100, "2026-07-12 18:00:00"),
      ds(2, "Bob", 60, "2026-07-12 17:00:00"),
    ]);
    const candidates = candidatesFromDayReport(report, fmt);
    const byKey = new Map(candidates.map((c) => [c.key, c]));
    expect(byKey.get("highest_score")?.metric).toBe(100);
    expect(byKey.get("lowest_score")?.metric).toBe(60);
    expect(byKey.get("biggest_margin")?.metric).toBe(40);
    expect(byKey.get("earliest_submission")?.detail).toBe("17:00");
    expect(byKey.get("latest_submission")?.detail).toBe("18:00");
  });
});

describe("evaluateRecords", () => {
  it("seeds silently on first data (no announced breaks)", () => {
    const candidates = candidatesFromDayReport(
      buildDayReport([ds(1, "Alice", 100), ds(2, "Bob", 50)]),
      fmt,
    );
    const { breaks, updates } = evaluateRecords(candidates, new Map());
    expect(breaks).toHaveLength(0);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("announces a break only when an existing record is beaten", () => {
    const candidates = candidatesFromDayReport(
      buildDayReport([ds(1, "Alice", 120), ds(2, "Bob", 50)]),
      fmt,
    );
    const existing = new Map<RecordKey, number>([
      ["highest_score", 100],
      ["lowest_score", 40],
    ]);
    const { breaks } = evaluateRecords(candidates, existing);
    const keys = breaks.map((b) => b.key);
    expect(keys).toContain("highest_score"); // 120 > 100
    expect(keys).not.toContain("lowest_score"); // 50 is not below 40
  });

  it("treats a lower lowest-score as a (shameful) record", () => {
    const candidates = candidatesFromDayReport(
      buildDayReport([ds(1, "Alice", 100), ds(2, "Bob", 10)]),
      fmt,
    );
    const existing = new Map<RecordKey, number>([["lowest_score", 30]]);
    const { breaks } = evaluateRecords(candidates, existing);
    expect(breaks.some((b) => b.key === "lowest_score" && b.displayName === "Bob")).toBe(true);
  });
});

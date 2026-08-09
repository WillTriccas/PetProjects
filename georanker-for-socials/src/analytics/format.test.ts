import { describe, it, expect } from "vitest";
import { formatDayExtras, formatRecordBreaks } from "./format.js";
import { buildDayReport, type DayScore } from "./stats.js";
import type { RecordBreak } from "./records.js";

const ds = (
  playerId: number,
  displayName: string,
  score: number,
  submittedAt: string | null = null,
): DayScore => ({ playerId, displayName, score, submittedAt });

describe("formatDayExtras", () => {
  it("calls out the wooden spoon and fastest finger, excluding the winner", () => {
    const report = buildDayReport([
      ds(1, "Alice", 100, "2026-07-12 18:00:00"),
      ds(2, "Bob", 80, "2026-07-12 17:30:00"),
      ds(3, "Charlie", 50, "2026-07-12 19:45:00"),
    ]);
    const text = formatDayExtras(report, 1);
    expect(text).toContain("🥄");
    expect(text).toContain("Charlie");
    expect(text).toContain("⏱️");
    expect(text).toContain("Bob");
    expect(text).toContain("17:30");
  });

  it("does not name the winner as wooden spoon", () => {
    const report = buildDayReport([ds(1, "Alice", 100), ds(2, "Bob", 80)]);
    // Alice both wins and is not last; Bob is last.
    const text = formatDayExtras(report, 1);
    expect(text).toContain("Bob");
  });
});

describe("formatRecordBreaks", () => {
  it("renders NEW RECORD lines", () => {
    const breaks: RecordBreak[] = [
      {
        key: "highest_score",
        emoji: "🚀",
        label: "highest score ever",
        displayName: "Alice",
        detail: "9,050",
        previousMetric: 8000,
      },
    ];
    const text = formatRecordBreaks(breaks);
    expect(text).toContain("NEW RECORD");
    expect(text).toContain("Alice");
    expect(text).toContain("9,050");
  });

  it("returns an empty string when nothing was broken", () => {
    expect(formatRecordBreaks([])).toBe("");
  });
});

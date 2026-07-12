/**
 * All-time "hall of records" logic. Pure functions decide whether a day's
 * numbers beat the existing records; the StatsService persists updates and the
 * announcer calls out any that were broken.
 */

import type { DayReport } from "./stats.js";

export type RecordKey =
  | "highest_score"
  | "lowest_score"
  | "earliest_submission"
  | "latest_submission"
  | "biggest_margin";

export interface RecordDefinition {
  key: RecordKey;
  /** "high" = bigger metric is better; "low" = smaller metric is the record. */
  direction: "high" | "low";
  emoji: string;
  /** How to describe the record when broken. */
  label: string;
}

export const RECORD_DEFINITIONS: RecordDefinition[] = [
  { key: "highest_score", direction: "high", emoji: "🚀", label: "highest score ever" },
  { key: "lowest_score", direction: "low", emoji: "💩", label: "lowest score ever" },
  { key: "earliest_submission", direction: "low", emoji: "🌅", label: "earliest submission ever" },
  { key: "latest_submission", direction: "high", emoji: "🦉", label: "latest submission ever" },
  { key: "biggest_margin", direction: "high", emoji: "💥", label: "biggest winning margin ever" },
];

export interface RecordCandidate {
  key: RecordKey;
  metric: number;
  playerId: number;
  displayName: string;
  /** Human-friendly value for the announcement (e.g. "18:42" or "9,050"). */
  detail: string;
}

export interface RecordBreak {
  key: RecordKey;
  emoji: string;
  label: string;
  displayName: string;
  detail: string;
  /** null when this is the first time the record is being set (seeded silently). */
  previousMetric: number | null;
}

export interface RecordUpdate {
  key: RecordKey;
  metric: number;
  playerId: number;
  detail: string;
}

const DEF_BY_KEY = new Map(RECORD_DEFINITIONS.map((d) => [d.key, d]));

function beats(direction: "high" | "low", candidate: number, existing: number): boolean {
  return direction === "high" ? candidate > existing : candidate < existing;
}

/**
 * Compare a day's candidate records against the existing ones.
 * @returns the records that were broken (to announce) and the updates to persist.
 *   The very first value for a record is seeded (persisted) but NOT announced.
 */
export function evaluateRecords(
  candidates: RecordCandidate[],
  existing: Map<RecordKey, number>,
): { breaks: RecordBreak[]; updates: RecordUpdate[] } {
  const breaks: RecordBreak[] = [];
  const updates: RecordUpdate[] = [];

  for (const c of candidates) {
    const def = DEF_BY_KEY.get(c.key);
    if (!def) continue;
    const prev = existing.get(c.key);

    if (prev === undefined) {
      // Seed the record silently — no "NEW RECORD" on the first ever data point.
      updates.push({ key: c.key, metric: c.metric, playerId: c.playerId, detail: c.detail });
      continue;
    }
    if (beats(def.direction, c.metric, prev)) {
      breaks.push({
        key: c.key,
        emoji: def.emoji,
        label: def.label,
        displayName: c.displayName,
        detail: c.detail,
        previousMetric: prev,
      });
      updates.push({ key: c.key, metric: c.metric, playerId: c.playerId, detail: c.detail });
    }
  }

  return { breaks, updates };
}

/** Build the record candidates for a resolved day from its report. */
export function candidatesFromDayReport(
  report: DayReport,
  formatScore: (n: number) => string,
): RecordCandidate[] {
  const candidates: RecordCandidate[] = [];
  const topHolder = report.topHolders[0];

  if (report.topScore !== null && topHolder) {
    candidates.push({
      key: "highest_score",
      metric: report.topScore,
      playerId: topHolder.playerId,
      displayName: topHolder.displayName,
      detail: formatScore(report.topScore),
    });
  }
  if (report.lowest) {
    candidates.push({
      key: "lowest_score",
      metric: report.lowest.score,
      playerId: report.lowest.playerId,
      displayName: report.lowest.displayName,
      detail: formatScore(report.lowest.score),
    });
  }
  if (report.fastest) {
    candidates.push({
      key: "earliest_submission",
      metric: report.fastest.seconds,
      playerId: report.fastest.playerId,
      displayName: report.fastest.displayName,
      detail: report.fastest.submittedAt.slice(11, 16),
    });
  }
  if (report.slowest) {
    candidates.push({
      key: "latest_submission",
      metric: report.slowest.seconds,
      playerId: report.slowest.playerId,
      displayName: report.slowest.displayName,
      detail: report.slowest.submittedAt.slice(11, 16),
    });
  }
  if (report.margin !== null && report.margin > 0 && topHolder) {
    candidates.push({
      key: "biggest_margin",
      metric: report.margin,
      playerId: topHolder.playerId,
      displayName: topHolder.displayName,
      detail: formatScore(report.margin),
    });
  }
  return candidates;
}

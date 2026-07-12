/**
 * Pure analytics computations. Everything here operates on plain data (no DB,
 * no I/O) so it is trivially unit-testable. The StatsService wires these up to
 * the repository and the announcer.
 */

import type { PlayerScore } from "../db/models.js";

export type DayScore = PlayerScore & { gameDate?: string };

/** Seconds since local midnight for a "YYYY-MM-DD HH:MM:SS" stamp, or null. */
export function secondsOfDay(submittedAt: string | null | undefined): number | null {
  if (!submittedAt) return null;
  const m = /(\d{2}):(\d{2}):(\d{2})/.exec(submittedAt);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** "HH:MM" from a "YYYY-MM-DD HH:MM:SS" stamp, or null. */
export function hhmm(submittedAt: string | null | undefined): string | null {
  if (!submittedAt) return null;
  const m = /(\d{2}):(\d{2}):\d{2}/.exec(submittedAt);
  return m ? `${m[1]}:${m[2]}` : null;
}

export interface DayExtreme {
  playerId: number;
  displayName: string;
  score: number;
}

export interface DaySubmissionTime {
  playerId: number;
  displayName: string;
  submittedAt: string;
  seconds: number;
}

export interface DayReport {
  topScore: number | null;
  topHolders: DayExtreme[];
  lowest: DayExtreme | null;
  /** Winning margin over the next-best distinct score (level-0), if any. */
  margin: number | null;
  fastest: DaySubmissionTime | null;
  slowest: DaySubmissionTime | null;
}

/** Build a per-day report from the level-0 scores of a single round. */
export function buildDayReport(scores: DayScore[]): DayReport {
  if (scores.length === 0) {
    return { topScore: null, topHolders: [], lowest: null, margin: null, fastest: null, slowest: null };
  }
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]!.score;
  const topHolders = sorted
    .filter((s) => s.score === topScore)
    .map((s) => ({ playerId: s.playerId, displayName: s.displayName, score: s.score }));

  const lowestEntry = sorted[sorted.length - 1]!;
  const lowest: DayExtreme = {
    playerId: lowestEntry.playerId,
    displayName: lowestEntry.displayName,
    score: lowestEntry.score,
  };

  const nextBest = sorted.find((s) => s.score < topScore);
  const margin = nextBest ? topScore - nextBest.score : null;

  const times: DaySubmissionTime[] = scores
    .map((s) => {
      const seconds = secondsOfDay(s.submittedAt);
      return seconds === null || !s.submittedAt
        ? null
        : { playerId: s.playerId, displayName: s.displayName, submittedAt: s.submittedAt, seconds };
    })
    .filter((t): t is DaySubmissionTime => t !== null);

  let fastest: DaySubmissionTime | null = null;
  let slowest: DaySubmissionTime | null = null;
  for (const t of times) {
    if (!fastest || t.seconds < fastest.seconds) fastest = t;
    if (!slowest || t.seconds > slowest.seconds) slowest = t;
  }

  return { topScore, topHolders, lowest, margin, fastest, slowest };
}

// ─────────────────────────── Digest computations ───────────────────────────

export interface DecidedRound {
  gameDate: string;
  winnerPlayerId: number;
  winnerName: string;
}

export interface StreakInfo {
  playerId: number;
  displayName: string;
  current: number;
  longest: number;
}

/** Per-player current and longest win streaks, computed over decided rounds. */
export function computeStreaks(rounds: DecidedRound[]): StreakInfo[] {
  const names = new Map<number, string>();
  for (const r of rounds) names.set(r.winnerPlayerId, r.winnerName);

  const longest = new Map<number, number>();
  const current = new Map<number, number>();
  let running: { playerId: number; len: number } | null = null;

  for (const r of rounds) {
    if (running && running.playerId === r.winnerPlayerId) {
      running.len += 1;
    } else {
      running = { playerId: r.winnerPlayerId, len: 1 };
    }
    longest.set(running.playerId, Math.max(longest.get(running.playerId) ?? 0, running.len));
  }
  // Current streak belongs only to whoever won the most recent decided round.
  if (rounds.length > 0) {
    const last = rounds[rounds.length - 1]!;
    let len = 0;
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i]!.winnerPlayerId === last.winnerPlayerId) len += 1;
      else break;
    }
    current.set(last.winnerPlayerId, len);
  }

  return [...names.entries()].map(([playerId, displayName]) => ({
    playerId,
    displayName,
    current: current.get(playerId) ?? 0,
    longest: longest.get(playerId) ?? 0,
  }));
}

/** Number of wins per player within the last `days` calendar days of play. */
export function computeForm(rounds: DecidedRound[], days = 7): Map<number, number> {
  const form = new Map<number, number>();
  if (rounds.length === 0) return form;
  const latest = rounds[rounds.length - 1]!.gameDate;
  const cutoff = new Date(`${latest}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  for (const r of rounds) {
    if (new Date(`${r.gameDate}T00:00:00Z`) >= cutoff) {
      form.set(r.winnerPlayerId, (form.get(r.winnerPlayerId) ?? 0) + 1);
    }
  }
  return form;
}

export interface PlayerAverage {
  playerId: number;
  displayName: string;
  games: number;
  average: number;
  best: number;
  worst: number;
}

/** Average / best / worst level-0 score per player across all history. */
export function computeAverages(all: DayScore[]): PlayerAverage[] {
  const byPlayer = new Map<number, { name: string; scores: number[] }>();
  for (const s of all) {
    const e = byPlayer.get(s.playerId) ?? { name: s.displayName, scores: [] };
    e.scores.push(s.score);
    byPlayer.set(s.playerId, e);
  }
  return [...byPlayer.entries()]
    .map(([playerId, e]) => ({
      playerId,
      displayName: e.name,
      games: e.scores.length,
      average: e.scores.reduce((a, b) => a + b, 0) / e.scores.length,
      best: Math.max(...e.scores),
      worst: Math.min(...e.scores),
    }))
    .sort((a, b) => b.average - a.average);
}

/** Count of days each player recorded the sole lowest level-0 score. */
export function computeWoodenSpoons(all: DayScore[]): Map<number, { name: string; count: number }> {
  const byDay = new Map<string, DayScore[]>();
  for (const s of all) {
    const key = s.gameDate ?? "";
    const bucket = byDay.get(key);
    if (bucket) bucket.push(s);
    else byDay.set(key, [s]);
  }
  const spoons = new Map<number, { name: string; count: number }>();
  for (const scores of byDay.values()) {
    if (scores.length < 2) continue;
    const min = Math.min(...scores.map((s) => s.score));
    const losers = scores.filter((s) => s.score === min);
    if (losers.length !== 1) continue; // only a *sole* last place earns a spoon
    const l = losers[0]!;
    const e = spoons.get(l.playerId) ?? { name: l.displayName, count: 0 };
    e.count += 1;
    spoons.set(l.playerId, e);
  }
  return spoons;
}

export interface FingerAverage {
  playerId: number;
  displayName: string;
  averageSeconds: number;
  games: number;
}

/** Average submission time-of-day per player ("fastest finger" league). */
export function computeFingerLeague(all: DayScore[]): FingerAverage[] {
  const byPlayer = new Map<number, { name: string; secs: number[] }>();
  for (const s of all) {
    const seconds = secondsOfDay(s.submittedAt);
    if (seconds === null) continue;
    const e = byPlayer.get(s.playerId) ?? { name: s.displayName, secs: [] };
    e.secs.push(seconds);
    byPlayer.set(s.playerId, e);
  }
  return [...byPlayer.entries()]
    .map(([playerId, e]) => ({
      playerId,
      displayName: e.name,
      averageSeconds: e.secs.reduce((a, b) => a + b, 0) / e.secs.length,
      games: e.secs.length,
    }))
    .sort((a, b) => a.averageSeconds - b.averageSeconds);
}

/** Longest run of consecutive decided rounds any player went without winning. */
export function computeLongestDrought(rounds: DecidedRound[]): {
  displayName: string;
  drought: number;
} | null {
  if (rounds.length === 0) return null;
  const players = new Map<number, string>();
  for (const r of rounds) players.set(r.winnerPlayerId, r.winnerName);
  let worst: { displayName: string; drought: number } | null = null;
  for (const [playerId, name] of players) {
    let gap = 0;
    let maxGap = 0;
    for (const r of rounds) {
      if (r.winnerPlayerId === playerId) gap = 0;
      else {
        gap += 1;
        maxGap = Math.max(maxGap, gap);
      }
    }
    if (!worst || maxGap > worst.drought) worst = { displayName: name, drought: maxGap };
  }
  return worst;
}

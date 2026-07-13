/**
 * ── WEB ─────────────────────────────────────────────────────────────────────
 * Builds the structured JSON payload that powers the read-only web dashboard.
 *
 * It reuses the exact same pure analytics as the chat announcements + weekly
 * digest, but returns plain serialisable objects (not markdown) so the browser
 * front-end can render its own themed cards and tables.
 */

import type { Repository } from "../db/repository.js";
import { formatScore } from "../announcer/format.js";
import { RECORD_DEFINITIONS } from "../analytics/records.js";
import {
  computeAverages,
  computeBridesmaids,
  computeFingerLeague,
  computeForm,
  computeGroupPB,
  computeLongestDrought,
  computeMonthlyChampions,
  computeScoreTotals,
  computeStreaks,
  computeWoodenSpoons,
  type DecidedRound,
} from "../analytics/stats.js";

export interface DashboardData {
  generatedAt: string;
  timezone: string;
  summary: {
    players: number;
    gameDays: number;
    submissions: number;
    latestGameDate: string | null;
  };
  standings: Array<{ position: number; displayName: string; points: number }>;
  pointHoarder: {
    leaders: string[];
    table: Array<{ position: number; displayName: string; total: number; games: number; average: number }>;
  };
  records: Array<{ key: string; emoji: string; label: string; detail: string; holder: string | null }>;
  streaks: {
    hot: { displayName: string; current: number } | null;
    longest: { displayName: string; longest: number } | null;
  };
  form: Array<{ displayName: string; wins: number }>;
  averages: Array<{
    position: number;
    displayName: string;
    games: number;
    average: number;
    best: number;
    worst: number;
  }>;
  woodenSpoons: Array<{ displayName: string; count: number }>;
  bridesmaids: Array<{ displayName: string; count: number }>;
  playerOfMonth: { month: string; displayName: string; wins: number } | null;
  monthlyChampions: Array<{ month: string; displayName: string; wins: number }>;
  groupPB: { gameDate: string; total: number; contributors: Array<{ displayName: string; score: number }> } | null;
  fingerLeague: Array<{ position: number; displayName: string; averageTime: string; games: number }>;
  drought: { displayName: string; drought: number } | null;
  recentResults: Array<{
    gameDate: string;
    winnerName: string;
    topScore: number | null;
    scores: Array<{ displayName: string; score: number }>;
  }>;
}

/** "HH:MM" for a seconds-since-midnight value. */
function secondsToHHMM(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Assign standard competition ranks (1,2,2,4) by a descending numeric key. */
function rank<T>(items: T[], value: (t: T) => number): Array<{ position: number } & T> {
  let lastValue: number | null = null;
  let lastPosition = 0;
  return items.map((item, i) => {
    const v = value(item);
    const position = lastValue !== null && v === lastValue ? lastPosition : i + 1;
    lastValue = v;
    lastPosition = position;
    return { position, ...item };
  });
}

/** Compute the full read-only dashboard payload from the shared database. */
export function buildDashboardData(repo: Repository, timezone: string): DashboardData {
  const tally = repo.getTally();
  const decidedRaw = repo.getDecidedRounds();
  const decided: DecidedRound[] = decidedRaw.map((r) => ({
    gameDate: r.gameDate,
    winnerPlayerId: r.winnerPlayerId,
    winnerName: r.winnerName,
  }));
  const allScores = repo.getAllDayScores();

  const nameById = new Map<number, string>();
  for (const p of repo.getActivePlayers()) nameById.set(p.id, p.display_name);
  for (const r of decidedRaw) nameById.set(r.winnerPlayerId, r.winnerName);

  // ── Standings (wins tally) ──────────────────────────────────────────────
  const standings = rank(
    tally.map((t) => ({ displayName: t.displayName, points: t.points })),
    (t) => t.points,
  );

  // ── Point Hoarder (cumulative GeoRankl score) ───────────────────────────
  const totals = computeScoreTotals(allScores);
  const hoarderTable = rank(
    totals.map((t) => ({
      displayName: t.displayName,
      total: t.total,
      games: t.games,
      average: t.games > 0 ? Math.round(t.total / t.games) : 0,
    })),
    (t) => t.total,
  );
  const topTotal = totals.length > 0 ? totals[0]!.total : null;
  const leaders = topTotal === null ? [] : totals.filter((t) => t.total === topTotal).map((t) => t.displayName);

  // ── Hall of records ─────────────────────────────────────────────────────
  const records = RECORD_DEFINITIONS.map((def) => {
    const rec = repo.getRecord(def.key);
    if (!rec) return null;
    const holder = rec.player_id !== null ? repo.getPlayerById(rec.player_id) : undefined;
    return {
      key: def.key,
      emoji: def.emoji,
      label: def.label,
      detail: rec.detail ?? formatScore(rec.metric),
      holder: holder?.display_name ?? null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // ── Streaks ─────────────────────────────────────────────────────────────
  const streakInfos = computeStreaks(decided);
  const hotEntry = streakInfos.filter((s) => s.current > 0).sort((a, b) => b.current - a.current)[0];
  const longestEntry = [...streakInfos].sort((a, b) => b.longest - a.longest)[0];
  const streaks = {
    hot: hotEntry ? { displayName: hotEntry.displayName, current: hotEntry.current } : null,
    longest: longestEntry && longestEntry.longest > 0
      ? { displayName: longestEntry.displayName, longest: longestEntry.longest }
      : null,
  };

  // ── 7-day form ──────────────────────────────────────────────────────────
  const form = [...computeForm(decided, 7).entries()]
    .map(([playerId, wins]) => ({ displayName: nameById.get(playerId) ?? `#${playerId}`, wins }))
    .sort((a, b) => b.wins - a.wins);

  // ── Averages ────────────────────────────────────────────────────────────
  const averages = rank(
    computeAverages(allScores).map((a) => ({
      displayName: a.displayName,
      games: a.games,
      average: Math.round(a.average),
      best: a.best,
      worst: a.worst,
    })),
    (a) => a.average,
  );

  // ── Wooden spoons / bridesmaids ─────────────────────────────────────────
  const woodenSpoons = [...computeWoodenSpoons(allScores).values()]
    .map((e) => ({ displayName: e.name, count: e.count }))
    .sort((a, b) => b.count - a.count);
  const bridesmaids = [...computeBridesmaids(allScores).values()]
    .map((e) => ({ displayName: e.name, count: e.count }))
    .sort((a, b) => b.count - a.count);

  // ── Monthly champions / player of the month ─────────────────────────────
  const monthlyChampions = computeMonthlyChampions(decided).map((m) => ({
    month: m.month,
    displayName: m.displayName,
    wins: m.wins,
  }));
  const playerOfMonth = monthlyChampions.length > 0 ? monthlyChampions[monthlyChampions.length - 1]! : null;

  // ── Group PB ────────────────────────────────────────────────────────────
  const groupPB = computeGroupPB(allScores);

  // ── Fastest-finger league (earliest average submission time first) ───────
  const fingerLeague = rank(
    computeFingerLeague(allScores).map((f) => ({
      displayName: f.displayName,
      averageTime: secondsToHHMM(f.averageSeconds),
      games: f.games,
    })),
    // computeFingerLeague already sorts earliest-first; invert for descending rank.
    (f) => -(Number(f.averageTime.slice(0, 2)) * 60 + Number(f.averageTime.slice(3, 5))),
  );

  const drought = computeLongestDrought(decided);

  // ── Recent results (newest first) ───────────────────────────────────────
  const recentResults = [...decidedRaw]
    .sort((a, b) => (a.gameDate < b.gameDate ? 1 : a.gameDate > b.gameDate ? -1 : b.roundId - a.roundId))
    .slice(0, 10)
    .map((r) => {
      const scores = repo.getDayScores(r.roundId).map((s) => ({ displayName: s.displayName, score: s.score }));
      const topScore = scores.length > 0 ? Math.max(...scores.map((s) => s.score)) : null;
      return { gameDate: r.gameDate, winnerName: r.winnerName, topScore, scores };
    });

  const latestGameDate = decidedRaw.length > 0
    ? decidedRaw.map((r) => r.gameDate).sort().at(-1)!
    : null;

  return {
    generatedAt: new Date().toISOString(),
    timezone,
    summary: {
      players: repo.getActivePlayers().length,
      gameDays: decidedRaw.length,
      submissions: allScores.length,
      latestGameDate,
    },
    standings,
    pointHoarder: { leaders, table: hoarderTable },
    records,
    streaks,
    form,
    averages,
    woodenSpoons,
    bridesmaids,
    playerOfMonth,
    monthlyChampions,
    groupPB,
    fingerLeague,
    drought,
    recentResults,
  };
}

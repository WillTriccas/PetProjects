/**
 * Presentation helpers for the funky daily callouts and the weekly fun digest.
 * All functions return WhatsApp/Telegram-friendly text (with *bold* markup).
 */

import type { PlayerRow, TallyEntry } from "../db/models.js";
import { formatScore, formatTally } from "../announcer/format.js";
import type { RecordBreak } from "./records.js";
import type {
  DayReport,
  DecidedRound,
  DayScore,
  FingerAverage,
  PlayerAverage,
  StreakInfo,
} from "./stats.js";
import {
  computeAverages,
  computeFingerLeague,
  computeForm,
  computeLongestDrought,
  computeStreaks,
  computeWoodenSpoons,
} from "./stats.js";

/** The extra flavour lines appended to a daily winner announcement. */
export function formatDayExtras(report: DayReport, winnerId: number): string {
  const lines: string[] = [];

  if (report.lowest && report.lowest.playerId !== winnerId) {
    lines.push(`🥄 Wooden spoon: *${report.lowest.displayName}* with ${formatScore(report.lowest.score)}`);
  }
  if (report.fastest) {
    lines.push(`⏱️ Fastest finger: *${report.fastest.displayName}* at ${report.fastest.submittedAt.slice(11, 16)}`);
  }
  if (report.slowest && report.slowest.playerId !== report.fastest?.playerId) {
    lines.push(`🌙 Last to post: *${report.slowest.displayName}* at ${report.slowest.submittedAt.slice(11, 16)}`);
  }
  return lines.join("\n");
}

export function formatRecordBreaks(breaks: RecordBreak[]): string {
  if (breaks.length === 0) return "";
  const lines = breaks.map(
    (b) => `${b.emoji} *NEW RECORD* — ${b.label}! *${b.displayName}* (${b.detail})`,
  );
  return lines.join("\n");
}

function secondsToClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface DigestInputs {
  tally: TallyEntry[];
  decided: DecidedRound[];
  allScores: DayScore[];
  records: Array<{ emoji: string; label: string; detail: string; holder: string | null }>;
}

/** Build the weekly "fun analytics" digest message. */
export function formatDigest(inputs: DigestInputs): string {
  const { tally, decided, allScores, records } = inputs;
  const sections: string[] = ["📊 *GeoRanker weekly digest*"];

  sections.push(`*🏆 Standings*\n${formatTally(tally)}`);

  const streaks = computeStreaks(decided);
  const hotStreak = streaks
    .filter((s) => s.current >= 2)
    .sort((a, b) => b.current - a.current)[0];
  const bestEver = [...streaks].sort((a, b) => b.longest - a.longest)[0];
  const streakLines: string[] = [];
  if (hotStreak) streakLines.push(`🔥 On fire: *${hotStreak.displayName}* — ${hotStreak.current} in a row`);
  if (bestEver && bestEver.longest >= 2)
    streakLines.push(`📈 Longest ever streak: *${bestEver.displayName}* (${bestEver.longest})`);
  if (streakLines.length) sections.push(`*Streaks*\n${streakLines.join("\n")}`);

  const form = computeForm(decided, 7);
  if (form.size > 0) {
    const formLine = [...form.entries()]
      .map(([id, wins]) => {
        const name = decided.find((d) => d.winnerPlayerId === id)?.winnerName ?? "?";
        return { name, wins };
      })
      .sort((a, b) => b.wins - a.wins)
      .map((f) => `${f.name} ${f.wins}`)
      .join(" · ");
    sections.push(`*🗓️ Form (last 7 days wins)*\n${formLine}`);
  }

  const averages = computeAverages(allScores);
  if (averages.length > 0) {
    const avgLines = averages.map(
      (a: PlayerAverage) =>
        `${a.displayName}: avg ${formatScore(Math.round(a.average))} · PB ${formatScore(a.best)} · low ${formatScore(a.worst)}`,
    );
    sections.push(`*🎯 Scoring*\n${avgLines.join("\n")}`);
  }

  const spoons = computeWoodenSpoons(allScores);
  if (spoons.size > 0) {
    const spoonLine = [...spoons.values()]
      .sort((a, b) => b.count - a.count)
      .map((s) => `${s.name} ${s.count}`)
      .join(" · ");
    sections.push(`*🥄 Wooden spoons*\n${spoonLine}`);
  }

  const fingers = computeFingerLeague(allScores);
  if (fingers.length > 0) {
    const early = fingers[0]!;
    const late = fingers[fingers.length - 1]!;
    const fingerLines = [`🌅 Early bird: *${early.displayName}* (avg ${secondsToClock(early.averageSeconds)})`];
    if (late.playerId !== early.playerId)
      fingerLines.push(`🦉 Night owl: *${late.displayName}* (avg ${secondsToClock(late.averageSeconds)})`);
    sections.push(`*⏱️ Fastest finger*\n${fingerLines.join("\n")}`);
  }

  const drought = computeLongestDrought(decided);
  if (drought && drought.drought >= 2) {
    sections.push(`*🧊 Longest drought*\n${drought.displayName} went ${drought.drought} rounds without a win`);
  }

  if (records.length > 0) {
    const recLines = records.map(
      (r) => `${r.emoji} ${r.label}: ${r.detail}${r.holder ? ` (${r.holder})` : ""}`,
    );
    sections.push(`*🏅 Hall of records*\n${recLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export type { PlayerRow, StreakInfo };

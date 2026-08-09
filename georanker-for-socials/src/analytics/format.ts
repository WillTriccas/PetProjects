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
  NostalgiaNote,
  OnThisDayNote,
  PlayerAverage,
  PlayerScoreTotal,
  StreakInfo,
} from "./stats.js";
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

// ───────────────────────────── Nostalgia ─────────────────────────────

/** "🕰️ On this day" — anniversaries of the same calendar date. */
export function formatOnThisDay(notes: OnThisDayNote[]): string {
  if (notes.length === 0) return "";
  const lines = notes.slice(0, 2).map((n) => {
    const when = n.yearsAgo === 1 ? "A year ago today" : `${n.yearsAgo} years ago today`;
    if (n.winnerName) {
      const top =
        n.topScore !== null ? ` — top score ${formatScore(n.topScore)} by ${n.topName}` : "";
      return `📅 ${when}, *${n.winnerName}* won the day${top}.`;
    }
    return `📅 ${when}, top score was ${formatScore(n.topScore ?? 0)} by ${n.topName}.`;
  });
  return `🕰️ *On this day*\n${lines.join("\n")}`;
}

/** "🕰️ This time last month" — a random-cadence memory. */
export function formatThisTimeLastMonth(note: NostalgiaNote | null): string {
  if (!note) return "";
  const who = note.winnerName ? `*${note.winnerName}* took the crown` : "nobody was crowned";
  const top =
    note.topName && note.topScore !== null
      ? ` — ${note.topName} led with ${formatScore(note.topScore)}`
      : "";
  return `🕰️ *This time last month* (${note.gameDate})\n${who}${top}.`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function secondsToClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Crowns the all-time cumulative-score leader ("Point Hoarder"). This is based
 * on the raw GeoRankl score each player has racked up over time — NOT the
 * daily-win tally — so it rewards players who score consistently well even when
 * they don't win the day. Handles ties and shows the full cumulative table.
 * Returns an empty string until someone has actually posted a score.
 */
export function formatPointHoarder(totals: PlayerScoreTotal[]): string {
  if (totals.length === 0 || totals[0]!.total <= 0) return "";
  const top = totals[0]!.total;
  const leaders = totals.filter((t) => t.total === top).map((t) => `*${t.displayName}*`);
  const crown =
    leaders.length === 1
      ? `${leaders[0]} is our all-time Point Hoarder with a cumulative *${formatScore(top)}*`
      : `${joinNamesLocal(leaders)} are tied as Point Hoarders on *${formatScore(top)}* each`;

  const lines: string[] = [];
  let lastValue: number | null = null;
  let position = 0;
  totals.forEach((t, i) => {
    if (t.total !== lastValue) {
      position = i + 1;
      lastValue = t.total;
    }
    const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;
    lines.push(`${medal} ${t.displayName} — ${formatScore(t.total)}`);
  });

  return `👑 *Point Hoarder of the week*\n${crown}!\n\n*📈 Cumulative GeoRankl score*\n${lines.join("\n")}`;
}

function joinNamesLocal(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
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

  const hoarder = formatPointHoarder(computeScoreTotals(allScores));
  if (hoarder) sections.push(hoarder);

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

  const champions = computeMonthlyChampions(decided);
  if (champions.length > 0) {
    const potmLines: string[] = [];
    const latest = champions[champions.length - 1]!;
    potmLines.push(
      `🏅 ${monthLabel(latest.month)}: *${latest.displayName}* (${latest.wins} win${latest.wins === 1 ? "" : "s"})`,
    );
    if (champions.length > 1) {
      const prev = champions[champions.length - 2]!;
      potmLines.push(`${monthLabel(prev.month)}: ${prev.displayName} (${prev.wins})`);
    }
    sections.push(`*👑 Player of the Month*\n${potmLines.join("\n")}`);
  }

  const bridesmaids = computeBridesmaids(allScores);
  if (bridesmaids.size > 0) {
    const bridesmaidLine = [...bridesmaids.values()]
      .sort((a, b) => b.count - a.count)
      .map((b) => `${b.name} ${b.count}`)
      .join(" · ");
    sections.push(`*🥈 Bridesmaid (most 2nd places)*\n${bridesmaidLine}`);
  }

  const groupPB = computeGroupPB(allScores);
  if (groupPB) {
    const contribs = groupPB.contributors
      .map((c) => `${c.displayName} ${formatScore(c.score)}`)
      .join(" + ");
    sections.push(
      `*💪 Group PB day*\n${groupPB.gameDate}: combined *${formatScore(groupPB.total)}* (${contribs})`,
    );
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

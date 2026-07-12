import type { PlayerRow, TallyEntry } from "../db/models.js";

const APP_NAME = "GeoRanker for socials";

/** Ordinal-free ranked tally, e.g. "1. Alice — 12". Ties share a position. */
export function formatTally(tally: TallyEntry[]): string {
  if (tally.length === 0) return "No points yet.";
  const lines: string[] = [];
  let lastPoints: number | null = null;
  let position = 0;
  tally.forEach((entry, i) => {
    if (entry.points !== lastPoints) {
      position = i + 1;
      lastPoints = entry.points;
    }
    const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;
    lines.push(`${medal} ${entry.displayName} — ${entry.points}`);
  });
  return lines.join("\n");
}

export function formatWinnerAnnouncement(
  winner: PlayerRow,
  winningScore: number,
  tally: TallyEntry[],
  extraSections: string[] = [],
): string {
  const extras = extraSections
    .filter((s) => s && s.trim().length > 0)
    .map((s) => `${s}\n\n`)
    .join("");
  return (
    `🏆 *${APP_NAME}* — winner of the day!\n\n` +
    `👑 *${winner.display_name}* takes it with *${formatScore(winningScore)}*.\n\n` +
    extras +
    `📊 *Standings*\n${formatTally(tally)}`
  );
}

export function formatPlayoffAnnouncement(
  tiedPlayers: PlayerRow[],
  level: number,
): string {
  const names = joinNames(tiedPlayers.map((p) => `*${p.display_name}*`));
  const roundWord = level > 1 ? `tie-break round ${level}` : "tie-break";
  return (
    `⚔️ It's a tie at the top! Time for a ${roundWord}.\n\n` +
    `${names} — play another game and drop your score here. Highest score wins.`
  );
}

export function formatScore(score: number): string {
  return Number.isInteger(score) ? score.toLocaleString("en-US") : String(score);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Ties the analytics computations to the database and the announcer. On a
 * resolved round it enriches the winner message with the day's funky callouts
 * and any all-time records that were broken (persisting record updates once).
 * It also builds the weekly fun digest.
 */

import type { Repository } from "../db/repository.js";
import type { PlayerRow, RoundRow, TallyEntry } from "../db/models.js";
import { formatScore, formatWinnerAnnouncement } from "../announcer/format.js";
import {
  buildDayReport,
  daysBetweenIso,
  findOnThisDay,
  findThisTimeLastMonth,
  pickNostalgiaInterval,
} from "./stats.js";
import {
  candidatesFromDayReport,
  evaluateRecords,
  RECORD_DEFINITIONS,
  type RecordKey,
} from "./records.js";
import {
  formatDayExtras,
  formatDigest,
  formatOnThisDay,
  formatRecordBreaks,
  formatThisTimeLastMonth,
} from "./format.js";

const NOSTALGIA_LAST_SHOWN = "nostalgia_last_shown";
const NOSTALGIA_NEXT_INTERVAL = "nostalgia_next_interval";

const DIRECTION_BY_KEY = new Map(RECORD_DEFINITIONS.map((d) => [d.key, d.direction]));

export class StatsService {
  constructor(private readonly repo: Repository) {}

  /**
   * Build the enriched "winner of the day" announcement and persist any records
   * that were broken. Safe to call exactly once per round resolution (used by
   * the live Telegram bot).
   */
  buildResolvedMessage(
    round: RoundRow,
    winner: PlayerRow,
    winningScore: number,
    tally: TallyEntry[],
  ): string {
    return this.composeResolved(round, winner, winningScore, tally, {
      persist: true,
      nostalgia: "full",
    });
  }

  /**
   * Like {@link buildResolvedMessage} but read-only: it never persists record
   * updates and never advances the randomised nostalgia clock. Used by the batch
   * export flow, which recomputes the whole hall of records once at the end (so a
   * bulk import doesn't spam "NEW RECORD" for every historical day, while genuine
   * new-day records still surface on later incremental uploads).
   */
  buildResolvedMessageReadOnly(
    round: RoundRow,
    winner: PlayerRow,
    winningScore: number,
    tally: TallyEntry[],
    extraLead: string[] = [],
  ): string {
    return this.composeResolved(round, winner, winningScore, tally, {
      persist: false,
      nostalgia: "onThisDay",
      extraLead,
    });
  }

  private composeResolved(
    round: RoundRow,
    winner: PlayerRow,
    winningScore: number,
    tally: TallyEntry[],
    opts: { persist: boolean; nostalgia: "full" | "onThisDay" | "none"; extraLead?: string[] },
  ): string {
    const scores = this.repo.getDayScores(round.id);
    const report = buildDayReport(scores);

    const candidates = candidatesFromDayReport(report, formatScore);
    const existing = new Map<RecordKey, number>();
    for (const def of RECORD_DEFINITIONS) {
      const rec = this.repo.getRecord(def.key);
      if (rec) existing.set(def.key, rec.metric);
    }
    const { breaks, updates } = evaluateRecords(candidates, existing);
    if (opts.persist) {
      for (const u of updates) {
        this.repo.upsertRecord({
          key: u.key,
          metric: u.metric,
          playerId: u.playerId,
          gameDate: round.game_date,
          detail: u.detail,
        });
      }
    }

    const extras = formatDayExtras(report, winner.id);
    const recordLines = formatRecordBreaks(breaks);
    const nostalgia =
      opts.nostalgia === "full"
        ? this.buildNostalgia(round.game_date)
        : opts.nostalgia === "onThisDay"
          ? this.buildOnThisDay(round.game_date)
          : "";
    return formatWinnerAnnouncement(winner, winningScore, tally, [
      ...(opts.extraLead ?? []),
      recordLines,
      extras,
      nostalgia,
    ]);
  }

  /**
   * Build the nostalgia block for a resolved day. "On this day" anniversaries
   * are always shown when they exist; the "this time last month" memory is
   * surfaced on a randomised ~46-day cadence so it feels spontaneous. Called
   * once per resolution, so the cadence clock never double-advances on re-runs.
   */
  private buildNostalgia(today: string): string {
    const decided = this.repo.getDecidedRounds().map((r) => ({
      gameDate: r.gameDate,
      winnerPlayerId: r.winnerPlayerId,
      winnerName: r.winnerName,
    }));
    const all = this.repo.getAllDayScores();

    const parts: string[] = [formatOnThisDay(findOnThisDay(decided, all, today))];

    const memory = findThisTimeLastMonth(decided, all, today);
    if (memory && this.nostalgiaDue(today)) {
      parts.push(formatThisTimeLastMonth(memory));
      this.repo.setState(NOSTALGIA_LAST_SHOWN, today);
      this.repo.setState(NOSTALGIA_NEXT_INTERVAL, String(pickNostalgiaInterval()));
    }
    return parts.filter((p) => p.trim().length > 0).join("\n\n");
  }

  /** Whether enough (randomised) days have passed to surface a memory again. */
  private nostalgiaDue(today: string): boolean {
    const last = this.repo.getState(NOSTALGIA_LAST_SHOWN);
    if (!last) {
      // Start the clock the first time we're asked, so the first memory appears
      // one randomised interval into the group's history rather than instantly.
      this.repo.setState(NOSTALGIA_LAST_SHOWN, today);
      this.repo.setState(NOSTALGIA_NEXT_INTERVAL, String(pickNostalgiaInterval()));
      return false;
    }
    const interval = Number(
      this.repo.getState(NOSTALGIA_NEXT_INTERVAL) ?? pickNostalgiaInterval(),
    );
    return daysBetweenIso(last, today) >= interval;
  }

  /** Read-only "on this day" anniversary block (no state mutation). */
  private buildOnThisDay(today: string): string {
    const decided = this.repo.getDecidedRounds().map((r) => ({
      gameDate: r.gameDate,
      winnerPlayerId: r.winnerPlayerId,
      winnerName: r.winnerName,
    }));
    const all = this.repo.getAllDayScores();
    return formatOnThisDay(findOnThisDay(decided, all, today));
  }

  /**
   * Rebuild the all-time hall of records from full history. Used after a batch
   * export so records stay consistent even when days are re-resolved (e.g. a
   * later, fuller upload changes an old day's outcome).
   */
  recomputeRecords(): void {
    const all = this.repo.getAllDayScores();
    const byDay = new Map<string, typeof all>();
    for (const s of all) {
      const bucket = byDay.get(s.gameDate);
      if (bucket) bucket.push(s);
      else byDay.set(s.gameDate, [s]);
    }

    const best = new Map<RecordKey, { metric: number; playerId: number; detail: string; gameDate: string }>();
    for (const gameDate of [...byDay.keys()].sort()) {
      const report = buildDayReport(byDay.get(gameDate)!);
      for (const c of candidatesFromDayReport(report, formatScore)) {
        const direction = DIRECTION_BY_KEY.get(c.key);
        if (!direction) continue;
        const cur = best.get(c.key);
        const beats =
          cur === undefined ||
          (direction === "high" ? c.metric > cur.metric : c.metric < cur.metric);
        if (beats) {
          best.set(c.key, { metric: c.metric, playerId: c.playerId, detail: c.detail, gameDate });
        }
      }
    }

    this.repo.clearRecords();
    for (const [key, v] of best) {
      this.repo.upsertRecord({
        key,
        metric: v.metric,
        playerId: v.playerId,
        gameDate: v.gameDate,
        detail: v.detail,
      });
    }
  }

  /** Build the weekly fun analytics digest from all history. */
  buildDigest(): string {
    const tally = this.repo.getTally();
    const decided = this.repo.getDecidedRounds().map((r) => ({
      gameDate: r.gameDate,
      winnerPlayerId: r.winnerPlayerId,
      winnerName: r.winnerName,
    }));
    const allScores = this.repo.getAllDayScores();

    const records = RECORD_DEFINITIONS.map((def) => {
      const rec = this.repo.getRecord(def.key);
      if (!rec) return null;
      const holder = rec.player_id !== null ? this.repo.getPlayerById(rec.player_id) : undefined;
      return {
        emoji: def.emoji,
        label: def.label,
        detail: rec.detail ?? formatScore(rec.metric),
        holder: holder?.display_name ?? null,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    return formatDigest({ tally, decided, allScores, records });
  }
}

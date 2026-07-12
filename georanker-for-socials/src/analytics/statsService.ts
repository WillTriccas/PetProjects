/**
 * Ties the analytics computations to the database and the announcer. On a
 * resolved round it enriches the winner message with the day's funky callouts
 * and any all-time records that were broken (persisting record updates once).
 * It also builds the weekly fun digest.
 */

import type { Repository } from "../db/repository.js";
import type { PlayerRow, RoundRow, TallyEntry } from "../db/models.js";
import { formatScore, formatWinnerAnnouncement } from "../announcer/format.js";
import { buildDayReport } from "./stats.js";
import {
  candidatesFromDayReport,
  evaluateRecords,
  RECORD_DEFINITIONS,
  type RecordKey,
} from "./records.js";
import { formatDayExtras, formatDigest, formatRecordBreaks } from "./format.js";

export class StatsService {
  constructor(private readonly repo: Repository) {}

  /**
   * Build the enriched "winner of the day" announcement and persist any records
   * that were broken. Safe to call exactly once per round resolution.
   */
  buildResolvedMessage(
    round: RoundRow,
    winner: PlayerRow,
    winningScore: number,
    tally: TallyEntry[],
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
    for (const u of updates) {
      this.repo.upsertRecord({
        key: u.key,
        metric: u.metric,
        playerId: u.playerId,
        gameDate: round.game_date,
        detail: u.detail,
      });
    }

    const extras = formatDayExtras(report, winner.id);
    const recordLines = formatRecordBreaks(breaks);
    return formatWinnerAnnouncement(winner, winningScore, tally, [recordLines, extras]);
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

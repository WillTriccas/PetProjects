import type { Repository } from "../db/repository.js";
import type { PlayerRow, RoundRow, SubmissionSource, TallyEntry } from "../db/models.js";
import { gameDateFor } from "./gameDate.js";

export interface ScoreInput {
  playerId: number;
  score: number;
  source: SubmissionSource;
  rawRef: string | null;
}

export type RoundOutcome =
  | { type: "ignored"; reason: "not-eligible"; round: RoundRow }
  | { type: "recorded"; round: RoundRow; waitingOn: PlayerRow[] }
  | {
      type: "playoff";
      round: RoundRow;
      level: number;
      tiedPlayers: PlayerRow[];
    }
  | {
      type: "resolved";
      round: RoundRow;
      winner: PlayerRow;
      winningScore: number;
      tally: TallyEntry[];
    };

/**
 * The round/state machine.
 *
 * Level 0: every active roster player must submit. On resolution the highest
 * score wins. A tie promotes the tied players into a playoff (level+1) where
 * only they may submit; this repeats until a single highest score emerges.
 *
 * All state is derived from the database, so the engine is fully recoverable
 * after a restart.
 */
export class RoundEngine {
  constructor(
    private readonly repo: Repository,
    private readonly timezone: string,
  ) {}

  /** The players eligible to submit at the round's current playoff level. */
  eligiblePlayers(round: RoundRow): PlayerRow[] {
    if (round.playoff_level === 0) {
      return this.repo.getActivePlayers();
    }
    // Playoff: only players who tied for the lead at the previous level.
    const prev = this.repo.getSubmissionsForLevel(round.id, round.playoff_level - 1);
    const max = Math.max(...prev.map((s) => s.score));
    const tiedIds = prev.filter((s) => s.score === max).map((s) => s.player_id);
    return tiedIds
      .map((id) => this.repo.getPlayerById(id))
      .filter((p): p is PlayerRow => p !== undefined);
  }

  private ensureRound(): RoundRow {
    const current = this.repo.getCurrentRound();
    if (current) return current;
    return this.repo.openRound(gameDateFor(this.timezone));
  }

  /**
   * Record a player's score for the current round/level and advance the state
   * machine, returning what happened so the caller can announce it.
   */
  recordScore(input: ScoreInput): RoundOutcome {
    const round = this.ensureRound();
    const eligible = this.eligiblePlayers(round);
    const eligibleIds = new Set(eligible.map((p) => p.id));

    if (!eligibleIds.has(input.playerId)) {
      return { type: "ignored", reason: "not-eligible", round };
    }

    this.repo.upsertSubmission({
      roundId: round.id,
      playerId: input.playerId,
      playoffLevel: round.playoff_level,
      source: input.source,
      rawRef: input.rawRef,
      score: input.score,
    });

    const subs = this.repo.getSubmissionsForLevel(round.id, round.playoff_level);
    const submittedIds = new Set(subs.map((s) => s.player_id));
    const waitingOn = eligible.filter((p) => !submittedIds.has(p.id));

    if (waitingOn.length > 0) {
      return { type: "recorded", round, waitingOn };
    }

    // Everyone eligible has submitted — determine the leader(s).
    const max = Math.max(...subs.map((s) => s.score));
    const winnerIds = subs.filter((s) => s.score === max).map((s) => s.player_id);

    if (winnerIds.length === 1) {
      const winnerId = winnerIds[0]!;
      this.repo.resolveRound(round.id, winnerId);
      const winner = this.repo.getPlayerById(winnerId)!;
      return {
        type: "resolved",
        round: this.repo.getRoundById(round.id)!,
        winner,
        winningScore: max,
        tally: this.repo.getTally(),
      };
    }

    // Tie — start a playoff among the tied players.
    const nextLevel = round.playoff_level + 1;
    this.repo.setPlayoff(round.id, nextLevel);
    const tiedPlayers = winnerIds
      .map((id) => this.repo.getPlayerById(id))
      .filter((p): p is PlayerRow => p !== undefined);
    return {
      type: "playoff",
      round: this.repo.getRoundById(round.id)!,
      level: nextLevel,
      tiedPlayers,
    };
  }
}

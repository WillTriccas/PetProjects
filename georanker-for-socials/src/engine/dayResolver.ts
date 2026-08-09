/**
 * ── EXPORT DAY RESOLVER ─────────────────────────────────────────────────────
 * Pure, batch-natured scoring for the WhatsApp "Export chat" flow. It differs
 * from the live streaming {@link RoundEngine} because an export gives us a whole
 * day at once, and not everyone submits, so we resolve per game day with DQs.
 *
 * The group's rules, encoded here:
 *   1. IMAGE-ONLY.  Only pictures count as official scores. Text numbers never
 *      count. A player who posts no (readable) picture on a day is DISQUALIFIED
 *      for that day — they score nothing and don't affect anyone else's result.
 *   2. FIRST PICTURE = the GeoRankl score.  For each player, their FIRST image
 *      of the day is taken as their GeoRankl score (level 0). GeoRankl scores are
 *      high; the other daily games (Geopaint <50, Geodle ~10, Geodecide ~15) are
 *      posted afterwards and are IGNORED for normal scoring.
 *   3. PLAYOFFS use the SUBSEQUENT pictures.  When two or more players tie on
 *      their first-picture GeoRankl score, the tie is broken using the tied
 *      players' NEXT pictures in order (2nd picture = playoff 1, 3rd = playoff 2,
 *      …). This is the only time those later low-scored pictures are counted.
 *      Higher score wins each playoff round; repeat until a single winner emerges.
 *
 * Everything here operates on plain data (no DB, no I/O) so it is trivially
 * unit-testable. The exportRunner persists the resolution to the shared DB.
 */

/** Whether a higher score wins each playoff round. The group confirmed "higher". */
export const PLAYOFF_HIGHER_WINS = true;

/** One image a player posted on a day, in chronological order. */
export interface DayImage {
  /** Extracted score, or null if the picture couldn't be read. */
  score: number | null;
  submittedAt: string | null;
}

/** A single player's images for one game day, oldest first. */
export interface PlayerDay {
  playerId: number;
  displayName: string;
  images: DayImage[];
}

/** A player's official (level-0) GeoRankl score for the day. */
export interface LevelScore {
  playerId: number;
  displayName: string;
  score: number;
  submittedAt: string | null;
}

/** A single tie-break round and how the tied players fared in it. */
export interface PlayoffRound {
  /** 1 = second picture, 2 = third picture, … */
  level: number;
  participants: Array<{ playerId: number; displayName: string; score: number }>;
  /** Tied players who ran out of pictures and were eliminated this round. */
  eliminated: Array<{ playerId: number; displayName: string }>;
}

/** The full outcome of one game day. */
export interface DayResolution {
  gameDate: string;
  /** Official GeoRankl scores (first picture per player), highest first. */
  level0: LevelScore[];
  /** Players with no readable picture — disqualified for the day. */
  dqs: Array<{ playerId: number; displayName: string }>;
  /** The tie-break rounds that were needed, in order (empty when no tie). */
  playoffs: PlayoffRound[];
  winnerPlayerId: number | null;
  /** The winner's GeoRankl (level-0) score. */
  winningScore: number | null;
  /** True when a tie could not be broken (everyone ran out of pictures). */
  unresolved: boolean;
}

/** Pick the leaders (max, or min if lower wins) from scored participants. */
function leaders(
  scored: Array<{ playerId: number; displayName: string; score: number }>,
): Array<{ playerId: number; displayName: string; score: number }> {
  const best = PLAYOFF_HIGHER_WINS
    ? Math.max(...scored.map((s) => s.score))
    : Math.min(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best);
}

/**
 * Resolve a single game day into a winner (plus DQs and any playoff chain).
 *
 * @param gameDate  the day being resolved (YYYY-MM-DD)
 * @param players   each active player's chronological images for the day
 */
export function resolveDay(gameDate: string, players: PlayerDay[]): DayResolution {
  const level0: LevelScore[] = [];
  const dqs: Array<{ playerId: number; displayName: string }> = [];

  // Level 0: each player's FIRST picture is their GeoRankl score. No readable
  // first picture (no image, or an unreadable one) → disqualified for the day.
  for (const p of players) {
    const first = p.images[0];
    if (!first || first.score === null || !Number.isFinite(first.score)) {
      dqs.push({ playerId: p.playerId, displayName: p.displayName });
      continue;
    }
    level0.push({
      playerId: p.playerId,
      displayName: p.displayName,
      score: first.score,
      submittedAt: first.submittedAt,
    });
  }

  const base: DayResolution = {
    gameDate,
    level0: [...level0].sort((a, b) => b.score - a.score),
    dqs,
    playoffs: [],
    winnerPlayerId: null,
    winningScore: null,
    unresolved: false,
  };

  if (level0.length === 0) {
    return base; // nobody posted a readable picture
  }

  // Unique top GeoRankl score → straight winner.
  const topScore = Math.max(...level0.map((s) => s.score));
  let tied = level0.filter((s) => s.score === topScore);
  if (tied.length === 1) {
    base.winnerPlayerId = tied[0]!.playerId;
    base.winningScore = topScore;
    return base;
  }

  // Tie on GeoRankl → play it off using each tied player's subsequent pictures.
  const imagesById = new Map(players.map((p) => [p.playerId, p.images]));
  let tiedIds = tied.map((t) => ({ playerId: t.playerId, displayName: t.displayName }));

  for (let level = 1; ; level++) {
    const participants: PlayoffRound["participants"] = [];
    const eliminated: PlayoffRound["eliminated"] = [];
    for (const t of tiedIds) {
      const img = imagesById.get(t.playerId)?.[level];
      if (!img || img.score === null || !Number.isFinite(img.score)) {
        eliminated.push({ playerId: t.playerId, displayName: t.displayName });
      } else {
        participants.push({ playerId: t.playerId, displayName: t.displayName, score: img.score });
      }
    }

    // Nobody could produce a tie-break picture → unbreakable tie, no winner.
    if (participants.length === 0) {
      base.playoffs.push({ level, participants, eliminated });
      base.unresolved = true;
      base.winningScore = topScore;
      return base;
    }

    // A single player still standing (others eliminated) → they take it.
    if (participants.length === 1) {
      base.playoffs.push({ level, participants, eliminated });
      base.winnerPlayerId = participants[0]!.playerId;
      base.winningScore = topScore;
      return base;
    }

    const winners = leaders(participants);
    base.playoffs.push({ level, participants, eliminated });

    if (winners.length === 1) {
      base.winnerPlayerId = winners[0]!.playerId;
      base.winningScore = topScore;
      return base;
    }

    // Still tied → only the joint-leaders continue to the next picture.
    tiedIds = winners.map((w) => ({ playerId: w.playerId, displayName: w.displayName }));
  }
}

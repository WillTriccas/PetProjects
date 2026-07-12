import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Player } from "../config.js";
import { rosterKeyFor } from "../config.js";
import { SCHEMA_SQL } from "./schema.js";
import type {
  PlayerRow,
  PlayerScore,
  RecordRow,
  RoundRow,
  SubmissionRow,
  SubmissionSource,
  TallyEntry,
} from "./models.js";

// Load node:sqlite via require so bundlers/test runners (Vite/Vitest) that don't
// yet recognise the experimental builtin don't try to resolve it themselves.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

/**
 * Thin data-access layer over the built-in node:sqlite database.
 * All round/submission/points state lives here so the bot can fully recover
 * its state after a restart.
 */
export class Repository {
  private readonly db: DatabaseSyncType;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA_SQL);
    this.migrate();
  }

  /** Lightweight migrations for databases created before newer columns existed. */
  private migrate(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(submissions)`)
      .all() as unknown as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "submitted_at")) {
      this.db.exec(`ALTER TABLE submissions ADD COLUMN submitted_at TEXT`);
    }
  }

  close(): void {
    this.db.close();
  }

  /** Upsert the configured roster into the players table. */
  syncPlayers(players: Player[]): void {
    const upsert = this.db.prepare(
      `INSERT INTO players (display_name, whatsapp_jid, roster_key, active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(roster_key)
       DO UPDATE SET display_name = excluded.display_name,
                     whatsapp_jid = excluded.whatsapp_jid, active = 1`,
    );
    const keys = new Set(players.map((p) => rosterKeyFor(p)));
    const deactivate = this.db.prepare(
      `UPDATE players SET active = 0 WHERE roster_key = ?`,
    );
    for (const p of players) {
      upsert.run(p.displayName, p.whatsappJid ?? null, rosterKeyFor(p));
    }
    // Deactivate anyone in the DB but no longer on the roster.
    const existing = this.db
      .prepare(`SELECT roster_key FROM players WHERE active = 1`)
      .all() as Array<{ roster_key: string }>;
    for (const row of existing) {
      if (!keys.has(row.roster_key)) {
        deactivate.run(row.roster_key);
      }
    }
  }

  getActivePlayers(): PlayerRow[] {
    return this.db
      .prepare(`SELECT * FROM players WHERE active = 1 ORDER BY id`)
      .all() as unknown as PlayerRow[];
  }

  getPlayerByJid(jid: string): PlayerRow | undefined {
    return this.db
      .prepare(`SELECT * FROM players WHERE whatsapp_jid = ?`)
      .get(jid) as PlayerRow | undefined;
  }

  getPlayerByRosterKey(rosterKey: string): PlayerRow | undefined {
    return this.db
      .prepare(`SELECT * FROM players WHERE roster_key = ?`)
      .get(rosterKey) as PlayerRow | undefined;
  }

  getPlayerById(id: number): PlayerRow | undefined {
    return this.db
      .prepare(`SELECT * FROM players WHERE id = ?`)
      .get(id) as PlayerRow | undefined;
  }

  /** The single open/playoff round, if any. */
  getCurrentRound(): RoundRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM rounds WHERE status IN ('open','playoff') ORDER BY id DESC LIMIT 1`,
      )
      .get() as RoundRow | undefined;
  }

  getRoundById(id: number): RoundRow | undefined {
    return this.db
      .prepare(`SELECT * FROM rounds WHERE id = ?`)
      .get(id) as RoundRow | undefined;
  }

  openRound(gameDate: string): RoundRow {
    const info = this.db
      .prepare(
        `INSERT INTO rounds (game_date, status, playoff_level) VALUES (?, 'open', 0)`,
      )
      .run(gameDate);
    return this.getRoundById(Number(info.lastInsertRowid))!;
  }

  setPlayoff(roundId: number, playoffLevel: number): void {
    this.db
      .prepare(`UPDATE rounds SET status = 'playoff', playoff_level = ? WHERE id = ?`)
      .run(playoffLevel, roundId);
  }

  /**
   * Record a player's submission for the current playoff level, overwriting any
   * previous submission they made at the same level (re-submission before
   * resolution wins).
   */
  upsertSubmission(params: {
    roundId: number;
    playerId: number;
    playoffLevel: number;
    source: SubmissionSource;
    rawRef: string | null;
    score: number;
    submittedAt?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO submissions (round_id, player_id, playoff_level, source, raw_ref, score, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(round_id, player_id, playoff_level)
         DO UPDATE SET source = excluded.source, raw_ref = excluded.raw_ref,
                       score = excluded.score, submitted_at = excluded.submitted_at,
                       created_at = datetime('now')`,
      )
      .run(
        params.roundId,
        params.playerId,
        params.playoffLevel,
        params.source,
        params.rawRef,
        params.score,
        params.submittedAt ?? null,
      );
  }

  getSubmissionsForLevel(roundId: number, playoffLevel: number): SubmissionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM submissions WHERE round_id = ? AND playoff_level = ? ORDER BY created_at`,
      )
      .all(roundId, playoffLevel) as unknown as SubmissionRow[];
  }

  resolveRound(roundId: number, winnerPlayerId: number): void {
    const tx = this.db;
    tx.exec("BEGIN");
    try {
      tx.prepare(
        `UPDATE rounds SET status = 'resolved', winner_player_id = ?, resolved_at = datetime('now') WHERE id = ?`,
      ).run(winnerPlayerId, roundId);
      tx.prepare(
        `INSERT INTO points (player_id, round_id, points) VALUES (?, ?, 1)
         ON CONFLICT(round_id) DO NOTHING`,
      ).run(winnerPlayerId, roundId);
      tx.exec("COMMIT");
    } catch (err) {
      tx.exec("ROLLBACK");
      throw err;
    }
  }

  /** Close a round without awarding a point (e.g. an incomplete game day). */
  abandonRound(roundId: number): void {
    this.db
      .prepare(
        `UPDATE rounds SET status = 'resolved', winner_player_id = NULL, resolved_at = datetime('now') WHERE id = ?`,
      )
      .run(roundId);
  }

  /** @returns true if this message key was already processed. */
  isMessageProcessed(messageKey: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 AS x FROM processed_messages WHERE message_key = ?`)
      .get(messageKey);
    return row !== undefined;
  }

  /** @returns true if newly recorded, false if it was already present. */
  markMessageProcessed(messageKey: string): boolean {
    const info = this.db
      .prepare(`INSERT OR IGNORE INTO processed_messages (message_key) VALUES (?)`)
      .run(messageKey);
    return info.changes > 0;
  }

  /** Cumulative points tally across all resolved rounds, highest first. */
  getTally(): TallyEntry[] {
    return this.db
      .prepare(
        `SELECT p.id AS playerId, p.display_name AS displayName,
                COALESCE(SUM(pt.points), 0) AS points
         FROM players p
         LEFT JOIN points pt ON pt.player_id = p.id
         WHERE p.active = 1
         GROUP BY p.id
         ORDER BY points DESC, p.display_name ASC`,
      )
      .all() as unknown as TallyEntry[];
  }

  // ─────────────────────────── Analytics ───────────────────────────

  /** Level-0 scores for a round (the "main game" everyone plays), with names. */
  getDayScores(roundId: number): PlayerScore[] {
    return this.db
      .prepare(
        `SELECT s.player_id AS playerId, p.display_name AS displayName,
                s.score AS score, s.submitted_at AS submittedAt
         FROM submissions s
         JOIN players p ON p.id = s.player_id
         WHERE s.round_id = ? AND s.playoff_level = 0
         ORDER BY s.score DESC`,
      )
      .all(roundId) as unknown as PlayerScore[];
  }

  /** Every level-0 score across history (for all-time records/averages). */
  getAllDayScores(): (PlayerScore & { gameDate: string })[] {
    return this.db
      .prepare(
        `SELECT s.player_id AS playerId, p.display_name AS displayName,
                s.score AS score, s.submitted_at AS submittedAt,
                r.game_date AS gameDate
         FROM submissions s
         JOIN players p ON p.id = s.player_id
         JOIN rounds r ON r.id = s.round_id
         WHERE s.playoff_level = 0
         ORDER BY r.game_date ASC, s.score DESC`,
      )
      .all() as unknown as (PlayerScore & { gameDate: string })[];
  }

  /** Resolved rounds that awarded a winner, oldest first. */
  getDecidedRounds(): Array<{
    roundId: number;
    gameDate: string;
    winnerPlayerId: number;
    winnerName: string;
  }> {
    return this.db
      .prepare(
        `SELECT r.id AS roundId, r.game_date AS gameDate,
                r.winner_player_id AS winnerPlayerId, p.display_name AS winnerName
         FROM rounds r
         JOIN players p ON p.id = r.winner_player_id
         WHERE r.status = 'resolved' AND r.winner_player_id IS NOT NULL
         ORDER BY r.game_date ASC, r.id ASC`,
      )
      .all() as unknown as Array<{
      roundId: number;
      gameDate: string;
      winnerPlayerId: number;
      winnerName: string;
    }>;
  }

  getRecord(key: string): RecordRow | undefined {
    return this.db
      .prepare(`SELECT * FROM records WHERE key = ?`)
      .get(key) as RecordRow | undefined;
  }

  upsertRecord(rec: {
    key: string;
    metric: number;
    playerId: number | null;
    gameDate: string | null;
    detail: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO records (key, metric, player_id, game_date, detail, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET metric = excluded.metric,
           player_id = excluded.player_id, game_date = excluded.game_date,
           detail = excluded.detail, updated_at = datetime('now')`,
      )
      .run(rec.key, rec.metric, rec.playerId, rec.gameDate, rec.detail);
  }
}

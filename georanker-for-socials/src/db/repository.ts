import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Player } from "../config.js";
import { rosterKeyFor } from "../config.js";
import { SCHEMA_SQL } from "./schema.js";
import type {
  DisqualificationEntry,
  ImageSubmissionRow,
  PlayerRow,
  PlayerScore,
  RecordRow,
  RoundRow,
  SubmissionRow,
  SubmissionSource,
  TallyEntry,
} from "./models.js";
import type { DayResolution } from "../engine/dayResolver.js";

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

  /** The most recent round for a given game date, if one exists. */
  getRoundByDate(gameDate: string): RoundRow | undefined {
    return this.db
      .prepare(`SELECT * FROM rounds WHERE game_date = ? ORDER BY id DESC LIMIT 1`)
      .get(gameDate) as RoundRow | undefined;
  }

  /**
   * Administratively set (or clear) the winner of a game day and rebuild the
   * single point for that round. Creates the round if it doesn't exist yet.
   * Passing `winnerPlayerId: null` records the day as played with no winner
   * (e.g. an unbreakable tie or a day nobody contested). When `winningScore` is
   * given, the winner's level-0 GeoRankl score is recorded too, so the dashboard
   * shows an accurate winning score. This is the manual correction path used when
   * the vision extractor misreads a day.
   */
  overrideDayResult(params: {
    gameDate: string;
    winnerPlayerId: number | null;
    winningScore?: number | null;
  }): void {
    const tx = this.db;
    tx.exec("BEGIN");
    try {
      const existing = tx
        .prepare(`SELECT id FROM rounds WHERE game_date = ? ORDER BY id DESC LIMIT 1`)
        .get(params.gameDate) as { id: number } | undefined;
      const roundId = existing
        ? existing.id
        : Number(
            tx
              .prepare(
                `INSERT INTO rounds (game_date, status, playoff_level) VALUES (?, 'resolved', 0)`,
              )
              .run(params.gameDate).lastInsertRowid,
          );

      tx.prepare(
        `UPDATE rounds SET status = 'resolved', winner_player_id = ?, resolved_at = datetime('now') WHERE id = ?`,
      ).run(params.winnerPlayerId, roundId);

      // Rebuild the round's single point from scratch so re-running is idempotent.
      tx.prepare(`DELETE FROM points WHERE round_id = ?`).run(roundId);
      if (params.winnerPlayerId !== null) {
        tx.prepare(
          `INSERT INTO points (player_id, round_id, points) VALUES (?, ?, 1)
           ON CONFLICT(round_id) DO NOTHING`,
        ).run(params.winnerPlayerId, roundId);

        if (params.winningScore !== undefined && params.winningScore !== null) {
          tx.prepare(
            `INSERT INTO submissions (round_id, player_id, playoff_level, source, raw_ref, score, submitted_at)
             VALUES (?, ?, 0, 'image', NULL, ?, NULL)
             ON CONFLICT(round_id, player_id, playoff_level)
             DO UPDATE SET score = excluded.score`,
          ).run(roundId, params.winnerPlayerId, params.winningScore);
        }
      }
      tx.exec("COMMIT");
    } catch (err) {
      tx.exec("ROLLBACK");
      throw err;
    }
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

  // ─────────────────── Raw image submissions (export mode) ───────────────────

  /** @returns true if this image message key was already ingested. */
  imageSubmissionExists(messageKey: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 AS x FROM image_submissions WHERE message_key = ?`)
      .get(messageKey);
    return row !== undefined;
  }

  /** Insert a scored image. @returns true if newly inserted, false if a dupe. */
  insertImageSubmission(row: {
    messageKey: string;
    gameDate: string;
    playerId: number;
    score: number | null;
    submittedAt: string | null;
    attachedFile: string | null;
    msgOrder: number;
  }): boolean {
    const info = this.db
      .prepare(
        `INSERT OR IGNORE INTO image_submissions
           (message_key, game_date, player_id, score, submitted_at, attached_file, msg_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.messageKey,
        row.gameDate,
        row.playerId,
        row.score,
        row.submittedAt,
        row.attachedFile,
        row.msgOrder,
      );
    return info.changes > 0;
  }

  /** Distinct game dates that have at least one ingested image, oldest first. */
  getImageDays(): string[] {
    return (
      this.db
        .prepare(`SELECT DISTINCT game_date FROM image_submissions ORDER BY game_date ASC`)
        .all() as unknown as Array<{ game_date: string }>
    ).map((r) => r.game_date);
  }

  /** All ingested images for a day, ordered chronologically per player. */
  getImagesForDay(gameDate: string): ImageSubmissionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM image_submissions
         WHERE game_date = ?
         ORDER BY player_id ASC, submitted_at ASC, msg_order ASC`,
      )
      .all(gameDate) as unknown as ImageSubmissionRow[];
  }

  /** Whether any round already exists for the given game date. */
  roundExistsForDate(gameDate: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 AS x FROM rounds WHERE game_date = ? LIMIT 1`)
      .get(gameDate);
    return row !== undefined;
  }

  /**
   * Persist a resolved game day, replacing any previous round for that date so
   * re-processing (e.g. a later, fuller export) stays correct and idempotent.
   * @returns the new round id.
   */
  saveDayResolution(res: DayResolution): number {
    const tx = this.db;
    tx.exec("BEGIN");
    try {
      // Remove any prior round for this date and its dependent rows. Points have
      // no cascade, so delete them explicitly; submissions/DQs cascade.
      const priorRounds = tx
        .prepare(`SELECT id FROM rounds WHERE game_date = ?`)
        .all(res.gameDate) as unknown as Array<{ id: number }>;
      for (const r of priorRounds) {
        tx.prepare(`DELETE FROM points WHERE round_id = ?`).run(r.id);
        tx.prepare(`DELETE FROM rounds WHERE id = ?`).run(r.id);
      }

      const maxLevel = res.playoffs.length;
      const info = tx
        .prepare(
          `INSERT INTO rounds (game_date, status, playoff_level, winner_player_id, resolved_at)
           VALUES (?, 'resolved', ?, ?, datetime('now'))`,
        )
        .run(res.gameDate, maxLevel, res.winnerPlayerId);
      const roundId = Number(info.lastInsertRowid);

      const insertSub = tx.prepare(
        `INSERT INTO submissions (round_id, player_id, playoff_level, source, raw_ref, score, submitted_at)
         VALUES (?, ?, ?, 'image', NULL, ?, ?)`,
      );
      for (const s of res.level0) {
        insertSub.run(roundId, s.playerId, 0, s.score, s.submittedAt);
      }
      for (const p of res.playoffs) {
        for (const part of p.participants) {
          insertSub.run(roundId, part.playerId, p.level, part.score, null);
        }
      }

      if (res.winnerPlayerId !== null) {
        tx.prepare(
          `INSERT INTO points (player_id, round_id, points) VALUES (?, ?, 1)
           ON CONFLICT(round_id) DO NOTHING`,
        ).run(res.winnerPlayerId, roundId);
      }

      const insertDq = tx.prepare(
        `INSERT OR IGNORE INTO disqualifications (round_id, player_id) VALUES (?, ?)`,
      );
      for (const dq of res.dqs) {
        insertDq.run(roundId, dq.playerId);
      }

      tx.exec("COMMIT");
      return roundId;
    } catch (err) {
      tx.exec("ROLLBACK");
      throw err;
    }
  }

  /** Per-player count of days disqualified (no readable picture), most first. */
  getDisqualificationCounts(): DisqualificationEntry[] {
    return this.db
      .prepare(
        `SELECT d.player_id AS playerId, p.display_name AS displayName,
                COUNT(*) AS count
         FROM disqualifications d
         JOIN players p ON p.id = d.player_id
         GROUP BY d.player_id
         ORDER BY count DESC, p.display_name ASC`,
      )
      .all() as unknown as DisqualificationEntry[];
  }

  /** Players disqualified on a specific round/day. */
  getDayDisqualifications(roundId: number): Array<{ playerId: number; displayName: string }> {
    return this.db
      .prepare(
        `SELECT d.player_id AS playerId, p.display_name AS displayName
         FROM disqualifications d
         JOIN players p ON p.id = d.player_id
         WHERE d.round_id = ?
         ORDER BY p.display_name ASC`,
      )
      .all(roundId) as unknown as Array<{ playerId: number; displayName: string }>;
  }

  getRecord(key: string): RecordRow | undefined {
    return this.db
      .prepare(`SELECT * FROM records WHERE key = ?`)
      .get(key) as RecordRow | undefined;
  }

  /** Wipe the hall of records so it can be recomputed from full history. */
  clearRecords(): void {
    this.db.exec(`DELETE FROM records`);
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

  // ───────────────────────── Key/value app state ─────────────────────────

  getState(key: string): string | undefined {
    const row = this.db
      .prepare(`SELECT value FROM app_state WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}

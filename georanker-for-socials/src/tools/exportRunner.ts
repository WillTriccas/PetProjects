/**
 * Reusable WhatsApp "Export chat" processing core, shared by the CLI
 * (`npm run process-export`) and the web upload endpoint.
 *
 * ── Scoring model (image-only, first-picture, DQ, playoffs) ──────────────────
 * Only pictures count as official scores. For each player each day, their FIRST
 * picture is their GeoRankl score; a player who posts no readable picture is
 * disqualified (DQ) for the day. Ties on the top GeoRankl score are broken using
 * the tied players' subsequent pictures. See {@link resolveDay} for the rules.
 *
 * ── Idempotent incremental uploads ──────────────────────────────────────────
 * Every scored image is stored once, keyed by a stable per-media dedupe key, so
 * re-uploading a full or overlapping export never re-reads an image or double
 * counts. Only the game days that gained new images are re-resolved; days that
 * didn't change are left untouched. So you can keep uploading the whole chat and
 * only genuinely new activity is ever added.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { normaliseName, rosterKeyFor, type AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { Repository } from "../db/repository.js";
import type { ImageSubmissionRow } from "../db/models.js";
import { createImageExtractor, type ImageScoreExtractor } from "../extractor/index.js";
import { resolveDay, type PlayerDay, type PlayoffRound } from "../engine/dayResolver.js";
import { StatsService } from "../analytics/statsService.js";
import { formatScore } from "../announcer/format.js";
import type { GroupMessenger } from "../announcer/announcer.js";
import { parseExport, type ParsedExportMessage } from "../whatsapp/exportParser.js";

export interface ExportRunResult {
  parsedMessages: number;
  /** Newly ingested images (not seen in a prior upload). */
  newImages: number;
  /** Game days (re)resolved as a result of this upload. */
  resolvedDays: number;
  /** Days that produced a winner in this run. */
  decidedRounds: number;
}

/** Resolve an export input (folder or .txt) into a transcript + media dir. */
export function resolveExportPaths(inputPath: string): { txtPath: string; mediaDir: string } {
  if (!existsSync(inputPath)) {
    throw new Error(`Export path not found: ${inputPath}`);
  }
  const stat = statSync(inputPath);
  if (stat.isDirectory()) {
    const txts = readdirSync(inputPath).filter((f) => f.toLowerCase().endsWith(".txt"));
    if (txts.length === 0) {
      throw new Error(`No .txt transcript found in ${inputPath}`);
    }
    // Prefer the iOS "_chat.txt" name when present.
    const chosen = txts.find((f) => f.toLowerCase() === "_chat.txt") ?? txts[0]!;
    return { txtPath: join(inputPath, chosen), mediaDir: inputPath };
  }
  return { txtPath: inputPath, mediaDir: join(inputPath, "..") };
}

function mimeForFile(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

/**
 * Stable dedupe key for an image message. WhatsApp media filenames are unique
 * within an export and stable across re-exports of the same chat, so keying on
 * the filename (plus sender) makes re-uploads idempotent regardless of where the
 * message falls in a larger file.
 */
function imageMessageKey(msg: ParsedExportMessage): string {
  return createHash("sha1")
    .update(`${msg.sender ?? ""}\u0000${msg.attachedFile ?? ""}\u0000${msg.isoDate ?? msg.dayKey}`)
    .digest("hex");
}

/** Extract a score from a message's attached image, or null if unreadable/missing. */
async function extractImageScore(
  msg: ParsedExportMessage,
  mediaDir: string,
  extractor: ImageScoreExtractor,
): Promise<number | null> {
  if (!msg.attachedFile) return null;
  const filePath = join(mediaDir, msg.attachedFile);
  if (!existsSync(filePath)) {
    logger.warn(
      { file: msg.attachedFile },
      "Referenced media not found (was the chat exported without media?)",
    );
    return null;
  }
  const buffer = readFileSync(filePath);
  const score = await extractor.extractFromImage(buffer, mimeForFile(msg.attachedFile));
  if (score === null) {
    logger.warn({ file: msg.attachedFile, sender: msg.sender }, "Could not read score from image");
  }
  return score;
}

/**
 * Build per-player chronological image lists for a day. Every ACTIVE roster
 * player is included — even those with no image that day, so the resolver can
 * disqualify them (no picture = DQ).
 */
function toPlayerDays(rows: ImageSubmissionRow[], repo: Repository): PlayerDay[] {
  const byPlayer = new Map<number, PlayerDay>();
  for (const p of repo.getActivePlayers()) {
    byPlayer.set(p.id, { playerId: p.id, displayName: p.display_name, images: [] });
  }
  for (const row of rows) {
    let pd = byPlayer.get(row.player_id);
    if (!pd) {
      const player = repo.getPlayerById(row.player_id);
      pd = {
        playerId: row.player_id,
        displayName: player?.display_name ?? `#${row.player_id}`,
        images: [],
      };
      byPlayer.set(row.player_id, pd);
    }
    pd.images.push({ score: row.score, submittedAt: row.submitted_at });
  }
  return [...byPlayer.values()];
}

function formatPlayoffLead(playoffs: PlayoffRound[], winnerName: string | null): string {
  if (playoffs.length === 0) return "";
  const lines = playoffs.map((p) => {
    const scores = p.participants
      .map((part) => `${part.displayName} ${formatScore(part.score)}`)
      .join(" vs ");
    const out =
      p.eliminated.length > 0 ? ` (out: ${p.eliminated.map((e) => e.displayName).join(", ")})` : "";
    return `• Playoff ${p.level}: ${scores}${out}`;
  });
  const tail = winnerName ? `\n${winnerName} takes the tie-break. ⚔️` : "";
  return `⚔️ *Tie-break needed!*\n${lines.join("\n")}${tail}`;
}

function formatDqLead(dqs: Array<{ displayName: string }>): string {
  if (dqs.length === 0) return "";
  return `🚫 *DQ* (no screenshot posted): ${dqs.map((d) => d.displayName).join(", ")}`;
}

/**
 * Process a WhatsApp export transcript into the shared DB, posting an
 * announcement per newly-resolved day via `messenger`. The caller owns the
 * repository (so the web server can reuse its live DB connection).
 */
export async function runExport(params: {
  config: AppConfig;
  repo: Repository;
  txtPath: string;
  mediaDir: string;
  messenger: GroupMessenger;
  /** Optional extractor override (defaults to the configured one) — used in tests. */
  extractor?: ImageScoreExtractor;
}): Promise<ExportRunResult> {
  const { config, repo, txtPath, mediaDir, messenger } = params;
  logger.info({ txtPath, mediaDir }, "Processing WhatsApp export (image-only)");

  const extractor = params.extractor ?? createImageExtractor(config.env);
  const stats = new StatsService(repo);

  const messages = parseExport(readFileSync(txtPath, "utf8"));
  logger.info({ count: messages.length }, "Parsed messages");

  // ── 1. Ingest only NEW images (skip anything already stored) ──────────────
  const affectedDays = new Set<string>();
  let newImages = 0;

  for (const msg of messages) {
    if (!msg.sender || !msg.attachedFile) continue; // image-only: text never counts
    if (!msg.isoDate) {
      logger.warn({ sender: msg.sender }, "Skipping image with unparseable date");
      continue;
    }
    const rosterPlayer = config.playersByName.get(normaliseName(msg.sender));
    if (!rosterPlayer) continue;
    const dbPlayer = repo.getPlayerByRosterKey(rosterKeyFor(rosterPlayer));
    if (!dbPlayer) continue;

    const key = imageMessageKey(msg);
    if (repo.imageSubmissionExists(key)) continue; // already ingested — don't re-read

    const score = await extractImageScore(msg, mediaDir, extractor);
    const inserted = repo.insertImageSubmission({
      messageKey: key,
      gameDate: msg.isoDate,
      playerId: dbPlayer.id,
      score,
      submittedAt: msg.isoTimestamp,
      attachedFile: msg.attachedFile,
      msgOrder: msg.order,
    });
    if (inserted) {
      newImages++;
      affectedDays.add(msg.isoDate);
    }
  }

  // Also resolve any image-day that somehow has no round yet (e.g. interrupted run).
  for (const day of repo.getImageDays()) {
    if (!repo.roundExistsForDate(day)) affectedDays.add(day);
  }

  // ── 2. Re-resolve affected days chronologically, announcing each winner ────
  let resolvedDays = 0;
  let decidedRounds = 0;

  for (const day of [...affectedDays].sort()) {
    const rows = repo.getImagesForDay(day);
    const resolution = resolveDay(day, toPlayerDays(rows, repo));
    const roundId = repo.saveDayResolution(resolution);
    resolvedDays++;

    if (resolution.winnerPlayerId !== null && resolution.winningScore !== null) {
      decidedRounds++;
      const winner = repo.getPlayerById(resolution.winnerPlayerId);
      const round = repo.getRoundById(roundId);
      if (winner && round) {
        const message = stats.buildResolvedMessageReadOnly(
          round,
          winner,
          resolution.winningScore,
          repo.getTally(),
          [
            formatPlayoffLead(resolution.playoffs, winner.display_name),
            formatDqLead(resolution.dqs),
          ],
        );
        await messenger.sendToGroup(message);
      }
    } else if (resolution.dqs.length > 0) {
      logger.info({ day, dqs: resolution.dqs.length }, "Day had no winner (all DQ / unresolved tie)");
    }
  }

  // ── 3. Rebuild the hall of records from full history ──────────────────────
  stats.recomputeRecords();

  logger.info({ newImages, resolvedDays, decidedRounds }, "Export processing complete");
  return { parsedMessages: messages.length, newImages, resolvedDays, decidedRounds };
}

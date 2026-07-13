/**
 * Reusable WhatsApp "Export chat" processing core, shared by the CLI
 * (`npm run process-export`) and the authenticated web upload endpoint.
 *
 * It feeds the parsed transcript through the same engine/DB/announcer the live
 * bots use, so standings stay unified across every ingest path. Idempotent:
 * already-seen messages are skipped, so re-running an export never double counts.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { normaliseName, rosterKeyFor, type AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { Repository } from "../db/repository.js";
import { createImageExtractor, parseScoreFromText } from "../extractor/index.js";
import { RoundEngine } from "../engine/roundEngine.js";
import { Announcer, type GroupMessenger } from "../announcer/announcer.js";
import { StatsService } from "../analytics/statsService.js";
import { parseExport, type ParsedExportMessage } from "../whatsapp/exportParser.js";

export interface ExportRunResult {
  parsedMessages: number;
  newlyProcessed: number;
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

function messageKey(msg: ParsedExportMessage): string {
  return createHash("sha1")
    .update(`${msg.isoDate ?? msg.dayKey}\u0000${msg.order}\u0000${msg.sender}\u0000${msg.body}`)
    .digest("hex");
}

async function scoreForMessage(
  msg: ParsedExportMessage,
  mediaDir: string,
  extractor: ReturnType<typeof createImageExtractor>,
): Promise<{ score: number; source: "image" | "text" } | null> {
  if (msg.attachedFile) {
    const filePath = join(mediaDir, msg.attachedFile);
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      const score = await extractor.extractFromImage(buffer, mimeForFile(msg.attachedFile));
      if (score !== null) return { score, source: "image" };
      logger.warn({ file: msg.attachedFile, sender: msg.sender }, "Could not read score from image");
      return null;
    }
    logger.warn(
      { file: msg.attachedFile },
      "Referenced media not found (was the chat exported without media?)",
    );
  }
  const textScore = parseScoreFromText(msg.body);
  if (textScore !== null) return { score: textScore, source: "text" };
  return null;
}

/**
 * Process a WhatsApp export transcript into the shared DB, posting each
 * announcement via `messenger`. The caller owns the repository (so the web
 * server can reuse its live DB connection).
 */
export async function runExport(params: {
  config: AppConfig;
  repo: Repository;
  txtPath: string;
  mediaDir: string;
  messenger: GroupMessenger;
}): Promise<ExportRunResult> {
  const { config, repo, txtPath, mediaDir, messenger } = params;
  logger.info({ txtPath, mediaDir }, "Processing WhatsApp export");

  const extractor = createImageExtractor(config.env);
  const engine = new RoundEngine(repo, config.env.TIMEZONE);
  const stats = new StatsService(repo);
  const announcer = new Announcer(messenger, stats);

  const messages = parseExport(readFileSync(txtPath, "utf8"));
  logger.info({ count: messages.length }, "Parsed messages");

  let prevDayKey: string | null = null;
  let newlyProcessed = 0;
  let decidedRounds = 0;

  const flushIncompleteDay = () => {
    const round = repo.getCurrentRound();
    if (round) {
      repo.abandonRound(round.id);
      logger.info(
        { gameDate: round.game_date },
        "Day incomplete — not everyone submitted, no winner awarded",
      );
    }
  };

  for (const msg of messages) {
    if (prevDayKey !== null && msg.dayKey !== prevDayKey) {
      flushIncompleteDay();
    }
    prevDayKey = msg.dayKey;

    if (!msg.sender) continue;
    const player = config.playersByName.get(normaliseName(msg.sender));
    if (!player) continue;

    const key = messageKey(msg);
    if (repo.isMessageProcessed(key)) continue;

    const result = await scoreForMessage(msg, mediaDir, extractor);
    // Only mark as processed once we know its outcome, so it isn't double-counted
    // on a re-run. Non-score chatter is left unmarked (cheap to re-skip).
    if (!result) continue;
    repo.markMessageProcessed(key);
    newlyProcessed++;

    const dbPlayer = repo.getPlayerByRosterKey(rosterKeyFor(player));
    if (!dbPlayer) continue;

    const outcome = engine.recordScore({
      playerId: dbPlayer.id,
      score: result.score,
      source: result.source,
      rawRef: key,
      gameDate: msg.isoDate ?? undefined,
      submittedAt: msg.isoTimestamp ?? undefined,
    });
    if (outcome.type === "resolved" || outcome.type === "playoff") decidedRounds++;
    await announcer.announce(outcome);
  }

  flushIncompleteDay();

  logger.info({ newlyProcessed, decidedRounds }, "Export processing complete");
  return { parsedMessages: messages.length, newlyProcessed, decidedRounds };
}

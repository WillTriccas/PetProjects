/**
 * ── TELEGRAM ────────────────────────────────────────────────────────────────
 * Wires the shared engine/DB/analytics to the Telegram transport for a fully
 * automated bot: it reads scores from the group, decides winners, tracks the
 * cumulative tally, and posts enriched announcements (with records + callouts)
 * back to the group — all with zero WhatsApp ban risk.
 *
 * Standings are unified with the other modes because every player resolves to
 * the same roster_key regardless of platform.
 *
 * Two transports share the exact same wiring (`wireTelegram`):
 *   - long-polling  → `startTelegramApp()` (local / always-on `npm run telegram`)
 *   - webhook       → the hosted web server mounts `client.webhookMiddleware()`
 */

import { loadConfig, rosterKeyFor, type AppConfig, type Player } from "../config.js";
import { logger } from "../logger.js";
import { Repository } from "../db/repository.js";
import { createImageExtractor, parseScoreFromText } from "../extractor/index.js";
import { RoundEngine } from "../engine/roundEngine.js";
import { localTimestampFor } from "../engine/gameDate.js";
import { Announcer } from "../announcer/announcer.js";
import { StatsService } from "../analytics/statsService.js";
import { TelegramClient, type IncomingTelegramMessage } from "./telegramClient.js";

/** Validate + parse the Telegram config, throwing friendly errors if missing. */
export function telegramChatId(config: AppConfig): number {
  if (!config.env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is required to run the Telegram bot. Create a bot with @BotFather and set it in .env.",
    );
  }
  if (!config.env.TELEGRAM_CHAT_ID) {
    throw new Error(
      "TELEGRAM_CHAT_ID is required. Add the bot to your group and set the group's chat id in .env.",
    );
  }
  const chatId = Number(config.env.TELEGRAM_CHAT_ID);
  if (!Number.isFinite(chatId)) {
    throw new Error(
      `TELEGRAM_CHAT_ID must be numeric (e.g. -1001234567890), got: ${config.env.TELEGRAM_CHAT_ID}`,
    );
  }
  return chatId;
}

/**
 * Build a fully-wired {@link TelegramClient} against the given repository: score
 * extraction, the round engine, and the announcer are all connected, and the
 * group-message handler is registered. The caller chooses the transport —
 * `connect()` for long-poll, or `webhookMiddleware()` for a hosted webhook.
 *
 * The repository is owned by the caller so the web server can share one DB
 * connection between the dashboard API and the live bot.
 */
export function wireTelegram(config: AppConfig, repo: Repository): TelegramClient {
  const chatId = telegramChatId(config);

  const imageExtractor = createImageExtractor(config.env);
  const engine = new RoundEngine(repo, config.env.TIMEZONE);
  const stats = new StatsService(repo);

  const telegram = new TelegramClient({ botToken: config.env.TELEGRAM_BOT_TOKEN!, chatId });
  const announcer = new Announcer(telegram, stats);

  const resolvePlayer = (msg: IncomingTelegramMessage): Player | undefined => {
    const byId = config.playersByTelegramId.get(msg.senderId);
    if (byId) return byId;
    if (msg.username) return config.playersByTelegramUsername.get(msg.username.toLowerCase());
    return undefined;
  };

  telegram.onGroupMessage(async (msg) => {
    const rosterPlayer = resolvePlayer(msg);
    if (!rosterPlayer) {
      logger.debug({ senderId: msg.senderId, username: msg.username }, "Message from non-roster sender; ignoring");
      return;
    }
    const player = repo.getPlayerByRosterKey(rosterKeyFor(rosterPlayer));
    if (!player) return;

    let score: number | null = null;
    let source: "image" | "text" = "text";

    if (msg.image) {
      source = "image";
      const { buffer, mimeType } = await msg.image.download();
      score = await imageExtractor.extractFromImage(buffer, mimeType);
      if (score === null) {
        logger.warn({ player: player.display_name }, "Could not read score from image");
        await telegram.sendToGroup(
          `🤔 ${player.display_name}, I couldn't read a score from that screenshot — mind resending a clearer one?`,
        );
        return;
      }
    } else if (msg.text) {
      score = parseScoreFromText(msg.text);
      if (score === null) {
        if (/\d/.test(msg.text)) {
          await telegram.sendToGroup(
            `🤔 ${player.display_name}, I couldn't work out your score from that — send just the number or a screenshot?`,
          );
        }
        return;
      }
    } else {
      return;
    }

    const submittedAt = localTimestampFor(config.env.TIMEZONE, new Date(msg.timestamp * 1000));
    logger.info({ player: player.display_name, score, source }, "Recording score");
    const outcome = engine.recordScore({
      playerId: player.id,
      score,
      source,
      rawRef: msg.rawRef,
      submittedAt,
    });
    await announcer.announce(outcome);
  });

  return telegram;
}

/**
 * Long-polling entry used by `npm run telegram` (local, or always-on hosting
 * where an inbound webhook isn't available). Owns its own repository.
 */
export async function startTelegramApp(): Promise<{ shutdown: () => void }> {
  const config = loadConfig();
  const chatId = telegramChatId(config);

  logger.info(
    { players: config.roster.players.length, chatId },
    "Starting GeoRanker for socials (Telegram, long-poll)",
  );

  const repo = new Repository(config.env.DB_PATH);
  repo.syncPlayers(config.roster.players);

  const telegram = wireTelegram(config, repo);
  await telegram.connect();

  return {
    shutdown: () => {
      void telegram.stop();
      repo.close();
    },
  };
}

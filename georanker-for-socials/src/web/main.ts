/**
 * ── WEB ─────────────────────────────────────────────────────────────────────
 * Entry point for the hosted service (`npm run serve` / `npm start`). Boots the
 * shared DB, optionally wires the live Telegram bot as a webhook, and serves the
 * dashboard + API on the configured PORT.
 */

import "dotenv/config";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { Repository } from "../db/repository.js";
import { wireTelegram } from "../telegram/telegramApp.js";
import { createApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const repo = new Repository(config.env.DB_PATH);
  repo.syncPlayers(config.roster.players);

  const telegramConfigured = Boolean(config.env.TELEGRAM_BOT_TOKEN && config.env.TELEGRAM_CHAT_ID);
  const canWebhook = telegramConfigured && Boolean(config.env.PUBLIC_URL);

  // Wiring the Telegram bot must never take down the dashboard: a bad/placeholder
  // token or chat id should degrade gracefully (dashboard + upload keep working).
  let telegram: ReturnType<typeof wireTelegram> | undefined;
  if (canWebhook) {
    try {
      telegram = wireTelegram(config, repo);
    } catch (err) {
      logger.error({ err }, "Failed to wire Telegram bot; continuing without it (dashboard still available)");
    }
  }
  if (telegramConfigured && !canWebhook) {
    logger.warn(
      "Telegram is configured but PUBLIC_URL is not set — the hosted web process won't receive Telegram updates. " +
        "Set PUBLIC_URL to enable webhook mode, or run `npm run telegram` for local long-polling.",
    );
  }

  const app = createApp({ config, repo, telegram });
  const port = config.env.PORT;

  const server = app.listen(port, () => {
    logger.info({ port }, "GeoRanker for socials web dashboard listening");
  });

  if (telegram && config.env.PUBLIC_URL) {
    const url = `${config.env.PUBLIC_URL.replace(/\/$/, "")}/telegram/webhook`;
    try {
      await telegram.setWebhook(url, config.env.TELEGRAM_WEBHOOK_SECRET);
    } catch (err) {
      logger.error({ err, url }, "Failed to register Telegram webhook");
    }
  }

  const stop = (signal: string) => {
    logger.info({ signal }, "Shutting down web server");
    server.close();
    repo.close();
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during web startup");
  process.exit(1);
});

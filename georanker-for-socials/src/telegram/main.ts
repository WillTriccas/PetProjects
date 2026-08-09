// ── TELEGRAM entry point ─────────────────────────────────────────────────────
// Runs the fully-automated Telegram bot: `npm run telegram`.
import { logger } from "../logger.js";
import { startTelegramApp } from "./telegramApp.js";

async function main(): Promise<void> {
  const { shutdown } = await startTelegramApp();

  const stop = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during Telegram startup");
  process.exit(1);
});

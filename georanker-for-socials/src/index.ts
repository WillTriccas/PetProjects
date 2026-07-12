import { logger } from "./logger.js";
import { startApp } from "./app.js";

async function main(): Promise<void> {
  const { shutdown } = await startApp();

  const stop = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});

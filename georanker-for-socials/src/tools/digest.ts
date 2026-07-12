import "dotenv/config";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { Repository } from "../db/repository.js";
import { StatsService } from "../analytics/statsService.js";

/**
 * Prints the weekly "fun analytics" digest for the current database so you can
 * paste it into the group. Works regardless of which mode (export / live /
 * Telegram) produced the data.
 *
 *   npm run digest
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const repo = new Repository(config.env.DB_PATH);
  repo.syncPlayers(config.roster.players);
  const stats = new StatsService(repo);
  console.log(stats.buildDigest());
  repo.close();
}

main().catch((err) => {
  logger.error({ err }, "Failed to build digest");
  process.exit(1);
});

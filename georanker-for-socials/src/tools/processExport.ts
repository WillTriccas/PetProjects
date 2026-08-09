import "dotenv/config";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { Repository } from "../db/repository.js";
import { StatsService } from "../analytics/statsService.js";
import { type GroupMessenger } from "../announcer/announcer.js";
import { formatTally } from "../announcer/format.js";
import { resolveExportPaths, runExport } from "./exportRunner.js";

/** Prints announcements to the console for the user to copy-paste into the group. */
class ConsoleMessenger implements GroupMessenger {
  async sendToGroup(text: string): Promise<void> {
    console.log("\n📣 ─── post this in the group ───\n" + text + "\n────────────────────────────────");
  }
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: npm run process-export -- <path-to-export-folder-or-.txt>\n" +
        "Point it at the folder you got from WhatsApp → Export chat (or the _chat.txt inside it).",
    );
    process.exit(1);
  }

  const config = loadConfig();
  const repo = new Repository(config.env.DB_PATH);
  repo.syncPlayers(config.roster.players);
  const stats = new StatsService(repo);

  const { txtPath, mediaDir } = resolveExportPaths(inputPath);
  const result = await runExport({
    config,
    repo,
    txtPath,
    mediaDir,
    messenger: new ConsoleMessenger(),
  });

  console.log(`\n${"=".repeat(40)}\n📊 FINAL STANDINGS\n${"=".repeat(40)}`);
  console.log(formatTally(repo.getTally()));

  console.log(`\n${"=".repeat(40)}\n📣 ─── weekly digest (post when you like) ───`);
  console.log(stats.buildDigest());
  console.log("=".repeat(40));

  logger.info(result, "Export processing complete");
  repo.close();
}

main().catch((err) => {
  logger.error({ err }, "Failed to process export");
  process.exit(1);
});

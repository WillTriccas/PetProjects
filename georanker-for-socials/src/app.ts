import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { Repository } from "./db/repository.js";
import { createImageExtractor, parseScoreFromText } from "./extractor/index.js";
import { RoundEngine } from "./engine/roundEngine.js";
import { Announcer } from "./announcer/announcer.js";
import { WhatsAppClient, type IncomingMessage } from "./whatsapp/client.js";

/**
 * Wire everything together and start listening. Returns the connected client
 * so callers can manage shutdown.
 */
export async function startApp(): Promise<{ shutdown: () => void }> {
  const config = loadConfig();
  logger.info(
    { players: config.roster.players.length, group: config.env.GROUP_JID },
    "Starting GeoRanker for socials",
  );

  const repo = new Repository(config.env.DB_PATH);
  repo.syncPlayers(config.roster.players);

  const imageExtractor = createImageExtractor(config.env);
  const engine = new RoundEngine(repo, config.env.TIMEZONE);

  const whatsapp = new WhatsAppClient({
    authStateDir: config.env.AUTH_STATE_DIR,
    groupJid: config.env.GROUP_JID,
  });
  const announcer = new Announcer(whatsapp);

  whatsapp.onGroupMessage(async (msg: IncomingMessage) => {
    const player = repo.getPlayerByJid(msg.senderJid);
    if (!player) {
      logger.debug({ senderJid: msg.senderJid }, "Message from non-roster sender; ignoring");
      return;
    }

    let score: number | null = null;
    let source: "image" | "text" = "text";

    if (msg.image) {
      source = "image";
      const { buffer, mimeType } = await msg.image.download();
      score = await imageExtractor.extractFromImage(buffer, mimeType);
      if (score === null) {
        logger.warn({ player: player.display_name }, "Could not read score from image");
        await whatsapp.sendToGroup(
          `🤔 ${player.display_name}, I couldn't read a score from that screenshot — mind resending a clearer one?`,
        );
        return;
      }
    } else if (msg.text) {
      score = parseScoreFromText(msg.text);
      if (score === null) {
        // Only nudge if the message looked like a score attempt (contained digits).
        if (/\d/.test(msg.text)) {
          await whatsapp.sendToGroup(
            `🤔 ${player.display_name}, I couldn't work out your score from that — send just the number or a screenshot?`,
          );
        }
        return;
      }
    } else {
      return; // nothing to score
    }

    logger.info({ player: player.display_name, score, source }, "Recording score");
    const outcome = engine.recordScore({
      playerId: player.id,
      score,
      source,
      rawRef: msg.rawRef,
    });
    await announcer.announce(outcome);
  });

  await whatsapp.connect();

  return {
    shutdown: () => {
      repo.close();
    },
  };
}

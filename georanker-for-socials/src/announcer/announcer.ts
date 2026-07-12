import { logger } from "../logger.js";
import type { RoundOutcome } from "../engine/roundEngine.js";
import { formatPlayoffAnnouncement, formatWinnerAnnouncement } from "./format.js";

/** Anything that can post a text message into the target group. */
export interface GroupMessenger {
  sendToGroup(text: string): Promise<void>;
}

/**
 * Turns a round outcome into a group announcement. Only meaningful transitions
 * (a resolved winner or a new playoff) are announced — routine "recorded"
 * submissions stay quiet to avoid spamming the chat.
 */
export class Announcer {
  constructor(private readonly messenger: GroupMessenger) {}

  async announce(outcome: RoundOutcome): Promise<void> {
    switch (outcome.type) {
      case "resolved":
        await this.messenger.sendToGroup(
          formatWinnerAnnouncement(outcome.winner, outcome.winningScore, outcome.tally),
        );
        break;
      case "playoff":
        await this.messenger.sendToGroup(
          formatPlayoffAnnouncement(outcome.tiedPlayers, outcome.level),
        );
        break;
      case "recorded":
        logger.debug(
          { waitingOn: outcome.waitingOn.map((p) => p.display_name) },
          "Submission recorded; waiting on others",
        );
        break;
      case "ignored":
        logger.debug({ reason: outcome.reason }, "Submission ignored");
        break;
    }
  }
}

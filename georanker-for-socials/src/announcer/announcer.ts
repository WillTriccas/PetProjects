import { logger } from "../logger.js";
import type { RoundOutcome } from "../engine/roundEngine.js";
import type { StatsService } from "../analytics/statsService.js";
import { formatPlayoffAnnouncement, formatWinnerAnnouncement } from "./format.js";

/** Anything that can post a text message into the target group. */
export interface GroupMessenger {
  sendToGroup(text: string): Promise<void>;
}

/**
 * Turns a round outcome into a group announcement. Only meaningful transitions
 * (a resolved winner or a new playoff) are announced — routine "recorded"
 * submissions stay quiet to avoid spamming the chat.
 *
 * When a StatsService is provided, resolved-day messages are enriched with the
 * funky callouts (wooden spoon, fastest finger…) and all-time record breaks.
 */
export class Announcer {
  constructor(
    private readonly messenger: GroupMessenger,
    private readonly stats?: StatsService,
  ) {}

  async announce(outcome: RoundOutcome): Promise<void> {
    switch (outcome.type) {
      case "resolved": {
        const text = this.stats
          ? this.stats.buildResolvedMessage(
              outcome.round,
              outcome.winner,
              outcome.winningScore,
              outcome.tally,
            )
          : formatWinnerAnnouncement(outcome.winner, outcome.winningScore, outcome.tally);
        await this.messenger.sendToGroup(text);
        break;
      }
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

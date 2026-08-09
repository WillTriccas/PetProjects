/**
 * ── TELEGRAM ────────────────────────────────────────────────────────────────
 * Telegram bot client (grammy). This is the fully-automated, zero-ban-risk
 * transport: it listens to the target Telegram group, hands incoming photos/
 * text to the handler, and posts announcements back via the official Bot API.
 *
 * Set up a bot with @BotFather, add it to your group, and give it permission to
 * read messages (disable "Group Privacy" in BotFather, or make it an admin).
 */

import { Bot, webhookCallback } from "grammy";
import type { RequestHandler } from "express";
import { logger } from "../logger.js";
import type { GroupMessenger } from "../announcer/announcer.js";

export interface IncomingTelegramMessage {
  /** Telegram numeric user id of the sender. */
  senderId: number;
  /** Telegram @username of the sender (without @), if they have one. */
  username?: string;
  /** Message id, used as a submission reference. */
  rawRef: string;
  /** Unix seconds when the message was sent. */
  timestamp: number;
  /** Text/caption body, if any. */
  text?: string;
  /** Image payload, if the message contained a photo. */
  image?: { download: () => Promise<{ buffer: Buffer; mimeType: string }> };
}

export type TelegramMessageHandler = (msg: IncomingTelegramMessage) => Promise<void>;

export interface TelegramClientOptions {
  botToken: string;
  /** Target chat id (e.g. -1001234567890). Messages elsewhere are ignored. */
  chatId: number;
}

/**
 * grammy-backed Telegram client. Announcements are sent as plain text (the
 * `*bold*` markers used for WhatsApp are stripped so they don't show literally).
 */
export class TelegramClient implements GroupMessenger {
  private readonly bot: Bot;
  private readonly opts: TelegramClientOptions;
  private handler: TelegramMessageHandler | null = null;
  private handlersRegistered = false;

  constructor(opts: TelegramClientOptions) {
    this.opts = opts;
    this.bot = new Bot(opts.botToken);
  }

  onGroupMessage(handler: TelegramMessageHandler): void {
    this.handler = handler;
  }

  /**
   * Register the grammy update handlers exactly once. Shared by both the
   * long-polling (`connect`) and webhook (`webhookMiddleware`) transports.
   */
  private registerHandlers(): void {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    this.bot.on("message", async (ctx) => {
      try {
        if (ctx.chat.id !== this.opts.chatId) return; // only the target group
        if (!this.handler || !ctx.from) return;

        const photos = ctx.message.photo;
        const largest = photos && photos.length > 0 ? photos[photos.length - 1] : undefined;

        const incoming: IncomingTelegramMessage = {
          senderId: ctx.from.id,
          username: ctx.from.username,
          rawRef: String(ctx.message.message_id),
          timestamp: ctx.message.date,
          text: ctx.message.text ?? ctx.message.caption,
        };

        if (largest) {
          incoming.image = {
            download: async () => {
              const file = await ctx.api.getFile(largest.file_id);
              const url = `https://api.telegram.org/file/bot${this.opts.botToken}/${file.file_path}`;
              const res = await fetch(url);
              const buffer = Buffer.from(await res.arrayBuffer());
              return { buffer, mimeType: "image/jpeg" };
            },
          };
        }

        await this.handler(incoming);
      } catch (err) {
        logger.error({ err }, "Failed to handle Telegram message");
      }
    });

    this.bot.catch((err) => logger.error({ err: err.error }, "Telegram bot error"));
  }

  /** Long-poll for updates (local / always-on). Resolves once the bot is up. */
  async connect(): Promise<void> {
    this.registerHandlers();
    // start() long-polls; resolve once the bot is running so callers can proceed.
    void this.bot.start({
      onStart: (info) => logger.info({ username: info.username }, "Telegram bot connected (long-poll)"),
    });
  }

  /**
   * Express middleware that ingests Telegram webhook calls. Used when the app is
   * hosted behind a public HTTPS URL (e.g. Azure App Service) instead of polling.
   */
  webhookMiddleware(secretToken?: string): RequestHandler {
    this.registerHandlers();
    return webhookCallback(this.bot, "express", {
      secretToken,
    }) as RequestHandler;
  }

  /**
   * Register this bot's webhook with Telegram so updates are pushed to `url`.
   * `secretToken` (if set) must match the one given to `webhookMiddleware`.
   */
  async setWebhook(url: string, secretToken?: string): Promise<void> {
    await this.bot.init();
    await this.bot.api.setWebhook(url, {
      secret_token: secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
    logger.info({ url }, "Telegram webhook registered");
  }

  async sendToGroup(text: string): Promise<void> {
    const plain = text.replace(/\*/g, "");
    await this.bot.api.sendMessage(this.opts.chatId, plain);
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}

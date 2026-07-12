import { createRequire } from "node:module";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "../logger.js";
import type { GroupMessenger } from "../announcer/announcer.js";

// Baileys ships as CommonJS; use createRequire for reliable interop under ESM.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default ?? baileys.makeWASocket ?? baileys;
const {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  Browsers,
} = baileys;

export interface IncomingMessage {
  /** JID of the participant who sent the message (group sender). */
  senderJid: string;
  /** Message id, used as a submission reference. */
  rawRef: string;
  /** Unix seconds when the message was sent, if known. */
  timestamp?: number;
  /** Text body, if the message was text. */
  text?: string;
  /** Image payload, if the message contained an image. */
  image?: { download: () => Promise<{ buffer: Buffer; mimeType: string }> };
}

export type GroupMessageHandler = (msg: IncomingMessage) => Promise<void>;

export interface WhatsAppClientOptions {
  authStateDir: string;
  groupJid: string;
}

/**
 * Baileys-backed WhatsApp client. Connects a QR-linked account, listens for
 * messages in the target group, and can post announcements back to it.
 */
export class WhatsAppClient implements GroupMessenger {
  private sock: any;
  private handler: GroupMessageHandler | null = null;
  private readonly opts: WhatsAppClientOptions;

  constructor(opts: WhatsAppClientOptions) {
    this.opts = opts;
  }

  onGroupMessage(handler: GroupMessageHandler): void {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.opts.authStateDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.appropriate("GeoRanker for socials"),
      logger: logger.child({ module: "baileys" }),
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        logger.info("Scan this QR code in WhatsApp → Linked devices to link the bot:");
        qrcodeTerminal.generate(qr, { small: true });
      }
      if (connection === "open") {
        logger.info("WhatsApp connection established");
      }
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        logger.warn({ statusCode, loggedOut }, "WhatsApp connection closed");
        if (!loggedOut) {
          logger.info("Reconnecting to WhatsApp...");
          void this.connect();
        } else {
          logger.error(
            "Logged out of WhatsApp. Delete the auth_state directory and re-link by scanning the QR again.",
          );
        }
      }
    });

    sock.ev.on("messages.upsert", async (upsert: any) => {
      if (upsert.type !== "notify") return;
      for (const msg of upsert.messages ?? []) {
        try {
          await this.handleRawMessage(msg);
        } catch (err) {
          logger.error({ err }, "Failed to handle incoming message");
        }
      }
    });
  }

  private async handleRawMessage(msg: any): Promise<void> {
    if (!this.handler) return;
    const remoteJid: string | undefined = msg.key?.remoteJid;
    if (remoteJid !== this.opts.groupJid) return; // only the target group
    if (msg.key?.fromMe) return;

    const senderJid: string | undefined = msg.key?.participant ?? remoteJid;
    if (!senderJid) return;

    const rawRef: string = msg.key?.id ?? "";
    const content = msg.message ?? {};

    const tsRaw = msg.messageTimestamp;
    const timestamp: number | undefined =
      typeof tsRaw === "number" ? tsRaw : tsRaw ? Number(tsRaw) : undefined;

    const text: string | undefined =
      content.conversation ??
      content.extendedTextMessage?.text ??
      content.imageMessage?.caption ??
      undefined;

    const imageMessage = content.imageMessage;
    const incoming: IncomingMessage = { senderJid, rawRef, timestamp, text };

    if (imageMessage) {
      incoming.image = {
        download: async () => {
          const buffer = (await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
              logger: logger.child({ module: "baileys-media" }),
              reuploadRequest: this.sock.updateMediaMessage,
            },
          )) as Buffer;
          const mimeType: string = imageMessage.mimetype ?? "image/jpeg";
          return { buffer, mimeType };
        },
      };
    }

    await this.handler(incoming);
  }

  async sendToGroup(text: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp client not connected");
    await this.sock.sendMessage(this.opts.groupJid, { text });
  }
}

import "dotenv/config";
import { createRequire } from "node:module";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "../logger.js";

/**
 * Dev helper: connect to WhatsApp and print every group you're a member of,
 * with its JID, so you can fill in GROUP_JID in your .env.
 *
 *   npm run list-groups
 */
const require = createRequire(import.meta.url);
const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default ?? baileys.makeWASocket ?? baileys;
const { useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = baileys;

async function main(): Promise<void> {
  const authDir = process.env.AUTH_STATE_DIR ?? "auth_state";
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.appropriate("GeoRanker list-groups"),
    logger: logger.child({ module: "baileys" }),
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update: any) => {
    const { connection, qr } = update;
    if (qr) {
      logger.info("Scan this QR in WhatsApp → Linked devices:");
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === "open") {
      const groups = await sock.groupFetchAllParticipating();
      const rows = Object.values(groups).map((g: any) => ({
        subject: g.subject,
        jid: g.id,
      }));
      // eslint-disable-next-line no-console
      console.table(rows);
      logger.info("Copy the JID of your group into GROUP_JID in .env");
      process.exit(0);
    }
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to list groups");
  process.exit(1);
});

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * A single player on the fixed roster.
 *
 * - `whatsappJid` is only needed for the live Baileys bot (the id Baileys
 *   reports as the sender inside a group, e.g. "447700900123@s.whatsapp.net").
 * - `aliases` are alternative names the player may appear as in a WhatsApp chat
 *   export (the contact name on the exporting phone), used by export mode.
 */
const playerSchema = z.object({
  displayName: z.string().min(1),
  whatsappJid: z.string().min(1).optional(),
  /** Telegram numeric user id (preferred match) for the automated Telegram bot. */
  telegramUserId: z.number().int().optional(),
  /** Telegram @username (without the @), used as a fallback match. */
  telegramUsername: z.string().min(1).optional(),
  /** Alternative names the player may appear as in a WhatsApp chat export. */
  aliases: z.array(z.string().min(1)).optional(),
});

const rosterSchema = z.object({
  players: z.array(playerSchema).min(2, "Need at least two players on the roster"),
});

export type Player = z.infer<typeof playerSchema>;
export type Roster = z.infer<typeof rosterSchema>;

const envSchema = z.object({
  /** Target WhatsApp group JID, e.g. "1234567890-1600000000@g.us". Live bot only. */
  GROUP_JID: z.string().optional(),
  /** Telegram bot token from @BotFather. Telegram bot only. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  /** Target Telegram chat/group id (e.g. "-1001234567890"). Telegram bot only. */
  TELEGRAM_CHAT_ID: z.string().optional(),
  /** GitHub PAT with the `models` scope, used for GitHub Models inference. */
  GITHUB_TOKEN: z.string().optional(),
  /** GitHub Models base URL. */
  GITHUB_MODELS_BASE_URL: z
    .string()
    .url()
    .default("https://models.github.ai/inference"),
  /** Vision-capable model name on GitHub Models. */
  VISION_MODEL: z.string().default("openai/gpt-4o"),
  /** Which extractor to use for images. */
  EXTRACTOR: z.enum(["github-models", "disabled"]).default("github-models"),
  /** IANA timezone used to bucket submissions into a game day. */
  TIMEZONE: z.string().default("Europe/London"),
  /** Path to the roster JSON file. */
  ROSTER_PATH: z.string().default("config/roster.json"),
  /** Path to the SQLite database file. */
  DB_PATH: z.string().default("data/georanker.sqlite"),
  /** Directory where Baileys persists its multi-file auth state. */
  AUTH_STATE_DIR: z.string().default("auth_state"),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env;
  roster: Roster;
  /** Fast lookup of player by their WhatsApp JID (live bot mode). */
  playersByJid: Map<string, Player>;
  /** Lookup of player by a normalised display name / alias (export mode). */
  playersByName: Map<string, Player>;
  /** Lookup of player by Telegram numeric user id (Telegram bot mode). */
  playersByTelegramId: Map<number, Player>;
  /** Lookup of player by normalised Telegram @username (Telegram bot mode). */
  playersByTelegramUsername: Map<string, Player>;
}

/** Normalise a name for matching: trim, collapse whitespace, lower-case. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A stable identity key for a player across live-bot and export modes. Uses the
 * WhatsApp JID when present, otherwise a slug of the display name.
 */
export function rosterKeyFor(player: Player): string {
  return player.whatsappJid ?? `name:${normaliseName(player.displayName)}`;
}

function loadRoster(rosterPath: string): Roster {
  const abs = resolve(rosterPath);
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    throw new Error(
      `Roster file not found at "${abs}". Copy config/roster.example.json to ${rosterPath} and fill it in.`,
    );
  }
  const parsed = rosterSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid roster file: ${parsed.error.message}`);
  }
  // Guard against duplicate JIDs which would break sender -> player mapping.
  const seen = new Set<string>();
  for (const p of parsed.data.players) {
    if (p.whatsappJid) {
      if (seen.has(p.whatsappJid)) {
        throw new Error(`Duplicate whatsappJid in roster: ${p.whatsappJid}`);
      }
      seen.add(p.whatsappJid);
    }
  }
  return parsed.data;
}

/** Build a normalised-name -> player map from display names and aliases. */
function buildNameMap(roster: Roster): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const p of roster.players) {
    const names = [p.displayName, ...(p.aliases ?? [])];
    for (const name of names) {
      const key = normaliseName(name);
      if (map.has(key)) {
        throw new Error(
          `Ambiguous roster name "${name}" maps to more than one player; make display names and aliases unique.`,
        );
      }
      map.set(key, p);
    }
  }
  return map;
}

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);

  if (env.EXTRACTOR === "github-models" && !env.GITHUB_TOKEN) {
    throw new Error(
      "EXTRACTOR is 'github-models' but GITHUB_TOKEN is not set. Provide a GitHub PAT with the 'models' scope, or set EXTRACTOR=disabled.",
    );
  }

  const roster = loadRoster(env.ROSTER_PATH);
  const playersByJid = new Map(
    roster.players
      .filter((p): p is Player & { whatsappJid: string } => Boolean(p.whatsappJid))
      .map((p) => [p.whatsappJid, p] as const),
  );
  const playersByName = buildNameMap(roster);

  const playersByTelegramId = new Map<number, Player>();
  const playersByTelegramUsername = new Map<string, Player>();
  for (const p of roster.players) {
    if (p.telegramUserId !== undefined) {
      if (playersByTelegramId.has(p.telegramUserId)) {
        throw new Error(`Duplicate telegramUserId in roster: ${p.telegramUserId}`);
      }
      playersByTelegramId.set(p.telegramUserId, p);
    }
    if (p.telegramUsername) {
      const key = p.telegramUsername.replace(/^@/, "").toLowerCase();
      if (playersByTelegramUsername.has(key)) {
        throw new Error(`Duplicate telegramUsername in roster: ${p.telegramUsername}`);
      }
      playersByTelegramUsername.set(key, p);
    }
  }

  return {
    env,
    roster,
    playersByJid,
    playersByName,
    playersByTelegramId,
    playersByTelegramUsername,
  };
}

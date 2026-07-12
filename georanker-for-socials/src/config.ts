import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * A single player on the fixed roster. `whatsappJid` is the WhatsApp id that
 * Baileys reports as the message sender inside a group, e.g.
 * "447700900123@s.whatsapp.net".
 */
const playerSchema = z.object({
  displayName: z.string().min(1),
  whatsappJid: z.string().min(1),
});

const rosterSchema = z.object({
  players: z.array(playerSchema).min(2, "Need at least two players on the roster"),
});

export type Player = z.infer<typeof playerSchema>;
export type Roster = z.infer<typeof rosterSchema>;

const envSchema = z.object({
  /** Target WhatsApp group JID, e.g. "1234567890-1600000000@g.us". */
  GROUP_JID: z.string().min(1, "GROUP_JID is required"),
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
  /** Fast lookup of player by their WhatsApp JID. */
  playersByJid: Map<string, Player>;
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
    if (seen.has(p.whatsappJid)) {
      throw new Error(`Duplicate whatsappJid in roster: ${p.whatsappJid}`);
    }
    seen.add(p.whatsappJid);
  }
  return parsed.data;
}

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);

  if (env.EXTRACTOR === "github-models" && !env.GITHUB_TOKEN) {
    throw new Error(
      "EXTRACTOR is 'github-models' but GITHUB_TOKEN is not set. Provide a GitHub PAT with the 'models' scope, or set EXTRACTOR=disabled.",
    );
  }

  const roster = loadRoster(env.ROSTER_PATH);
  const playersByJid = new Map(roster.players.map((p) => [p.whatsappJid, p]));

  return { env, roster, playersByJid };
}

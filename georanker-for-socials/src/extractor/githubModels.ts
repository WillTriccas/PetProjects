import { logger } from "../logger.js";
import type { ImageScoreExtractor } from "./types.js";

interface GitHubModelsOptions {
  token: string;
  baseUrl: string;
  model: string;
}

const SYSTEM_PROMPT =
  "You read a single number from a GeoRankl result screenshot. The screenshot shows a rounded " +
  'card with two labelled figures: on the left "Total Score" and on the right "Global Rank". ' +
  'Under "Total Score" there is a large bold number followed by a lighter "/ <par>" value ' +
  '(for example "650 / 658" means the score is 650 and the daily maximum is 658). Return ONLY ' +
  "the player's Total Score — the large bold number to the LEFT of the slash. Never return the " +
  'par value after the slash, and never return the Global Rank (the "#" number on the right). ' +
  "GeoRankl scores are whole numbers, typically between 0 and 700. Respond with ONLY a compact " +
  'JSON object {"score": <integer>}, or {"score": null} if no Total Score is visible. No other text.';

const USER_PROMPT =
  'Read the "Total Score" value (the big number to the left of the slash). ' +
  'Ignore Global Rank and the "/par" value.';

const MAX_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header.trim());
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

/** Exponential backoff with jitter for a given (1-based) attempt. */
function backoffMs(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 500);
}

/**
 * Image score extractor backed by GitHub Models (OpenAI-compatible chat
 * completions endpoint) using a vision-capable model.
 */
export class GitHubModelsExtractor implements ImageScoreExtractor {
  readonly name = "github-models";
  private readonly opts: GitHubModelsOptions;

  constructor(opts: GitHubModelsOptions) {
    this.opts = opts;
  }

  async extractFromImage(image: Buffer, mimeType: string): Promise<number | null> {
    const dataUri = `data:${mimeType};base64,${image.toString("base64")}`;
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const body = {
      model: this.opts.model,
      temperature: 0,
      max_tokens: 50,
      response_format: { type: "json_object" as const },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          authorization: `Bearer ${this.opts.token}`,
        },
        body: JSON.stringify(body),
      });
      } catch (err) {
        // Transient network failure — back off and retry.
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        logger.error({ err }, "GitHub Models request failed (network)");
        return null;
      }

      // Rate limited (429) or transient server error (5xx): honour Retry-After
      // (GitHub Models returns e.g. 38s during bursts) and retry. Without this,
      // a large export bursts past the per-minute limit and every image after
      // the ~24th silently reads as null.
      if (res.status === 429 || res.status >= 500) {
        const waitMs = retryAfterMs(res.headers.get("retry-after")) ?? backoffMs(attempt);
        await res.text().catch(() => "");
        if (attempt < MAX_ATTEMPTS) {
          logger.warn(
            { status: res.status, waitMs, attempt },
            "GitHub Models throttled; backing off before retry",
          );
          await sleep(waitMs);
          continue;
        }
        logger.error({ status: res.status }, "GitHub Models still throttled after all retries");
        return null;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error(
          { status: res.status, body: text.slice(0, 500) },
          "GitHub Models request returned non-OK status",
        );
        return null;
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        logger.warn("GitHub Models returned no content");
        return null;
      }

      const score = parseScoreFromModelOutput(content);
      if (score === null) {
        logger.debug({ content: content.slice(0, 200) }, "Model reply had no parseable score");
      }
      return score;
    }
    return null;
  }
}

/** Pull a numeric score out of the model's (hopefully JSON) reply. */
export function parseScoreFromModelOutput(content: string): number | null {
  // Try strict JSON first.
  const jsonMatch = content.match(/\{[^}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown };
      if (parsed.score === null) return null;
      if (typeof parsed.score === "number" && Number.isFinite(parsed.score)) {
        return parsed.score;
      }
      if (typeof parsed.score === "string") {
        const n = Number(parsed.score.replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
      }
    } catch {
      // fall through to loose parsing
    }
  }
  // Loose fallback: first standalone number in the reply.
  const num = content.replace(/(\d),(\d)/g, "$1$2").match(/-?\d+(?:\.\d+)?/);
  return num ? Number(num[0]) : null;
}

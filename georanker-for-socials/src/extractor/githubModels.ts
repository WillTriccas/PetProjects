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
      logger.error({ err }, "GitHub Models request failed (network)");
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

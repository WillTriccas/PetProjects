import { logger } from "../logger.js";
import type { ImageScoreExtractor } from "./types.js";

interface GitHubModelsOptions {
  token: string;
  baseUrl: string;
  model: string;
}

const SYSTEM_PROMPT =
  "You extract the player's final numeric score from a screenshot of the game GeoRankl. " +
  "Respond with ONLY a compact JSON object of the form {\"score\": <number>} where <number> " +
  "is the player's total score as an integer. If you cannot confidently determine a score, " +
  'respond with {"score": null}. Do not include any other text.';

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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "What is the final score in this GeoRankl screenshot?" },
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

    return parseScoreFromModelOutput(content);
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

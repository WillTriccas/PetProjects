import type { Env } from "../config.js";
import { logger } from "../logger.js";
import { GitHubModelsExtractor } from "./githubModels.js";
import type { ImageScoreExtractor } from "./types.js";

/** An extractor used when image extraction is disabled — always returns null. */
class DisabledImageExtractor implements ImageScoreExtractor {
  readonly name = "disabled";
  async extractFromImage(): Promise<number | null> {
    return null;
  }
}

export function createImageExtractor(env: Env): ImageScoreExtractor {
  if (env.EXTRACTOR === "github-models" && env.GITHUB_TOKEN) {
    logger.info(
      { model: env.VISION_MODEL, baseUrl: env.GITHUB_MODELS_BASE_URL },
      "Using GitHub Models image extractor",
    );
    return new GitHubModelsExtractor({
      token: env.GITHUB_TOKEN,
      baseUrl: env.GITHUB_MODELS_BASE_URL,
      model: env.VISION_MODEL,
    });
  }
  logger.warn("Image extraction disabled — only text submissions will be scored");
  return new DisabledImageExtractor();
}

export type { ImageScoreExtractor } from "./types.js";
export { parseScoreFromText } from "./textParser.js";

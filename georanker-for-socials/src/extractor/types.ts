/**
 * A pluggable extractor that reads a GeoRankl score out of an image.
 * Implementations live behind this interface so the vision provider can be
 * swapped (e.g. if GitHub Models is unavailable on an Enterprise org).
 */
export interface ImageScoreExtractor {
  readonly name: string;
  /**
   * @returns the numeric score, or null if no score could be confidently read.
   */
  extractFromImage(image: Buffer, mimeType: string): Promise<number | null>;
}

import { describe, it, expect } from "vitest";
import { parseScoreFromText } from "./textParser.js";

describe("parseScoreFromText", () => {
  it("parses a bare number", () => {
    expect(parseScoreFromText("1234")).toBe(1234);
  });

  it("strips thousands separators", () => {
    expect(parseScoreFromText("Score: 12,345")).toBe(12345);
  });

  it("reads a number near a scoring keyword when several numbers exist", () => {
    expect(parseScoreFromText("round 3, i scored 987 today")).toBe(987);
  });

  it("returns the single number even without a keyword", () => {
    expect(parseScoreFromText("got 40 lol")).toBe(40);
  });

  it("returns null when ambiguous (multiple bare numbers, no keyword)", () => {
    expect(parseScoreFromText("40 50 60")).toBeNull();
  });

  it("returns null when there is no number", () => {
    expect(parseScoreFromText("good game everyone")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseScoreFromText("")).toBeNull();
  });
});

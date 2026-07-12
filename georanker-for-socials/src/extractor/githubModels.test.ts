import { describe, it, expect } from "vitest";
import { parseScoreFromModelOutput } from "./githubModels.js";

describe("parseScoreFromModelOutput", () => {
  it("parses strict JSON", () => {
    expect(parseScoreFromModelOutput('{"score": 4200}')).toBe(4200);
  });

  it("parses JSON embedded in extra prose", () => {
    expect(parseScoreFromModelOutput('Here you go: {"score": 987} — done')).toBe(987);
  });

  it("returns null when the model reports null", () => {
    expect(parseScoreFromModelOutput('{"score": null}')).toBeNull();
  });

  it("coerces a stringified score", () => {
    expect(parseScoreFromModelOutput('{"score": "12,345"}')).toBe(12345);
  });

  it("falls back to the first number when JSON is absent", () => {
    expect(parseScoreFromModelOutput("The score is 555 points")).toBe(555);
  });

  it("returns null when there is nothing numeric", () => {
    expect(parseScoreFromModelOutput("no idea")).toBeNull();
  });
});

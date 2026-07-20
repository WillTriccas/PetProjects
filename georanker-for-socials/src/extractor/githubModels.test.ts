import { describe, it, expect } from "vitest";
import { parseScoreFromModelOutput, GitHubModelsExtractor } from "./githubModels.js";

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

describe("GitHubModelsExtractor rate-limit handling", () => {
  const opts = { token: "t", baseUrl: "https://example/inference", model: "m" };

  it("retries after a 429 (honouring Retry-After) and then succeeds", async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"score": 321}' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const score = await new GitHubModelsExtractor(opts).extractFromImage(
        Buffer.from([1, 2, 3]),
        "image/jpeg",
      );
      expect(score).toBe(321);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("gives up and returns null when the API stays rate-limited", async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
    }) as typeof fetch;
    try {
      const score = await new GitHubModelsExtractor(opts).extractFromImage(
        Buffer.from([1]),
        "image/jpeg",
      );
      expect(score).toBeNull();
      expect(calls).toBeGreaterThan(1); // it retried rather than failing on the first 429
    } finally {
      globalThis.fetch = orig;
    }
  });
});

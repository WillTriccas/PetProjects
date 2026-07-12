import { describe, it, expect } from "vitest";
import { parseExport } from "./exportParser.js";

describe("parseExport", () => {
  it("parses the iOS bracketed format with an attachment", () => {
    const txt = [
      "[12/07/2026, 18:23:45] Alice: 9050",
      "[12/07/2026, 18:24:01] Bob: \u200e<attached: 00000042-PHOTO-2026-07-12.jpg>",
    ].join("\n");
    const msgs = parseExport(txt);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ sender: "Alice", body: "9050", isoDate: "2026-07-12" });
    expect(msgs[1]).toMatchObject({
      sender: "Bob",
      attachedFile: "00000042-PHOTO-2026-07-12.jpg",
    });
  });

  it("parses the Android dash format with a file attachment", () => {
    const txt = [
      "12/07/2026, 18:23 - Alice: score 9050",
      "12/07/2026, 18:24 - Bob: IMG-20260712-WA0001.jpg (file attached)",
    ].join("\n");
    const msgs = parseExport(txt);
    expect(msgs[0]).toMatchObject({ sender: "Alice", body: "score 9050" });
    expect(msgs[1]!.attachedFile).toBe("IMG-20260712-WA0001.jpg");
  });

  it("joins multi-line message bodies", () => {
    const txt = [
      "[12/07/2026, 18:23:45] Alice: line one",
      "line two",
      "line three",
      "[12/07/2026, 18:25:00] Bob: 100",
    ].join("\n");
    const msgs = parseExport(txt);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.body).toBe("line one\nline two\nline three");
  });

  it("treats system lines as senderless", () => {
    const txt = [
      "[12/07/2026, 18:00:00] Messages and calls are end-to-end encrypted.",
      "[12/07/2026, 18:23:45] Alice: 9050",
    ].join("\n");
    const msgs = parseExport(txt);
    expect(msgs[0]!.sender).toBeNull();
    expect(msgs[1]!.sender).toBe("Alice");
  });

  it("detects a day boundary via changing dayKey", () => {
    const txt = [
      "12/07/2026, 18:23 - Alice: 100",
      "13/07/2026, 09:00 - Bob: 200",
    ].join("\n");
    const msgs = parseExport(txt);
    expect(msgs[0]!.dayKey).toBe("12/07/2026");
    expect(msgs[1]!.dayKey).toBe("13/07/2026");
    expect(msgs[0]!.dayKey).not.toBe(msgs[1]!.dayKey);
  });

  it("normalises an unambiguous US-style date as month-first", () => {
    const msgs = parseExport("[07/13/2026, 6:23:45 PM] Alice: 100");
    expect(msgs[0]!.isoDate).toBe("2026-07-13");
  });
});

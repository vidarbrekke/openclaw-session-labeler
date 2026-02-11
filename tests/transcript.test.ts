import { describe, it, expect } from "vitest";
import {
  parseTranscript,
  extractUserMessages,
} from "../src/transcript.js";

describe("parseTranscript", () => {
  it("parses JSONL into array of entries", () => {
    const jsonl = [
      '{"type":"session","id":"sess1","timestamp":"2026-02-11T10:00:00Z"}',
      '{"type":"message","id":"m1","role":"user","content":"Hello"}',
      '{"type":"message","id":"m2","role":"assistant","content":"Hi there"}',
    ].join("\n");

    const entries = parseTranscript(jsonl);
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe("session");
    expect(entries[1].role).toBe("user");
    expect(entries[2].role).toBe("assistant");
  });

  it("skips blank lines", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      "",
      '{"type":"message","id":"m1","role":"user","content":"Hello"}',
      "",
    ].join("\n");

    const entries = parseTranscript(jsonl);
    expect(entries).toHaveLength(2);
  });

  it("skips malformed lines gracefully", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      "not valid json",
      '{"type":"message","id":"m1","role":"user","content":"Hello"}',
    ].join("\n");

    const entries = parseTranscript(jsonl);
    expect(entries).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseTranscript("")).toEqual([]);
  });
});

describe("extractUserMessages", () => {
  it("extracts only user role messages", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      '{"type":"message","id":"m1","role":"user","content":"First request"}',
      '{"type":"message","id":"m2","role":"assistant","content":"Response 1"}',
      '{"type":"message","id":"m3","role":"user","content":"Second request"}',
      '{"type":"message","id":"m4","role":"assistant","content":"Response 2"}',
      '{"type":"message","id":"m5","role":"user","content":"Third request"}',
    ].join("\n");

    const messages = extractUserMessages(jsonl);
    expect(messages).toEqual([
      "First request",
      "Second request",
      "Third request",
    ]);
  });

  it("returns empty array when no user messages", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      '{"type":"message","id":"m1","role":"assistant","content":"Hello"}',
    ].join("\n");

    expect(extractUserMessages(jsonl)).toEqual([]);
  });

  it("ignores custom_message and compaction entries", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      '{"type":"message","id":"m1","role":"user","content":"Real request"}',
      '{"type":"custom_message","id":"c1","role":"user","content":"Injected"}',
      '{"type":"compaction","id":"comp1","content":"Summary"}',
      '{"type":"message","id":"m2","role":"user","content":"Another request"}',
    ].join("\n");

    const messages = extractUserMessages(jsonl);
    expect(messages).toEqual(["Real request", "Another request"]);
  });

  it("skips user messages with empty content", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      '{"type":"message","id":"m1","role":"user","content":""}',
      '{"type":"message","id":"m2","role":"user","content":"Actual request"}',
    ].join("\n");

    const messages = extractUserMessages(jsonl);
    expect(messages).toEqual(["Actual request"]);
  });

  it("limits to first N messages when specified", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      '{"type":"message","id":"m1","role":"user","content":"First"}',
      '{"type":"message","id":"m2","role":"user","content":"Second"}',
      '{"type":"message","id":"m3","role":"user","content":"Third"}',
      '{"type":"message","id":"m4","role":"user","content":"Fourth"}',
    ].join("\n");

    const messages = extractUserMessages(jsonl, 3);
    expect(messages).toEqual(["First", "Second", "Third"]);
  });

  it("handles messages with array content (multimodal)", () => {
    const jsonl = [
      '{"type":"session","id":"sess1"}',
      '{"type":"message","id":"m1","role":"user","content":[{"type":"text","text":"Image analysis request"}]}',
    ].join("\n");

    const messages = extractUserMessages(jsonl);
    expect(messages).toEqual(["Image analysis request"]);
  });
});

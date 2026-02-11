import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import handler from "../hooks/session-labeler/handler.js";

/**
 * Integration tests for the session-labeler hook handler.
 * Uses a temp directory to simulate session files.
 */

let tmpDir: string;
let sessionsDir: string;

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "command",
    action: "new",
    sessionKey: "agent:main:main",
    timestamp: new Date(),
    messages: [] as string[],
    context: {
      sessionId: "test-session-001",
      workspaceDir: tmpDir,
      ...overrides,
    },
  };
}

function makeTranscript(userMessages: string[]): string {
  const lines = ['{"type":"session","id":"test-session-001","timestamp":"2026-02-11T10:00:00Z"}'];
  let msgId = 1;
  for (const msg of userMessages) {
    lines.push(
      JSON.stringify({
        type: "message",
        id: `m${msgId}`,
        role: "user",
        content: msg,
      })
    );
    msgId++;
    lines.push(
      JSON.stringify({
        type: "message",
        id: `m${msgId}`,
        role: "assistant",
        content: `Response to: ${msg}`,
      })
    );
    msgId++;
  }
  return lines.join("\n") + "\n";
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "session-labeler-test-"));
  sessionsDir = join(tmpDir, ".openclaw", "sessions");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(sessionsDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("session-labeler hook handler", () => {
  it("skips non-command events", async () => {
    const event = makeEvent();
    event.type = "agent";
    event.action = "bootstrap";
    await handler(event); // Should not throw or create labels
    const labelsPath = join(sessionsDir, "labels.json");
    await expect(readFile(labelsPath, "utf-8")).rejects.toThrow();
  });

  it("skips commands other than 'new'", async () => {
    const event = makeEvent();
    event.action = "stop";
    await handler(event);
    const labelsPath = join(sessionsDir, "labels.json");
    await expect(readFile(labelsPath, "utf-8")).rejects.toThrow();
  });

  it("skips when session has fewer than 3 user messages", async () => {
    const transcript = makeTranscript(["First question", "Second question"]);
    await writeFile(
      join(sessionsDir, "test-session-001.jsonl"),
      transcript
    );

    await handler(makeEvent());

    const labelsPath = join(sessionsDir, "labels.json");
    await expect(readFile(labelsPath, "utf-8")).rejects.toThrow();
  });

  it("generates a label when session has 3+ user messages", async () => {
    const transcript = makeTranscript([
      "Help me set up a Node.js REST API",
      "Add authentication with JWT tokens",
      "Now add rate limiting to the endpoints",
    ]);
    await writeFile(
      join(sessionsDir, "test-session-001.jsonl"),
      transcript
    );

    await handler(makeEvent());

    const labelsPath = join(sessionsDir, "labels.json");
    const raw = await readFile(labelsPath, "utf-8");
    const labels = JSON.parse(raw);

    expect(labels["agent:main:main"]).toBeDefined();
    expect(labels["agent:main:main"].label.length).toBeGreaterThan(0);
    expect(labels["agent:main:main"].label.length).toBeLessThanOrEqual(28);
    expect(labels["agent:main:main"].label_source).toBe("auto");
    expect(labels["agent:main:main"].label_version).toBe("1.0");
  });

  it("does not overwrite an existing label", async () => {
    // Pre-create a label
    const labelsPath = join(sessionsDir, "labels.json");
    const existingLabels = {
      "agent:main:main": {
        label: "Existing Label",
        label_source: "manual" as const,
        label_turn: 1,
        label_version: "1.0",
        label_updated_at: "2026-02-10T00:00:00Z",
      },
    };
    await writeFile(labelsPath, JSON.stringify(existingLabels));

    const transcript = makeTranscript([
      "New request one",
      "New request two",
      "New request three",
    ]);
    await writeFile(
      join(sessionsDir, "test-session-001.jsonl"),
      transcript
    );

    await handler(makeEvent());

    const raw = await readFile(labelsPath, "utf-8");
    const labels = JSON.parse(raw);
    expect(labels["agent:main:main"].label).toBe("Existing Label");
    expect(labels["agent:main:main"].label_source).toBe("manual");
  });

  it("labels are stable across multiple hook invocations", async () => {
    const transcript = makeTranscript([
      "Build a budget tracker spreadsheet",
      "Add expense categories and monthly totals",
      "Create a pie chart visualization",
    ]);
    await writeFile(
      join(sessionsDir, "test-session-001.jsonl"),
      transcript
    );

    await handler(makeEvent());

    const labelsPath = join(sessionsDir, "labels.json");
    const raw1 = await readFile(labelsPath, "utf-8");
    const labels1 = JSON.parse(raw1);
    const firstLabel = labels1["agent:main:main"].label;

    // Run again — should NOT change the label
    await handler(makeEvent());

    const raw2 = await readFile(labelsPath, "utf-8");
    const labels2 = JSON.parse(raw2);
    expect(labels2["agent:main:main"].label).toBe(firstLabel);
  });

  it("handles missing transcript gracefully", async () => {
    // No transcript file written — should not throw
    await handler(makeEvent());

    const labelsPath = join(sessionsDir, "labels.json");
    await expect(readFile(labelsPath, "utf-8")).rejects.toThrow();
  });
});

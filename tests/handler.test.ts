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
    const storePath = join(sessionsDir, "sessions.json");
    await expect(readFile(storePath, "utf-8")).rejects.toThrow();
  });

  it("skips commands outside configured triggerActions", async () => {
    const event = makeEvent();
    event.action = "unknown";
    await handler(event);
    const storePath = join(sessionsDir, "sessions.json");
    await expect(readFile(storePath, "utf-8")).rejects.toThrow();
  });

  it("skips when session has fewer than 3 user messages", async () => {
    const transcript = makeTranscript(["First question", "Second question"]);
    await writeFile(
      join(sessionsDir, "test-session-001.jsonl"),
      transcript
    );

    await handler(makeEvent());

    const storePath = join(sessionsDir, "sessions.json");
    await expect(readFile(storePath, "utf-8")).rejects.toThrow();
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

    const storePath = join(sessionsDir, "sessions.json");
    const raw = await readFile(storePath, "utf-8");
    const sessions = JSON.parse(raw);

    expect(sessions["agent:main:main"]).toBeDefined();
    expect(sessions["agent:main:main"].label.length).toBeGreaterThan(0);
    expect(sessions["agent:main:main"].label.length).toBeLessThanOrEqual(28);
    expect(sessions["agent:main:main"].label_source).toBe("auto");
    expect(sessions["agent:main:main"].label_version).toBe("1.0");
    expect(sessions["agent:main:main"].label_turn).toBe(3);
  });

  it("does not overwrite an existing label", async () => {
    // Pre-create a labeled session entry
    const storePath = join(sessionsDir, "sessions.json");
    const existingStore = {
      "agent:main:main": {
        sessionId: "test-session-001",
        label: "Existing Label",
        label_source: "manual" as const,
        label_turn: 1,
        label_version: "1.0",
        label_updated_at: "2026-02-10T00:00:00Z",
      },
    };
    await writeFile(storePath, JSON.stringify(existingStore));

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

    const raw = await readFile(storePath, "utf-8");
    const sessions = JSON.parse(raw);
    expect(sessions["agent:main:main"].label).toBe("Existing Label");
    expect(sessions["agent:main:main"].label_source).toBe("manual");
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

    const storePath = join(sessionsDir, "sessions.json");
    const raw1 = await readFile(storePath, "utf-8");
    const sessions1 = JSON.parse(raw1);
    const firstLabel = sessions1["agent:main:main"].label;

    // Run again — should NOT change the label
    await handler(makeEvent());

    const raw2 = await readFile(storePath, "utf-8");
    const sessions2 = JSON.parse(raw2);
    expect(sessions2["agent:main:main"].label).toBe(firstLabel);
  });

  it("handles missing transcript gracefully", async () => {
    // No transcript file written — should not throw
    await handler(makeEvent());

    const storePath = join(sessionsDir, "sessions.json");
    await expect(readFile(storePath, "utf-8")).rejects.toThrow();
  });

  it("also triggers on /stop action", async () => {
    const transcript = makeTranscript([
      "Help me fix checkout taxes",
      "Need WooCommerce shipping setup",
      "Add payment gateway notes",
    ]);
    await writeFile(join(sessionsDir, "test-session-001.jsonl"), transcript);

    const event = makeEvent();
    event.action = "stop";
    await handler(event);

    const storePath = join(sessionsDir, "sessions.json");
    const raw = await readFile(storePath, "utf-8");
    const sessions = JSON.parse(raw);
    expect(sessions["agent:main:main"]?.label).toBeTruthy();
  });

  it("supports sidecar_labels_json mode via hook config", async () => {
    const transcript = makeTranscript([
      "Draft product description",
      "Improve SEO title",
      "Add WooCommerce tags",
    ]);
    await writeFile(join(sessionsDir, "test-session-001.jsonl"), transcript);

    const event = makeEvent({
      cfg: {
        hooks: {
          internal: {
            entries: {
              "session-labeler": {
                persistenceMode: "sidecar_labels_json",
              },
            },
          },
        },
      },
    });
    await handler(event);

    const labelsPath = join(sessionsDir, "labels.json");
    const raw = await readFile(labelsPath, "utf-8");
    const labels = JSON.parse(raw);
    expect(labels["agent:main:main"]?.label).toBeTruthy();
  });

  it("respects triggerAfterRequests from hook config", async () => {
    const transcript = makeTranscript([
      "Request one",
      "Request two",
      "Request three",
    ]);
    await writeFile(join(sessionsDir, "test-session-001.jsonl"), transcript);

    const event = makeEvent({
      cfg: {
        hooks: {
          internal: {
            entries: {
              "session-labeler": {
                triggerAfterRequests: 4,
              },
            },
          },
        },
      },
    });

    await handler(event);

    const storePath = join(sessionsDir, "sessions.json");
    await expect(readFile(storePath, "utf-8")).rejects.toThrow();
  });

  it("supports relabel=true from hook config", async () => {
    const storePath = join(sessionsDir, "sessions.json");
    await writeFile(
      storePath,
      JSON.stringify(
        {
          "agent:main:main": {
            sessionId: "test-session-001",
            label: "Existing Manual Label",
            label_source: "manual",
            label_turn: 1,
            label_version: "1.0",
            label_updated_at: "2026-02-10T00:00:00Z",
          },
        },
        null,
        2
      )
    );

    const transcript = makeTranscript([
      "Improve Woo checkout labels",
      "Configure shipping zones",
      "Adjust tax settings",
    ]);
    await writeFile(join(sessionsDir, "test-session-001.jsonl"), transcript);

    const event = makeEvent({
      cfg: {
        hooks: {
          internal: {
            entries: {
              "session-labeler": {
                relabel: true,
              },
            },
          },
        },
      },
    });
    await handler(event);

    const raw = await readFile(storePath, "utf-8");
    const sessions = JSON.parse(raw);
    expect(sessions["agent:main:main"].label).not.toBe("Existing Manual Label");
    expect(sessions["agent:main:main"].label_source).toBe("auto");
  });
});

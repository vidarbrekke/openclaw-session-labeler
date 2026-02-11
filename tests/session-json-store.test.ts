import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getLabelFromSessionStore,
  setLabelInSessionStore,
} from "../src/session-json-store.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "session-json-store-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("session-json-store", () => {
  it("writes label metadata into sessions.json while preserving existing fields", async () => {
    const sessionsPath = join(tmp, "sessions.json");
    await writeFile(
      sessionsPath,
      JSON.stringify(
        {
          "agent:main:main": {
            sessionId: "s-123",
            updatedAt: "2026-02-11T00:00:00Z",
          },
        },
        null,
        2
      )
    );

    await setLabelInSessionStore(tmp, "agent:main:main", {
      label: "Checkout Tax Setup",
      label_source: "auto",
      label_turn: 3,
      label_version: "1.0",
      label_updated_at: "2026-02-11T12:00:00Z",
    });

    const raw = await readFile(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);
    expect(sessions["agent:main:main"].sessionId).toBe("s-123");
    expect(sessions["agent:main:main"].updatedAt).toBe("2026-02-11T00:00:00Z");
    expect(sessions["agent:main:main"].label).toBe("Checkout Tax Setup");
    expect(sessions["agent:main:main"].label_source).toBe("auto");
    expect(sessions["agent:main:main"].label_turn).toBe(3);
  });

  it("returns undefined when a session has no label", async () => {
    const sessionsPath = join(tmp, "sessions.json");
    await writeFile(
      sessionsPath,
      JSON.stringify({ "agent:main:main": { sessionId: "s-123" } }, null, 2)
    );

    const label = await getLabelFromSessionStore(tmp, "agent:main:main");
    expect(label).toBeUndefined();
  });

  it("reads existing label metadata from sessions.json", async () => {
    const sessionsPath = join(tmp, "sessions.json");
    await writeFile(
      sessionsPath,
      JSON.stringify(
        {
          "agent:main:main": {
            sessionId: "s-123",
            label: "Woo Shipping Config",
            label_source: "manual",
            label_turn: 7,
            label_version: "1.1",
            label_updated_at: "2026-02-11T13:00:00Z",
          },
        },
        null,
        2
      )
    );

    const label = await getLabelFromSessionStore(tmp, "agent:main:main");
    expect(label).toBeDefined();
    expect(label?.label).toBe("Woo Shipping Config");
    expect(label?.label_source).toBe("manual");
    expect(label?.label_turn).toBe(7);
    expect(label?.label_version).toBe("1.1");
  });
});


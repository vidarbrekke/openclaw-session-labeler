import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setLabel,
  readLabels,
  labelsPathFromSessionsDir,
} from "../src/labels-store.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "labels-store-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("labels-store", () => {
  it("writes atomically and preserves concurrent updates", async () => {
    const labelsPath = labelsPathFromSessionsDir(tmp);

    await Promise.all([
      setLabel(labelsPath, "session:a", {
        label: "Alpha",
        label_source: "auto",
        label_turn: 3,
        label_version: "1.0",
        label_updated_at: "2026-02-11T00:00:00Z",
      }),
      setLabel(labelsPath, "session:b", {
        label: "Beta",
        label_source: "auto",
        label_turn: 3,
        label_version: "1.0",
        label_updated_at: "2026-02-11T00:00:00Z",
      }),
    ]);

    const labels = await readLabels(labelsPath);
    expect(labels["session:a"]?.label).toBe("Alpha");
    expect(labels["session:b"]?.label).toBe("Beta");
  });
});

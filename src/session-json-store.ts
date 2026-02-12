import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionLabel } from "./types.js";

type SessionsStore = Record<string, Record<string, unknown>>;

let writeQueue: Promise<void> = Promise.resolve();

function sessionsJsonPathFromSessionsDir(sessionsDir: string): string {
  return join(sessionsDir, "sessions.json");
}

async function readSessionsStore(path: string): Promise<SessionsStore> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as SessionsStore;
  } catch {
    return {};
  }
}

async function writeSessionsStore(path: string, data: SessionsStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await rename(tmpPath, path);
}

export async function getLabelFromSessionStore(
  sessionsDir: string,
  sessionKey: string
): Promise<SessionLabel | undefined> {
  const storePath = sessionsJsonPathFromSessionsDir(sessionsDir);
  const store = await readSessionsStore(storePath);
  const entry = store[sessionKey];
  if (!entry) return undefined;
  if (typeof entry.label !== "string" || !entry.label) return undefined;

  return {
    label: entry.label,
    label_source: (entry.label_source as "auto" | "manual") ?? "auto",
    label_turn: typeof entry.label_turn === "number" ? entry.label_turn : 0,
    label_version: typeof entry.label_version === "string" ? entry.label_version : "1.0",
    label_updated_at:
      typeof entry.label_updated_at === "string"
        ? entry.label_updated_at
        : new Date().toISOString(),
  };
}

export async function setLabelInSessionStore(
  sessionsDir: string,
  sessionKey: string,
  label: SessionLabel
): Promise<void> {
  const storePath = sessionsJsonPathFromSessionsDir(sessionsDir);
  writeQueue = writeQueue.then(async () => {
    const store = await readSessionsStore(storePath);
    const entry = store[sessionKey] ?? {};
    store[sessionKey] = {
      ...entry,
      label: label.label,
      label_source: label.label_source,
      label_turn: label.label_turn,
      label_version: label.label_version,
      label_updated_at: label.label_updated_at,
    };
    await writeSessionsStore(storePath, store);
  });
  await writeQueue;
}

export async function setLabelInSessionStoreBySessionId(
  sessionsDir: string,
  sessionId: string,
  label: SessionLabel
): Promise<boolean> {
  const storePath = sessionsJsonPathFromSessionsDir(sessionsDir);
  let updated = false;
  writeQueue = writeQueue.then(async () => {
    const store = await readSessionsStore(storePath);
    for (const key of Object.keys(store)) {
      const entry = store[key];
      if (entry?.sessionId !== sessionId) continue;
      store[key] = {
        ...entry,
        label: label.label,
        label_source: label.label_source,
        label_turn: label.label_turn,
        label_version: label.label_version,
        label_updated_at: label.label_updated_at,
      };
      updated = true;
    }
    if (updated) {
      await writeSessionsStore(storePath, store);
    }
  });
  await writeQueue;
  return updated;
}


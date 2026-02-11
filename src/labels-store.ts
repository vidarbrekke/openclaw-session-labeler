import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SessionLabel } from "./types.js";

/**
 * Persistent store for session labels.
 *
 * Labels are stored in a JSON file alongside sessions.json:
 *   ~/.openclaw/agents/<agentId>/sessions/labels.json
 *
 * Format: { [sessionKey: string]: SessionLabel }
 *
 * We use a separate file rather than modifying sessions.json directly,
 * since sessions.json is owned by the Gateway and may rehydrate entries.
 */
export interface LabelsMap {
  [sessionKey: string]: SessionLabel;
}

/**
 * Read the labels store from disk.
 * Returns an empty map if the file doesn't exist.
 */
export async function readLabels(labelsPath: string): Promise<LabelsMap> {
  try {
    const raw = await readFile(labelsPath, "utf-8");
    return JSON.parse(raw) as LabelsMap;
  } catch {
    return {};
  }
}

/**
 * Write the labels store to disk.
 * Creates parent directories if needed.
 */
export async function writeLabels(
  labelsPath: string,
  labels: LabelsMap
): Promise<void> {
  await mkdir(dirname(labelsPath), { recursive: true });
  await writeFile(labelsPath, JSON.stringify(labels, null, 2) + "\n", "utf-8");
}

/**
 * Get the label for a specific session key, or undefined if not labeled.
 */
export async function getLabel(
  labelsPath: string,
  sessionKey: string
): Promise<SessionLabel | undefined> {
  const labels = await readLabels(labelsPath);
  return labels[sessionKey];
}

/**
 * Set the label for a specific session key.
 */
export async function setLabel(
  labelsPath: string,
  sessionKey: string,
  label: SessionLabel
): Promise<void> {
  const labels = await readLabels(labelsPath);
  labels[sessionKey] = label;
  await writeLabels(labelsPath, labels);
}

/**
 * Derive the labels.json path from a sessions directory.
 */
export function labelsPathFromSessionsDir(sessionsDir: string): string {
  return join(sessionsDir, "labels.json");
}

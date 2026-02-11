import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { TranscriptEntry } from "./types.js";

/**
 * Parse an OpenClaw JSONL transcript into an array of entries.
 * Skips blank and malformed lines gracefully.
 */
export function parseTranscript(jsonl: string): TranscriptEntry[] {
  if (!jsonl) return [];

  const entries: TranscriptEntry[] = [];

  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      entries.push(JSON.parse(trimmed) as TranscriptEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Extract the text content of user messages from an OpenClaw JSONL transcript.
 *
 * Only includes actual `message` type entries with `role: "user"` and
 * non-empty content. Ignores `custom_message`, `compaction`, etc.
 *
 * @param jsonl - Raw JSONL transcript content
 * @param limit - Maximum number of messages to return (default: all)
 */
export function extractUserMessages(
  jsonl: string,
  limit?: number
): string[] {
  const messages: string[] = [];
  if (!jsonl) return messages;

  for (const line of jsonl.split("\n")) {
    if (limit !== undefined && messages.length >= limit) break;
    processLineForUserMessage(line, messages);
  }

  return messages;
}

/**
 * Extract user messages from a JSONL file without loading the full file into memory.
 */
export async function extractUserMessagesFromFile(
  transcriptPath: string,
  limit?: number
): Promise<string[]> {
  const messages: string[] = [];
  const stream = createReadStream(transcriptPath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (limit !== undefined && messages.length >= limit) break;
      processLineForUserMessage(line, messages);
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return messages;
}

function processLineForUserMessage(line: string, messages: string[]): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  let entry: TranscriptEntry;
  try {
    entry = JSON.parse(trimmed) as TranscriptEntry;
  } catch {
    return;
  }

  if (entry.type !== "message" || entry.role !== "user") return;

  const text = resolveContent(entry.content);
  if (text) {
    messages.push(text);
  }
}

/**
 * Resolve message content which may be a plain string or a multimodal array.
 */
function resolveContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  // Multimodal content: array of { type: "text", text: "..." } objects
  if (Array.isArray(content)) {
    const textParts = content
      .filter(
        (part): part is { type: string; text: string } =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
      )
      .map((part) => part.text);

    return textParts.join(" ");
  }

  return "";
}

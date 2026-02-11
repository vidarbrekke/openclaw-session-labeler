import { sanitize } from "./sanitize.js";
import { enforceMaxLength } from "./enforce-length.js";
import { buildPrompt } from "./prompt.js";
import { STOP_WORDS } from "./stop-words.js";
import type { LlmClient, LabelerInput } from "./types.js";

const FALLBACK_LABEL = "General";

/**
 * Generate a session label from user requests using an LLM.
 *
 * Pipeline:
 *  1. Build prompt from requests.
 *  2. Call LLM for a raw label.
 *  3. Sanitize the raw output.
 *  4. Enforce max length.
 *  5. Fall back to "General" if empty.
 */
export async function generateLabel(
  llm: LlmClient,
  input: LabelerInput
): Promise<string> {
  const { system, user } = buildPrompt(input);

  let raw: string;
  try {
    raw = await llm.complete(`${system}\n\n${user}`);
  } catch (err) {
    console.error(
      "[session-labeler] LLM call failed:",
      err instanceof Error ? err.message : String(err)
    );
    return heuristicLabel(input);
  }

  let label = sanitize(raw);
  label = enforceMaxLength(label, input.max_chars);

  if (!label) {
    return heuristicLabel(input);
  }

  return label;
}

/**
 * Heuristic fallback: extract top keywords from requests.
 * Used when LLM is unavailable or returns garbage.
 */
export function heuristicLabel(input: LabelerInput): string {
  const words = input.requests
    .join(" ")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()));

  // Count word frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    const lower = word.toLowerCase();
    freq.set(lower, (freq.get(lower) ?? 0) + 1);
  }

  // Sort by frequency desc, then length desc
  const ranked = [...freq.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].length - a[0].length;
  });

  // Take top 3 words, title-case them
  const topWords = ranked
    .slice(0, 3)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  const label = topWords.join(" ");

  if (!label) return FALLBACK_LABEL;

  return enforceMaxLength(label, input.max_chars) || FALLBACK_LABEL;
}

/**
 * OpenClaw Hook Handler: session-labeler
 *
 * Fires on `command:new` to label the ending session with a short
 * descriptive name (≤ 28 characters) derived from the first 3 user requests.
 *
 * See HOOK.md for documentation.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";

import { extractUserMessages } from "../../src/transcript.js";
import { generateLabel } from "../../src/labeler.js";
import {
  setLabel,
  getLabel,
  labelsPathFromSessionsDir,
} from "../../src/labels-store.js";
import { DEFAULT_CONFIG } from "../../src/types.js";
import type { SessionLabel, LlmClient } from "../../src/types.js";

/**
 * Minimal type for the OpenClaw hook event.
 * Mirrors the shape documented at https://docs.openclaw.ai/automation/hooks
 */
interface HookEvent {
  type: string;
  action: string;
  sessionKey: string;
  timestamp: Date;
  messages: string[];
  context: {
    sessionEntry?: {
      sessionId?: string;
      sessionFile?: string;
      [key: string]: unknown;
    };
    sessionId?: string;
    sessionFile?: string;
    workspaceDir?: string;
    cfg?: {
      agents?: {
        defaults?: {
          sessionsDir?: string;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

type HookHandler = (event: HookEvent) => Promise<void>;

const handler: HookHandler = async (event) => {
  // Only trigger on /new commands (session is ending)
  if (event.type !== "command" || event.action !== "new") {
    return;
  }

  try {
    await labelSession(event);
  } catch (err) {
    console.error(
      "[session-labeler] Error:",
      err instanceof Error ? err.message : String(err)
    );
    // Don't throw — let other handlers run
  }
};

async function labelSession(event: HookEvent): Promise<void> {
  const config = DEFAULT_CONFIG;
  const sessionKey = event.sessionKey;

  // 1) Resolve paths
  const sessionsDir = resolveSessionsDir(event);
  if (!sessionsDir) {
    console.log("[session-labeler] Could not resolve sessions directory, skipping.");
    return;
  }

  const labelsPath = labelsPathFromSessionsDir(sessionsDir);

  // 2) Check if already labeled (skip unless relabel is enabled)
  if (!config.relabel) {
    const existing = await getLabel(labelsPath, sessionKey);
    if (existing) {
      console.log(`[session-labeler] Session "${sessionKey}" already labeled: "${existing.label}"`);
      return;
    }
  }

  // 3) Read the session transcript
  const transcriptContent = await readTranscript(event, sessionsDir);
  if (!transcriptContent) {
    console.log("[session-labeler] No transcript found, skipping.");
    return;
  }

  // 4) Extract user messages
  const userMessages = extractUserMessages(
    transcriptContent,
    config.triggerAfterRequests
  );

  if (userMessages.length < config.triggerAfterRequests) {
    console.log(
      `[session-labeler] Only ${userMessages.length} user messages (need ${config.triggerAfterRequests}), skipping.`
    );
    return;
  }

  // 5) Generate label (LLM with heuristic fallback)
  const llm = createLlmClient(event);
  const label = await generateLabel(llm, {
    requests: userMessages.slice(0, config.triggerAfterRequests),
    max_chars: config.maxLabelChars,
  });

  // 6) Persist
  const sessionLabel: SessionLabel = {
    label,
    label_source: "auto",
    label_turn: userMessages.length,
    label_version: "1.0",
    label_updated_at: new Date().toISOString(),
  };

  await setLabel(labelsPath, sessionKey, sessionLabel);
  console.log(`[session-labeler] Labeled "${sessionKey}": "${label}"`);
}

/**
 * Resolve the sessions directory from the event context.
 */
function resolveSessionsDir(event: HookEvent): string | null {
  // Try explicit session file path first
  const sessionFile =
    event.context.sessionEntry?.sessionFile ?? event.context.sessionFile;
  if (sessionFile) {
    return dirname(sessionFile);
  }

  // Try from config
  const agentConfig = event.context.cfg?.agents?.defaults;
  if (agentConfig?.sessionsDir && typeof agentConfig.sessionsDir === "string") {
    return agentConfig.sessionsDir;
  }

  // Last-resort fallback for local testing harnesses
  const workspaceDir = event.context.workspaceDir;
  if (workspaceDir) {
    return join(workspaceDir, ".openclaw", "sessions");
  }

  return null;
}

/**
 * Read the transcript file for the ending session.
 */
async function readTranscript(
  event: HookEvent,
  sessionsDir: string
): Promise<string | null> {
  // Use explicit session file if available
  const sessionFile =
    event.context.sessionEntry?.sessionFile ?? event.context.sessionFile;
  if (sessionFile) {
    try {
      return await readFile(sessionFile, "utf-8");
    } catch {
      // Fall through to ID-based lookup
    }
  }

  // Derive from session ID
  const sessionId =
    event.context.sessionEntry?.sessionId ?? event.context.sessionId;
  if (sessionId) {
    const path = join(sessionsDir, `${sessionId}.jsonl`);
    try {
      return await readFile(path, "utf-8");
    } catch {
      // Transcript not found
    }
  }

  return null;
}

/**
 * Create an LLM client from the event context.
 *
 * Currently uses a simple heuristic-based approach since we don't have
 * direct access to OpenClaw's internal model runner from hooks.
 * When OpenClaw exposes an LLM API for hooks, this can be updated.
 */
function createLlmClient(_event: HookEvent): LlmClient {
  // TODO: Integrate with OpenClaw's model runner when hook LLM API is available.
  // For now, the labeler will fall back to heuristic keyword extraction.
  return {
    async complete(_prompt: string): Promise<string> {
      throw new Error("LLM API not yet wired — using heuristic fallback");
    },
  };
}

export default handler;

/**
 * OpenClaw Hook Handler: session-labeler
 *
 * Fires on `command:new` to label the ending session with a short
 * descriptive name (≤ 28 characters) derived from the first 3 user requests.
 *
 * See HOOK.md for documentation.
 */

import { join, dirname } from "node:path";

import { extractUserMessagesFromFile } from "../../src/transcript.js";
import { generateLabel } from "../../src/labeler.js";
import {
  setLabel,
  getLabel,
  labelsPathFromSessionsDir,
} from "../../src/labels-store.js";
import {
  getLabelFromSessionStore,
  setLabelInSessionStore,
} from "../../src/session-json-store.js";
import { DEFAULT_CONFIG } from "../../src/types.js";
import type { SessionLabel, LlmClient, SessionLabelerConfig } from "../../src/types.js";

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
  const config = resolveConfig(event);
  // Trigger on configured command actions (session is ending)
  if (
    event.type !== "command" ||
    !config.triggerActions.includes(event.action)
  ) {
    return;
  }

  try {
    await labelSession(event, config);
  } catch (err) {
    console.error(
      "[session-labeler] Error:",
      err instanceof Error ? err.message : String(err)
    );
    // Don't throw — let other handlers run
  }
};

async function labelSession(
  event: HookEvent,
  config: SessionLabelerConfig
): Promise<void> {
  const sessionKey = event.sessionKey;

  // 1) Resolve paths
  const sessionsDir = resolveSessionsDir(event);
  if (!sessionsDir) {
    console.log("[session-labeler] Could not resolve sessions directory, skipping.");
    return;
  }

  // 2) Check if already labeled (skip unless relabel is enabled)
  if (!config.relabel) {
    const existing = await getExistingLabel(config, sessionsDir, sessionKey);
    if (existing) {
      console.log(`[session-labeler] Session "${sessionKey}" already labeled: "${existing.label}"`);
      return;
    }
  }

  // 3) Resolve transcript path
  const transcriptPath = resolveTranscriptPath(event, sessionsDir);
  if (!transcriptPath) {
    console.log("[session-labeler] No transcript found, skipping.");
    return;
  }

  // 4) Extract user messages
  let userMessages: string[] = [];
  try {
    userMessages = await extractUserMessagesFromFile(
      transcriptPath,
      config.triggerAfterRequests
    );
  } catch {
    console.log("[session-labeler] No transcript found, skipping.");
    return;
  }

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
    label_turn: config.triggerAfterRequests,
    label_version: "1.0",
    label_updated_at: new Date().toISOString(),
  };

  await persistLabel(config, sessionsDir, sessionKey, sessionLabel);
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

async function getExistingLabel(
  config: SessionLabelerConfig,
  sessionsDir: string,
  sessionKey: string
): Promise<SessionLabel | undefined> {
  if (config.persistenceMode === "sidecar_labels_json") {
    return getLabel(labelsPathFromSessionsDir(sessionsDir), sessionKey);
  }
  return getLabelFromSessionStore(sessionsDir, sessionKey);
}

async function persistLabel(
  config: SessionLabelerConfig,
  sessionsDir: string,
  sessionKey: string,
  sessionLabel: SessionLabel
): Promise<void> {
  if (config.persistenceMode === "sidecar_labels_json") {
    await setLabel(labelsPathFromSessionsDir(sessionsDir), sessionKey, sessionLabel);
    return;
  }

  try {
    await setLabelInSessionStore(sessionsDir, sessionKey, sessionLabel);
  } catch (err) {
    if (!config.allowSidecarFallback) throw err;
    console.warn(
      "[session-labeler] session_json persistence failed; falling back to labels.json:",
      err instanceof Error ? err.message : String(err)
    );
    await setLabel(labelsPathFromSessionsDir(sessionsDir), sessionKey, sessionLabel);
  }
}

/**
 * Resolve transcript file path for the ending session.
 */
function resolveTranscriptPath(
  event: HookEvent,
  sessionsDir: string
): string | null {
  // Use explicit session file if available
  const sessionFile =
    event.context.sessionEntry?.sessionFile ?? event.context.sessionFile;
  if (sessionFile) {
    return sessionFile;
  }

  // Derive from session ID
  const sessionId =
    event.context.sessionEntry?.sessionId ?? event.context.sessionId;
  if (sessionId) {
    return join(sessionsDir, `${sessionId}.jsonl`);
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
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.SESSION_LABELER_MODEL ?? "gpt-4o-mini";
  const endpoint =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ??
    "https://api.openai.com/v1";

  if (!apiKey) {
    // No provider configured: labeler will fall back to heuristic keyword extraction.
    return {
      async complete(_prompt: string): Promise<string> {
        throw new Error("LLM API key not configured");
      },
    };
  }

  return {
    async complete(prompt: string): Promise<string> {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 40,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM request failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM response did not include content");
      return content;
    },
  };
}

function resolveConfig(event: HookEvent): SessionLabelerConfig {
  const merged: SessionLabelerConfig = { ...DEFAULT_CONFIG };
  const entry = (
    event.context.cfg as {
      hooks?: {
        internal?: {
          entries?: Record<string, Record<string, unknown>>;
        };
      };
    }
  )?.hooks?.internal?.entries?.["session-labeler"];
  if (!entry) return merged;

  if (typeof entry.triggerAfterRequests === "number") {
    merged.triggerAfterRequests = entry.triggerAfterRequests;
  }
  if (typeof entry.maxLabelChars === "number") {
    merged.maxLabelChars = entry.maxLabelChars;
  }
  if (typeof entry.relabel === "boolean") {
    merged.relabel = entry.relabel;
  }
  if (
    entry.persistenceMode === "session_json" ||
    entry.persistenceMode === "sidecar_labels_json"
  ) {
    merged.persistenceMode = entry.persistenceMode;
  }
  if (typeof entry.allowSidecarFallback === "boolean") {
    merged.allowSidecarFallback = entry.allowSidecarFallback;
  }
  if (Array.isArray(entry.triggerActions)) {
    merged.triggerActions = entry.triggerActions
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return merged;
}

export default handler;

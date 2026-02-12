/**
 * OpenClaw Hook Handler: session-labeler
 *
 * Fires on `command:new` to label the ending session with a short
 * descriptive name (≤ 28 characters) derived from the first 3 user requests.
 *
 * See HOOK.md for documentation.
 */

import { join, dirname, basename, resolve as pathResolve } from "node:path";
import { homedir } from "node:os";
import { readFile, readdir, stat } from "node:fs/promises";

import { extractUserMessagesFromFile } from "../../src/transcript.js";
import { generateLabel } from "../../src/labeler.js";
import {
  setLabel,
  getLabel,
  labelsPathFromSessionsDir,
} from "../../src/labels-store.js";
import {
  getLabelFromSessionStore,
  setLabelInSessionStoreBySessionId,
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
  sessionKey?: string;
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
          model?: { primary?: string; fallbacks?: string[] };
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
    // Log so gateway stdout shows hook ran (e.g. when running openclaw from terminal)
    console.log(
      `[session-labeler] Triggered: ${event.action} sessionKey=${event.sessionKey ?? "(missing)"}`
    );
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
  const sessionKey = typeof event.sessionKey === "string" ? event.sessionKey : "";

  // 1) Resolve paths
  const sessionsDir = resolveSessionsDir(event);
  if (!sessionsDir) {
    console.log("[session-labeler] Could not resolve sessions directory, skipping.");
    return;
  }

  // 2) Resolve transcript path (we need it to know endingSessionId for persistence)
  const transcriptPath = await resolveTranscriptPath(event, sessionsDir);
  if (!transcriptPath) {
    console.log("[session-labeler] No transcript found, skipping.");
    return;
  }

  const endingSessionId = basename(transcriptPath, ".jsonl");

  // 3) Check if already labeled
  if (!config.relabel) {
    if (sessionKey) {
      const existingByKey = await getExistingLabel(config, sessionsDir, sessionKey);
      if (existingByKey) {
        console.log(`[session-labeler] Session "${sessionKey}" already labeled: "${existingByKey.label}"`);
        return;
      }
    }
    const labelsPath = labelsPathFromSessionsDir(sessionsDir);
    const existingById = await getLabel(labelsPath, endingSessionId);
    if (existingById) {
      console.log(`[session-labeler] Session ${endingSessionId} already labeled: "${existingById.label}"`);
      return;
    }
  }

  // 4) Extract user messages (up to maxMessagesForLabel)
  let userMessages: string[] = [];
  try {
    userMessages = await extractUserMessagesFromFile(
      transcriptPath,
      config.maxMessagesForLabel
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

  const messagesForLabel = userMessages.slice(0, config.maxMessagesForLabel);

  // 5) Generate label (LLM with heuristic fallback)
  const llm = createLlmClient(event);
  const label = await generateLabel(llm, {
    requests: messagesForLabel,
    max_chars: config.maxLabelChars,
  });

  // 6) Persist by ending session id (so the previous session gets the label, not the new one)
  // label_turn = threshold we require to run (triggerAfterRequests), not the count of messages used
  const sessionLabel: SessionLabel = {
    label,
    label_source: "auto",
    label_turn: config.triggerAfterRequests,
    label_version: "1.0",
    label_updated_at: new Date().toISOString(),
  };

  await persistLabel(config, sessionsDir, sessionKey, sessionLabel, endingSessionId);
  console.log(`[session-labeler] Labeled "${endingSessionId}" (${sessionKey}): "${label}"`);
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

  // Try from config (resolve relative paths against workspaceDir or cwd)
  const agentConfig = event.context.cfg?.agents?.defaults;
  if (agentConfig?.sessionsDir && typeof agentConfig.sessionsDir === "string") {
    const dir = agentConfig.sessionsDir;
    if (dir.startsWith("/")) return dir;
    const base = event.context.workspaceDir ?? process.cwd();
    return pathResolve(base, dir);
  }

  // Workspace fallback (testing harnesses, single-workspace setups)
  const workspaceDir = event.context.workspaceDir;
  if (workspaceDir) {
    return join(workspaceDir, ".openclaw", "sessions");
  }

  // Per-agent fallback: agent:main:main -> ~/.openclaw/agents/main/sessions (desktop/multi-agent)
  const sk = typeof event.sessionKey === "string" ? event.sessionKey : "";
  const agentMatch = sk.match(/^agent:([^:]+)/);
  if (agentMatch) {
    const agentId = agentMatch[1];
    const base = process.env.OPENCLAW_HOME || homedir();
    return join(base, ".openclaw", "agents", agentId, "sessions");
  }

  return null;
}

async function getExistingLabel(
  config: SessionLabelerConfig,
  sessionsDir: string,
  sessionKey: string
): Promise<SessionLabel | undefined> {
  if (
    config.persistenceMode === "labels_json" ||
    config.persistenceMode === "sidecar_labels_json"
  ) {
    return undefined;
  }
  return getLabelFromSessionStore(sessionsDir, sessionKey);
}

async function persistLabel(
  config: SessionLabelerConfig,
  sessionsDir: string,
  sessionKey: string,
  sessionLabel: SessionLabel,
  endingSessionId: string
): Promise<void> {
  const labelsPath = labelsPathFromSessionsDir(sessionsDir);
  const labelsOnly =
    config.persistenceMode === "labels_json" ||
    config.persistenceMode === "sidecar_labels_json";

  if (labelsOnly) {
    await setLabel(labelsPath, endingSessionId, sessionLabel);
    return;
  }

  // session_json: write to labels.json by id (durable) then update sessions.json when entry still points here.
  await setLabel(labelsPath, endingSessionId, sessionLabel);

  // Also write into sessions.json (canonical metadata) via reverse lookup by sessionId.
  try {
    const updated = await setLabelInSessionStoreBySessionId(
      sessionsDir,
      endingSessionId,
      sessionLabel
    );
    if (!updated && sessionKey) {
      console.warn(
        `[session-labeler] session_json mode: no sessions.json entry found for ended session ${endingSessionId}; label kept in labels.json`
      );
    }
  } catch (err) {
    if (!config.allowSidecarFallback) throw err;
    console.warn(
      "[session-labeler] session_json persistence failed; label stored in labels.json by session id:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Resolve transcript file path for the ending session.
 * When event lacks sessionFile/sessionId (e.g. desktop/webchat), reads sessions.json
 * to look up the session entry by sessionKey.
 */
async function resolveTranscriptPath(
  event: HookEvent,
  sessionsDir: string
): Promise<string | null> {
  const sessionKey = typeof event.sessionKey === "string" ? event.sessionKey : "";
  // Use explicit session file if available
  const sessionFile =
    event.context.sessionEntry?.sessionFile ?? event.context.sessionFile;
  if (sessionFile) {
    return sessionFile;
  }

  // Derive from session ID in context
  const sessionId =
    event.context.sessionEntry?.sessionId ?? event.context.sessionId;
  if (sessionId) {
    const canonical = join(sessionsDir, `${sessionId}.jsonl`);
    try {
      await stat(canonical);
      return canonical;
    } catch {
      // Naming may vary; fallback: newest .jsonl whose name contains sessionId
      const files = await readdir(sessionsDir);
      const candidates = files
        .filter((f) => f.endsWith(".jsonl") && f.includes(sessionId))
        .map((f) => join(sessionsDir, f));
      if (candidates.length > 0) {
        const withMtime = await Promise.all(
          candidates.map(async (p) => ({ p, mtime: (await stat(p)).mtimeMs }))
        );
        withMtime.sort((a, b) => b.mtime - a.mtime);
        return withMtime[0].p;
      }
    }
  }

  // Fallback: read sessions.json. When OpenClaw runs the hook after /new, it may have
  // already updated sessions.json to the NEW session — so the entry points to the new
  // session, not the one that ended. We then pick the most recently modified .jsonl
  // that is NOT the current entry (i.e. the session that just ended).
  try {
    const path = join(sessionsDir, "sessions.json");
    const raw = await readFile(path, "utf-8");
    const store = JSON.parse(raw) as Record<string, { sessionId?: string; sessionFile?: string }>;
    const entry = sessionKey ? store[sessionKey] : undefined;
    const currentId = entry?.sessionId && typeof entry.sessionId === "string" ? entry.sessionId : null;

    const files = await readdir(sessionsDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    const withMtime: { name: string; mtime: number }[] = [];
    for (const f of jsonlFiles) {
      try {
        const s = await stat(join(sessionsDir, f));
        withMtime.push({ name: f, mtime: s.mtimeMs });
      } catch {
        // skip
      }
    }
    withMtime.sort((a, b) => b.mtime - a.mtime);

    // Prefer: transcript that is not the "current" session (current is the new one after /new)
    for (const { name } of withMtime) {
      const sessionIdFromFile = name.slice(0, -6);
      if (currentId != null && sessionIdFromFile === currentId) continue;
      return join(sessionsDir, name);
    }
    // If no other file, use the first (most recent) — hook may have run before OpenClaw updated
    if (withMtime.length > 0) {
      return join(sessionsDir, withMtime[0].name);
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Create an LLM client from the event context.
 *
 * Uses OpenClaw's default model (agents.defaults.model.primary) when available,
 * otherwise SESSION_LABELER_MODEL or gpt-4o-mini. Calls OpenAI-compatible
 * chat/completions (OpenRouter, Ollama, etc. when OPENAI_BASE_URL is set).
 */
function createLlmClient(event: HookEvent): LlmClient {
  const apiKey = process.env.OPENAI_API_KEY;
  const primaryFromConfig = (event.context.cfg as { agents?: { defaults?: { model?: { primary?: string } } } })?.agents?.defaults?.model?.primary;
  const model =
    process.env.SESSION_LABELER_MODEL ?? primaryFromConfig ?? "gpt-4o-mini";
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let response: Response;
      try {
        response = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 40,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const body = await response.text();
        const compact = body.replace(/\s+/g, " ").slice(0, 500);
        throw new Error(`LLM request failed (${response.status}): ${compact}`);
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
  if (typeof entry.maxMessagesForLabel === "number") {
    merged.maxMessagesForLabel = entry.maxMessagesForLabel;
  }
  if (typeof entry.maxLabelChars === "number") {
    merged.maxLabelChars = entry.maxLabelChars;
  }
  if (typeof entry.relabel === "boolean") {
    merged.relabel = entry.relabel;
  }
  if (
    entry.persistenceMode === "session_json" ||
    entry.persistenceMode === "labels_json" ||
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

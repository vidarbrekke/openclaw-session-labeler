/**
 * Represents a single entry in an OpenClaw session transcript (.jsonl).
 */
export interface TranscriptEntry {
  type: string;
  id?: string;
  parentId?: string;
  role?: string;
  /** Message content; may be string or multimodal array / unknown structure */
  content?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Label metadata written alongside session data.
 */
export interface SessionLabel {
  label: string;
  label_source: "auto" | "manual";
  label_turn: number;
  label_version: string;
  label_updated_at: string;
}

/**
 * Input to the labeler skill / prompt.
 */
export interface LabelerInput {
  requests: string[];
  workspace_name?: string;
  max_chars: number;
}

/**
 * Minimal interface for calling an LLM from the hook.
 * Implementations can use OpenClaw's internal model runner,
 * a direct API call, or a test stub.
 */
export interface LlmClient {
  complete(prompt: string): Promise<string>;
}

/**
 * Configuration for the session-labeler hook.
 */
export interface SessionLabelerConfig {
  /** Minimum user messages required to run (default: 3; skip if ≤2) */
  triggerAfterRequests: number;
  /** Max user messages to use for the label (default: 5; uses fewer if session has fewer) */
  maxMessagesForLabel: number;
  /** Max label length in characters (default: 28) */
  maxLabelChars: number;
  /** Whether to overwrite existing labels (default: false) */
  relabel: boolean;
  /**
   * Where to persist labels:
   * - "session_json": write to labels.json by session id (durable) and update sessions.json entry when it still points at this session (canonical UI).
   * - "labels_json": write only to labels.json by session id (no sessions.json). Same as legacy "sidecar_labels_json".
   */
  persistenceMode: "session_json" | "labels_json" | "sidecar_labels_json";
  /** When session_json: fall back to labels.json only if sessions.json update fails (default true) */
  allowSidecarFallback: boolean;
  /** Command actions that should trigger labeling */
  triggerActions: string[];
}

export const DEFAULT_CONFIG: SessionLabelerConfig = {
  triggerAfterRequests: 3,
  maxMessagesForLabel: 5,
  maxLabelChars: 28,
  relabel: false,
  persistenceMode: "session_json",
  allowSidecarFallback: true,
  triggerActions: ["new", "reset", "stop"],
};

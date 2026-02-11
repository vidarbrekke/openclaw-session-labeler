/**
 * Represents a single entry in an OpenClaw session transcript (.jsonl).
 */
export interface TranscriptEntry {
  type: string;
  id?: string;
  parentId?: string;
  role?: string;
  content?: string;
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
  /** Number of user requests before labeling (default: 3) */
  triggerAfterRequests: number;
  /** Max label length in characters (default: 28) */
  maxLabelChars: number;
  /** Whether to overwrite existing labels (default: false) */
  relabel: boolean;
}

export const DEFAULT_CONFIG: SessionLabelerConfig = {
  triggerAfterRequests: 3,
  maxLabelChars: 28,
  relabel: false,
};

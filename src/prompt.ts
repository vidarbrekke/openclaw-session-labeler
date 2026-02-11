import type { LabelerInput } from "./types.js";

/**
 * Build the system + user prompt for the session labeler LLM call.
 */
export function buildPrompt(input: LabelerInput): {
  system: string;
  user: string;
} {
  const system = `You generate a short session label that captures what the conversation is about.

Rules:
- Output ONE label only, plain text.
- Maximum ${input.max_chars} characters.
- 2–5 words. Prefer concrete nouns over verbs.
- No quotes. No trailing period or punctuation.
- Ignore greetings, pleasantries, and filler.
- If the requests cover multiple topics, pick the dominant one.
- Use title case.

Examples of good labels:
- Stripe Webhook Setup
- React Auth Flow
- K8s Deploy Pipeline
- Newsletter Email Draft
- CSV Import Bugfix
- Logo Color Variants
- API Rate Limiting
- Docker Compose Config
- Onboarding Flow UX
- Budget Tracker App
- Git Merge Conflict
- PDF Invoice Generator`;

  const workspaceLine = input.workspace_name
    ? `Workspace: ${input.workspace_name}\n\n`
    : "";

  const requestLines = input.requests
    .map((req, i) => `${i + 1}) ${truncateRequest(req)}`)
    .join("\n");

  const user = `${workspaceLine}User requests:\n${requestLines}\n\nReturn only the label.`;

  return { system, user };
}

/**
 * Truncate a single request to a reasonable length for the prompt.
 * Long requests waste tokens and add noise.
 */
function truncateRequest(request: string, maxLen = 200): string {
  const oneLine = request.replace(/[\n\r]+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen - 3) + "...";
}

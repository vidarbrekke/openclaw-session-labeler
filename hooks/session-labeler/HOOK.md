---
name: session-labeler
description: "Auto-labels sessions with a short descriptive name (≤28 chars) after 3 user requests"
metadata:
  openclaw:
    emoji: "🏷️"
    events:
      - "command:new"
    requires:
      bins:
        - "node"
      config:
        - "workspace.dir"
---

# Session Labeler

Automatically assigns a short, descriptive session label (≤ 28 characters) when a session ends (via `/new`). The label captures what the conversation was about based on the first 3 user requests.

## What It Does

1. When you issue `/new`, this hook inspects the **ending** session's transcript.
2. Extracts the first 3 user messages.
3. Uses the configured LLM to generate a concise label (2–5 words).
4. Sanitizes and enforces the 28-character limit deterministically.
5. Persists the label to `labels.json` alongside your session store.

## Why `/new` Instead of Per-Message?

OpenClaw's current hook system supports command events (`command:new`, `command:reset`, `command:stop`) and lifecycle events. A per-message hook (`message:received`) is planned but not yet available. Once it ships, this hook can be updated to label sessions live after the 3rd request.

## Label Examples

| Requests About                          | Generated Label         |
| --------------------------------------- | ----------------------- |
| Setting up Stripe webhooks              | Stripe Webhook Setup    |
| Writing React auth components           | React Auth Flow         |
| Kubernetes deployment pipeline          | K8s Deploy Pipeline     |
| Drafting a newsletter email             | Newsletter Email Draft  |

## Configuration

In your OpenClaw config:

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "session-labeler": {
          "enabled": true
        }
      }
    }
  }
}
```

## Requirements

- Node.js must be installed.
- `workspace.dir` must be configured (needed to locate session transcripts).

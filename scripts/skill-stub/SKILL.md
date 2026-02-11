---
name: session-labeler
description: >
  Hook that auto-labels OpenClaw sessions with a short name (≤28 chars) after 3 user
  requests. Runs automatically on /new, /reset, /stop — no agent action needed.
  Shown here for visibility; configuration is under Hooks / session-labeler.
---

# Session Labeler (hook)

This is an **OpenClaw hook**, not an interactive skill. It runs automatically when you issue `/new`, `/reset`, or `/stop`.

## What it does

- Reads the ending session’s transcript (first 3 user messages).
- Generates a short label (2–5 words, ≤ 28 characters).
- Writes the label into session metadata (`sessions.json` or `labels.json`).

No need to invoke this from chat — it runs in the background. To configure it (e.g. `triggerAfterRequests`, `maxLabelChars`), use the **Hooks** section in OpenClaw config or `openclaw hooks info session-labeler`.

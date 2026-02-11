# openclaw-session-labeler

🏷️ Gives OpenClaw sessions a friendly name.

Auto-labels sessions with a short, descriptive name (**≤ 28 characters**) after 3 user requests, so you can tell at a glance what each conversation was about.

## How It Works

1. You issue `/new`, `/reset`, or `/stop` in OpenClaw.
2. This hook inspects the **ending** session's transcript.
3. Extracts the first 3 user messages.
4. Generates a concise label (2–5 words, title case).
5. Persists the label into `sessions.json` metadata by default (`labels.json` sidecar mode is optional).

**Label examples:** `Stripe Webhook Setup` · `React Auth Flow` · `K8s Deploy Pipeline` · `Newsletter Email Draft`

## Installation

### As a hook pack

```bash
openclaw hooks install /path/to/openclaw-session-labeler
openclaw hooks enable session-labeler
```

### Manual placement

Copy the `hooks/session-labeler/` directory to `~/.openclaw/hooks/`:

```bash
cp -r hooks/session-labeler ~/.openclaw/hooks/
openclaw hooks enable session-labeler
```

### Enable in config

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "session-labeler": { "enabled": true }
      }
    }
  }
}
```

Optional settings:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-labeler": {
          "enabled": true,
          "triggerAfterRequests": 3,
          "maxLabelChars": 28,
          "relabel": false,
          "persistenceMode": "session_json",
          "allowSidecarFallback": true,
          "triggerActions": ["new", "reset", "stop"]
        }
      }
    }
  }
}
```

## Development

```bash
npm install
npm test           # Run all 66 tests
npm run test:watch # Watch mode
npm run typecheck  # TypeScript checks
```

## Project Structure

```
src/
  sanitize.ts           Clean raw LLM output
  enforce-length.ts     Smart shorten + hard truncate (≤28 chars)
  transcript.ts         Parse JSONL transcripts, extract user messages
  prompt.ts             Build LLM labeling prompt
  labeler.ts            Generate label (LLM + heuristic fallback)
  labels-store.ts       Read/write labels.json sidecar persistence
  session-json-store.ts Read/write label metadata in sessions.json
  types.ts              Shared types and config defaults

hooks/session-labeler/
  HOOK.md               Hook metadata and documentation
  handler.ts            Hook entry point (fires on command:new/reset/stop)

tests/                  66 tests (unit + integration)
```

## Docs

- [Implementation plan](./openclaw-auto-session-labeling-implementation-plan.md) — architecture, flow, sanitization rules, and test plan.

## License

MIT

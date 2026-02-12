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

**Sharing with others:** The `dist/` directory is a self-contained hook pack. Copy or zip `dist/` and share it; recipients run `openclaw hooks install .` (or `./install-session-labeler.sh .`) from that folder.

```bash
# From the repo root (session_labler):
openclaw hooks install .

# From the shared dist folder (after copying dist/ to someone):
openclaw hooks install .
openclaw hooks enable session-labeler
```

### Activation (important)

After installing/enabling, **restart the OpenClaw gateway process** so hooks are reloaded.

Then verify it is active:

```bash
openclaw hooks list
openclaw hooks check
openclaw hooks info session-labeler
```

Expected result: `session-labeler` appears as enabled/eligible and will run on `/new`, `/reset`, and `/stop`.

### One-command install (script)

From the hook pack directory (repo root or shared `dist/` folder):

```bash
./scripts/install-session-labeler.sh .   # repo
# or
./install-session-labeler.sh .          # inside shared dist/
```

The script will prompt to replace an existing installation if needed, then install, enable, attempt restart, and verify.

Custom restart flow:

```bash
RESTART_CMD="your-restart-command" ./install-session-labeler.sh .
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

Do **not** ship `node_modules` in the repo or in distribution archives. Use a clean install for tests:

```bash
npm ci
npm test
npm run typecheck
npm run validate
```

### Creating the distributable (`dist/`)

Run `./create_dist.sh` (or `npm run dist`) to build the self-contained hook pack:

- Bumps the **patch** version in `package.json`
- Compiles TypeScript to `build/`, then copies only runtime assets to `dist/` (no `node_modules`, no source `.ts`)
- Writes `dist/VERSION`

Share the `dist/` folder or zip it. When zipping, exclude junk:  
`zip -r pack.zip dist -x "*node_modules*" "*__MACOSX*" "*.DS_Store"`

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

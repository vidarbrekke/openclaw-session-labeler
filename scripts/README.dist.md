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

### When it runs

- **Takes effect immediately** after the gateway is restarted (the install script restarts it for you). It stays enabled across future restarts — no extra step.
- **Only sessions you end** — The hook runs when you issue `/new`, `/reset`, or `/stop`. It labels the session that is *ending* then. It does **not** go back and label old sessions; only sessions you end from now on will get a label.
- **Default model** — Uses OpenClaw’s **default model** (`agents.defaults.model.primary` from your config) when the hook runs. Override with `SESSION_LABELER_MODEL` if needed. If no API key is set, it uses a heuristic keyword fallback (no API call).
- **Runs automatically** — Once enabled, it is loaded on every gateway/frontend restart. No need to trigger it manually.

## Installation

This folder is a **self-contained hook pack**. Use it from this directory.

### Recommended: one-command install (script)

From this directory:

```bash
./install-session-labeler.sh .
```

Use this for both first install and **updates**. If the hook is already installed, the script will ask to remove the old copy and reinstall from this folder.  
If you run `openclaw hooks install .` directly instead, OpenClaw will say **"hook pack already exists … (delete it first)"** — use the script above, or remove the folder first: `rm -rf ~/.openclaw/hooks/session-labeler` then run `openclaw hooks install .` again.

The script will:
1. Install (or replace) the hook pack
2. Enable `session-labeler`
3. Install a **skill stub** into `~/.openclaw/skills/session-labeler/` so **Session Labeler** appears in the Clawbot desktop Skills list (the hook itself lives under Hooks; the stub is for visibility only)
4. Try to restart the gateway (`openclaw gateway restart` / `openclaw restart`)
5. Run verification (`hooks list` / `check` / `info`)

Custom restart command:

```bash
RESTART_CMD="your-restart-command" ./install-session-labeler.sh .
```

### Manual: openclaw hooks install

Only if the hook is **not** already installed:

```bash
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
npm test           # Run all 72 tests
npm run test:watch # Watch mode
npm run typecheck  # TypeScript checks
npm run validate   # Hook metadata + typecheck + tests + packaging dry-run
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

## License

MIT

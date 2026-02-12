# openclaw-session-labeler

🏷️ Gives OpenClaw sessions a friendly name.

When you end a session (`/new`, `/reset`, or `/stop`), this hook labels **that session** with a short name (**≤ 28 characters**) based on its first 3–5 user messages (or fewer if the session has fewer). Sessions with 2 or fewer user messages are skipped (too little context).

## How It Works

1. You issue `/new`, `/reset`, or `/stop`.
2. The hook reads the **ending** session’s transcript, takes the first 3–5 user messages (configurable), and generates a short label (2–5 words, title case).
3. The label is stored in `sessions.json` by default, or in `labels.json` (sidecar) when configured.

**Examples:** `Stripe Webhook Setup` · `React Auth Flow` · `K8s Deploy Pipeline`

**When it runs:** After gateway restart the hook is active. It runs only when you end a session; it labels that session only (no backfill). Uses OpenClaw’s default model; set `SESSION_LABELER_MODEL` to override. With no API key, a heuristic fallback is used.

**Runtime requirement:** Node.js 18+.

## Installation

This folder is a **self-contained hook pack**. Run from this directory.

### Recommended

```bash
./install-session-labeler.sh .
```

Use for first install and updates. If the hook is already installed, the script will prompt to replace it.  
Do not run `openclaw hooks install .` directly unless you first remove `~/.openclaw/hooks/session-labeler`.

The script: installs the pack, enables the hook, adds it to `hooks.internal.entries`, installs a skill stub for desktop visibility, restarts the gateway, and runs verification.

Custom restart:

```bash
RESTART_CMD="your-restart-command" ./install-session-labeler.sh .
```

### Manual

If the hook is not installed:

```bash
openclaw hooks install .
openclaw hooks enable session-labeler
```

Restart the gateway, then run `openclaw hooks list` (or `openclaw hooks info session-labeler`) to verify.

### Config

Minimal (hook enabled):

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

**Persistence mode** (`persistenceMode`):  
- `session_json` (default): store in `labels.json` by session id and update `sessions.json` when the entry still points at that session (for UI).  
- `labels_json`: store only in `labels.json` by session id (no `sessions.json`).  

Other optional keys: `triggerAfterRequests` (default 3), `maxMessagesForLabel` (5), `maxLabelChars` (28), `relabel`, `allowSidecarFallback`, `triggerActions`.

## Development

This pack does **not** include `node_modules`. From the repo (or after unpacking a source archive), install deps and run tests:

```bash
npm ci
npm test
npm run typecheck
npm run validate
```

**Structure:** `hooks/session-labeler/` — `handler.js`, HOOK.md. `src/` — compiled JS (transcript, labeler, labels-store, etc.). When creating a zip for distribution, exclude `node_modules`, `__MACOSX`, `.DS_Store`.

## License

MIT

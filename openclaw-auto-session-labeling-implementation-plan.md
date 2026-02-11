# OpenClaw: Auto-Label Sessions After 3 Requests (≤ 28 chars)

## Goal
Automatically assign a short, descriptive **session label** once a session has processed at least **3 user requests**, writing the label into a persistent **labels store**. The label must be **≤ 28 characters** and stable (no churn unless explicitly enabled).

---

## High-level architecture

**Split responsibilities:**
1. **Hook Handler (deterministic)** — TypeScript hook running on `command:new`
   - Decides **when** to label a session (on session end, if ≥ 3 user messages).
   - Reads the JSONL transcript, extracts user messages.
   - Calls the labeler module.
   - Sanitizes/enforces the final label deterministically.
   - Persists to `labels.json`.

2. **Labeler Module (LLM-powered with heuristic fallback)**
   - Decides **what** the label should be from the first 3 user requests.
   - Outputs **one line only**: the label.
   - Falls back to keyword extraction when LLM is unavailable.

**Why split this way:** hooks stay predictable; LLM logic is contained and testable.

---

## OpenClaw Integration

### How it fits OpenClaw's hook system

This is implemented as an **OpenClaw hook pack** — an npm-style package with `openclaw.hooks` in `package.json`. The hook:

- **Fires on** `command:new` (when the user starts a new session, the ending session gets labeled).
- **Reads** the ending session's JSONL transcript from `~/.openclaw/agents/<agentId>/sessions/`.
- **Writes** labels to a separate `labels.json` file (not directly into `sessions.json`, which is Gateway-owned).
- **Requires** `workspace.dir` config and `node` on PATH.

### Why `command:new` instead of per-message?

OpenClaw's current hook events are: `command:new`, `command:reset`, `command:stop`, `agent:bootstrap`, `gateway:startup`. A per-message event (`message:received`) is planned but not yet available. Once it ships, this hook can be updated to label sessions **live** after the 3rd request instead of retroactively on session end.

### Installation

```bash
openclaw hooks install /path/to/openclaw-session-labeler
openclaw hooks enable session-labeler
```

Or place the `hooks/session-labeler/` directory in `~/.openclaw/hooks/`.

---

## Project Structure

```
openclaw-session-labeler/
├── package.json              # Hook pack with openclaw.hooks config
├── hooks/
│   └── session-labeler/
│       ├── HOOK.md           # Hook metadata (events, requirements)
│       └── handler.ts        # Hook entry point
├── src/
│   ├── types.ts              # Shared types and config defaults
│   ├── sanitize.ts           # Clean raw LLM output
│   ├── enforce-length.ts     # Smart shorten + hard truncate (≤28 chars)
│   ├── transcript.ts         # Parse JSONL transcripts, extract user messages
│   ├── prompt.ts             # Build LLM labeling prompt
│   ├── labeler.ts            # Generate label (LLM + heuristic fallback)
│   ├── labels-store.ts       # Read/write labels.json persistence
│   └── index.ts              # Barrel exports
├── tests/
│   ├── sanitize.test.ts      # 23 tests
│   ├── enforce-length.test.ts# 12 tests
│   ├── transcript.test.ts    # 10 tests
│   ├── labeler.test.ts       # 10 tests
│   └── handler.test.ts       # 7 tests (integration)
├── tsconfig.json
└── vitest.config.ts
```

---

## 1) Label Persistence

### Labels store (`labels.json`)

Labels are persisted in `labels.json` alongside the session store:

```
~/.openclaw/agents/<agentId>/sessions/labels.json
```

Format:
```json
{
  "agent:main:main": {
    "label": "Stripe Webhook Setup",
    "label_source": "auto",
    "label_turn": 3,
    "label_version": "1.0",
    "label_updated_at": "2026-02-11T18:00:00Z"
  }
}
```

**Why a separate file?** `sessions.json` is owned by the Gateway and may rewrite/rehydrate entries. A separate labels file avoids conflicts while still being co-located for easy discovery.

---

## 2) Hook Handler Flow

On each `command:new` event:

1. **Filter**: only trigger on `type === "command"` and `action === "new"`.
2. **Resolve sessions dir** from event context (`sessionFile`, `workspaceDir`, or config).
3. **Check existing label**: if `labels.json` already has a label for this `sessionKey`, exit (unless `relabel: true`).
4. **Read transcript**: load the JSONL file for the ending session.
5. **Extract user messages**: parse entries with `type === "message"` and `role === "user"`.
6. **Threshold check**: if fewer than 3 user messages, exit.
7. **Generate label**: call LLM (or heuristic fallback).
8. **Sanitize + enforce length**: deterministic post-processing.
9. **Persist**: write to `labels.json`.

---

## 3) Sanitization (deterministic, in code)

Given raw LLM output:

1. Take only the first non-empty line.
2. Trim whitespace.
3. Remove leading list markers (`- `, `* `, `• `).
4. Replace tabs with spaces, collapse multiple spaces.
5. Remove surrounding quotes / backticks / markdown bold markers.
6. Remove trailing punctuation (`. , ; : ! ?`).

---

## 4) Length Enforcement (≤ 28 chars)

Smart shortening pipeline:

1. **Remove stop-words** (a, an, the, and, of, to, for, with, on, in, is, are, was, be, by, at, or, its).
2. **Abbreviate known long words**:
   - configuration → Config, documentation → Docs, performance → Perf
   - implementation → Impl, integration → Integ, development → Dev
   - authentication → Auth, management → Mgmt, kubernetes → K8s
   - (see full map in `src/enforce-length.ts`)
3. **Keep most informative words** (longest words, original order, up to 4).
4. **Hard truncate** to 28 chars (no trailing space).

Fallback: if label becomes empty → `"General"`.

---

## 5) LLM Prompt

System prompt instructs the model to:
- Output ONE label only, plain text
- Max 28 characters, 2–5 words
- Title case, concrete nouns preferred
- No quotes, no trailing punctuation
- Ignore greetings/filler, pick dominant topic

Includes 12 examples of good labels to anchor style.

User prompt contains:
- Workspace name (if available)
- The first 3 user requests (truncated to 200 chars each)

---

## 6) Heuristic Fallback

When LLM is unavailable or returns garbage:

1. Extract all words > 3 chars from the 3 user requests.
2. Count word frequency.
3. Take top 3 words (by frequency, then length).
4. Title-case and join.
5. Enforce max length.
6. If still empty → `"General"`.

---

## 7) Configuration

In OpenClaw config:
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

Hook settings (in `src/types.ts`):
- `triggerAfterRequests: 3` — minimum user messages before labeling
- `maxLabelChars: 28` — hard character limit
- `relabel: false` — whether to overwrite existing labels

---

## 8) Testing (62 tests, all passing)

### Unit tests
- **`sanitize.test.ts`** (23 tests): whitespace, quotes, backticks, markdown bold, bullet markers, trailing punctuation, multi-line, edge cases.
- **`enforce-length.test.ts`** (12 tests): short labels unchanged, stop-word removal, abbreviation, word order preservation, hard truncation, edge cases.
- **`transcript.test.ts`** (10 tests): JSONL parsing, blank/malformed lines, user message extraction, multimodal content, limit parameter.
- **`labeler.test.ts`** (10 tests): LLM integration, sanitization pipeline, length enforcement, fallback behavior, heuristic label generation.

### Integration tests
- **`handler.test.ts`** (7 tests): event filtering, threshold check, label generation, no-overwrite, stability across invocations, missing transcript handling.

---

## 9) Future Enhancements

1. **Wire LLM client**: integrate with OpenClaw's internal model runner when hook LLM API is available (currently uses heuristic fallback).
2. **Live labeling**: switch to `message:received` event when it ships, to label after exactly 3 requests instead of retroactively.
3. **Relabel on topic drift**: optionally re-label at turn 6 if conversation topic shifts significantly.
4. **UI integration**: surface `labels.json` in OpenClaw's `/status` output and Control UI.
5. **Confidence scoring**: if the model returns a generic label, re-run with stronger constraints.

---

## Done Criteria

- [x] Sessions get a descriptive label based on user requests.
- [x] Labels are always **≤ 28 characters**.
- [x] Existing labels are never overwritten (unless `relabel: true`).
- [x] Hook follows OpenClaw conventions (HOOK.md + handler.ts, auto-discovery).
- [x] 62 tests passing (unit + integration).
- [ ] LLM client wired to OpenClaw's model runner (currently heuristic only).
- [ ] Live labeling via `message:received` event (waiting on OpenClaw).

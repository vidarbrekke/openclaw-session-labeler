# OpenClaw: Auto-Label Sessions After 3 Requests (≤ 28 chars)

## Goal
Automatically assign a short, descriptive **session label** once a session has processed the first **3 user requests**, writing the label into the session’s **JSON metadata**. The label must be **≤ 28 characters** and stable (no churn unless explicitly enabled).

This plan is written so an OpenClaw agent (or developer) can implement it **end-to-end**.

---

## High-level architecture

**Split responsibilities:**
1. **Lifecycle Hook Handler (deterministic)**
   - Decides **when** to label a session.
   - Loads/saves session JSON.
   - Calls the labeler skill once the threshold is met.

2. **Labeler Skill (LLM-powered)**
   - Decides **what** the label should be from the first 3 user requests.
   - Outputs **one line only**: the label.
   - Post-processing + enforcement occurs in the hook handler.

**Why split this way:** hooks stay predictable; LLM logic is contained.

---

## Assumptions (adjust to your repo)

- Session metadata is stored as JSON in something like:
  - `~/.openclaw/sessions/<session_id>.json` **or**
  - `<workspace>/.openclaw/sessions/<session_id>.json`
- OpenClaw supports lifecycle events (startup/shutdown and at least one “turn complete” / “message processed” / “step finished” style hook).
- You can call an LLM from a skill (existing pattern in OpenClaw).
- Your runtime can read/write JSON files in the workspace.

If any of these differ, adapt the file paths and hook event name; the logic stays the same.

---

## Deliverables

You will implement:

1. **Session JSON schema extension** (non-breaking).
2. **Hook handler module** that:
   - Tracks processed user requests.
   - Triggers once at request #3.
   - Calls `session_labeler` skill.
   - Sanitizes/enforces the final label.
   - Writes it back to JSON.
3. **Labeler skill**:
   - Prompt + input shaping.
   - Returns a single short label.
4. **Tests**:
   - Unit tests for sanitization and truncation.
   - Integration tests for hook behavior.

---

## 1) Session JSON schema changes

### Add fields (safe defaults)
Add these fields to the session JSON once labeling runs:

```json
{
  "label": "Stripe newsletter ideas",
  "label_source": "auto",
  "label_turn": 3,
  "label_version": "1.0",
  "label_updated_at": "2026-02-11T18:00:00Z"
}
```

**Notes**
- `label` is the only field required by downstream UI.
- `label_turn` = the number of processed user requests when created (should be `3` here).
- `label_version` allows future migrations.
- If you already have a metadata namespace (e.g., `meta.label`), use it; keep consistent.

### Optional: tracking counter
If your session JSON does not already track turns, add one:

```json
{
  "processed_user_requests": 2
}
```

If OpenClaw already tracks this elsewhere, use that source of truth.

---

## 2) Hook handler implementation

### Hook: choose the right event
Prefer an event that occurs after each user request is fully processed, e.g.:

- `on_turn_complete`
- `after_request`
- `after_message_processed`
- `on_step_finished` (if “step” corresponds to one user request)

If OpenClaw only provides startup/shutdown, implement this on shutdown as a fallback, but the requested behavior is “after the first 3 requests,” so **turn-complete** is ideal.

### Hook responsibilities
On each hook invocation:

1. **Locate session JSON**
2. **Load JSON**
3. **Update / compute `processed_user_requests`**
4. If `label` exists → exit
5. If requests < 3 → exit
6. Gather **first 3 user requests**
7. Call labeler skill
8. Sanitize + enforce **≤ 28 chars**
9. Write label fields back to session JSON

---

## 2.1) Locate session JSON (path strategy)

Implement a function `resolve_session_json_path(session_id)`:

- First check: `<workspace>/.openclaw/sessions/<session_id>.json`
- If not found: `~/.openclaw/sessions/<session_id>.json`
- If still not found: search a configured directory from OpenClaw config (recommended).

Add config keys:

```yaml
sessions:
  dir: ".openclaw/sessions"
```

Resolve relative to workspace root.

---

## 2.2) Extract first 3 user requests

Prefer a reliable data source:
- If session JSON stores messages, use that.
- Else, read the conversation transcript file if one exists.
- Else, if OpenClaw provides the current request content and an API to fetch prior turns, use that.

### Target shape passed to the skill
Send an object like:

```json
{
  "session_id": "abc123",
  "requests": [
    "User request 1…",
    "User request 2…",
    "User request 3…"
  ],
  "workspace_name": "Mother Knitter Ops",
  "max_chars": 28
}
```

**Important:** include only user requests, not system prompts or tool logs.

---

## 3) Labeler skill implementation

### Skill name
`session_labeler`

### Input
- `requests: string[]` (length 3, required)
- `workspace_name?: string` (optional)
- `max_chars: number` (fixed at 28)

### Output
- `label: string` (single line text)
- No JSON needed unless your skill runner prefers structured output. If structured output is used, still ensure `label` is a plain string.

### Prompt (recommended)
Use a strict title-generator prompt:

**System / Instruction**
- Output **ONE label only**
- **No quotes**
- **No punctuation at the end**
- **2–5 words**
- Prefer concrete nouns
- Ignore greetings / fluff

**User content**
- Workspace name (if present)
- The 3 user requests verbatim

**Examples**
Include 8–12 examples of good labels to anchor brevity.

#### Example prompt template
```
You generate a short session label.

Rules:
- Output ONE label only, plain text.
- Max 28 characters.
- 2–5 words. Prefer concrete nouns.
- No quotes. No trailing period.
- Ignore greetings and filler.
- If multiple topics, pick the dominant one.

Workspace: {{workspace_name}}

Requests:
1) {{req1}}
2) {{req2}}
3) {{req3}}

Return only the label.
```

---

## 4) Sanitization & enforcement (must be in code)

Even with a good prompt, enforce constraints deterministically.

### 4.1) Sanitization steps
Given the model output `raw`:

1. `label = raw.strip()`
2. Remove surrounding quotes/backticks:
   - trim leading/trailing: `" ' ` ``
3. Replace newlines/tabs with spaces.
4. Collapse multiple spaces to single.
5. Remove trailing punctuation: `. , ; : ! ?` (only at end)
6. Remove any leading list markers: `- `, `* `, `• `

### 4.2) Enforce max length (≤ 28)
Prefer “smart shorten” before hard truncation:

**Smart shorten algorithm**
- If `len(label) <= 28`: done.
- Else:
  1) Remove stop-words (a, an, the, and, of, to, for, with, on, in) while keeping order.
  2) Replace long phrases with compact equivalents:
     - “configuration” → “config”
     - “newsletter” → “newsletter” (already short)
     - “woocommerce” → “Woo”
     - “documentation” → “docs”
     - “performance” → “perf”
     - “integration” → “integr”
  3) If still too long: keep the first 3–4 most informative words (nouns-ish heuristic: longest words first, preserving original order).
  4) If still too long: hard truncate to 28 characters.

**Hard truncate rule**
- `label = label[:28].rstrip()` (no trailing space)

### 4.3) Fallback label
If label becomes empty or garbage:
- Use: `General` (or `Session`)
- Still set metadata fields.

---

## 5) Hook configuration wiring

In your main OpenClaw configuration file, register the handler.

### Example (YAML-ish)
```yaml
hooks:
  on_turn_complete:
    - name: auto_label_session
      module: skills/session_labeler/auto_label_hook.py
      enabled: true
      settings:
        trigger_after_user_requests: 3
        max_label_chars: 28
        relabel: false
        sessions_dir: ".openclaw/sessions"
```

**Notes**
- Use your actual event name.
- `relabel: false` prevents churn.
- If OpenClaw uses JS/TS hooks, implement in that language; logic remains identical.

---

## 6) Pseudocode (hook handler)

```python
def on_turn_complete(event):
    session_id = event.session_id
    workspace_root = event.workspace_root

    path = resolve_session_json_path(workspace_root, session_id)
    session = load_json(path)

    # 1) Update request count
    session["processed_user_requests"] = compute_processed_user_requests(session, event)

    # 2) If already labeled, exit
    if session.get("label"):
        save_json(path, session)
        return

    # 3) If below threshold, exit
    if session["processed_user_requests"] < 3:
        save_json(path, session)
        return

    # 4) Gather first 3 user requests
    reqs = first_three_user_requests(session, event)
    if len(reqs) < 3:
        save_json(path, session)
        return

    # 5) Call skill
    raw_label = call_skill("session_labeler", {
        "requests": reqs[:3],
        "workspace_name": session.get("workspace_name") or event.workspace_name,
        "max_chars": 28
    })

    # 6) Sanitize + enforce
    label = sanitize(raw_label)
    label = enforce_28_chars(label)

    if not label:
        label = "General"

    # 7) Persist
    session["label"] = label
    session["label_source"] = "auto"
    session["label_turn"] = 3
    session["label_version"] = "1.0"
    session["label_updated_at"] = now_iso_utc()

    save_json(path, session)
```

---

## 7) Testing plan (must-pass)

### 7.1 Unit tests: sanitize()
Cases:
- `"Stripe newsletter ideas\n"` → `Stripe newsletter ideas`
- `"•  Woo config  "` → `Woo config`
- `"Label."` → `Label`
- `"\"Quoted Label\""` → `Quoted Label`

### 7.2 Unit tests: enforce_28_chars()
- Already short stays unchanged.
- Very long label gets smart-shortened.
- Still too long gets hard-truncated.
- No trailing spaces.

### 7.3 Integration tests: hook behavior
- Session with < 3 requests → no label.
- Session at exactly 3 requests → label created once.
- Session with existing label → hook does not overwrite.
- Session missing message history → safe no-op (or fallback to current request counting).

### 7.4 Regression test: label stability
- Run hook multiple times after labeling → label remains unchanged unless `relabel=true`.

---

## 8) Operational considerations

### Performance
- Labeling runs **once per session** in the common case.
- Keep LLM call small: only 3 requests + brief instructions.

### Privacy
- Only pass the first 3 user requests to the model.
- Do not include tool logs, credentials, or file contents.

### Observability
Add logging:
- when label is generated
- raw label (debug only, optional)
- final label + length

### Feature flag
Make it easy to toggle:

```yaml
auto_label_sessions: true
```

---

## 9) Optional enhancements (safe follow-ups)

1. **Relabel at turn 6** if topic drift is detected (off by default).
2. **Confidence scoring**: if model returns generic label, re-run with stronger constraints.
3. **Local heuristic labeler** fallback when LLM unavailable:
   - extract top nouns/keywords from first 3 requests
   - join into 2–4 words, cap 28 chars

---

## Implementation checklist (for the OpenClaw agent)

- [ ] Identify session JSON storage location and confirm write permissions.
- [ ] Identify correct lifecycle hook for “turn complete.”
- [ ] Implement `resolve_session_json_path()`.
- [ ] Implement request counting (`processed_user_requests`), using existing counters if available.
- [ ] Implement `first_three_user_requests()` extraction.
- [ ] Implement `session_labeler` skill with strict prompt and single-line output.
- [ ] Implement `sanitize()` and `enforce_28_chars()` with tests.
- [ ] Wire hook config into main OpenClaw config.
- [ ] Run integration tests across a few real sessions.
- [ ] Verify UI displays `label` from session JSON.

---

## Done criteria
- A new session with no manual label will automatically gain a stable label after the **third** user request completes.
- Labels are always **≤ 28 characters**.
- Existing labels are never overwritten unless explicitly configured.

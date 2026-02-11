# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Atomic label writes** — Labels are written to a temp file then renamed into place to avoid partial writes on crash or interrupt.
- **Concurrent-update safety** — Read-modify-write for `labels.json` is serialized so concurrent hook invocations cannot overwrite each other’s labels.
- **Shared stop-word list** — New `src/stop-words.ts` used by both length enforcement and heuristic labeler; heuristic now filters common filler words (e.g. help, need, please) for better fallback labels.
- **Test** — `tests/labels-store.test.ts` for concurrent `setLabel` behavior.
- **Test** — Heuristic filler-word filtering in `tests/labeler.test.ts`.

### Changed

- **Lazy transcript parsing** — `extractUserMessages()` parses JSONL line-by-line and stops once the requested number of user messages is reached, reducing work for long sessions.
- **Session-dir resolution** — Hook prefers `sessionFile` and config-derived paths; workspace-based fallback is last-resort only.
- **Docs** — `sanitize.ts` step comment updated to match actual code order.
- **Cleanup** — Removed unused `heuristicLabel` import from the hook handler.

### Fixed

- Race condition where two `command:new` events could cause one label to be lost when updating `labels.json`.

---

## [0.1.0] — 2026-02-11

### Added

- OpenClaw hook `session-labeler`: auto-labels sessions (≤ 28 chars) after 3 user requests on `command:new`.
- Sanitization and length enforcement (smart shorten + abbreviations).
- Heuristic fallback when LLM is not wired.
- Persistence in `labels.json` alongside session store.
- 62 unit and integration tests.

[Unreleased]: https://github.com/vidarbrekke/openclaw-session-labeler/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vidarbrekke/openclaw-session-labeler/releases/tag/v0.1.0

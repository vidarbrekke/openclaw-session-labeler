#!/usr/bin/env bash
set -euo pipefail

HOOK_NAME="session-labeler"
HOOK_PATH="${1:-$(pwd)}"
RESTART_CMD="${RESTART_CMD:-}"

log() {
  printf '[install-session-labeler] %s\n' "$*"
}

warn() {
  printf '[install-session-labeler] WARNING: %s\n' "$*" >&2
}

fail() {
  printf '[install-session-labeler] ERROR: %s\n' "$*" >&2
  exit 1
}

run_or_fail() {
  local description="$1"
  shift
  log "$description"
  if ! "$@"; then
    fail "Failed: $description"
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Required command not found: $cmd"
  fi
}

contains_text() {
  local needle="$1"
  local haystack="$2"
  if command -v rg >/dev/null 2>&1; then
    printf '%s\n' "$haystack" | rg -q --fixed-strings "$needle"
    return $?
  fi
  if command -v grep >/dev/null 2>&1; then
    printf '%s\n' "$haystack" | grep -Fq "$needle"
    return $?
  fi
  case "$haystack" in
    *"$needle"*) return 0 ;;
    *) return 1 ;;
  esac
}

attempt_restart() {
  if [[ -n "$RESTART_CMD" ]]; then
    log "Restarting gateway using RESTART_CMD: $RESTART_CMD"
    if bash -lc "$RESTART_CMD"; then
      log "Gateway restart command succeeded."
      return 0
    fi
    warn "RESTART_CMD failed. Will continue to verification."
    return 1
  fi

  log "Attempting gateway restart with common OpenClaw commands..."
  local attempted=0

  if openclaw gateway restart >/dev/null 2>&1; then
    log "Restarted with: openclaw gateway restart"
    return 0
  fi
  attempted=1

  if openclaw restart >/dev/null 2>&1; then
    log "Restarted with: openclaw restart"
    return 0
  fi
  attempted=1

  if [[ "$attempted" -eq 1 ]]; then
    warn "Could not auto-restart gateway with known commands."
    warn "Please restart OpenClaw manually, then re-run verification:"
    warn "  openclaw hooks list"
    warn "  openclaw hooks check"
    warn "  openclaw hooks info $HOOK_NAME"
    return 1
  fi
}

verify_enabled() {
  log "Verifying hook registration..."

  local list_output
  if ! list_output="$(openclaw hooks list 2>&1)"; then
    warn "openclaw hooks list failed:"
    printf '%s\n' "$list_output" >&2
    return 1
  fi
  printf '%s\n' "$list_output"

  if ! contains_text "$HOOK_NAME" "$list_output"; then
    warn "Hook '$HOOK_NAME' not found in hooks list output."
    return 1
  fi

  local check_output
  if ! check_output="$(openclaw hooks check 2>&1)"; then
    warn "openclaw hooks check failed:"
    printf '%s\n' "$check_output" >&2
    return 1
  fi
  printf '%s\n' "$check_output"

  local info_output
  if ! info_output="$(openclaw hooks info "$HOOK_NAME" 2>&1)"; then
    warn "openclaw hooks info $HOOK_NAME failed:"
    printf '%s\n' "$info_output" >&2
    return 1
  fi
  printf '%s\n' "$info_output"

  log "Verification completed."
  return 0
}

main() {
  require_cmd openclaw

  [[ -d "$HOOK_PATH" ]] || fail "Hook path is not a directory: $HOOK_PATH"
  [[ -f "$HOOK_PATH/package.json" ]] || warn "No package.json found at $HOOK_PATH (continuing, install may still work)"

  run_or_fail "Installing hook pack from: $HOOK_PATH" openclaw hooks install "$HOOK_PATH"
  run_or_fail "Enabling hook: $HOOK_NAME" openclaw hooks enable "$HOOK_NAME"

  attempt_restart || true

  if verify_enabled; then
    log "Done. '$HOOK_NAME' is installed and verified."
    exit 0
  fi

  fail "Install completed but verification failed. Check output above."
}

main "$@"

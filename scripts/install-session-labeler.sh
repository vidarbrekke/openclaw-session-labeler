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

# Ensure hooks.internal.entries["session-labeler"] exists and is enabled in OpenClaw config.
# Without this, the hook is installed but "Not configured" and won't run.
ensure_hook_config_entry() {
  local config_file="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"
  if [[ ! -f "$config_file" ]]; then
    warn "OpenClaw config not found at $config_file; skipping config entry."
    return 0
  fi
  if ! node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const hookName = process.argv[2];
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) {
      console.error('Could not read config:', e.message);
      process.exit(1);
    }
    if (!cfg.hooks) cfg.hooks = {};
    if (!cfg.hooks.internal) cfg.hooks.internal = {};
    if (cfg.hooks.internal.enabled !== true) cfg.hooks.internal.enabled = true;
    if (!cfg.hooks.internal.entries) cfg.hooks.internal.entries = {};
    const entry = cfg.hooks.internal.entries[hookName] || {};
    if (entry.enabled !== true) {
      cfg.hooks.internal.entries[hookName] = { ...entry, enabled: true };
      fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
      console.log('Added', hookName, 'to hooks.internal.entries with enabled: true');
    }
  " "$config_file" "$HOOK_NAME" 2>/dev/null; then
    warn "Could not update OpenClaw config; you may need to add session-labeler to hooks.internal.entries manually."
    return 1
  fi
  return 0
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

  existing_dir="${OPENCLAW_HOOKS_DIR:-$HOME/.openclaw/hooks}/$HOOK_NAME"
  if [[ -d "$existing_dir" ]]; then
    log "Existing installation found at: $existing_dir"
    if [[ -t 0 ]]; then
      printf '[install-session-labeler] Remove it and install from current path? [y/N] '
      read -r response
      if [[ ! "$response" =~ ^[yY] ]]; then
        fail "Install cancelled. Remove manually with: rm -rf $existing_dir"
      fi
    else
      if [[ "${FORCE_UPDATE:-0}" != "1" ]]; then
        fail "Existing installation at $existing_dir. Remove it first or run with FORCE_UPDATE=1 to replace."
      fi
      log "FORCE_UPDATE=1: removing existing installation."
    fi
    rm -rf "$existing_dir"
    log "Removed existing hook pack; installing from: $HOOK_PATH"
  else
    log "Installing hook pack from: $HOOK_PATH"
  fi

  run_or_fail "Installing hook pack" openclaw hooks install "$HOOK_PATH"

  run_or_fail "Enabling hook: $HOOK_NAME" openclaw hooks enable "$HOOK_NAME"

  # Ensure hooks.internal.entries["session-labeler"] { enabled: true } so the hook is actually used
  log "Ensuring session-labeler is in OpenClaw config (hooks.internal.entries)..."
  ensure_hook_config_entry || true

  # Install skill stub so the hook appears in the desktop Skills list (Clawbot shows ~/.openclaw/skills/)
  SKILLS_DIR="${OPENCLAW_SKILLS_DIR:-$HOME/.openclaw/skills}"
  if [[ -d "$HOOK_PATH/skill-stub" ]]; then
    mkdir -p "$SKILLS_DIR/$HOOK_NAME"
    cp -r "$HOOK_PATH/skill-stub"/* "$SKILLS_DIR/$HOOK_NAME/"
    log "Installed skill stub to $SKILLS_DIR/$HOOK_NAME (visible in desktop Skills list)."
  fi

  attempt_restart || true

  if verify_enabled; then
    log "Done. '$HOOK_NAME' is installed and verified."
    printf '\n'
    printf '  Your skill is now installed and enabled. It takes effect immediately and\n'
    printf '  stays active across gateway restarts. Only sessions you end (via /new,\n'
    printf '  /reset, or /stop) from now on will be labelled — after 3 conversation\n'
    printf '  turns — so you get a short summary of what each session was about.\n'
    printf '  (Existing sessions are not labelled.) It uses OpenClaw'\''s default model;\n'
    printf '  set OPENAI_API_KEY (and OPENAI_BASE_URL if needed) for LLM labels. See README.\n'
    printf '\n'
    exit 0
  fi

  fail "Install completed but verification failed. Check output above."
}

main "$@"

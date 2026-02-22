#!/usr/bin/env bash
# session-watchdog.sh — Tracks Claude Code session activity and detects idle periods.
#
# Usage:
#   bash session-watchdog.sh track     # Record current timestamp (PostToolUse hook)
#   bash session-watchdog.sh check     # Check idle time, emit reminder if >40 min (PreToolUse hook)
#   bash session-watchdog.sh diagnose  # Run full project health diagnostics
#   bash session-watchdog.sh daemon    # Run as background daemon (checks every 40 min)
#
# State files stored in .claude/.watchdog/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$PROJECT_DIR/.claude/.watchdog"
TIMESTAMP_FILE="$STATE_DIR/last-activity"
REMINDED_FILE="$STATE_DIR/reminded"
REPORT_FILE="$STATE_DIR/last-report.md"
IDLE_THRESHOLD_SECONDS=2400  # 40 minutes

mkdir -p "$STATE_DIR"

# --- track: save current timestamp ---
cmd_track() {
  date +%s > "$TIMESTAMP_FILE"
  # Clear the reminded flag when there's new activity
  rm -f "$REMINDED_FILE"
}

# --- check: return reminder if idle > threshold ---
cmd_check() {
  # No timestamp yet — first tool use, just track
  if [ ! -f "$TIMESTAMP_FILE" ]; then
    cmd_track
    exit 0
  fi

  # Already reminded for this idle period
  if [ -f "$REMINDED_FILE" ]; then
    exit 0
  fi

  local last_ts
  last_ts=$(cat "$TIMESTAMP_FILE" 2>/dev/null || echo 0)
  local now_ts
  now_ts=$(date +%s)
  local diff=$(( now_ts - last_ts ))

  if [ "$diff" -ge "$IDLE_THRESHOLD_SECONDS" ]; then
    local idle_min=$(( diff / 60 ))
    touch "$REMINDED_FILE"

    # Run quick diagnostics and output as hook message
    echo ""
    echo "=== SESSION IDLE ALERT ==="
    echo "Session was idle for ${idle_min} minutes."
    echo "Running automatic health check..."
    echo ""
    cmd_diagnose_quick
    echo ""
    echo ">>> RECOMMENDED: Run /init for full diagnostics and suggested actions."
    echo "=== END IDLE ALERT ==="
  fi
}

# --- diagnose_quick: fast subset of checks (for hook output) ---
cmd_diagnose_quick() {
  cd "$PROJECT_DIR" || exit 1

  echo "## Quick Health Check"
  echo ""

  # Git status
  local uncommitted
  uncommitted=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  local branch
  branch=$(git branch --show-current 2>/dev/null)
  echo "- Branch: \`$branch\`"
  echo "- Uncommitted changes: $uncommitted files"

  # Check if on dev branch
  if [ "$branch" != "dev" ]; then
    echo "- WARNING: Not on dev branch!"
  fi

  # Check for untracked files
  local untracked
  untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
  if [ "$untracked" -gt 0 ]; then
    echo "- Untracked files: $untracked"
  fi

  # Check build status (quick — just verify no syntax errors via lint)
  echo ""
  echo "### Lint Check"
  local lint_result
  lint_result=$(cd "$PROJECT_DIR" && npx eslint src/ --quiet 2>&1 | tail -5)
  if [ $? -eq 0 ]; then
    echo "- Lint: PASS"
  else
    echo "- Lint: ISSUES FOUND"
    echo "\`\`\`"
    echo "$lint_result"
    echo "\`\`\`"
  fi
}

# --- diagnose: full project health diagnostics ---
cmd_diagnose() {
  cd "$PROJECT_DIR" || exit 1

  echo "# Project Health Report"
  echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""

  # 1. Git status
  echo "## Git Status"
  local branch
  branch=$(git branch --show-current 2>/dev/null)
  echo "- **Branch:** \`$branch\`"
  echo "- **Last commit:** $(git log -1 --format='%h %s' 2>/dev/null)"
  echo ""

  local uncommitted
  uncommitted=$(git status --porcelain 2>/dev/null)
  if [ -n "$uncommitted" ]; then
    echo "### Uncommitted Changes"
    echo "\`\`\`"
    echo "$uncommitted"
    echo "\`\`\`"
    echo ""
  else
    echo "- Working tree clean"
    echo ""
  fi

  # 2. Lint check
  echo "## Lint"
  local lint_output
  lint_output=$(npx eslint src/ --quiet 2>&1)
  local lint_exit=$?
  if [ $lint_exit -eq 0 ]; then
    echo "- PASS (no errors)"
  else
    echo "- FAIL"
    echo "\`\`\`"
    echo "$lint_output" | tail -20
    echo "\`\`\`"
  fi
  echo ""

  # 3. Unit tests (quick run)
  echo "## Unit Tests"
  local test_output
  test_output=$(npx vitest run --reporter=verbose 2>&1 | tail -20)
  local test_exit=$?
  if [ $test_exit -eq 0 ]; then
    local test_summary
    test_summary=$(echo "$test_output" | grep -E "Tests|Test Files" | tail -3)
    echo "- PASS"
    echo "\`\`\`"
    echo "$test_summary"
    echo "\`\`\`"
  else
    echo "- FAIL"
    echo "\`\`\`"
    echo "$test_output"
    echo "\`\`\`"
  fi
  echo ""

  # 4. Build check
  echo "## Build"
  local build_output
  build_output=$(npx vite build 2>&1 | tail -10)
  local build_exit=$?
  if [ $build_exit -eq 0 ]; then
    echo "- PASS"
  else
    echo "- FAIL"
    echo "\`\`\`"
    echo "$build_output"
    echo "\`\`\`"
  fi
  echo ""

  # 5. Service worker version check
  echo "## Service Worker"
  local sw_version
  sw_version=$(grep -oP "APP_VERSION\s*=\s*'v\K[0-9]+'" "$PROJECT_DIR/public/service-worker.js" 2>/dev/null || echo "unknown")
  echo "- Current APP_VERSION: v${sw_version}"
  echo ""

  # 6. Dependency audit (quick)
  echo "## Dependencies"
  local audit_output
  audit_output=$(npm audit --production 2>&1 | tail -5)
  echo "\`\`\`"
  echo "$audit_output"
  echo "\`\`\`"
  echo ""

  # Save report
  echo "---"
  echo "*Report saved to .claude/.watchdog/last-report.md*"
}

# --- daemon: background process that checks every 40 min ---
cmd_daemon() {
  echo "Session watchdog daemon started (checking every 40 minutes)"
  echo "PID: $$"
  echo "Press Ctrl+C to stop"
  echo ""

  # Save PID for cleanup
  echo $$ > "$STATE_DIR/daemon.pid"

  while true; do
    sleep $IDLE_THRESHOLD_SECONDS

    echo ""
    echo "=== Periodic Health Check ($(date '+%H:%M:%S')) ==="
    cmd_diagnose > "$REPORT_FILE" 2>&1

    # Count issues
    local issues=0
    grep -c "FAIL" "$REPORT_FILE" 2>/dev/null && issues=$((issues + $(grep -c "FAIL" "$REPORT_FILE")))
    grep -c "WARNING" "$REPORT_FILE" 2>/dev/null && issues=$((issues + $(grep -c "WARNING" "$REPORT_FILE")))

    if [ "$issues" -gt 0 ]; then
      echo "Found $issues issue(s). Report saved to: $REPORT_FILE"
      echo "Run /init in Claude Code to review and fix."
    else
      echo "All checks passed."
    fi
  done
}

# --- main dispatch ---
case "${1:-check}" in
  track)    cmd_track ;;
  check)    cmd_check ;;
  diagnose) cmd_diagnose ;;
  daemon)   cmd_daemon ;;
  *)
    echo "Usage: session-watchdog.sh {track|check|diagnose|daemon}"
    exit 1
    ;;
esac

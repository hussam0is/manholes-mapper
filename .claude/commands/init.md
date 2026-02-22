# /init — Session Health Check & Auto-Fix

You are a proactive project health monitor for the **manholes-mapper** project. Run a comprehensive health check, report your findings, and suggest actionable fixes. Apply critical fixes automatically with user approval.

## Procedure

### Phase 1: Gather State

Run ALL of these checks in parallel where possible:

1. **Git status** — `git status`, `git branch --show-current`, `git log --oneline -5`
2. **Lint** — `npx eslint src/ --quiet`
3. **Unit tests** — `npx vitest run --reporter=verbose`
4. **Build** — `npx vite build`
5. **Service worker version** — read `public/service-worker.js` for `APP_VERSION`
6. **Uncommitted changes review** — `git diff --stat`
7. **Dependency check** — `npm audit --production 2>&1 | tail -10`

### Phase 2: Report Status

Format your findings as a structured status report:

```
## Session Status Report

**Branch:** `dev` | **Last commit:** abc1234 — message
**Session idle time:** [if available from .claude/.watchdog/last-activity]

### Health Summary
| Check       | Status | Details                |
|-------------|--------|------------------------|
| Lint        | PASS/FAIL | N errors, N warnings |
| Tests       | PASS/FAIL | N passed, N failed   |
| Build       | PASS/FAIL | bundle size          |
| Git         | CLEAN/DIRTY | N uncommitted files |
| SW Version  | vNN    | matches/needs bump    |

### Issues Found
1. [CRITICAL] description — suggested fix
2. [WARNING] description — suggested fix
3. [INFO] description — suggested improvement

### Suggested Actions
- [ ] Action 1 (priority: critical/high/medium/low)
- [ ] Action 2
```

### Phase 3: Triage & Fix

For each issue found:

- **CRITICAL** (broken build, failing tests, lint errors, security issues):
  - Present the fix clearly to the user
  - Ask: "This is a critical issue. Should I fix it now?"
  - If user approves → apply the fix immediately
  - After fixing, re-run the relevant check to confirm

- **WARNING** (uncommitted changes, outdated deps, SW version mismatch):
  - Present in the report
  - Suggest action but don't auto-fix

- **INFO** (style improvements, potential optimizations):
  - List in report for awareness
  - No action needed

### Phase 4: Commit & Push Check

After triage, check if there are uncommitted or unpushed changes:

1. **Uncommitted changes** — If `git status` shows modified/untracked files:
   - Summarize what changed (files and purpose)
   - Propose a commit message based on the changes
   - Ask: "Should I commit these changes?"
   - If approved → stage relevant files, commit, then check push status

2. **Unpushed commits** — Run `git log origin/dev..HEAD --oneline` to check:
   - If there are local commits not pushed to `origin/dev`:
     - List them
     - Ask: "There are N unpushed commits. Should I push to origin/dev?"
     - If approved → `git push origin dev`

3. **Both clean** — If working tree is clean and all commits are pushed, report: "Git is fully synced."

### Phase 5: Update Watchdog State

After completing the health check:
```bash
bash scripts/session-watchdog.sh track
```
This resets the idle timer so the next idle check starts fresh.

## Important Notes

- Always run checks from the project root directory
- Do NOT auto-commit or push without explicit user approval — always ask first
- Do NOT modify files outside the project scope
- If tests are already running in another terminal, skip the test phase
- Keep the report concise — focus on actionable items
- If everything passes, say so briefly and suggest what to work on next based on recent git history
- When committing, use descriptive messages that explain the "why" not the "what"
- Never force-push or push to master/main without explicit instruction

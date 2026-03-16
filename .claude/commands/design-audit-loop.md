# Design Audit Loop — Agent Skill

You are a **senior product designer and full-stack engineer** running a continuous design improvement loop for the **Manholes Mapper** app. You autonomously research the app, capture screenshots of real user workflows, audit them for issues, delegate fixes, test, and iterate.

---

## CRITICAL: Browser Access Protocol

**Playwright MCP is a SINGLETON** — there is only ONE shared browser instance. Multiple agents CANNOT use it simultaneously.

### Rules:
1. **ONLY ONE agent may use Playwright MCP at a time.** Never spawn parallel agents that both need the browser.
2. **NEVER kill Chrome processes** (`taskkill`, `pkill chrome`, etc.) — this destroys other agents' browser sessions and creates cascading failures.
3. **NEVER retry browser_navigate in a loop** — if Playwright MCP fails to launch, do NOT repeatedly kill Chrome and retry. Instead, fall back to writing a standalone Playwright script (see below).
4. **Sequential browser phases** — Phase 0 (research) must fully complete and return before Phase 4 (test) starts. Never overlap.
5. **Close the browser when done** — Each agent that uses Playwright MCP should call `browser_close` when finished, before returning.

### Fallback: Standalone Playwright Script

If Playwright MCP fails (browser locked, Chrome conflict), the agent MUST switch to writing a standalone Node.js script that uses Playwright's library API. This launches its OWN isolated Chromium — no conflict with MCP or system Chrome:

```javascript
// scripts/capture-screenshots.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch(); // Own isolated Chromium
const context = await browser.newContext({ viewport: { width: 740, height: 360 } });
const page = await context.newPage();
await page.goto('http://localhost:5173');
await page.screenshot({ path: 'app_state_YYYY-MM-DD/01_screenshot.png' });
// ... more screenshots ...
await browser.close();
```

Run with: `node scripts/capture-screenshots.mjs`

This is the PREFERRED approach when the user's system Chrome is running or when Playwright MCP cannot acquire the browser.

---

## What This Skill Does

0. **RESEARCH & CAPTURE** — Spawn `general-purpose` agent (Task tool) to browse the live app, capture screenshots + 1-min video into `app_state_YYYY-MM-DD/`. Send video to Gemini CLI for analysis. Present top 3 improvement areas + manual option for user to choose.
1. **AUDIT** — Read the captured screenshots + Gemini video report, identify all design/UX/UI/performance issues
2. **TRACK** — Update `app_state_YYYY-MM-DD/ISSUES.md` with prioritized findings
3. **FIX** — Spawn `codesmith-engineer` agent (Task tool) with full app architecture context to implement fixes
4. **TEST** — Spawn `general-purpose` agent (Task tool) with design verification criteria (Playwright)
5. **PHONE TEST** — Invoke `mobile-phone-tester` skill (Skill tool) with design-specific phone criteria
6. **LOOP** — Return to step 0 with a different workflow or after fixes are deployed

**Agent sequencing**: Phases 0, 3, 4, 5 each spawn agents — they MUST run sequentially, never in parallel. Wait for each agent to fully complete before spawning the next.

---

## ClickUp Integration

**All design audit issues of severity CRITICAL or HIGH must be tracked in ClickUp.** Use the ClickUp MCP tools to create tasks and update their status as issues move through the audit loop.

### ClickUp Reference

| Item | Value |
|------|-------|
| **List ID** | `901815260471` |
| **MCP Tools** | `mcp__clickup__get_tasks`, `mcp__clickup__create_task`, `mcp__clickup__update_task` |

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__clickup__get_tasks` | Get tasks from a list (use List ID `901815260471`) |
| `mcp__clickup__create_task` | Create a new task in a list |
| `mcp__clickup__update_task` | Update task status, description, assignees, etc. |

### Task Naming Convention

Prefix design audit tasks with `UPGRADE:` (for design/UX improvements) or `BUG:` (for visual bugs):
- `UPGRADE: improve mobile canvas toolbar touch targets`
- `BUG: dark mode contrast issue on node panel`
- `UPGRADE: admin panel information hierarchy`

### Status Flow

| Phase | ClickUp Status | When |
|-------|---------------|------|
| Phase 2 (Track) | `backlog` | Issue identified, task created |
| Phase 3 (Fix) | `in progress` | Fix agent starts working |
| Phase 3 (Done) | `success in dev` | Fix committed and pushed to dev |
| Phase 4/5 (Test) | `Testing` | Verification in progress |
| Phase 6 (Pass) | `Closed` | Fix verified on Playwright + phone |
| Phase 6 (Fail) | `in progress` | Test failed, needs re-fix |

### When to Use ClickUp

1. **Phase 2** — After writing ISSUES.md, search ClickUp for existing tasks matching your issues (`mcp__clickup__get_tasks`). If a matching task exists, update it. If not, create a new task for each CRITICAL or HIGH issue.
2. **Phase 3** — Before spawning the fix agent, update all relevant ClickUp tasks to `in progress`.
3. **Phase 3 completion** — After fixes are committed, update tasks to `success in dev`. Add the commit SHA in the task description.
4. **Phase 4/5** — After spawning test agents, update tasks to `Testing`.
5. **Phase 6** — If tests pass, update tasks to `Closed`. If tests fail, update back to `in progress` with a note on what failed.

### MEDIUM/LOW Issues

MEDIUM and LOW issues do NOT need individual ClickUp tasks. They are tracked only in `ISSUES.md`. If a MEDIUM issue persists across 2+ audit iterations, escalate it to a ClickUp task.

---

## Folder Structure

Each run creates a date-stamped folder:

```
app_state_YYYY-MM-DD/
  ├── NN_screenshot_name.png      ← Captured during Phase 0 workflow walkthrough
  ├── walkthrough.webm             ← 1-min video recording of the full workflow (Playwright)
  ├── gemini_video_report.md       ← Gemini's analysis of the video (issues + improvements)
  ├── ISSUES.md                    ← Running issue tracker (severity, status, fix commit)
  └── workflow_log.md              ← What workflow was followed, steps taken, observations
```

If the folder already exists (same day, second run), append a suffix: `app_state_YYYY-MM-DD_02/`.

**Loop control**: Each iteration processes the screenshots from its own folder. Previous day folders are kept for reference but not reprocessed.

---

## Phase 0: Research & Capture

This phase runs FIRST, before any auditing. It browses the live app, follows a real user workflow end-to-end, and captures screenshots at each meaningful state change.

### Step 0.1 — Create output folder

```bash
mkdir -p app_state_$(date +%Y-%m-%d)
```

If it already exists, use `app_state_$(date +%Y-%m-%d)_02` (increment suffix).

### Step 0.2 — Pick the app URL

Use the **dev preview** URL by default:
```
https://manholes-mapper-git-dev-hussam0is-projects.vercel.app
```
Or production if the user specifies: `https://manholes-mapper.vercel.app`

### Step 0.3 — Spawn a `general-purpose` agent to research the app

Use the **Task tool** with `subagent_type: "general-purpose"`. Do NOT use the Skill tool — the research agent needs a custom design-focused prompt, not the default QA skill.

**IMPORTANT**: This agent will use Playwright MCP for browser access. Do NOT spawn any other browser-using agents until this one completes and returns.

Spawn the agent with this prompt:

```
You are a **design researcher** capturing the current visual state of the Manholes Mapper app.
Your ONLY job is to navigate every screen, take screenshots, and record a video. You are NOT
doing QA testing, security testing, or functional testing — just visual documentation.

## CRITICAL: Browser Rules
- Use Playwright MCP tools (browser_navigate, browser_snapshot, browser_take_screenshot, etc.)
- NEVER run `taskkill`, `pkill`, or kill Chrome/Chromium processes — this destroys shared browser state
- If browser_navigate fails, try ONCE more. If it fails again, switch to the FALLBACK approach below.
- When finished with ALL screenshots, call browser_close to release the browser for other agents.

### FALLBACK: If Playwright MCP fails
Write a standalone Playwright script and run it with `node`:
```javascript
// Save as scripts/capture-screenshots.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
// ... navigate, screenshot, etc.
await browser.close();
```
Run: `node scripts/capture-screenshots.mjs`
This uses Playwright's own Chromium — no conflict with MCP or system Chrome.

App URL: [URL]
Login: admin@geopoint.me / Geopoint2026!
Output folder: [ABSOLUTE_PATH_TO_app_state_YYYY-MM-DD]/

## CRITICAL: Read the UI Reference FIRST

Before navigating, read the complete UI reference file:
```
Read .claude/app-ui-reference.md
```
This file contains EVERY element ID, button, panel, menu item, dialog, canvas tool, map layer,
keyboard shortcut, and i18n key in the app. Use it to know exactly what to screenshot and where
to find each UI element.

## APP CONTEXT (read this before navigating)

Manholes Mapper is a Hebrew-first (RTL) PWA for field workers who draw manhole/pipe networks
on an HTML5 Canvas. Key things to know:

**Routing (hash-based SPA):**
- `#/` or `#/login` → Login page (React auth form mounted in #authContainer)
- After login → Home panel (#homePanel) overlays the canvas with sketch list + project cards
- Close home panel → Canvas mode (main drawing surface with toolbar on right side)
- `#/projects` → Projects page (admin only)
- `#/admin` → Admin panel (tabs: Users, Organizations, Features)
- `#/project/:id` → Project canvas mode (multi-sketch view with side panel)

**UI Structure (see `.claude/app-ui-reference.md` for full element inventory):**
- **Header** (#appHeader): brand logo, sketch name (#sketchNameDisplay), sync indicator (#headerSyncIndicator), hamburger menu (#mobileMenuBtn, in RTL: LEFT side, in LTR: RIGHT side)
- **Desktop actions**: New Sketch (#newSketchBtn), Save (#saveBtn), Autosave (#autosaveToggle), Search (#searchNodeInput), Size controls (#sizeDecreaseBtn/#sizeIncreaseBtn/#autoSizeBtn)
- **Command menu** (#exportMenuBtn → #exportDropdown): Sketch export/import, CSV export, Workday, Location & Coordinates (scale/stretch controls), GNSS/Live Measure, Map layers, Reference layers
- **Canvas** (#graphCanvas): Full-screen HTML5 Canvas, nodes=circles with icons (Manhole/Home/Drainage), edges=colored lines with length labels, edge legend (#edgeLegend)
- **Canvas toolbar** (#modeGroup, bottom-left): My Location (#myLocationBtn), Node mode (#nodeModeBtn), Home Node (#homeNodeModeBtn), Drainage (#drainageNodeModeBtn), Edge mode (#edgeModeBtn), Undo (#undoBtn), Zoom +/- (#canvasZoomInBtn/#canvasZoomOutBtn), 3D View (#threeDViewBtn)
- **FAB speed dial** (#canvasFabToggle, bottom-right): Incomplete edge tracker (#incompleteEdgeTracker), Recenter density (#recenterDensityBtn), Recenter sketch (#recenterBtn), Zoom to fit (#zoomToFitBtn)
- **GPS Quick Capture** (#gpsQuickCaptureBtn): Floating capture button, visible when location tracking active, pulses for RTK
- **Bottom drawer** (#sidebar): Resizable via drag handle, shows node/edge details panel with wizard tabs (accuracy, maintenance, material, diameter, access, note), survey data section, connected lines section, delete button
- **Node panel wizard tabs**: accuracy_level (gps_fixed), maintenance_status (build), material (layers), cover_diameter (circle), access (stairs), note (notes) — each shows one field at a time, visibility depends on maintenance status
- **Edge panel**: type select, engineering status, material, diameter, fall depth/position, measurements, delete
- **Mobile menu** (#mobileMenu): Slides from LEFT (RTL) or RIGHT (LTR), mirrors desktop: navigation, search, view controls, sketch ops, CSV export, location/coordinates, map layers, GNSS, survey device (Bluetooth/WebSocket), workday, settings (autosave, language, help, admin, projects)
- **Home panel** (#homePanel): Full-screen overlay with sync status bar, personal/organization tabs, sketch list, "New Sketch" button
- **Admin screen** (#adminScreen): Settings (Nodes/Edges tabs with CSV fields, defaults, options, custom fields), User/Org management (Users/Organizations/Features tabs), Input Flow Settings (#inputFlowScreen with conditional rules)
- **Projects screen** (#projectsScreen): Project cards list, "Add Project" button
- **Project canvas**: Sketch side panel (#sketchSidePanel) with sketch list, visibility toggles, stats (km, issues), issue navigation
- **Layers**: GovMap tiles (orthophoto/street), reference GeoJSON layers (sections, survey_manholes, survey_pipes, streets, addresses), Street View pegman
- **Floating keyboard** (#floatingKeyboard): Draggable numeric keypad for mobile
- **Dialogs**: Login (#loginPanel), Start/New Sketch (#startPanel), Help (#helpModal), Finish Workday (#finishWorkdayModal), Point Capture (#pointCaptureDialog), Device Picker, Survey Node Type

**Design system:**
- CSS custom properties: `--color-primary: #2563eb`, `--color-success: #22c55e`, `--color-danger: #ef4444`, `--color-accent: #a855f7`, `--color-bg: #f8fafc`, `--color-surface: #ffffff`, `--color-text: #0f172a`
- Dark mode: `@media (prefers-color-scheme: dark)` — `--color-bg: #0b1220`, `--color-surface: #0f172a`, `--color-text: #e2e8f0`
- Icons: Material Icons (self-hosted woff2), used everywhere via `<span class="material-icons">`
- Touch targets: minimum 44px on mobile (`.btn-icon-sm`, `.scale-btn`)
- RTL: uses `margin-inline-*` / `padding-inline-*`, `dir="rtl"` on `<html>`

**What to OBSERVE while navigating (note in workflow_log.md):**
- Are transitions smooth or janky?
- Do loading states exist or does the UI just freeze?
- Are touch targets large enough on mobile?
- Does RTL layout look correct (no clipped text, proper alignment)?
- Are colors consistent with the design tokens above?
- Is text readable (contrast, size)?
- Do empty states have helpful messaging?

## VIDEO RECORDING (CRITICAL)

You MUST record a video of the entire workflow walkthrough. The video captures
transitions, animations, loading states, and jank that screenshots miss.

**How to record:** Use `browser_run_code` to launch a NEW browser context with video
recording enabled, then perform ALL workflow navigation inside that context:

```javascript
async (page) => {
  const context = await page.context().browser().newContext({
    recordVideo: {
      dir: '[ABSOLUTE_PATH_TO_app_state_YYYY-MM-DD]/',
      size: { width: 1280, height: 720 }
    }
  });
  const videoPage = await context.newPage();

  // --- Perform all workflow steps on videoPage ---
  await videoPage.goto('[URL]');
  // ... login, navigate, interact ...
  // Add short pauses (1-2s) between actions so the video is reviewable

  await videoPage.close();
  await context.close();
  // Video is automatically saved to the dir above
}
```

**Video rules:**
- Keep total recording under **60 seconds** (1 minute max). Breadth over depth — hit every major screen, don't linger.
- Use `await videoPage.waitForTimeout(1500)` between major transitions so viewers can see each state.
- Move briskly: login → home → open sketch → draw node → draw edge → select node → menu → projects → admin → mobile resize → done.
- After recording, rename the video file to `walkthrough.webm` inside the output folder.

## SCREENSHOTS

Walk through ALL of these workflows and screenshot every distinct screen/state.
Use `browser_take_screenshot` with descriptive filenames saved to the output folder.

**Workflow A — First-time Login & Home**
1. Load the app (pre-login state) → screenshot (look at: login panel styling, brand, gradient header)
2. Login form → screenshot (look at: input fields, button style, error state if any)
3. After login — home panel with sketch list → screenshot (look at: sketch cards, empty state, CTA buttons)
4. Hamburger menu open → screenshot (look at: menu item spacing, section headers, scroll behavior)

**Workflow B — Sketch Drawing (core workflow)**
1. Close home panel → canvas view → screenshot (look at: toolbar buttons, FAB, clean canvas state)
2. Click Node mode → tap canvas to add node → screenshot (look at: node icon, selection ring)
3. Click Edge mode → connect two nodes → screenshot (look at: edge line, length label)
4. Select a node → screenshot the bottom drawer/panel (look at: field layout, touch targets, delete button)
5. Select an edge → screenshot the edge panel (look at: similar to node panel)
6. Zoom in/out → screenshot at different zoom levels (look at: label readability, icon scaling)
7. Toggle map layer on → screenshot (look at: tile rendering, layer controls)

**Workflow C — Project Management**
1. Navigate to `#/projects` → screenshot (look at: project cards, layout, empty states)
2. Open a project → screenshot project canvas (look at: multi-sketch rendering, side panel toggle)
3. Open sketch side panel → screenshot (look at: sketch list, issue badges, nav buttons, panel width)
4. Open issues sub-panel → screenshot (look at: issue rows, severity indicators)

**Workflow D — Admin Panel**
1. Navigate to `#/admin` → screenshot (look at: tab bar style, active tab indicator)
2. Users tab → screenshot (look at: user list layout, role badges, action buttons)
3. Organizations tab → screenshot (look at: org cards, member counts)
4. Features tab → screenshot (look at: feature toggles, descriptions)

**Workflow E — Mobile Viewport**
1. Resize browser to 360x740
2. Re-take key screens: home panel, canvas + toolbar, hamburger menu, node panel, admin
3. Screenshot each (look at: does everything FIT? Are touch targets ≥44px? Is text truncated?)

**Workflow F — Settings & Misc**
1. Toggle language Hebrew→English → screenshot both (look at: RTL→LTR flip, text alignment)
2. Toggle dark mode (use browser `prefers-color-scheme` emulation) → screenshot (look at: contrast, readability)
3. Open layer controls → screenshot (look at: toggle list, floating card positioning)
4. Any error states or empty states you encounter → screenshot

**Naming convention:** `NN_workflowLetter_description.png`
Examples: `01_A_pre_login.png`, `02_A_login_form.png`, `15_B_node_panel.png`

## CLEANUP (MANDATORY)

After taking all screenshots and recording video, you MUST call `browser_close` to release the
Playwright MCP browser. Other agents need it after you. Failure to close causes browser lock conflicts.

## OUTPUT

After all screenshots + video, write `[OUTPUT_FOLDER]/workflow_log.md` with:
- Every screenshot taken with a one-line description + what you observed
- The video file path and approximate duration
- Issues noticed while navigating (broken links, slow loads, console errors/warnings)
- The overall state of each workflow: smooth / needs work / broken
- Design observations: anything that felt off, inconsistent, or hard to use
```

### Step 0.4 — Send video to Gemini for analysis

Once the research agent finishes and the video is saved, spawn a **background agent** that runs the Gemini CLI to analyze the video. Gemini's multimodal model can watch the video and produce a detailed design/UX report.

**Run this command via Bash** (headless, non-interactive):

```bash
gemini -p "You are a senior product designer and UX expert. Watch this 1-minute video walkthrough of the Manholes Mapper web app.

## App Context
Manholes Mapper is a Hebrew-first (RTL) PWA for field workers who draw manhole/pipe networks on an HTML5 Canvas with optional RTK GNSS positioning. The app uses:
- Design tokens: primary=#2563eb (blue), success=#22c55e (green), danger=#ef4444 (red), accent=#a855f7 (purple), bg=#f8fafc, surface=#ffffff, text=#0f172a
- Dark mode via prefers-color-scheme with tokens: bg=#0b1220, surface=#0f172a, text=#e2e8f0
- Material Icons (self-hosted), 44px minimum touch targets on mobile
- RTL layout (Hebrew default), hash-based SPA routing

## Key UI Sections (what you'll see in the video)
- **Login panel** (#loginPanel): gradient header, React auth form (email/password), sign-in/sign-up toggle
- **Home panel** (#homePanel): sync status bar, personal/organization tabs, sketch cards, 'New Sketch' CTA button
- **Canvas** (#graphCanvas): full-screen drawing surface with nodes (Manhole/Home/Drainage icons), edges (colored by type: Main=blue, Drainage=cyan, Secondary=orange), edge length labels, edge legend
- **Canvas toolbar** (#modeGroup, bottom-left): My Location, Node/Home/Drainage/Edge mode buttons, Undo, Zoom +/-, 3D View
- **FAB speed dial** (#canvasFabToggle, bottom-right): Incomplete edge tracker, Recenter density, Recenter sketch, Zoom to fit
- **GPS Quick Capture** (#gpsQuickCaptureBtn): floating capture button, visible when location tracking active
- **Bottom drawer** (#sidebar): resizable via drag handle, shows node details (wizard tabs: accuracy/maintenance/material/diameter/access/note), survey data section, connected lines with measurements, delete button. For edges: type/material/diameter/measurements/delete
- **Mobile menu** (#mobileMenu): slides from LEFT (RTL) or RIGHT (LTR), has sections: Navigation, Search, View Controls, Sketch ops, CSV Export, Location/Coordinates (scale/stretch), Map Layers, GNSS/Live Measure, Survey Device (Bluetooth/WebSocket), Workday, Settings (autosave/language/help/admin/projects)
- **Admin screen** (#adminScreen): Settings tabs (Nodes/Edges with CSV fields, defaults, options, custom fields), User/Org management (Users/Organizations/Features tabs), Input Flow Settings
- **Projects screen** (#projectsScreen): project cards, "Add Project" button
- **Project canvas**: sketch side panel with list, visibility toggles, stats (km, issues), issue navigation
- **Floating keyboard** (#floatingKeyboard): draggable numeric keypad for mobile field workers
- **Dialogs**: Start/New Sketch, Help/Shortcuts, Finish Workday (dangling edge resolution), Point Capture (GNSS), Device Picker (Bluetooth), Survey Node Type

## Analyze the video and produce a structured report:

## Visual Issues
- Color inconsistency with design tokens, poor contrast, misalignment, font size issues, icon quality

## UX Issues
- Confusing flows, missing affordances, poor feedback, unclear loading/error states

## Mobile Issues
- Touch targets <44px, elements overlapping, toolbar reachability, content obscured

## RTL/i18n Issues
- Hebrew text rendering problems, mixed LTR/RTL, clipped text in RTL

## Animation & Performance
- Jank, slow transitions, missing loading indicators, laggy interactions

## Top 5 Improvements (Prioritized)
1. [Most impactful fix] — why, where (reference timestamp e.g. 0:15), and how to fix
2. ...

Be SPECIFIC: reference timestamps, screen areas (e.g. top-right toolbar), and element types (e.g. the blue FAB button). Output as markdown." \
  --yolo \
  -o text \
  -- "[ABSOLUTE_PATH_TO_app_state_YYYY-MM-DD]/walkthrough.webm" \
  > "[ABSOLUTE_PATH_TO_app_state_YYYY-MM-DD]/gemini_video_report.md" 2>&1
```

**Important:**
- Use `--yolo` so Gemini doesn't prompt for approval
- Use `-o text` for clean markdown output
- Pipe stdout to `gemini_video_report.md` in the same output folder
- If the video file doesn't exist or is empty, skip this step and note it in `workflow_log.md`
- This runs in the **background** — don't block on it. Continue to Step 0.5 with screenshots while Gemini processes.

### Step 0.5 — Read the captured screenshots and workflow log

After the research agent completes:
1. Read `workflow_log.md` to understand what was captured
2. Read all screenshots (in parallel groups of 6)
3. Analyze across all workflows for patterns

### Step 0.6 — Collect Gemini video report

Check if `gemini_video_report.md` is ready. Read it and merge its findings into your analysis:
- Gemini may catch motion/animation issues that static screenshots miss
- Gemini may spot timing problems (slow loads, missing spinners)
- Deduplicate: if Gemini and your screenshot audit found the same issue, keep the more detailed description

If Gemini is still running, proceed to Step 0.7 and incorporate the report later in Phase 1.

### Step 0.7 — Identify top 3 improvement areas

Based on the screenshots, workflow observations, **and Gemini video report**, identify the **top 3 areas** that need the most design/UX improvement. Categorize by workflow area, not individual issues.

Examples of areas:
- "Mobile canvas toolbar is cluttered and hard to use"
- "Admin panel has poor information hierarchy"
- "Node/edge panels lack visual polish and have tiny touch targets"
- "Login flow has no loading states or error feedback"
- "Project canvas sketch switching is confusing"
- "RTL layout breaks in several panels"
- "Dark mode has contrast issues across the app"
- "Transitions feel janky — no loading indicators between screens" (from video)

### Step 0.8 — Present choices to the user

Use `AskUserQuestion` to present the top 3 areas plus a manual option:

```
Based on my research of the app (screenshots + Gemini video analysis), here are the
top 3 areas that need the most design improvement:

1. [Area 1] — [brief why]
2. [Area 2] — [brief why]
3. [Area 3] — [brief why]
4. Manual — Tell me what to focus on

Which area should I focus on for this audit iteration?
```

The user's choice determines which screenshots get prioritized in Phase 1. If the user picks "Manual", ask them what workflow or screen to focus on.

### Step 0.9 — Write workflow_log.md summary

Append the user's chosen focus area to `workflow_log.md`:

```markdown
## Audit Focus
**User chose**: [Area name]
**Relevant screenshots**: [list the NN_*.png files related to this area]
**Gemini report**: gemini_video_report.md (merged findings)
```

---

## Phase 1: Audit (Read Screenshots)

### Step 1 — Identify screenshots to audit

Read `app_state_YYYY-MM-DD/workflow_log.md` to find the screenshots relevant to the user's chosen focus area (from Phase 0 Step 0.6). Prioritize those screenshots, but also include nearby/related screenshots for context.

```bash
ls app_state_$(date +%Y-%m-%d)/*.png | sort
```

### Step 2 — Read each screenshot as image
Use the `Read` tool on each `.png` file — Claude Code supports image reading.
Read screenshots in parallel groups of 6 for speed. Start with the focus-area screenshots, then read remaining ones.

### Step 3 — Cross-reference with workflow log and Gemini report
```
Read app_state_YYYY-MM-DD/workflow_log.md
Read app_state_YYYY-MM-DD/gemini_video_report.md
```
The workflow log has per-screenshot descriptions and observations from the research agent.
The Gemini report has video-based findings — motion/animation issues, timing problems, and prioritized improvements. Use both as input for your audit.

### Step 4 — Analyze for these issue categories

| Category | What to Look For |
|----------|-----------------|
| **Visual Design** | Color inconsistency, poor contrast, misaligned elements, font size issues, icon quality |
| **UX / Flow** | Confusing navigation, unexpected behavior, missing affordances, poor information hierarchy |
| **Mobile / Touch** | Touch targets < 44dp, buttons too close together, content obscured by toolbars, one-hand reachability |
| **RTL / i18n** | Hebrew text rendering, RTL layout issues, mixed LTR/RTL elements |
| **Performance** | Overcrowded canvas with overlapping labels, slow-feeling interactions |
| **Accessibility** | Low contrast, missing icons without labels, no error state feedback |
| **Bugs** | UI glitches, debug info visible in production, broken state, wrong colors |
| **Information Architecture** | Settings buried too deep, unrelated items grouped together |
| **Best Practices** | Destructive actions (Delete) not requiring confirmation, irreversible actions without undo |

### Step 5 — Produce issue list

For each issue, classify:
- **Severity**: `CRITICAL` | `HIGH` | `MEDIUM` | `LOW`
- **Type**: bug | design | ux | accessibility | performance | best-practice
- **Affected file(s)**: e.g., `styles.css`, `index.html`, `src/legacy/main.js`
- **Description**: What is wrong, why it matters, what the fix is

---

## Phase 2: Update ISSUES.md

Append new issues to `app_state_YYYY-MM-DD/ISSUES.md`. Format:

```markdown
## Issue #N — [Short Title]
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 04_hamburger_menu.png
- **Affected**: `styles.css`, `src/legacy/main.js`
- **Problem**: The debug diagnostic bar (P:0/1, dX, dY, Xv, Yv, Prs, Size) is visible in all production screenshots
- **Fix**: Hide `#debugBar` or remove it entirely; only show in dev mode
- **Status**: OPEN
- **Commit**: —
- **ClickUp**: #task_id (subtask of #parent_id) — backlog
```

Mark fixed issues:
```markdown
- **Status**: FIXED
- **Commit**: abc1234 — "fix: hide debug bar in production"
- **ClickUp**: #task_id (subtask of #parent_id) — Closed
```

### Step 2b — Sync CRITICAL/HIGH issues to ClickUp

After writing ISSUES.md, sync CRITICAL and HIGH issues to ClickUp:

1. **Fetch existing tasks** — Use `mcp__clickup__get_tasks` with list ID `901815260471` to get ALL current tasks. Review both task names and their subtasks.

2. **For each CRITICAL/HIGH issue, decide: subtask vs. standalone task vs. update**

   **Check for parent task fit (subtask):** Look at the existing tasks and determine if the new issue logically belongs as a subtask of an existing parent. Use these heuristics:
   - **Same UI area** — e.g., issue "touch targets too small on node panel" fits under a parent like "UPGRADE: node/edge panel improvements"
   - **Same feature scope** — e.g., issue "dark mode contrast on admin panel" fits under "UPGRADE: dark mode fixes" or "UPGRADE: admin panel"
   - **Related bug cluster** — multiple small bugs in the same screen area should be subtasks of one umbrella task

   If a parent task fits → create a **subtask** using `mcp__clickup__create_task` with the `parent` parameter set to the parent task ID:
   ```
   mcp__clickup__create_task({
     list_id: "901815260471",
     name: "BUG: [specific issue]",
     parent: "PARENT_TASK_ID",
     description: "...",
     status: "backlog",
     priority: 1 or 2
   })
   ```

   **Check for exact match (update):** If an existing task or subtask already describes this exact issue, use `mcp__clickup__update_task` to add the new audit findings to its description. Do NOT create a duplicate.

   **No match (standalone task):** If no parent task fits and no existing task matches, create a new standalone task:
   ```
   mcp__clickup__create_task({
     list_id: "901815260471",
     name: "UPGRADE: [issue title]" or "BUG: [issue title]",
     description: "Severity, screenshot reference, affected files, planned fix",
     status: "backlog",
     priority: 1 (urgent) for CRITICAL, 2 (high) for HIGH
   })
   ```

3. **Record ClickUp task IDs** in ISSUES.md — Add `- **ClickUp**: #task_id (subtask of #parent_id)` or `- **ClickUp**: #task_id` to each synced issue.

---

## Phase 3: Spawn Fix Agent

### Step 3a — Update ClickUp tasks to "in progress"

Before spawning the fix agent, update all ClickUp tasks for the issues being fixed:
```
mcp__clickup__update_task({ task_id: "TASK_ID", status: "in progress" })
```
Do this for each CRITICAL/HIGH issue that has a ClickUp task ID recorded in ISSUES.md.

### Step 3b — Spawn fix agent

After collecting issues, spawn a `codesmith-engineer` agent via the **Task tool** (`subagent_type: "codesmith-engineer"`).

Include this full context in the prompt:

```
Task: Fix the following prioritized UI/UX issues in the Manholes Mapper app.

## CRITICAL: Read the UI Reference FIRST

Before making ANY changes, read the complete UI reference file:
```
Read .claude/app-ui-reference.md
```
This file contains EVERY element ID, button, panel, menu item, dialog, canvas tool, map layer,
keyboard shortcut, and i18n key in the app. Use it to understand what each element does, its
ID, its i18n key, and where it's defined. This prevents you from breaking other UI elements.

## APP ARCHITECTURE (read before making changes)

Manholes Mapper is a vanilla JS + HTML5 Canvas PWA. Key things to know:

**File map (what controls what):**
| File | What It Controls |
|------|-----------------|
| `styles.css` (~9000 lines) | ALL CSS: design tokens, layout, panels, buttons, dark mode, RTL, responsive |
| `index.html` | DOM structure, element IDs, class names |
| `src/legacy/main.js` (~8300 lines) | Monolithic core: canvas rendering, event handlers, ALL panel logic, menu. EXCLUDED from ESLint. Be careful editing — changes cascade. |
| `src/main-entry.js` (~634 lines) | App init: auth, i18n, GNSS, mobile menu open/close, floating keyboard, drawer |
| `src/i18n.js` (~37KB) | Full translation dictionary. BOTH `he` and `en` keys must always be in sync. |
| `public/service-worker.js` | APP_VERSION constant — BUMP when styles.css or index.html changes |
| `src/admin/admin-panel.js` (~26KB) | Admin panel: Users/Orgs/Features tabs |
| `src/project/sketch-side-panel.js` (~14KB) | Sketch side panel with per-sketch stats, issues sub-panel |
| `src/features/rendering.js` | Graph rendering engine (nodes, edges, labels) |
| `src/features/node-icons.js` (~13KB) | Manhole, drainage, house connection SVG icons |
| `src/canvas-fab-toolbar.js` | FAB speed dial component |

**Design tokens (CSS custom properties in :root):**
Light mode: `--color-primary: #2563eb`, `--color-primary-hover: #1d4ed8`, `--color-primary-light: #dbeafe`, `--color-success: #22c55e`, `--color-danger: #ef4444`, `--color-accent: #a855f7`, `--color-bg: #f8fafc`, `--color-surface: #ffffff`, `--color-text: #0f172a`, `--color-text-secondary: #475569`, `--color-border: #e5e7eb`
Dark mode (inside `@media (prefers-color-scheme: dark) { :root { ... } }`): `--color-bg: #0b1220`, `--color-surface: #0f172a`, `--color-surface-alt: #1e293b`, `--color-text: #e2e8f0`, `--color-accent: #60a5fa`, `--color-border: #1f2937`

ALWAYS use these tokens — never hardcode hex values. If you need a new shade, create a token.

**RTL rules:**
- `<html lang="he" dir="rtl">` is the default
- Use `margin-inline-start/end`, `padding-inline-start/end` — NEVER `margin-left/right`
- Use `inset-inline-start/end` — NEVER `left/right` for positioning
- Test that your changes work in both RTL (Hebrew) and LTR (English)

**Touch targets:**
- ALL interactive elements must be ≥44px on mobile
- Existing classes: `.btn-icon-sm` (44px), `.scale-btn` (44px), `.btn-sm` (44px)

**Icons:**
- Material Icons, self-hosted at `public/fonts/material-icons.woff2`
- Usage: `<span class="material-icons">icon_name</span>`

**i18n:**
- `src/i18n.js` has `he` and `en` objects. Access via `window.t('dotted.key')` or `data-i18n="key"` attribute.
- EVERY key added to `he` must also be added to `en` and vice versa.

## ISSUES TO FIX

CRITICAL:
1. [Description of issue + affected file + exact fix]

HIGH:
2. [Description of issue + affected file + exact fix]

## RULES
- Read each affected file BEFORE editing — understand context
- Follow existing code patterns (vanilla JS, CSS custom properties, RTL-safe)
- Commit after EACH logical fix with message: "fix: [description]"
- Push to dev branch after all fixes
- Do NOT change unrelated code — minimal, focused fixes only
- Bump APP_VERSION in public/service-worker.js if styles.css or index.html changes
- Both he and en must be updated for any i18n key changes
- Test dark mode: if you change any color, check it works in both light and dark
- Test RTL: if you change any spacing/layout, ensure it works in both directions
```

**Batch size**: Pick top 3-5 issues per iteration (don't overload the fix agent).

### Step 3c — Update ClickUp tasks to "success in dev"

After the fix agent completes and pushes commits, update each ClickUp task:
```
mcp__clickup__update_task({
  task_id: "TASK_ID",
  status: "success in dev",
  description: "Fixed in commit [SHA]. [original description]"
})
```
Also update ISSUES.md with the commit SHA and ClickUp status.

---

## Phase 4: Spawn Test Agent

After the fix agent pushes to `dev`, wait ~2 minutes for Vercel to deploy.

### Step 4a — Update ClickUp tasks to "Testing"

Before spawning the test agent, update all relevant ClickUp tasks:
```
mcp__clickup__update_task({ task_id: "TASK_ID", status: "Testing" })
```

### Step 4b — Spawn test agent

Spawn a `general-purpose` agent via the **Task tool** (`subagent_type: "general-purpose"`).

**IMPORTANT**: The Phase 0 research agent MUST have fully completed and returned before spawning this agent. Both use Playwright MCP which is a singleton — concurrent access causes browser conflicts.

```
You are a **design verification tester** for the Manholes Mapper app. Your job is to verify
that specific UI/UX fixes are visually correct across different states. This is NOT functional
QA — you're checking that things LOOK right.

## CRITICAL: Read the UI Reference FIRST

Before verifying ANY fixes, read the complete UI reference file:
```
Read .claude/app-ui-reference.md
```
This file contains EVERY element ID, button, panel, menu item, dialog, canvas tool, map layer,
keyboard shortcut, and i18n key in the app. Use it to know exactly which elements to verify,
their IDs for querying via Playwright, and what the expected visual states should be.

## CRITICAL: Browser Rules
- Use Playwright MCP tools (browser_navigate, browser_snapshot, browser_take_screenshot, etc.)
- NEVER run `taskkill`, `pkill`, or kill Chrome/Chromium processes — this destroys shared browser state
- If browser_navigate fails, try ONCE more. If it fails again, write a standalone Playwright script and run with `node` (see fallback below).
- When finished, call browser_close to release the browser.

### FALLBACK: If Playwright MCP fails
Write a standalone script: `import { chromium } from 'playwright'; const browser = await chromium.launch(); ...`
Run with `node scripts/verify-screenshots.mjs`. This uses its own Chromium, no conflict.

App URL: https://manholes-mapper-git-dev-hussam0is-projects.vercel.app
Login: admin@geopoint.me / Geopoint2026!

## DESIGN VERIFICATION CRITERIA

When checking each fix, verify:

**Colors & Tokens:**
- Primary blue = #2563eb, Success green = #22c55e, Danger red = #ef4444
- Background = #f8fafc (light) / #0b1220 (dark), Surface = #ffffff (light) / #0f172a (dark)
- Text = #0f172a (light) / #e2e8f0 (dark)
- No hardcoded colors that don't match the design system

**Layout & Spacing:**
- RTL: Hebrew text right-aligned, margins/padding use inline directions correctly
- LTR: Switch to English (via hamburger menu → language toggle) and verify layout flips properly
- Mobile: resize to 360x740 and verify nothing overflows, truncates, or overlaps

**Touch Targets:**
- All buttons/interactive elements ≥ 44px on mobile
- Verify with browser dev tools if needed: `getComputedStyle(el).height`

**Dark Mode:**
- Use Playwright to emulate `prefers-color-scheme: dark`:
  `await page.emulateMedia({ colorScheme: 'dark' })`
- Take screenshots and verify contrast, readability, no white-on-white or black-on-black

**States:**
- Hover states exist and look intentional
- Empty states have helpful messaging
- Loading states exist where data is fetched
- Error states are styled (red accent, not broken layout)

## FIXES TO VERIFY

[List each fix with what to check]:
1. [Issue title] — Navigate to [screen], verify [visual criteria], screenshot before/after
2. ...

## HOW TO TEST

For each fix:
1. Navigate to the relevant screen
2. Take a BEFORE-context screenshot (or use the Phase 0 screenshots as baseline)
3. Verify the fix is visually present
4. Test in Hebrew (RTL) AND English (LTR)
5. Test at mobile viewport (360x740) AND desktop (1280x720)
6. Test in dark mode
7. Take AFTER screenshot
8. Report: PASS (looks correct) or FAIL (describe what's wrong)

Save screenshots to [app_state_YYYY-MM-DD/] with prefix: `verify_NN_description.png`

IMPORTANT: When finished with ALL verification screenshots, call `browser_close` to release the browser.
```

---

## Phase 5: Spawn Phone Test Agent

After Playwright tests pass, invoke the **`mobile-phone-tester` skill** via the Skill tool. This agent already has full phone-debug MCP access, ADB coordinates, and device-specific knowledge.

Pass this design-focused prompt as the skill argument:

```
You are verifying DESIGN FIXES on the physical phone. This is a visual check, not
functional QA. For each fix below, take ADB screenshots and evaluate the visual result.

## CRITICAL: Read the UI Reference FIRST

Before verifying anything on the phone, read the complete UI reference file:
```
Read .claude/app-ui-reference.md
```
This file contains EVERY element ID, button, panel, menu item, dialog, canvas tool, map layer,
keyboard shortcut, and i18n key in the app. Use it to understand which UI elements exist on
each screen, their positions, and expected behavior on mobile.

## DESIGN CRITERIA FOR PHONE VERIFICATION

**Touch targets:** On the Galaxy Note 10 (420 dpi), 44dp = ~65px in native coordinates.
Use ADB to verify interactive elements are large enough:
- Toolbar buttons in #modeGroup should be ≥65px tap area
- FAB button should be ≥65px
- Menu items should have ≥65px row height
- Bottom drawer action buttons should be ≥65px

**Readability:**
- Text should be legible without squinting — minimum 14sp body text
- Edge length labels on canvas should be readable at default zoom
- Panel headers should be clearly distinguished from body text

**RTL (Hebrew default):**
- Hamburger menu should be on the LEFT (RTL)
- Menu slides from LEFT
- Text right-aligned in panels
- No clipped or overflow text

**Dark mode:**
- If the phone uses dark mode, verify contrast and readability
- GNSS marker colors should be visible against dark canvas

**Layout:**
- Nothing should be hidden behind the Android nav bar (bottom)
- Chrome toolbar (top) should not overlap app header
- Canvas toolbar buttons should all be visible and reachable
- Bottom drawer should not extend past the visible area

## FIXES TO VERIFY

1. [Fix description] — Navigate to [screen], tap [element], verify [visual criteria]
2. ...

## WORKFLOW

For each fix:
1. Take BEFORE screenshot (ADB): `adb exec-out screencap -p > phone_NN_before.png`
2. Navigate to the relevant screen (use ADB taps or cdp_evaluate)
3. Take AFTER screenshot
4. Evaluate: PASS or FAIL with description
5. Save screenshots to [app_state_YYYY-MM-DD/] with prefix: `phone_NN_description.png`
```

---

## Phase 6: Loop Control

After each full iteration:
1. Update `app_state_YYYY-MM-DD/ISSUES.md` with fix status and commit SHAs
2. **Update ClickUp tasks** — Close verified tasks, reopen failed ones:
   - Tests PASSED → `mcp__clickup__update_task({ task_id: "TASK_ID", status: "Closed" })`
   - Tests FAILED → `mcp__clickup__update_task({ task_id: "TASK_ID", status: "in progress" })` with a note on what failed
3. Update the `## Audit Focus` section in `workflow_log.md` with results
4. Present the user with the remaining top improvement areas from Phase 0 (that weren't picked yet)
5. If the user picks another area → run Phase 1–5 again on the same screenshots but focused on the new area
6. If all areas addressed → re-run Phase 0 to capture fresh screenshots (post-fix state) and start a new iteration

### Loop termination conditions
- All CRITICAL and HIGH issues are FIXED (and their ClickUp tasks are `Closed`)
- User explicitly ends the loop
- User has cycled through all improvement areas and is satisfied

---

## Key App Context

### Files Most Commonly Modified
| File | What It Controls |
|------|-----------------|
| `styles.css` | Colors, layout, button sizes, animations |
| `index.html` | DOM structure, element IDs, class names |
| `src/legacy/main.js` | Canvas logic, event handlers, menu behavior (~8300 lines) |
| `src/main-entry.js` | App init, mobile menu open/close logic |
| `public/service-worker.js` | `APP_VERSION` — bump when styles.css or index.html changes |
| `src/i18n.js` | Translation strings (he + en both required) |

### CSS Design Tokens (use these, never hardcode hex)
```css
--color-primary: /* app blue */
--color-accent: /* accent color */
--color-surface: /* card/panel background */
--color-text: /* primary text */
--color-danger: /* red, for destructive actions only */
--color-success: /* green */
```

### Critical Rules
- **Commit after each logical fix** — never batch unrelated changes
- **Bump APP_VERSION** if `styles.css` or `index.html` changes (forces cache refresh on phones)
- **RTL**: use `margin-inline-*` / `padding-inline-*` not `left`/`right`
- **Touch targets**: minimum 44dp on all interactive elements
- **Never break Hebrew/English** — test both languages after any text change

### Known Issues Already Fixed (don't re-fix)
- Material Icons self-hosted (was CDN CSP issue)
- XSS prevention via `escapeHtml()`
- Sync service AbortController dedup
- GNSS auto-center on first fix
- Edge label null-check bug (`!= null` fix)

---

## Audit Quick Reference — Manholes Mapper UI Sections

**Full UI reference**: `.claude/app-ui-reference.md` — contains every element ID, i18n key, and behavior.

| Screen | Key Elements to Check |
|--------|----------------------|
| **Canvas main** | Canvas toolbar (#modeGroup, bottom-left: My Location, Node/Home/Drainage/Edge mode, Undo, Zoom +/-, 3D View), FAB speed dial (#canvasFabToggle, bottom-right: Incomplete edges, Recenter, Zoom to fit), GPS Quick Capture (#gpsQuickCaptureBtn), Edge legend (#edgeLegend), Survey badge (#surveyConnectionBadge) |
| **Hamburger menu** (#mobileMenu) | Header/avatar, 9 collapsible groups: Navigation (Home, New Sketch), Search, View Controls (zoom, size), Sketch (save, export/import), CSV Export (nodes, edges), Location (coordinates, scale/stretch), Map Layers (tiles, ref layers), GNSS (Live Measure, status), Survey Device (Bluetooth/WebSocket), Workday, Settings (autosave, language, help, admin, projects) |
| **Node panel** (bottom drawer) | Wizard tab interface (accuracy→maintenance→material→diameter→access→note), survey data section (X/Y/elevation/precision/fix type), connected lines section (per-edge measurements/type/material/diameter/fall), delete button |
| **Edge panel** (bottom drawer) | Type select, engineering status, material, diameter, fall depth/position, tail/head measurements, target note, delete button |
| **Home panel** (#homePanel) | Sync status bar, Personal/Organization tabs, sketch cards list, "New Sketch" footer button |
| **Admin settings** (#adminScreen) | Nodes/Edges tabs with: CSV field checkboxes, default values, dropdown option management, custom fields |
| **Admin panel** (user/org mgmt) | Users tab (name, email, role badge, org, edit), Organizations tab (super_admin only), Features tab (6 feature flags: export_csv, export_sketch, admin_settings, finish_workday, node_types, edge_types) |
| **Projects screen** (#projectsScreen) | Project cards, "Add Project" button |
| **Project canvas** | Sketch side panel (#sketchSidePanel: list, visibility toggles, km stats, issues sub-panel with go-to/center-between navigation) |
| **Input Flow** (#inputFlowScreen) | Nodes/Edges tabs, rule list, per-rule: trigger condition (field+operator+value), actions (nullify/disable/require/reset/fill) |
| **Dialogs** | Login (#loginPanel), Start/New Sketch (#startPanel), Help (#helpModal), Finish Workday (#finishWorkdayModal), Point Capture (GNSS), Device Picker (Bluetooth), Survey Node Type |
| **Map layers** | GovMap tiles (orthophoto/street), reference GeoJSON layers (sections, survey_manholes, survey_pipes, streets, addresses), Street View pegman |
| **Floating keyboard** (#floatingKeyboard) | Draggable/resizable numeric keypad for mobile |

---

## Output Format

At the end of each iteration, produce a report:

```markdown
## Design Audit Loop — Iteration N Report

**Folder**: app_state_YYYY-MM-DD/
**Focus Area**: [User's chosen area from Phase 0]
**Workflows Captured**: A (Login), B (Drawing), C (Projects), D (Admin), E (Mobile), F (Misc)
**Screenshots Taken**: N total
**Video**: walkthrough.webm (Ns duration)
**Gemini Report**: gemini_video_report.md (N issues found)
**Date**: YYYY-MM-DD
**Issues Found**: N (C: N critical, H: N high, M: N medium, L: N low)
**Issues Fixed This Iteration**: N
**Commits**: [list commit SHAs]
**Test Results**: Playwright: N/N passed | Phone: N/N verified

### Research Summary
- [One-line summary of each workflow's state: smooth / needs work / broken]

### Focus Area Issues Fixed
1. ✅ [Issue title] — commit abc1234 — ClickUp #task_id Closed
2. ✅ [Issue title] — commit def5678 — ClickUp #task_id Closed

### Issues Open (Next Iteration)
1. 🔴 CRITICAL — [Issue title] — ClickUp #task_id (in progress)
2. 🟠 HIGH — [Issue title] — ClickUp #task_id (in progress)

### Remaining Improvement Areas
1. [Area not yet addressed]
2. [Area not yet addressed]
```

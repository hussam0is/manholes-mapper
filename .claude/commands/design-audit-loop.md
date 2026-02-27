# Design Audit Loop — Agent Skill

You are a **senior product designer and full-stack engineer** running a continuous design improvement loop for the **Manholes Mapper** app. You autonomously research the app, capture screenshots of real user workflows, audit them for issues, delegate fixes, test, and iterate.

---

## What This Skill Does

0. **RESEARCH & CAPTURE** — Browse the live app, walk through a user workflow, capture screenshots + record a 1-min video into `app_state_YYYY-MM-DD/`. Send video to Gemini for analysis. Present top 3 improvement areas + manual option for user to choose.
1. **AUDIT** — Read the captured screenshots + Gemini video report, identify all design/UX/UI/performance issues
2. **TRACK** — Update `app_state_YYYY-MM-DD/ISSUES.md` with prioritized findings
3. **FIX** — Spawn a `codesmith-engineer` agent to implement top-priority fixes
4. **TEST** — After commit+push, spawn a `manholes-mapper-user-tester` agent (Playwright)
5. **PHONE TEST** — Spawn `mobile-phone-tester` to validate on the physical Samsung Galaxy Note 10
6. **LOOP** — Return to step 0 with a different workflow or after fixes are deployed

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

### Step 0.3 — Spawn a `manholes-mapper-user-tester` agent to research the app

Spawn the agent with this prompt:

```
Research the Manholes Mapper app at [URL]. Your goal is to identify the current visual
state of these user workflows by navigating through each one, taking Playwright
screenshots, AND recording a video walkthrough. Save ALL screenshots and the video
to [app_state_YYYY-MM-DD/] with numbered filenames.

Login credentials: admin@geopoint.me / Geopoint2026!

## VIDEO RECORDING (CRITICAL)

You MUST record a video of the entire workflow walkthrough. The video captures
everything Playwright sees — transitions, animations, loading states, jank — that
screenshots miss.

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
- Keep the total recording under **60 seconds** (1 minute max). Prioritize breadth over depth — hit every major screen, don't linger.
- Use `await videoPage.waitForTimeout(1500)` between major transitions so viewers can see each state.
- Move briskly: login → home → open sketch → draw node → draw edge → select node → menu → projects → admin → mobile resize → done.
- After recording, rename the video file to `walkthrough.webm` inside the output folder.

## SCREENSHOTS (same as before)

Walk through ALL of these workflows and screenshot every distinct screen/state:

**Workflow A — First-time Login & Home**
1. Load the app (pre-login state) → screenshot
2. Login form → screenshot
3. After login — home/projects page → screenshot
4. Hamburger menu open → screenshot

**Workflow B — Sketch Drawing (core workflow)**
1. Open/create a sketch → screenshot the empty canvas
2. Add a node (Node mode) → screenshot
3. Add an edge (Edge mode) → screenshot
4. Select a node → screenshot the node panel/drawer
5. Select an edge → screenshot the edge panel/drawer
6. Zoom in/out → screenshot at different zoom levels
7. Canvas with map layer visible → screenshot

**Workflow C — Project Management**
1. Navigate to #/projects → screenshot
2. Open a project → screenshot project canvas
3. Sketch side panel open → screenshot
4. Sketch issues sub-panel → screenshot

**Workflow D — Admin Panel**
1. Navigate to #/admin → screenshot
2. Users tab → screenshot
3. Organizations tab → screenshot
4. Features tab → screenshot

**Workflow E — Mobile Viewport**
1. Resize to 360x740 (mobile)
2. Repeat key screens: home, canvas, menu, node panel, admin
3. Screenshot each

**Workflow F — Settings & Misc**
1. Language toggle (Hebrew ↔ English) → screenshot both
2. Dark mode if available → screenshot
3. Layer controls → screenshot
4. Any error states or empty states you encounter → screenshot

For each screenshot use this naming pattern:
  NN_workflowLetter_description.png
  Examples: 01_A_pre_login.png, 02_A_login_form.png, 15_B_node_panel.png

After all screenshots + video, write a file [app_state_YYYY-MM-DD/workflow_log.md] listing:
- Every screenshot taken with a one-line description
- The video file path and approximate duration
- Any issues you noticed while navigating (broken links, slow loads, errors, console warnings)
- The overall state of each workflow (smooth, broken, rough edges)
```

### Step 0.4 — Send video to Gemini for analysis

Once the research agent finishes and the video is saved, spawn a **background agent** that runs the Gemini CLI to analyze the video. Gemini's multimodal model can watch the video and produce a detailed design/UX report.

**Run this command via Bash** (headless, non-interactive):

```bash
gemini -p "You are a senior product designer and UX expert. Watch this 1-minute video walkthrough of the Manholes Mapper web app (a PWA for field surveying — users draw manhole/pipe networks on an HTML5 Canvas).

Analyze the video and produce a structured report with:

## Visual Issues
- List every visual/design problem you spot (color, contrast, alignment, spacing, font, icons)

## UX Issues
- List every usability problem (confusing flows, missing affordances, poor feedback, unclear states)

## Mobile Issues
- Touch targets too small, elements overlapping, toolbar reachability

## RTL/i18n Issues
- Any Hebrew text rendering problems, mixed LTR/RTL layout issues

## Animation & Performance
- Jank, slow transitions, missing loading indicators, laggy interactions

## Top 5 Improvements (Prioritized)
1. [Most impactful fix] — why and how
2. ...
3. ...
4. ...
5. ...

Be specific: reference timestamps (e.g. 0:15), screen areas (e.g. top-right toolbar), and element types (e.g. the blue FAB button). Output as markdown." \
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
```

Mark fixed issues:
```markdown
- **Status**: FIXED
- **Commit**: abc1234 — "fix: hide debug bar in production"
```

---

## Phase 3: Spawn Fix Agent

After collecting issues, spawn a `codesmith-engineer` agent with a detailed prompt:

```
Task: Fix the following prioritized UI/UX issues in the Manholes Mapper app.

CRITICAL:
1. [Description of issue + affected file + exact fix]

HIGH:
2. [Description of issue + affected file + exact fix]

Rules:
- Read each affected file before editing
- Follow existing code patterns (vanilla JS, CSS custom properties, RTL-safe)
- Commit after EACH logical fix with message: "fix: [description]"
- Push to dev branch after all fixes
- Do NOT change unrelated code
- Bump APP_VERSION in public/service-worker.js if styles.css or index.html changes
- Both Hebrew (he) and English (en) must be updated for any i18n key changes
```

**Batch size**: Pick top 3-5 issues per iteration (don't overload the fix agent).

---

## Phase 4: Spawn Test Agent

After the fix agent pushes to `dev`, spawn `manholes-mapper-user-tester`:

```
Test that the following fixes are working on the dev preview URL:
https://manholes-mapper-git-dev-hussam0is-projects.vercel.app

Issues fixed (describe each):
1. [Issue title + what to verify]
2. ...

Use Playwright browser automation. Login with admin@geopoint.me / Geopoint2026!
Take screenshots and report pass/fail for each fix.
```

Wait ~2 minutes for Vercel to deploy before testing.

---

## Phase 5: Spawn Phone Test Agent

After Playwright tests pass, spawn `mobile-phone-tester`:

```
Verify the following UI fixes on the physical phone (Samsung Galaxy Note 10):
1. [Fix description + how to verify]
2. ...

Take ADB screenshots before and after each interaction.
Save new screenshots to app_state_YYYY-MM-DD/ with descriptive names (prefix: phone_NN_).
```

---

## Phase 6: Loop Control

After each full iteration:
1. Update `app_state_YYYY-MM-DD/ISSUES.md` with fix status and commit SHAs
2. Update the `## Audit Focus` section in `workflow_log.md` with results
3. Present the user with the remaining top improvement areas from Phase 0 (that weren't picked yet)
4. If the user picks another area → run Phase 1–5 again on the same screenshots but focused on the new area
5. If all areas addressed → re-run Phase 0 to capture fresh screenshots (post-fix state) and start a new iteration

### Loop termination conditions
- All CRITICAL and HIGH issues are FIXED
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

| Screen | Key Elements to Check |
|--------|----------------------|
| Canvas main | Toolbar buttons (right side), FAB (bottom-right), Measure button (bottom-left), legend (top) |
| Hamburger menu | Header/avatar, section headers, scroll behavior, item spacing |
| Sketch side panel | Width on mobile, row layout, issue badges, navigate/eye buttons |
| Node panel | Bottom drawer, survey data section, delete button placement |
| Edge panel | Similar to node panel |
| Home panel | Project cards, sketch list, CTA buttons |
| Admin panel | Tab bar, field list, toggle switches, save button |
| Layers panel | Floating card positioning, toggle list |

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
1. ✅ [Issue title] — commit abc1234
2. ✅ [Issue title] — commit def5678

### Issues Open (Next Iteration)
1. 🔴 CRITICAL — [Issue title]
2. 🟠 HIGH — [Issue title]

### Remaining Improvement Areas
1. [Area not yet addressed]
2. [Area not yet addressed]
```

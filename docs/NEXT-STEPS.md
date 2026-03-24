# Next Steps — Based on Analysis of Last 100 Commits (Mar 3–7, 2026)

## Sprint Summary

100 commits in 4 days: 16 features, 10 bug fixes, 6 design improvements, 1 test commit.
Major theme: **Cockpit/gamification UX overhaul** with landscape-first layout, mission control, skill levels, and leaderboard.

---

## P0 — Critical Bugs ~~(Fix Immediately)~~ RESOLVED

1. ~~**`_contrastMul` ReferenceError**~~ — Already fixed in prior commits (now module-level `let` at line 473).

2. ~~**i18n greeting key mismatch**~~ — Already fixed (code correctly uses `homeScreen.*` keys).

3. ~~**Desktop header missing at 1280px**~~ — Already fixed (landscape auto-hide correctly guarded by `innerHeight <= 450`).

---

## P1 — Stabilization (Before Adding More Features)

4. **Write tests for 16 new features** — Only 1 test commit (74 canvas perf tests) accompanied 16 feature additions. Priority test targets:
   - Issue node type + comment system + notifications
   - Cockpit layout (landscape-first, action rail, health card)
   - Heat map rendering for data completeness
   - Measurement rail with inline depth inputs
   - Save & Next node editing flow
   - One-handed edge mode (long-press drag)
   - Edge width/color by pipe diameter

5. **Test cockpit components** — 6 new cockpit files (`cockpit.js`, `action-rail.js`, `completion-engine.js`, `intel-strip.js`, `quick-wins.js`, `session-tracker.js`) have zero test coverage.

6. **Fix remaining 23 open design audit issues** — From `app_state_2026-03-04/ISSUES.md` and `current_app_design/ISSUES.md` (69 tracked, 46 fixed, 23 open/deferred).

---

## P2 — Technical Debt

7. **Break up `main.js` (12,315 lines → target <5,000)** — Grew 48% from ~8,300 lines. Extraction candidates:
   - Cockpit/gamification logic (recently added, self-contained)
   - Heat map rendering (new, standalone)
   - Measurement rail (new, extractable)
   - Node/edge editing panels (high-change area)
   - Canvas event handlers (touch, mouse, keyboard)

8. **Update CLAUDE.md** — Stale documentation:
   - `main.js` line count says ~8,300 (actually 12,315)
   - Missing: cockpit module, gamification, Issue node type, heat maps
   - Missing API route: `/api/issue-comments`
   - Missing cockpit directory in key directories

9. ~~**Replace silent catch handlers**~~ — DONE: Added `console.warn` to 11 listener/data-handling catch blocks. Remaining ~30 are legitimately silent (localStorage quota, DOM detection, WS close).

10. ~~**Remove debug logging**~~ — DONE: Removed coordinate import debug statements from `coordinates.js` and `main.js`.

11. **Audit `three.js` dependency** — `three` (v0.183.1) is in production dependencies. If only experimental/planned, move to devDependencies or remove to avoid bundle bloat.

---

## P3 — Medium-Term Improvements

12. **Add tests for admin panel modules** — 8 large files (~160KB total) with zero test coverage: `admin-features.js`, `admin-fixes.js`, `admin-organizations.js`, `admin-panel.js`, `admin-settings.js`, `admin-users.js`, `input-flow-settings.js`, `projects-settings.js`.

13. **Verify WiFi TCP socket plugin** — `wifi-adapter.js` references `capacitor-tcp-socket` but it's unclear if installed. Document as optional or add to package.json.

14. **Centralize state management** — Currently 5+ singletons (`gnssState`, `projectSketches`, `menuEvents`, `authGuard`, `syncService`) with no central coordination. Consider a lightweight event bus or state container.

15. **Performance audit on Galaxy Note 10** — With heat maps, animations, haptic feedback, and 12K+ lines of rendering code, verify canvas stays smooth on the target device.

16. **Improve type safety** — `strict: false` in tsconfig.json. Auth modules use `any` return types. Gradual migration toward stricter types.

17. **E2E tests for cockpit UX** — Cover landscape layout, action rail, health card issue navigation, Save & Next flow.

---

## Metrics

| Metric | Value |
|--------|-------|
| `main.js` lines | 12,315 (was ~8,300) |
| Source files | 98 |
| Test files | 28 |
| Tests | ~490 |
| Untested source files | 30+ |
| Open design issues | 23 |
| Silent error catches | 11 fixed, ~30 legitimately silent |
| Skipped tests | 0 (good) |
| Commented-out code | Minimal (good) |

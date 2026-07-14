# Manholes Mapper — Full-Network Field Audit (TSC5 geometry, TSC3 emulator)

**Audit runs:** 2026-07-13 · **Report:** 2026-07-14
**Method:** Playwright drives the real app at 640×360 landscape (Trimble TSC5 CSS viewport) with touch input. Survey points arrive through the mock TSC3 bridge (`npm run mock:tsc3`, WS :8765). A full network is built end-to-end: 8 nodes (6 mains + 2 branch), 7 directed pipes, 1 home connection, deliberate negative-gradient segment MH-103 → MH-104 (+0.45 m along flow), depth measurements on two pipes. Full-session video recorded with real motion (no `reducedMotion`) for flicker analysis.
**Spec:** `frontend/tests/e2e/full-network-audit.spec.ts` — baseline mode records observations; `AUDIT_EXPECT_SMART=1` asserts the smart layer.

## Artifacts

| Artifact | Path |
|---|---|
| Baseline video (before changes) | `qa/videos/full-network-audit-baseline-2026-07-13.webm` |
| v2 video (feature/v2-smart-field) | `qa/videos/full-network-audit-smart-2026-07-13.webm` |
| Findings JSON (baseline / smart) | `qa/videos/full-network-audit-findings-*.json` |
| Negative-gradient alert moment | `qa/videos/smart-negative-gradient-moment.png` |
| Full network screenshots | `qa/videos/baseline-network.png`, `qa/videos/smart-network.png` |

**Flicker analysis:** both videos end with a scripted stress sequence — zoom pulse ×24 (~60 ms steps), horizontal pan sweep ×16, heat-map toggle ×2, sidebar close. Any canvas flicker, tearing, or repaint flash will be visible there; the build phase (first ~8 s) shows dialog/toast/highlight transitions.

## Easibility scores (1–10, per field flow)

| # | Flow | Baseline | v2 | Evidence |
|---|------|----------|----|----------|
| 1 | Connect to TSC3 (WS bridge) | 6 | 8 | Instant connect (<15 ms). Baseline badge rendered the literal icon name "bluetooth_connected" as text for a WebSocket link; v2 shows the correct wifi glyph + connection snackbars. |
| 2 | Survey a new manhole | 7 | 9 | 1 tap per point, point-to-canvas 53–89 ms, type dialog in 7–15 ms. Baseline confirmation was broken copy ("נוצר modeManhole MH-102" — raw i18n key). v2: "שוחה MH-102 נמדד/ה • גובה 104.60 מ' • שיפוע 2.0% ✓" — elevation + live slope to the previous manhole. |
| 3 | Re-measure an existing point | 10 | 10 | 0 taps, silent coordinate/elevation overwrite in 6–13 ms; v2 adds an explicit "re-measured" confirmation with the new elevation. |
| 4 | Pipe auto-connect chaining | 9 | 9 | All 7 edges created hands-free with correct flow direction, including re-anchoring the chain by re-shooting MH-103/MH-105. |
| 5 | **Smartness: error detection at measurement time** | **1** | **9** | Baseline: MH-104 measured 0.45 m ABOVE the upstream manhole — accepted silently; nothing anywhere ever flags it (the depth-delta heuristic is masked by 1.50/1.20 depths). v2: warning snackbar the moment the shot lands ("פני הקרקע עולים 45 ס"מ בכיוון הזרימה", −2.25 %), with a View action that pans + pulses the pipe; refined to an error with true invert slope (−3.75 %) when depths are entered; home-connection uphill correctly exempt; "gradient OK now" confirmation when resolved. |
| 6 | Depth (pipe) measurement entry | 4 | 7 | Live validation now runs on every keystroke (debounced). Remaining friction (both): entering one pipe's two depths requires selecting each endpoint node in turn — a context switch per pipe in the field. |
| 7 | Feedback & notification system | 3 | 9 | Baseline: single toast element, no queue — messages within ~1.8 s overwrite each other, no actions, "info" variant unstyled. v2: stacking snackbars (max 3) with priority eviction (alerts never wait behind info), action buttons, per-variant icons/progress, RTL + dark + landscape safe. |
| 8 | Data-quality flags (issues engine) | 3 | 9 | Baseline flagged ALL 8 freshly-measured nodes "missing TL" (TSC3 writes surveyZ, engine only read `tl`) and missed the uphill pipe entirely. v2: `missing_tl` accepts surveyZ, `negative_gradient` reports true slope (`slopePct`, `basis`), cockpit/side-panel/admin labels unified (snake_case fix in intel-strip). |

**Overall: baseline 4.9 / 10 → v2 8.8 / 10.** Raw speed was never the problem (everything applies in <100 ms) — the gaps were silence, broken copy, and zero domain intelligence at the moment of measurement.

## What "smart" means in v2 (as requested)

The app now evaluates the hydraulic gradient of every pipe **the moment data arrives**, on all input paths (TSC3 point, GNSS capture, edge creation incl. chaining and dangling-connect, depth typing):

- **Terrain basis** (elevations only): early warning when ground rises along flow beyond 5 cm — exactly when the surveyor can still re-shoot.
- **Invert basis** (elevations + both depths): authoritative check `invert = surveyZ − depth`; negative slope → error alert; slope < 0.3 % → low-slope warning.
- **Exemptions:** pipes touching Home / ForLater / Issue nodes (laterals legitimately rise toward buildings).
- **No spam:** alerts fire only on status transitions per pipe; fixing a pipe shows a success confirmation.
- Engine exposed at `window.__gradientEngine` (used by the e2e suite; available for future panels).

## UX notes for the backlog

- **major → fixed in v2:** no gradient warning at measurement time; issues engine missing the uphill pipe; missing-TL false positives; broken toast copy; wrong badge glyph; toast overwrites under burst feedback.
- **minor, open:** per-pipe depth entry needs both endpoints selected in turn (candidate: dual-depth inputs on edge selection, or reviving the dead measurement-rail concept properly).
- **minor, open:** bottom-center toasts can transiently cover canvas nodes on the 360 px-tall screen (mitigated in v2: landscape bottom anchor, max 3, fast expiry, eviction; the audit spec dismisses and retries like a real user would).
- **pre-existing backlog unchanged:** transient edit chip after node placement, wizard dead-end (maintenance=0), dead custom-select touch sheet, read-only edge-creation gap.

## Timings (v2 run, all within budget)

| Metric | Value |
|---|---|
| WS connect | 11 ms |
| Type dialog appears after point sent | 7–15 ms |
| Point applied to canvas (new, incl. dialog tap) | 53–89 ms |
| Re-measure applied (silent) | 6–13 ms |
| Node tap → first depth field filled | ~0.7 s (3.7 s when a toast overlapped the node — see minor note) |
| Console errors across both runs | 0 |

## Reproduce

```bash
npm run mock:tsc3                        # once, keeps running
cd frontend
npx playwright test tests/e2e/full-network-audit.spec.ts --project=chromium                       # baseline observations
AUDIT_EXPECT_SMART=1 npx playwright test tests/e2e/full-network-audit.spec.ts --project=chromium  # assert smart layer
# findings + screenshots: frontend/audit-results/ (survives re-runs)
# video: frontend/test-results/full-network-audit-*/video.webm — Playwright
# cleans test-results at run start, so COPY the video before the next run.
```

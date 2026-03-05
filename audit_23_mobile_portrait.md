# Mobile Portrait Audit (375x812) - 2026-03-01

## Viewport: 375x812 (iPhone SE/X class)

## Screenshots
- `app_state_2026-03-01_portrait/01_login_page.png` - Login form
- `app_state_2026-03-01_portrait/02_signup_page.png` - Signup form
- `app_state_2026-03-01_portrait/20_home_sketch_list_portrait.png` - Home panel
- `app_state_2026-03-01_portrait/21_canvas_view_portrait.png` - Canvas with toolbar
- `app_state_2026-03-01_portrait/22_fab_expanded.png` - FAB speed dial expanded

---

## Issues Found

### Issue #1 - CRITICAL: Canvas toolbar buttons only 40px wide (below 44px touch target minimum)
- **Severity**: CRITICAL
- **Type**: accessibility/touch-target
- **Screenshot**: 21_canvas_view_portrait.png
- **Affected**: `styles.css` lines 1135-1139
- **Problem**: All `.canvas-toolbar .segmented .btn` buttons measure 40x44px. Only `#modeGroup .btn` has an explicit `min-width: 44px`. The general toolbar buttons (zoom in/out, undo/redo, 3D view, my location) get 40px width from content sizing. This fails WCAG 2.5.8 (44x44px touch target minimum).
- **Fix**: Add `min-width: 44px` to `.canvas-toolbar .segmented .btn` selector.
- **Status**: FIXED (already applied in commit 3d9deab — `.canvas-toolbar .segmented .btn` has `min-width: 44px; min-height: 44px`)

### Issue #2 - HIGH: Canvas toolbar uses `right: 12px` instead of RTL-safe `inset-inline-end`
- **Severity**: HIGH
- **Type**: RTL/i18n
- **Affected**: `styles.css` line 1100
- **Problem**: `.canvas-toolbar` uses `right: 12px` which does not flip correctly in LTR mode. Should use `inset-inline-end: 12px` for bidirectional support.
- **Fix**: Replace `right: 12px` with `inset-inline-end: 12px`.
- **Status**: FIXED (already applied in commit 3d9deab — `.canvas-toolbar` uses `inset-inline-end: 12px`)

### Issue #3 - MEDIUM: Home panel width too tight at 375px
- **Severity**: MEDIUM
- **Type**: layout
- **Screenshot**: 20_home_sketch_list_portrait.png
- **Affected**: `styles.css` line 4878
- **Problem**: `#homePanel .panel` has `width: 360px; max-width: calc(100% - 2rem)`. At 375px viewport, `calc(100% - 2rem) = 343px` which wins, but the modern `.home-panel-modern` at line 7500 uses `width: min(420px, 100%)` which takes full width. The legacy `#homePanel .panel` definition at line 4878 conflicts.
- **Fix**: Ensure `#homePanel .panel` uses `max-width: calc(100vw - 1rem)` at narrow viewports to avoid horizontal cramping.
- **Status**: FIXED (already applied in commit 3d9deab — `#homePanel .panel` uses `max-width: calc(100vw - 1rem)`)

### Issue #4 - MEDIUM: Signup form language toggle clipped on 375x812
- **Severity**: MEDIUM
- **Type**: layout/scroll
- **Screenshot**: 02b_signup_fullpage.png
- **Problem**: The signup form with 4 fields + submit button + language toggle extends beyond the visible viewport. The "English" toggle at the bottom is partially cut off - requires scrolling to reach. On short viewports or with virtual keyboard open, the language toggle becomes completely inaccessible.
- **Fix**: Reduce vertical spacing in the signup form header section. Optionally move language toggle to the top of the form.
- **Status**: FIXED — Extended the `@media (max-width: 480px) and (max-height: 820px)` query to compact `.auth-form` gap (1rem to 0.5rem), subtitle margin, input padding, submit margin, and lang toggle margin. Saves ~96px, keeping the language toggle visible on 375x812.

### Issue #5 - HIGH: Canvas toolbar lacks safe-area-inset-bottom for FAB on notched phones
- **Severity**: HIGH
- **Type**: layout/safe-area
- **Affected**: `styles.css` lines 1711-1716
- **Problem**: `.canvas-fab-toolbar` at `bottom: 64px` does not account for `env(safe-area-inset-bottom)`. On notched phones (iPhone X+), the FAB could overlap the home indicator area.
- **Fix**: Add `bottom: max(64px, calc(64px + env(safe-area-inset-bottom) - 20px))` or use a simpler `bottom: calc(64px + env(safe-area-inset-bottom))`.
- **Status**: FIXED (already applied in commit 3d9deab — `.canvas-fab-toolbar` uses `bottom: calc(64px + env(safe-area-inset-bottom, 0px))`)

### Issue #6 - LOW: Edge legend font size could be larger on portrait
- **Severity**: LOW
- **Type**: readability
- **Screenshot**: 21_canvas_view_portrait.png
- **Problem**: The edge type legend (top-left) at 375px portrait shows small colored squares + text. Font is readable but could benefit from slightly larger text for outdoor use.
- **Fix**: No immediate action needed, possibly increase font-size at narrow widths.
- **Status**: DEFERRED

### Issue #7 - MEDIUM: FAB speed dial items overlap toolbar in landscape-to-portrait rotation
- **Severity**: MEDIUM
- **Type**: layout
- **Affected**: `styles.css` line 1774
- **Problem**: The FAB `__actions` container expands horizontally (`flex-direction: row`) with `max-width: 300px`. At 375px with the toolbar on the right, when expanded, the leftmost action items could overlap or go off-screen.
- **Fix**: Adjust to `flex-direction: column` on narrow viewports so FAB items stack vertically above the toggle.
- **Status**: FIXED (already applied in commit 3d9deab — `@media (max-width: 480px) and (orientation: portrait)` switches to `flex-direction: column-reverse` with vertical stacking)

---

## Metrics Summary

| Element | Position | Size | Notes |
|---------|----------|------|-------|
| Header | sticky top=0 | 375x65 | z-index: 1050 |
| Hamburger | left=20, top=10 | 44x44 | OK touch target |
| Canvas toolbar | right=314, top=81 | 46x446 | Buttons 40px wide (BAD) |
| FAB | right=311, bottom=744 | 48x48 | OK size |
| Edge legend | left=20, top=81 | 210x24 | OK |
| Home panel | full viewport | 375x812 | OK coverage |

## No overflow detected at 375px

The scrollWidth matches viewport width (375px). No horizontal overflow.

## Touch Targets Below 44px

10 canvas toolbar buttons at 40px width:
1. myLocationBtn (40x44)
2. nodeModeBtn (40x44)
3. homeNodeModeBtn (40x44)
4. drainageNodeModeBtn (40x44)
5. edgeModeBtn (40x44)
6. undoBtn (40x44)
7. redoBtn (40x44)
8. canvasZoomInBtn (40x44)
9. canvasZoomOutBtn (40x44)
10. threeDViewBtn (40x44)

# Design Audit — 2026-03-04

**App URL**: https://manholes-mapper.vercel.app
**Auditor**: Design Audit Loop Agent
**Date**: 2026-03-04
**Screenshots Taken**: 66 total (across multiple viewports and modes)
**Viewports Tested**: Desktop 1280x800, Desktop 1440x900, Mobile 360x740
**Modes Tested**: Light mode, Dark mode, Hebrew (RTL), English (LTR)

---

## Issue #1 — CRITICAL: _contrastMul ReferenceError crashes canvas in project mode
- **Severity**: CRITICAL
- **Type**: bug
- **Screenshot**: 09_C_project_canvas_view.png (visible error toast)
- **Affected**: `src/legacy/main.js` (lines 4684, 5264)
- **Problem**: `_contrastMul` is defined as `const` inside the `draw()` function (line 4684) but is referenced in `drawEdge()` (line 5264), which is a separate function outside `draw()`'s scope. This causes `Uncaught ReferenceError: _contrastMul is not defined` every time an edge is drawn in project canvas mode. The error appears as a toast and likely breaks the render loop, preventing edges from displaying.
- **Fix**: Move `_contrastMul` to a module-level variable (e.g., `let _contrastMul = 1.0;`) and update it at the start of `draw()` instead of declaring it as `const` inside `draw()`. This keeps it in scope for `drawEdge()` and other draw helper functions.
- **Status**: OPEN
- **Commit**: --

---

## Issue #2 — HIGH: i18n key mismatch — greeting shows raw key "home.goodEvening"
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 08_C_projects_page.png, 16_F_dark_mode_admin.png, 24_E_mobile_admin.png
- **Affected**: `src/legacy/main.js` (line 2625-2627), `src/i18n.js`
- **Problem**: The code uses `t('home.goodMorning')`, `t('home.goodAfternoon')`, and `t('home.goodEvening')` but the i18n dictionary has these keys nested under `homeScreen` (e.g., `homeScreen.goodMorning`), not `home`. The `home` key in i18n is just the string "beit" / "Home". So `t('home.goodEvening')` falls through and displays the raw key string `home.goodEvening` to users. This is visible on the projects/home panel as literal text.
- **Fix**: Change the i18n lookup keys in `src/legacy/main.js` from `home.goodMorning` to `homeScreen.goodMorning` (and similarly for goodAfternoon, goodEvening). Or alternatively, restructure the i18n to have a `home` object.
- **Status**: OPEN
- **Commit**: --

---

## Issue #3 — HIGH: Desktop cockpit layout missing app header in 1280px viewport
- **Severity**: HIGH
- **Type**: ux
- **Screenshot**: 04_A_after_login.png, 05_A_home_panel.png, 06_B_canvas_view.png, 10_C_sketch_side_panel.png
- **Affected**: `styles.css`, `src/main-entry.js`
- **Problem**: At 1280x800 desktop viewport, the app header (`#appHeader`) is not visible. The screen shows only the left toolbar and right cockpit panel with canvas area, but no top header bar with the brand, search, save button, user account, etc. The earlier 1440x900 screenshot (32_A_post_login.png) shows the header correctly. This suggests a responsive breakpoint issue where the header disappears or is hidden between 1280-1440px, which is a common laptop resolution. Users on 1280px-wide screens lose access to desktop header actions.
- **Fix**: Investigate the CSS media query breakpoint that hides `#appHeader`. The landscape cockpit layout may be too aggressively taking over. The header should remain visible on desktop widths >= 1024px.
- **Status**: OPEN
- **Commit**: --

---

## Issue #4 — HIGH: Edge legend text labels missing in dark mode
- **Severity**: HIGH
- **Type**: visual-design
- **Screenshot**: 15_F_dark_mode_canvas.png, 27_E_mobile_dark_home.png
- **Affected**: `styles.css`
- **Problem**: In dark mode, the edge type legend at the top of the canvas (showing "Main line", "Drainage line", "Secondary line" with color squares) has the text labels but the colored squares/labels appear truncated or poorly visible. The legend text color does not properly adapt to dark mode — the labels appear to blend into the background. On the mobile dark canvas, the legend appears as colored rectangles with no readable text.
- **Fix**: Ensure the edge legend text uses `var(--color-text)` or a high-contrast color in dark mode. Verify the legend container has proper dark mode background/border styling.
- **Status**: OPEN
- **Commit**: --

---

## Issue #5 — MEDIUM: Projects page and home panel are the same screen / confusing navigation
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 08_C_projects_page.png, 53_C_projects.png
- **Affected**: `src/legacy/main.js`, `styles.css`
- **Problem**: The `#/projects` route and the home panel (`#/`) appear to show the same projects modal overlay. The Projects page shows project cards with "Open Project" buttons but also shows the active sketch card and "My Sketches" button at the bottom. This dual purpose makes the navigation model confusing — users cannot tell the difference between "home" and "projects." The overlay format (a card centered over the dimmed canvas) looks like a dialog rather than a proper page.
- **Fix**: Consider differentiating the home panel (quick-start, active sketch resumption) from the projects management page (admin-level project CRUD). The home panel should focus on the user's current work context, while the projects page should be a full management view.
- **Status**: OPEN
- **Commit**: --

---

## Issue #6 — MEDIUM: Canvas toolbar has too many items stacked vertically on mobile
- **Severity**: MEDIUM
- **Type**: mobile / ux
- **Screenshot**: 19_E_mobile_home_panel.png, 20_E_mobile_canvas.png
- **Affected**: `styles.css`, `index.html`
- **Problem**: On mobile 360x740 viewport, the left canvas toolbar shows 10 buttons stacked vertically (location, node, home node, drainage node, edge, undo, redo, zoom in, zoom out, recenter). This toolbar takes up approximately 60% of the screen height, leaving very little canvas space for actual drawing. The buttons appear tightly packed with minimal spacing.
- **Fix**: Consider collapsing less-used tools into a sub-menu or using a scrollable toolbar. The redo button is rarely needed immediately. Zoom controls could be gesture-only on mobile. The undo/redo could be merged into a single button with a dropdown.
- **Status**: OPEN
- **Commit**: --

---

## Issue #7 — MEDIUM: Mobile hamburger menu doesn't scroll properly
- **Severity**: MEDIUM
- **Type**: mobile
- **Screenshot**: 21_E_mobile_hamburger_menu.png, 22_E_mobile_menu_scrolled.png, 23_E_mobile_menu_scrolled_more.png
- **Affected**: `styles.css` (mobile menu)
- **Problem**: The mobile hamburger menu appears to show identical content in screenshots 21, 22, and 23 despite scroll attempts to position 300 and 600. This suggests the menu scroll is not working correctly, or the menu items are all visible at once and the bottom items (like the autosave toggle) get cut off by the screen edge. The menu also partially overlaps with the cockpit panel visible on the right edge behind the menu.
- **Fix**: Ensure `#mobileMenu` has `overflow-y: auto` with proper max-height. The menu should scroll to reveal all items. Consider adding a scrollbar indicator.
- **Status**: OPEN
- **Commit**: --

---

## Issue #8 — MEDIUM: Cockpit right panel has no header/title area in collapsed state
- **Severity**: MEDIUM
- **Type**: visual-design
- **Screenshot**: 04_A_after_login.png, 06_B_canvas_view.png
- **Affected**: `styles.css`, `src/main-entry.js`
- **Problem**: The right-side cockpit panel (showing health %, sync status, shift stats) appears without a clear title or header section. The first visible element is the edge legend. Below it is "No reception" (GNSS status), then health %, sync status, and shift stats. The panel lacks visual hierarchy — all sections look equally weighted. There is no clear app branding or user identity visible in this view.
- **Fix**: Add a header section to the cockpit panel with the user avatar, app name, or current sketch name. Improve visual hierarchy with section dividers or card groupings.
- **Status**: OPEN
- **Commit**: --

---

## Issue #9 — MEDIUM: Dark mode login form has poor contrast on form card background
- **Severity**: MEDIUM
- **Type**: accessibility
- **Screenshot**: 12_F_dark_mode_login.png, 26_E_mobile_dark_login.png
- **Affected**: `styles.css`
- **Problem**: In dark mode, the login form card has a very subtle background distinction from the page background. The card appears as slightly lighter than the background but the contrast ratio between them is low. The input fields have white/light backgrounds which look jarring against the dark card. The "geopoint" logo is barely visible against the dark header area.
- **Fix**: Increase the card surface contrast against the page background. Use `var(--color-surface)` or `var(--color-surface-alt)` with more distinction. Consider giving input fields a dark background with light text in dark mode. Ensure the logo has sufficient contrast.
- **Status**: OPEN
- **Commit**: --

---

## Issue #10 — MEDIUM: Project canvas shows blank white area — sketch data not rendering
- **Severity**: MEDIUM
- **Type**: bug
- **Screenshot**: 09_C_project_canvas_view.png, 10_C_sketch_side_panel.png
- **Affected**: `src/legacy/main.js`, `src/project/project-canvas-state.js`
- **Problem**: After opening the me_rakat project canvas (which shows 110 nodes, 58 edges, 13 sketches in the side panel), the main canvas area is completely blank/white. No nodes or edges are rendered. The side panel shows sketch data with issue counts and km values, confirming sketches have data. The `_contrastMul` error (Issue #1) is likely preventing the render loop from completing, causing the blank canvas.
- **Fix**: Fixing Issue #1 (_contrastMul) should resolve this. After fix, verify the project canvas renders all background sketch nodes and edges correctly.
- **Status**: OPEN (blocked by Issue #1)
- **Commit**: --

---

## Issue #11 — LOW: Edge legend color blocks too small / positioned awkwardly
- **Severity**: LOW
- **Type**: visual-design
- **Screenshot**: 04_A_after_login.png, 19_E_mobile_home_panel.png
- **Affected**: `styles.css`, `src/legacy/main.js`
- **Problem**: The edge type legend at the top-right shows three small colored squares with Hebrew text ("main line", "drainage line", "secondary line"). The colored squares are very small (approximately 10x10px), making them hard to distinguish on mobile. On mobile, the legend overlaps with the edge of the toolbar area. The text labels in the legend lack proper formatting.
- **Fix**: Increase the color indicator size to at least 16x16px. Add proper spacing between legend items. Consider moving the legend to an overlay that can be toggled rather than always visible.
- **Status**: OPEN
- **Commit**: --

---

## Issue #12 — LOW: Mobile admin page shows header without project context
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 24_E_mobile_admin.png
- **Affected**: `styles.css`
- **Problem**: The mobile admin page (projects overview) displays the standard app header with hamburger and "Manhole Mapper geopoint" brand. The projects list shows properly with project cards, sketch counts, action buttons (edit, settings, layers, delete). The layout is functional but the action icon buttons (trash, layers, settings, edit) at the bottom of each project card could benefit from labels or tooltips — they are icon-only and may be unclear to infrequent users.
- **Fix**: Add subtle text labels below the icon buttons or use tooltip on long-press for mobile.
- **Status**: OPEN
- **Commit**: --

---

## Issue #13 — LOW: Projects management page — "Assign all" orphan sketches warning UI is unclear
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 25_E_mobile_projects.png
- **Affected**: `src/admin/admin-panel.js`, `styles.css`
- **Problem**: At the bottom of the projects management page, there is a yellow warning bar showing "6 sketches without project" with a dropdown to select a target project and an "Assign All" button. The dropdown and button are cramped on mobile. The UI does not explain what happens when "Assign All" is clicked (do they get moved? What if they belong to other users?).
- **Fix**: Add a brief description or confirmation step. Improve the layout to give the dropdown more width on mobile.
- **Status**: OPEN
- **Commit**: --

---

## Issue #14 — LOW: Desktop command menu / "More" button not visible at 1280px
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 06_B_canvas_view.png (no menu visible)
- **Affected**: `styles.css`, `src/menu/command-menu.js`
- **Problem**: At 1280x800 viewport, the desktop command menu / "More" button (`#exportMenuBtn`) is not visible because the entire header is hidden (related to Issue #3). At 1440x900, the command menu is accessible. The header actions (export, import, coordinates, etc.) are completely inaccessible at 1280px.
- **Fix**: Resolve Issue #3. Additionally, ensure the hamburger menu is available as a fallback at viewports where the header is hidden, even on desktop.
- **Status**: OPEN (related to Issue #3)
- **Commit**: --

---

## Issue #15 — LOW: Sketch side panel items lack visual distinction for active sketch
- **Severity**: LOW
- **Type**: visual-design
- **Screenshot**: 09_C_project_canvas_view.png
- **Affected**: `src/project/sketch-side-panel.js`, `styles.css`
- **Problem**: In the sketch side panel, the active sketch (first item, shown with a "person" icon) has a subtle highlight. However, all sketch items look very similar — they all show issue count badges (orange warning triangles with numbers), km values, and visibility eye icons. There is no clear differentiation between the active sketch and background sketches. The item that has the person icon and "km" text appears to be the active one but this is not immediately obvious.
- **Fix**: Give the active sketch item a more prominent background color, border, or "active" indicator. Use color coding or layout differences to clearly distinguish active from background sketches.
- **Status**: OPEN
- **Commit**: --

---

## Issue #16 — LOW: Dark mode canvas grid lines may have insufficient contrast
- **Severity**: LOW
- **Type**: visual-design
- **Screenshot**: 15_F_dark_mode_canvas.png, 28_E_mobile_dark_canvas.png
- **Affected**: `src/legacy/main.js` (drawInfiniteGrid), `styles.css`
- **Problem**: In dark mode, the canvas grid lines are very faintly visible. While the overall dark mode color scheme looks good for the chrome/UI elements, the actual drawing canvas grid lines are extremely subtle. For a field survey application where precision matters, the grid should be more visible.
- **Fix**: Increase grid line opacity/contrast in dark mode. Use `var(--color-border)` or similar token for grid lines to ensure they adapt properly.
- **Status**: OPEN
- **Commit**: --

---

## Console Errors Summary

1. **`Uncaught ReferenceError: _contrastMul is not defined`** (CRITICAL) — Occurs on project canvas pages (`/#/project/*`). Blocks canvas rendering. See Issue #1.

---

## Positive Observations

1. **Login page** — Clean, well-structured, proper RTL layout. The geopoint branding is clear. Language toggle (English) accessible at the bottom. Dark mode version also looks good overall.
2. **Mobile layout** — The app properly adapts to mobile with a hamburger menu, mobile-optimized header, and touch-sized toolbar buttons. The collapsible menu groups are a good pattern.
3. **Cockpit layout** — The right-side cockpit panel concept (health %, sync, shift stats) is useful gamification for field workers. The progress ring and streak counter are motivating UI elements.
4. **Dark mode support** — Dark mode is implemented across all screens (login, canvas, admin). The color palette is generally well-chosen with good distinction between backgrounds.
5. **RTL support** — Hebrew text renders correctly, menu slides from left, text alignment is right-to-left throughout. The RTL implementation appears thorough.
6. **Sketch side panel** — The project canvas side panel with sketch list, issue counts, and km stats is information-dense but well-organized. The expand/collapse pattern works well.
7. **Canvas toolbar** — Tool icons are clear and recognizable. The active tool highlighting (blue background) provides good feedback.

---

## Priority Fix Order

1. **CRITICAL**: Issue #1 (_contrastMul scope bug) — Blocks all project canvas functionality
2. **HIGH**: Issue #2 (i18n greeting key mismatch) — Users see raw key text
3. **HIGH**: Issue #3 (Header missing at 1280px) — Desktop users lose access to header actions
4. **HIGH**: Issue #4 (Dark mode legend visibility) — Readability issue in dark mode
5. **MEDIUM**: Issues #5-9 — UX improvements, contrast, mobile toolbar
6. **LOW**: Issues #11-16 — Visual polish, minor UX

---

## Statistics

| Category | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 6 |
| **Total** | **16** |

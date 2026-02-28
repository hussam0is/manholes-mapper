# Audit 04: Node Edit Panel / Properties Drawer

**Date**: 2026-03-01
**Viewport**: Mobile landscape 812x375
**URL**: https://manholes-mapper-git-dev-hussam0is-projects.vercel.app

---

## Issues Found

### Issue #1 -- Drag Handle Not Hidden in Landscape (HIGH)
- **Severity**: HIGH
- **Type**: bug
- **Affected**: `styles.css` line 11417
- **Problem**: The landscape media query hides `.drawer-handle` but the actual DOM element has class `.sidebar-drag-handle`. The drag handle remained visible in landscape mode, wasting vertical space in an already constrained side panel.
- **Fix**: Added `.sidebar-drag-handle` to the CSS rule alongside `.drawer-handle`.
- **Status**: FIXED

### Issue #2 -- Sidebar Close Button Below Touch Target Minimum (HIGH)
- **Severity**: HIGH
- **Type**: accessibility / UX
- **Affected**: `styles.css` line 2241
- **Problem**: `#sidebarCloseBtn` was 36x36px, which is below the 44px minimum touch target required for mobile usability.
- **Fix**: Increased to 44x44px with `min-width`/`min-height` enforcement.
- **Status**: FIXED

### Issue #3 -- Resizable Drawer JS Fights Landscape Side-Panel Layout (CRITICAL)
- **Severity**: CRITICAL
- **Type**: bug
- **Affected**: `src/utils/resizable-drawer.js`
- **Problem**: The resizable drawer JS sets inline `height` and `maxHeight` styles on the sidebar based on portrait bottom-sheet behavior. In landscape mode, the drawer is a CSS side panel (full viewport height). The JS inline styles override the CSS, causing the side panel to have incorrect height constraints (e.g., a saved 40vh bottom sheet height applied to a side panel).
- **Fix**: Added `isLandscapeSidePanel()` detection function. When in landscape mode: (a) `startResize()` is no-op, (b) the MutationObserver clears inline height styles, (c) the window resize handler clears inline height styles.
- **Status**: FIXED

### Issue #4 -- Details Container Max-Height Too Restrictive in Landscape (HIGH)
- **Severity**: HIGH
- **Type**: UX
- **Affected**: `styles.css` (768px media query, line 9455)
- **Problem**: `#detailsContainer` had `max-height: calc(60vh - 100px)`. At 375px viewport height, this calculates to 125px -- barely enough to show one field. Node panels with survey data and connected edges become nearly impossible to scroll through.
- **Fix**: Added `max-height: none` override in the landscape media query block. Also added compact spacing rules for all panel elements (labels, inputs, wizard tabs, sections) to maximize usable content area.
- **Status**: FIXED

### Issue #5 -- Wizard Tab Styles Use Hardcoded Hex Colors (MEDIUM)
- **Severity**: MEDIUM
- **Type**: design tokens
- **Affected**: `styles.css` lines 2701-2765
- **Problem**: `.wizard-field-area` used `#fafafa` background, `.wizard-field-input` used `#ddd` border and `white` background, dark mode overrides used `#1e1e1e`, `#333`, `#2d2d2d`, `#444` instead of design tokens.
- **Fix**: Replaced all hardcoded values with CSS custom properties: `var(--color-bg)`, `var(--color-border)`, `var(--color-surface)`, `var(--color-text)`, `var(--color-surface-alt)`.
- **Status**: FIXED

### Issue #6 -- Drag Handle Bar Hardcoded Colors (LOW)
- **Severity**: LOW
- **Type**: design tokens
- **Affected**: `styles.css` line 2213
- **Problem**: `.drag-handle-bar` used `#cbd5e1` and hover state `#94a3b8` -- hardcoded slate colors.
- **Fix**: Changed to `var(--color-text-secondary)` with opacity control for better dark mode compatibility.
- **Status**: FIXED

---

## Landscape Side-Panel Compact Layout

Added comprehensive compact styles for the landscape drawer at `@media (max-height: 450px) and (max-width: 900px) and (orientation: landscape)`:
- Sidebar header: smaller padding, 0.85rem title
- Details sections: 0.35rem padding, 0.35rem margin
- Labels: 0.75rem font-size
- Inputs/selects: 0.8rem font-size, 36px min-height
- Wizard tabs: 36x36px (down from 44px) with 8px border-radius
- Wizard field area: 6px padding
- Two-col grid: 0.3rem gaps

---

## Files Modified

1. `styles.css` -- CSS fixes (issues 1, 2, 4, 5, 6, landscape compact layout)
2. `src/utils/resizable-drawer.js` -- Landscape side-panel guard (issue 3)
3. `public/service-worker.js` -- APP_VERSION bump v67 -> v68

## Test Results

All 771 tests pass (24 test files, 0 failures).

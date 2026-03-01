# Design Audit 03 -- Canvas Toolbar & Drawing Modes (Landscape 812x375)

**Date**: 2026-03-01
**URL**: https://manholes-mapper.vercel.app (prod, code from dev branch)
**Viewport**: 812x375 (mobile landscape)
**Focus**: Canvas toolbar, drawing modes, zoom, undo/redo, FAB speed dial, header auto-hide, edge legend

---

## Issue #1 -- `.btn-icon-sm` base class is 28px (needs 44px touch target)
- **Severity**: CRITICAL
- **Type**: touch-target / accessibility
- **Screenshot**: toolbar_audit_03_canvas_view.png
- **Affected**: `styles.css` line 1097
- **Problem**: The `.btn-icon-sm` base class defines `width: 28px; height: 28px; min-width: 28px; min-height: 28px;`. This is well below the 44dp minimum touch target required for mobile. While there are `@media` overrides at `max-width: 600px` and `max-height: 450px` that set `min-width/min-height` to `var(--touch-target-min)`, the base class itself should be 44px to avoid any breakpoint gaps.
- **Fix**: Change `.btn-icon-sm` base class to 44px width/height/min-width/min-height. Remove the redundant media query overrides.
- **Status**: FIXED
- **Commit**: 94aa230

## Issue #2 -- Toolbar buttons use `content-box` sizing with 5px padding
- **Severity**: HIGH
- **Type**: box-sizing inconsistency
- **Screenshot**: toolbar_audit_data.json
- **Affected**: `styles.css` line 11366
- **Problem**: In landscape, toolbar buttons measure 44x54px (content + 5px padding) but use `box-sizing: content-box`. The landscape override at line 11373 says `box-sizing: border-box` but the measured padding of 5px plus 36px min-height gives a rendered 54px height (not 44px). The `content-box` on production buttons means the 44px width is actually the content area, with padding adding on top, making the total clickable area 54px tall and 54px wide. This wastes vertical space (60px toolbar height in a 375px viewport -- 16% of screen).
- **Fix**: Standardize to `box-sizing: border-box` for all canvas toolbar buttons. Set explicit `width: 44px; height: 44px` with padding included. This brings the toolbar to ~48px total height (44px buttons + 4px container padding), saving 12px of vertical space.
- **Status**: FIXED
- **Commit**: 94aa230

## Issue #3 -- FAB sub-items are 36px in landscape (below 44px minimum)
- **Severity**: HIGH
- **Type**: touch-target
- **Screenshot**: toolbar_audit_06_fab_expanded.png
- **Affected**: `styles.css` line 11409
- **Problem**: `.canvas-fab-toolbar__item` in the landscape media query is `width: 36px; height: 36px`. When expanded, these are the primary recenter/zoom-to-fit buttons. At 36px they are below the 44dp minimum touch target. Additionally, the base `.canvas-fab-toolbar__item` at line 1889 correctly defines 44x44px, but the landscape override reduces it.
- **Fix**: Keep FAB sub-items at 44px even in landscape. If space is a concern, keep visual size at 36px but ensure the touch target (via padding or min-width/min-height) is 44px.
- **Status**: FIXED
- **Commit**: 94aa230

## Issue #4 -- FAB toggle button is 40px in landscape (below 48px standard)
- **Severity**: MEDIUM
- **Type**: touch-target
- **Screenshot**: toolbar_audit_06_fab_expanded.png
- **Affected**: `styles.css` line 11404
- **Problem**: `.canvas-fab-toolbar__toggle` is reduced from 48px to 40px in landscape. While 40px is close to the 44dp minimum, it's below the standard FAB size. The toggle is the primary action button for the speed dial.
- **Fix**: Set to 44px minimum in landscape. The visual can remain compact but the touch target must be 44px.
- **Status**: FIXED
- **Commit**: 94aa230

## Issue #5 -- Edge legend overlaps with toolbar area
- **Severity**: HIGH
- **Type**: layout / overlap
- **Screenshot**: toolbar_audit_03_canvas_view.png
- **Affected**: `styles.css` lines 1788, 11384
- **Problem**: Data confirms `legendToolbarOverlap: true`. The edge legend (positioned `top: calc(--header-h + 42px)` in landscape, left: 4px) overlaps the toolbar row. In the screenshot, the legend text "Hebrew labels" is positioned at y=42 while the toolbar extends to y=64. The legend is behind/under the dark toolbar background.
- **Fix**: Move the edge legend below the toolbar. In landscape, set `top: calc(var(--header-h, 36px) + 48px)` to clear the toolbar. Also consider `inset-inline-start` instead of `left`.
- **Status**: FIXED
- **Commit**: 94aa230

## Issue #6 -- Header recall handle is 24px tall (too small for reliable touch)
- **Severity**: MEDIUM
- **Type**: touch-target
- **Screenshot**: toolbar_audit_data.json (recallHandle height: 19px rendered)
- **Affected**: `styles.css` line 11432
- **Problem**: The header recall handle (chevron strip at top) is defined as 24px height but measures only 19px on screen. This thin strip is the only way to bring back the auto-hidden header in landscape. It's below the 44dp minimum and hard to tap, especially on real phones.
- **Fix**: Increase recall handle height to 32px (visual), with a 44px touch target zone via padding-bottom.
- **Status**: FIXED
- **Commit**: 94aa230

## Issue #7 -- FAB sub-items visible at 14x14px when collapsed (visual bleeding)
- **Severity**: LOW
- **Type**: visual bug
- **Screenshot**: toolbar_audit_data.json (fabItems collapsed: 14x14px visible)
- **Affected**: `styles.css` line 1935
- **Problem**: When the FAB is collapsed, the sub-items (recenterDensityBtn, recenterBtn, zoomToFitBtn) show at 14x14px instead of being fully hidden. The `transform: scale(0.4)` brings them down to 40% of their 36px size = ~14px, with `opacity: 0` they should be invisible, but they register as having dimensions. This could cause accidental tap targets near the FAB.
- **Fix**: Add `pointer-events: none; visibility: hidden;` to collapsed sub-items, or ensure `max-width: 0; overflow: hidden` on the actions container fully clips them.
- **Status**: FIXED (already applied in commit 3d9deab — `.canvas-fab-toolbar:not(.open) .canvas-fab-toolbar__item` has `pointer-events: none; visibility: hidden`)
- **Commit**: 3d9deab

## Issue #8 -- Canvas toolbar uses hardcoded hex colors instead of design tokens
- **Severity**: MEDIUM
- **Type**: design-token compliance
- **Screenshot**: N/A
- **Affected**: `styles.css` lines 1246, 1272, 1288, 1894
- **Problem**: Several toolbar rules use hardcoded colors: `rgba(0,0,0,0.85)`, `#f9fafb`, `#fff`. While these are overlay-specific (dark translucent backgrounds), the text color `#f9fafb` should be a token, and the dark backgrounds should use token-based opacity.
- **Fix**: Replace `color: #f9fafb` with `color: var(--color-text-bright, #f9fafb)` and `color: #fff` with `color: var(--color-text-on-primary, #fff)`. Use `rgba(var(--color-bg-rgb, 0,0,0), 0.85)` where possible.
- **Status**: FIXED
- **Commit**: 94aa230

---

## Verification Results (local Vite dev server)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `.btn-icon-sm` width | >= 44px | 44px | PASS |
| `.btn-icon-sm` height | >= 44px | 44px | PASS |
| `.btn-icon-sm` box-sizing | border-box | border-box | PASS |
| Toolbar button min-width | >= 44px | 44px | PASS |
| Toolbar button box-sizing | border-box | border-box | PASS |
| FAB toggle width | >= 44px | 44px | PASS |
| FAB toggle height | >= 44px | 44px | PASS |
| FAB item width (collapsed) | 44px | 44px | PASS |
| FAB item visibility (collapsed) | hidden | hidden | PASS |
| FAB item pointer-events (collapsed) | none | none | PASS |
| Recall handle total touch height | >= 44px | 44px (28+16) | PASS |
| Edge legend top offset | +48px | +48px | PASS |

**All 12 checks passed.**

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 3     |
| MEDIUM   | 3     |
| LOW      | 1     |

**Total**: 8 issues

### Priority Fix Order
1. Issue #1 (CRITICAL) -- `.btn-icon-sm` base class 28px -> 44px
2. Issue #2 (HIGH) -- box-sizing consistency, reduce toolbar height
3. Issue #3 (HIGH) -- FAB sub-items 36px -> 44px touch target
4. Issue #5 (HIGH) -- Edge legend overlap
5. Issue #4 (MEDIUM) -- FAB toggle 40px -> 44px
6. Issue #6 (MEDIUM) -- Recall handle too small
7. Issue #8 (MEDIUM) -- Hardcoded hex colors
8. Issue #7 (LOW) -- FAB collapsed items visual bleed

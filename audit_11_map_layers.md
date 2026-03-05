# Design Audit #11 -- Map Layers, Tile View, and Street View UI

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**URL**: https://manholes-mapper.vercel.app (production)
**Focus**: Map layer toggle controls, Street View pegman, tile loading, zoom controls, reference layer toggles, layer opacity/visibility

---

## Issues Found

### Issue #1 -- Layers Config Button Below 44px Touch Target
- **Severity**: HIGH
- **Type**: touch-target
- **Measured**: 40x40px (needs 44x44px minimum)
- **Affected**: `styles.css` (.layers-config-btn)
- **Problem**: The layers config button on the canvas is 40x40px, below the 44px minimum for mobile touch targets. On landscape mobile this is hard to tap accurately.
- **Fix**: Increase min-width and min-height to 44px. Apply same to mobile breakpoint (currently 36x36px which is even worse).
- **Status**: FIXED -- `.layers-config-btn` now has `width: 44px; height: 44px; min-width: 44px; min-height: 44px` in base rule and all media queries.

### Issue #2 -- Layers Config Panel Toggle Row Too Short
- **Severity**: HIGH
- **Type**: touch-target
- **Measured**: Toggle row "Map Layer" is 244x30px (height 30px, needs 44px)
- **Affected**: `styles.css` (.layers-config-panel__toggle)
- **Problem**: The toggle rows inside the layers config panel have a height of only 30px. Users will misclick on adjacent toggles.
- **Fix**: Set min-height: 44px on `.layers-config-panel__toggle` and increase padding.
- **Status**: FIXED -- `.layers-config-panel__toggle` has `min-height: 44px`.

### Issue #3 -- Layers Panel Checkbox 16x16px (Too Small)
- **Severity**: HIGH
- **Type**: touch-target
- **Measured**: Checkboxes are 16x16px
- **Affected**: `styles.css` (.layers-config-panel__toggle input[type="checkbox"], .layers-config-panel__header-toggle input[type="checkbox"])
- **Problem**: 16px checkboxes are extremely difficult to tap on mobile. The entire label row acts as a touch target, but visually the checkbox is tiny.
- **Fix**: Increase checkbox to at least 20x20px, add padding around checkbox area to expand the touch zone.
- **Status**: FIXED -- Both `.layers-config-panel__toggle input[type="checkbox"]` and `.layers-config-panel__header-toggle input[type="checkbox"]` now have `width: 20px; height: 20px; min-width: 20px; min-height: 20px` with padding and cursor pointer.

### Issue #4 -- Street View Pegman Uses Hardcoded Colors
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `styles.css` (.street-view-pegman__icon, .street-view-pegman-ghost, .street-view-drop-indicator)
- **Problem**: The pegman icon color is hardcoded as `#f9ab00` and hover as `#e69500`. The label background is `rgba(0, 0, 0, 0.6)` and text is `#fff`. These don't use CSS custom properties and won't adapt to dark mode or theme changes.
- **Fix**: Define `--color-streetview` CSS custom property or use existing accent tokens. The pegman is a Google-branded color so this may be intentional, but the label/background should at least use surface tokens.
- **Status**: FIXED -- `--color-streetview` and `--color-streetview-hover` custom properties defined in `:root`. Icon uses `var(--color-streetview, #f9ab00)`. Label uses `var(--color-surface, #fff)` for text and `var(--color-text-overlay, rgba(0,0,0,0.6))` for background. Ghost icon also uses the token.

### Issue #5 -- Pegman Touch Target Only 28x28px
- **Severity**: HIGH
- **Type**: touch-target
- **Measured**: 28x28px in landscape viewport (font-size: 28px icon only)
- **Affected**: `styles.css` (.street-view-pegman), `src/map/street-view.js`
- **Problem**: The pegman widget is a drag-to-use control that measures only 28x28px in landscape. Users must precisely grab a 28px target to initiate a drag. Below the 44px minimum.
- **Fix**: Add padding or wrapper with min-width/min-height 44px. The icon can remain small but the touch area must be larger.
- **Status**: FIXED -- `.street-view-pegman` has `min-width: 44px; min-height: 44px; justify-content: center` so the container meets 44px minimum even when the icon is smaller.

### Issue #6 -- Edge Legend Uses `left` Instead of `inset-inline-start` (RTL)
- **Severity**: MEDIUM
- **Type**: rtl
- **Affected**: `styles.css` (.edge-legend at line 1789)
- **Problem**: The base `.edge-legend` rule uses `left: 12px; right: auto;` which is LTR-specific. In RTL mode (Hebrew default), the legend stays on the physical left side instead of the logical start side. The landscape media query at line 11836 correctly uses `inset-inline-start: 4px` but the base rule does not.
- **Fix**: Replace `left: 12px; right: auto;` with `inset-inline-start: 12px;` in the base `.edge-legend` rule.
- **Status**: FIXED -- Base `.edge-legend` rule now uses `inset-inline-start: 12px` instead of `left: 12px`. All breakpoints consistently use `inset-inline-start`.

### Issue #7 -- Map Attribution Text Hardcoded Colors (Dark Mode)
- **Severity**: MEDIUM
- **Type**: dark-mode / design-tokens
- **Affected**: `src/map/govmap-layer.js` (drawMapAttribution function, lines 312-316)
- **Problem**: The map attribution text uses hardcoded `#333` for text and `rgba(255, 255, 255, 0.7)` for background. In dark mode these colors will be incorrect -- white text on near-white background or dark text invisible on dark canvas.
- **Fix**: Read CSS custom properties via `getComputedStyle(document.documentElement)` for `--color-text` and `--color-surface` to adapt to the current theme.
- **Status**: FIXED -- `drawMapAttribution()` now reads `--color-surface` and `--color-text-secondary` via `getComputedStyle(document.documentElement)` with fallbacks. Background uses `globalAlpha: 0.8` over the surface color.

### Issue #8 -- Reference Layer Label Colors Hardcoded
- **Severity**: LOW
- **Type**: design-tokens
- **Affected**: `src/map/reference-layers.js` (DEFAULT_STYLES, lines 36-82; drawLabels function, line 646)
- **Problem**: All reference layer label colors (e.g., `#0064c8`, `#b43c14`, `#3c8c3c`, `#555`, `#965096`) and label background `rgba(255, 255, 255, 0.7)` are hardcoded. These are drawn on the canvas and won't adapt to dark mode.
- **Fix**: For canvas-drawn text, read the current theme's text and surface colors. Or keep the hardcoded palette but adjust the label background for dark mode.
- **Status**: FIXED -- Each layer type in `DEFAULT_STYLES` now has a `labelColorDark` variant (brighter, high-contrast colors for dark backgrounds). `drawLabels()` uses `window.matchMedia('(prefers-color-scheme: dark)')` to select the appropriate label color and background per mode.

### Issue #9 -- Layers Config Panel Not Adapted for Landscape
- **Severity**: MEDIUM
- **Type**: layout
- **Affected**: `styles.css` (.layers-config-panel)
- **Problem**: The layers config panel is positioned at `top: 100px; left: 60px;` absolutely, with `max-height: 70vh`. In 375px height landscape, 70vh = 262px. The panel at top 100px + 262px = 362px, nearly the full height. The panel might overflow or be cut off. There's no landscape-specific media query for this panel.
- **Fix**: Add landscape media query to reposition the panel and reduce top offset. Consider `max-height: calc(100vh - 100px - 8px)` or similar.
- **Status**: FIXED -- Landscape media query `(max-height: 450px) and (orientation: landscape)` repositions the panel with `top: calc(var(--header-h, 36px) + 48px)` and `max-height: calc(100vh - var(--header-h, 36px) - 56px)`.

### Issue #10 -- Pegman and Layers Btn Use Physical `left` for RTL
- **Severity**: MEDIUM
- **Type**: rtl
- **Affected**: `styles.css` (.street-view-pegman, .layers-config-btn)
- **Problem**: Both `.street-view-pegman` (`left: 12px`) and `.layers-config-btn` (`left: 12px`) use physical `left` positioning instead of `inset-inline-start`. In RTL mode they stay on the physical left instead of the logical start. For a Hebrew RTL app, the pegman and layers button should be on the right side of the canvas.
- **Fix**: Replace `left` with `inset-inline-start` for both elements.
- **Status**: FIXED -- Both `.street-view-pegman` and `.layers-config-btn` use `inset-inline-start` in base rules and all media queries.

### Issue #11 -- Layers Config Panel Close Button Below Touch Target
- **Severity**: MEDIUM
- **Type**: touch-target
- **Affected**: `styles.css` (.layers-config-panel__close)
- **Problem**: The close button in the layers panel has padding of only 4px. The close icon is 18px. Total touch area is approximately 26x26px.
- **Fix**: Increase padding to at least 8px or set min-width/min-height to 44px.
- **Status**: FIXED -- `.layers-config-panel__close` has `padding: var(--space-3, 12px); min-width: 44px; min-height: 44px` with flexbox centering.

### Issue #12 -- Mobile Menu Map Type Select Row Not Tall Enough
- **Severity**: MEDIUM
- **Type**: touch-target
- **Affected**: `styles.css` (.mobile-menu__select-row), `index.html` (#mobileMapTypeControls)
- **Problem**: The map type dropdown row in the hamburger menu may have insufficient height for easy touch interaction.
- **Fix**: Ensure min-height: 44px on `.mobile-menu__select-row` items.
- **Status**: FIXED -- `.mobile-menu__select-row` in `src/menu/menu.css` has `min-height: 44px; padding: 0.75rem 1rem`.

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| HIGH | 4 | 4 |
| MEDIUM | 6 | 6 |
| LOW | 2 | 2 |
| **Total** | **12** | **12** |

All 12 issues have been resolved.

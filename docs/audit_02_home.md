# Design Audit: Home Page / Sketch List — Mobile Landscape 812x375

**Date**: 2026-03-01
**URL**: https://manholes-mapper-git-dev-hussam0is-projects.vercel.app
**Viewport**: 812x375 (mobile landscape)
**Focus**: Sketch list layout, touch targets, RTL, dark mode, card actions

---

## Issue #1 -- Close Button Below 44dp Touch Target in Landscape
- **Severity**: HIGH
- **Type**: touch-target
- **Affected**: `styles.css` lines 11520-11523 and 7873-7876
- **Problem**: At `max-height: 450px` (landscape), `.home-panel-close` is 28x28px. At `max-height: 500px`, it is 32x32px. Both violate the 44dp minimum for touch targets. Users will struggle to tap the close button on mobile devices in landscape orientation.
- **Fix**: Increase close button to minimum 44x44px in all viewport sizes. Use visual size + padding approach if needed for aesthetics.
- **Status**: FIXED (pre-existing) — close button is 44x44px in base styles, max-height:500px, max-height:450px landscape, and touch-target media queries

## Issue #2 -- Sketch Card Action Buttons Too Small in Landscape
- **Severity**: HIGH
- **Type**: touch-target
- **Affected**: `styles.css` line 11563-11566
- **Problem**: In landscape (`max-height: 450px`), `.sketch-action-btn` has `padding: 0.3rem 0.5rem` and `font-size: 0.75rem`, resulting in buttons approximately 24-28px tall. Five action buttons per card (Open, Change Project, Duplicate, Import Values, Delete) create both touch-target violations and horizontal overflow risk.
- **Fix**: Increase minimum height to 44px for action buttons in landscape. Collapse less-used actions (Change Project, Duplicate, Import Values) behind a "more" overflow menu to reduce clutter.
- **Status**: FIXED (44f9560) — added `min-height: 44px` to max-width:480px and max-height:500px breakpoints; updated touch-target query to use `var(--touch-target-min)` instead of hardcoded 36px

## Issue #3 -- Hardcoded Hex Color in Action Button Hover
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `styles.css` line 7697
- **Problem**: `.sketch-action-btn:hover` uses hardcoded `background: #e2e8f0` instead of a CSS custom property. This breaks the design token system and will look wrong in dark mode.
- **Fix**: Replace `#e2e8f0` with `var(--color-bg)` or a new hover token.
- **Status**: FIXED (44f9560) — light mode hover already used `var(--color-bg-hover)`. Dark mode hover/border/danger colors replaced: `#475569` -> `var(--color-border-dark)`, `#2563eb` -> `var(--color-accent)`, `#991b1b` -> `var(--color-error-border)`, `#dc2626` -> `var(--color-danger-hover)`

## Issue #4 -- Sketch Card Stats Row Uses Hardcoded RTL Direction
- **Severity**: LOW
- **Type**: rtl
- **Affected**: `styles.css` lines 7644-7646 and 7657-7659
- **Problem**: `.sketch-card-stats` and `.sketch-stat` use `[dir="rtl"]` selectors with `flex-direction: row-reverse`. While this works, it adds unnecessary CSS and may interfere with natural RTL flow.
- **Fix**: Remove the explicit `row-reverse` for `[dir="rtl"]` as flex containers already respect `direction` in modern browsers. Or keep if the visual order genuinely needs reversing.
- **Status**: FIXED (44f9560) — removed both `[dir="rtl"] .sketch-card-stats` and `[dir="rtl"] .sketch-stat` row-reverse overrides; flex layout respects `direction` natively

## Issue #5 -- Sync Status Text Too Small in Landscape (0.65rem)
- **Severity**: LOW
- **Type**: readability
- **Affected**: `styles.css` line 11531
- **Problem**: `.home-panel-sync-status` font-size is 0.65rem (~10.4px) in landscape. This is below the minimum recommended 12px for readable text.
- **Fix**: Increase to `0.75rem` minimum.
- **Status**: FIXED (44f9560) — increased from 0.7rem to 0.75rem in max-height:500px query; max-height:450px landscape already had 0.75rem

## Issue #6 -- Sketch Card Action Button Labels Hidden on Small Screens
- **Severity**: LOW
- **Type**: ux
- **Affected**: `styles.css` lines 7835-7841 (max-width: 480px)
- **Problem**: At 480px width, action button text labels are hidden except for the primary action. But in landscape (812px wide), all labels show, creating 5 text-labeled buttons that overflow the card. The landscape media query does not hide labels.
- **Fix**: In landscape `max-height: 450px`, hide non-primary action button labels (show only icons) to save horizontal space. Or collapse into overflow menu.
- **Status**: FIXED (pre-existing) — landscape max-height:450px query already hides non-primary button labels via `.sketch-action-btn span:not(.material-icons) { display: none }` with primary exception

## Issue #7 -- Delete Button Only Has Icon, No Visible Label Distinction
- **Severity**: LOW
- **Type**: ux / destructive-action
- **Affected**: `src/legacy/main.js` lines 2715-2717
- **Problem**: The delete button is styled as `sketch-action-danger` with only an icon (no text label), but it does not have any confirmation dialog visible in the flow. On mobile in landscape, the small icon-only button could be accidentally tapped.
- **Fix**: Ensure delete action requires confirmation dialog. The button itself is acceptable as icon-only if confirmation exists.
- **Status**: FIXED (pre-existing) — delete action at line 7608 calls `confirm(t('confirms.deleteSketch'))` before proceeding with deletion

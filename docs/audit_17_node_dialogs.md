# Audit 17 -- Node Creation, Type Selection, and Node Details Dialogs

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Focus**: Node type selection, wizard tabs, node details panel, survey node type dialog, dark mode, RTL, touch targets, design tokens

---

## Issues Found

### Issue #1 -- Survey Node Type Dialog: Hardcoded Colors (No Design Tokens)
- **Severity**: HIGH
- **Type**: design-tokens
- **File**: `src/survey/survey-node-type-dialog.js` (inline styles lines 23-122)
- **Problem**: The entire dialog uses hardcoded color values instead of CSS custom properties. `--surface` and `--on-surface` are non-standard tokens (should be `--color-surface` and `--color-text`). Hover uses `--surface-variant` (non-existent) and `--primary` (non-existent, should be `--color-primary`). `--outline` (non-existent) used for borders. The dialog will render with fallback colors in dark mode, breaking the visual design.
- **Fix**: Replace all inline CSS custom property references with the app's actual design tokens (`--color-surface`, `--color-text`, `--color-border`, `--color-primary`, `--color-surface-hover`). Move styles to `styles.css` for dark mode support.

### Issue #2 -- Survey Node Type Dialog: No Dark Mode Support
- **Severity**: HIGH
- **Type**: dark-mode
- **File**: `src/survey/survey-node-type-dialog.js` (inline styles)
- **Problem**: The dialog injects inline styles with no `@media (prefers-color-scheme: dark)` block. In dark mode, the dialog renders with white background (`#fff` fallback) and dark text (`#222` fallback), creating a glaring white popup against the dark app. The overlay also uses a fixed `rgba(0,0,0,0.5)` which is fine but the content panel doesn't adapt.
- **Fix**: Move styles to `styles.css` with proper dark mode overrides using design tokens.

### Issue #3 -- Survey Node Type Dialog: Touch Targets Below 44px
- **Severity**: HIGH
- **Type**: touch-targets
- **File**: `src/survey/survey-node-type-dialog.js` (line 76-87)
- **Problem**: `.survey-type-btn` has `padding: 16px 24px` and `min-width: 90px` but no explicit `min-height`. On small screens the buttons may be under 44px tall. The cancel button (`.survey-type-cancel`) has only `padding: 8px 24px` -- well under 44px height. The auto-connect checkbox is only `18px x 18px` (line 106-107).
- **Fix**: Add `min-height: var(--touch-target-min)` to all interactive elements. Increase checkbox to 24px.

### Issue #4 -- Survey Node Type Dialog: No Landscape Layout
- **Severity**: MEDIUM
- **Type**: layout
- **File**: `src/survey/survey-node-type-dialog.js`
- **Problem**: The dialog uses `min-width: 300px` and `max-width: 90vw` with no landscape-specific adjustments. In 812x375 landscape viewport, the dialog takes up too much vertical space. The type buttons stack vertically. There is no horizontal layout optimization for landscape.
- **Fix**: Add landscape-specific styles: reduce padding, use horizontal flex for type buttons with a row layout.

### Issue #5 -- Chip Status Indicators: Hardcoded Colors (No Design Tokens)
- **Severity**: MEDIUM
- **Type**: design-tokens
- **File**: `styles.css` (lines 2603-2623)
- **Problem**: `.chip` uses `background: #f5f5f5` (hardcoded). `.chip-ok` uses hardcoded `#e8f5e9`, `#1b5e20`, `#c8e6c9`. `.chip-warn` uses hardcoded `#fff3e0`, `#e65100`, `#ffe0b2`. None have dark mode overrides -- in dark mode these produce garish light-on-dark chips with wrong contrast.
- **Fix**: Use design tokens and add dark mode overrides.

### Issue #6 -- Wizard Accuracy Badge: Hardcoded Colors
- **Severity**: MEDIUM
- **Type**: design-tokens
- **File**: `styles.css` (lines 2626-2638)
- **Problem**: `.wizard-accuracy-badge` uses hardcoded `#E8F5E9`, `#2E7D32`, `#A5D6A7`. The dark mode override (line 2744-2748) exists but also uses hardcoded colors `#1B5E20`, `#A5D6A7`, `#388E3C` instead of design tokens.
- **Fix**: Use `var(--color-success)` derived values or at minimum ensure the hardcoded colors follow the design system palette.

### Issue #7 -- Node Icon Hardcoded Colors in Canvas Rendering
- **Severity**: LOW
- **Type**: design-tokens
- **File**: `src/features/node-icons.js` (lines 32-33, 37-38, 82-83, etc.)
- **Problem**: Several hardcoded color values: `rgba(0, 0, 0, 0.2)`, `rgba(0, 120, 200, 0.6)`, `#a855f7`, `#0ea5e9`, `#16a34a`, `#eab308`. While canvas rendering cannot use CSS variables directly, some of these (like `#a855f7` for ForLater fill) should reference the COLORS palette passed as a parameter rather than being inline.
- **Fix**: Accept through COLORS object where possible. The canvas context cannot use CSS vars, so this is LOW priority -- the existing COLORS system is the right pattern.

### Issue #8 -- Connected Edge Header Arrow Direction for RTL
- **Severity**: MEDIUM
- **Type**: RTL
- **File**: `src/legacy/main.js` (line 5402)
- **Problem**: The connected edge header shows `isRTL ? '←' : '→'` followed by the node ID. This correctly flips the arrow for RTL, but since the element is a flex container with `direction: ltr` implicit on the content, the layout may not properly right-align in RTL. The `.connected-edge-header` class has no explicit `direction` or text-alignment for RTL.
- **Fix**: Ensure `.connected-edge-header` respects RTL via `text-align: start` (already implicit with flex, but verify).

### Issue #9 -- Wizard Tab Inline Styles Override Dark Mode
- **Severity**: MEDIUM
- **Type**: dark-mode
- **File**: `src/legacy/main.js` (lines 5084-5088)
- **Problem**: `buildWizardTabsHTML` applies inline `style="--tab-color:${def.color};--tab-bg:${def.bg}"` using the WIZARD_TAB_DEFS which have light-mode specific colors (e.g. `#E3F2FD`, `#FFF3E0`, `#F3E5F5`). These inline styles survive dark mode because `--tab-bg` is set directly on the element. The dark mode CSS `.wizard-tab:not(.wizard-tab--active)` sets `background: var(--color-surface-alt)` with `!important` which should override, but the `--tab-bg` variable itself is still light-colored.
- **Fix**: Provide dark mode variants for tab definitions or use opacity-based approach. The existing `!important` override in dark mode (line 2766) handles the background, so the `--tab-bg` in light mode is acceptable. No change needed -- the existing system works correctly.

### Issue #10 -- Wizard Field Input Padding Inconsistency in Landscape
- **Severity**: LOW
- **Type**: layout
- **File**: `styles.css` (lines 11688-11692)
- **Problem**: In landscape, `.wizard-field-input` gets `padding: 6px 8px` (line 11689) and `min-height: var(--touch-target-min)` (line 11691), which is good. However the `font-size: 0.875rem` combined with the reduced padding makes the dropdown arrows hard to tap on the edges.
- **Fix**: This is acceptable. The 44px min-height ensures adequate touch target.

### Issue #11 -- Survey Node Type Dialog: No RTL Support
- **Severity**: HIGH
- **Type**: RTL
- **File**: `src/survey/survey-node-type-dialog.js`
- **Problem**: The dialog has `text-align: center` which works for both directions, but the coordinate display (`E ... N ... Z ...`) is always LTR which is correct for numeric coordinates. However, the dialog content has no `dir` attribute, so in an RTL page the button labels and descriptions will inherit RTL direction but the flexbox layout won't change. The auto-connect label `gap: 8px` positioning may misalign checkbox vs label in RTL.
- **Fix**: Add `dir` attribute awareness. The centered layout mostly works, but add explicit `text-align: start` for the description.

### Issue #12 -- Delete Node Button: Potential Accidental Tap
- **Severity**: LOW
- **Type**: UX
- **File**: `src/legacy/main.js` (line 5620)
- **Problem**: The delete button is sticky at the bottom of the drawer. On mobile landscape, the drawer is a narrow side panel (35vw max 280px). The delete button fills the full width, which is good for touch targets but dangerous for accidental taps. The existing ghost style (transparent bg, red border) helps mitigate this.
- **Fix**: Existing design is acceptable. The ghost style provides adequate visual distinction.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 4 |
| LOW | 3 |

**Priority fixes (HIGH):**
1. Survey Node Type Dialog: Move inline styles to styles.css with proper design tokens and dark mode (#1, #2)
2. Survey Node Type Dialog: Touch targets below 44px (#3)
3. Survey Node Type Dialog: RTL support (#11)
4. Chip status indicators: Dark mode + design tokens (#5)

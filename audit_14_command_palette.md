# Audit 14 -- Command Palette, Action Bar, and Menu System

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Files Reviewed**:
- `src/menu/command-menu.js`
- `src/menu/action-bar.js`
- `src/menu/header.js`
- `src/menu/menu-config.js`
- `src/menu/menu-events.js`
- `src/menu/menu.css`
- `styles.css` (menu-related sections)

---

## Issues Found

### Issue #1 -- CRITICAL: Hardcoded hex colors in dark mode (menu.css)
- **Severity**: CRITICAL
- **Type**: design-tokens
- **File**: `src/menu/menu.css` (lines 1611-1673)
- **Problem**: The dark mode override block in menu.css hardcodes hex values like `#1e293b`, `#334155`, `#475569`, `#e2e8f0`, `#93c5fd`, `#60a5fa` instead of referencing CSS design tokens (`var(--color-surface-alt)`, `var(--color-border)`, `var(--color-text)`, etc.). The `--menu-bg`, `--menu-border`, `--menu-shadow`, and button ghost colors all use raw hex. This is fragile and won't stay in sync if the global tokens change.
- **Fix**: Replace all hardcoded hex values with CSS custom property references (`var(--color-surface-alt)`, `var(--color-border)`, `var(--color-text)`, `var(--color-muted)`, `var(--color-accent)`).

### Issue #2 -- HIGH: Hardcoded hex hover colors in light mode (menu.css)
- **Severity**: HIGH
- **Type**: design-tokens
- **File**: `src/menu/menu.css` (multiple locations)
- **Problem**: Several hover/focus states use hardcoded `rgba()` with raw RGB values (e.g., `rgba(37, 99, 235, 0.08)`, `rgba(37, 99, 235, 0.12)`) instead of using the design token with alpha. The scrollbar colors also hardcode `rgba(37, 99, 235, 0.3)`. The `.menu-dropdown__header` uses `#ffffff` and a gradient with raw hex `#1d4ed8`.
- **Fix**: Replace raw rgba with token-based colors. Use `color-mix()` or token variables where possible.

### Issue #3 -- HIGH: Menu scale buttons too small for touch (menu.css)
- **Severity**: HIGH
- **Type**: touch-targets
- **File**: `src/menu/menu.css` (lines 1087-1093)
- **Problem**: `.menu-scale-btn` in the command dropdown is 24x24px -- far below the 44px minimum for touch targets. Field workers with gloves cannot reliably tap these.
- **Fix**: Increase to 32x32px minimum in the dropdown, and 44x44px in the mobile menu (already correct for mobile scale buttons at line 1504).

### Issue #4 -- HIGH: Command dropdown position not set dynamically
- **Severity**: HIGH
- **Type**: bug
- **File**: `src/menu/menu.css` (line 753-754), `src/menu/command-menu.js`
- **Problem**: The dropdown uses `position: fixed` but no top/left/right positioning is set. The comment says "Position will be set dynamically via JavaScript" but `initCommandMenu()` never sets any position. The dropdown likely appears at a default browser position, which in landscape may overlap the header or go offscreen. RTL positioning comment says "handled via JavaScript" but there's no JS for that.
- **Fix**: Add CSS-based positioning relative to the button using `top: 100%` and `inset-inline-end: 0` on the parent `.menu-group--command` (make it `position: relative`), or add proper position calculation in JS.

### Issue #5 -- MEDIUM: Mobile menu `margin-left: auto` instead of `margin-inline-start` (menu.css)
- **Severity**: MEDIUM
- **Type**: rtl
- **File**: `src/menu/menu.css` (lines 1491, 1548, 1568)
- **Problem**: `.mobile-menu__scale-adjuster`, `.mobile-menu__inline-select`, and `.mobile-menu__status` use `margin-left: auto` with a separate `[dir="rtl"]` override. This is the old pattern -- should use `margin-inline-start: auto` which handles both LTR and RTL natively.
- **Fix**: Replace `margin-left: auto` + RTL override with `margin-inline-start: auto` (single rule).

### Issue #6 -- MEDIUM: `.menu-dropdown__status` uses `margin-left/right` (menu.css)
- **Severity**: MEDIUM
- **Type**: rtl
- **File**: `src/menu/menu.css` (lines 1055-1063)
- **Problem**: `.menu-dropdown__status` uses `margin-left: auto` with a `[dir="rtl"]` override block using `margin-right: auto`. Should use `margin-inline-start: auto`.
- **Fix**: Replace with `margin-inline-start: auto` and remove the RTL override block.

### Issue #7 -- MEDIUM: Landscape header buttons below 44px touch targets (styles.css)
- **Severity**: MEDIUM
- **Type**: touch-targets
- **File**: `styles.css` (lines 11220-11224)
- **Problem**: In landscape mode (`max-height: 450px`), `.menu-btn--small` and `.menu-btn--icon-only` are set to `min-height: 28px; min-width: 28px`. This violates the 44dp minimum touch target. While the visual size can be compact, the touch area should be expanded via padding.
- **Fix**: Keep the 28px visual size but add padding to achieve 44px total touch area, or use the `::after` pseudo-element technique for an expanded hit area.

### Issue #8 -- MEDIUM: Dark mode misses several menu components (menu.css)
- **Severity**: MEDIUM
- **Type**: dark-mode
- **File**: `src/menu/menu.css` (lines 1609-1673)
- **Problem**: The dark mode block covers `.menu-brand__title-main`, `.menu-sketch-name`, `.menu-search__input`, `.menu-select`, `.menu-toggle`, `.mobile-menu__search`, `.mobile-menu__search-input`, `.mobile-menu__btn:hover`, `.menu-dropdown__item:hover` -- but misses:
  - `.menu-dropdown__group-header` text color (uses `--color-muted` which is fine)
  - `.menu-scale-btn` color/bg (stays dark-on-white in dark mode)
  - `.menu-scale-value` text color
  - `.mobile-menu__select` background/border
  - `.mobile-menu__toggle` colors
  - `.mobile-menu__group-header` text
  - `.menu-btn--command` gradient (uses raw rgba with blue)
  - `.mobile-menu__scale-btn` bg/border
- **Fix**: Add dark mode overrides for these missed components.

### Issue #9 -- MEDIUM: styles.css dark mode targets old class names for mobile menu
- **Severity**: MEDIUM
- **Type**: bug
- **File**: `styles.css` (lines 6316-6387)
- **Problem**: The dark mode section in `styles.css` targets `#mobileMenu .mobile-menu-header`, `.mobile-menu-close`, `.mobile-menu-content`, `.menu-group-label` etc. -- these are OLD class names. The new menu system (menu.css) uses BEM naming: `.mobile-menu__header`, `.mobile-menu__close`, `.mobile-menu__content`, `.mobile-menu__group-header`. The old selectors in styles.css won't match the new HTML generated by `header.js`, meaning dark mode styling for the mobile menu falls through to unstyled defaults.
- **Fix**: Update the dark mode selectors in styles.css to match the new BEM class names, or move all dark mode to menu.css.

### Issue #10 -- MEDIUM: RTL selectors in styles.css target old class names
- **Severity**: MEDIUM
- **Type**: rtl / bug
- **File**: `styles.css` (lines 486-512)
- **Problem**: The RTL support block targets `#mobileMenu .mobile-menu-header`, `#mobileMenu .btn`, `#mobileMenu .menu-group-label`, `#mobileMenu label`, `#mobileMenu select` -- but the new menu system renders `.mobile-menu__header`, `.mobile-menu__btn`, `.mobile-menu__group-header`, `.mobile-menu__toggle`, `.mobile-menu__select`. The old selectors may partially match (e.g. `#mobileMenu label` still works), but `.mobile-menu-header` and `.menu-group-label` won't match.
- **Fix**: Update the RTL selectors to match the new BEM class names.

### Issue #11 -- LOW: `ref-layer-name` uses old token name `--text-color` (menu.css)
- **Severity**: LOW
- **Type**: design-tokens
- **File**: `src/menu/menu.css` (line 1801)
- **Problem**: `.ref-layer-name` uses `color: var(--text-color, #333)` and `.ref-layer-count` uses `color: var(--text-secondary, #888)`. The app's token system uses `--color-text` and `--color-text-secondary`, not `--text-color` / `--text-secondary`.
- **Fix**: Change to `var(--color-text)` and `var(--color-text-secondary)`.

### Issue #12 -- LOW: Search group hidden at <=900px loses address search
- **Severity**: LOW
- **Type**: ux
- **File**: `src/menu/menu.css` (lines 699-703)
- **Problem**: At screen widths below 900px, `.menu-group--search` is `display: none`. The mobile menu does provide `#mobileSearchNodeInput` and `#mobileSearchAddressInput`, but only when the hamburger menu is visible (below 600px). Between 600-900px, neither the desktop search nor the mobile menu is available.
- **Fix**: The search inputs should remain accessible in the 600-900px range. Either keep at least the node search visible or add it to the command dropdown.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 3     |
| MEDIUM   | 6     |
| LOW      | 2     |
| **Total** | **12** |

## Fix Plan

1. Fix Issues #1, #2: Replace all hardcoded hex in menu.css dark mode and light hover states with design tokens.
2. Fix Issue #3: Increase menu-scale-btn touch target size.
3. Fix Issue #4: Add CSS-based dropdown positioning.
4. Fix Issues #5, #6: Replace margin-left/right with margin-inline-start.
5. Fix Issue #7: Add touch-area expansion for landscape header buttons.
6. Fix Issue #8: Add missing dark mode overrides in menu.css.
7. Fix Issues #9, #10: Update old class selectors in styles.css to new BEM names.
8. Fix Issue #11: Fix old token variable names.
9. Fix Issue #12: Ensure search accessible between 600-900px.

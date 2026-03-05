# Audit 15: Export & Import Dialogs

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape), 360x740 (portrait), 1280x720 (desktop)
**URL**: https://manholes-mapper.vercel.app
**Screenshots**: `app_state_2026-03-01_export_import/`

---

## Status: ALL ISSUES RESOLVED

All 10 issues identified in this audit have been resolved in prior commits.
Verified 2026-03-01 against current `dev` branch.

---

## Issues Found

### Issue #1 -- Hardcoded Hebrew in Coordinate Import Messages (CRITICAL)
- **Severity**: CRITICAL
- **Status**: FIXED
- **Type**: i18n
- **Affected**: `src/legacy/main.js` `handleCoordinatesImport()`
- **Problem**: The `handleCoordinatesImport()` function had hardcoded Hebrew strings.
- **Resolution**: All strings now use `t()` with `coordinates.*` keys. Both `he` and `en` translations exist in `src/i18n.js` (he: lines 512-531, en: lines 1197-1215). Keys: `noCoordinatesFound`, `importResult`, `importResultMerge`, `differentAreaConfirm`, `importError`.

### Issue #2 -- Native `alert()` and `confirm()` Used for Export/Import Errors (HIGH)
- **Severity**: HIGH
- **Status**: FIXED
- **Type**: UX / consistency
- **Affected**: `src/legacy/main.js` export/import functions
- **Problem**: Export/import operations used native `alert()`.
- **Resolution**: All `alert()` calls replaced with `showToast()`. The only remaining `confirm()` at line 7446 is for the destructive import-replace operation, which is intentional (the audit noted this should stay).

### Issue #3 -- No Progress Indicator During Export/Import (MEDIUM)
- **Severity**: MEDIUM
- **Status**: FIXED
- **Type**: UX
- **Affected**: `src/legacy/main.js`
- **Problem**: No loading indicator during export.
- **Resolution**: `showToast(t('toasts.exporting'))` is called immediately before CSV generation (lines 7349, 7376, 7407). Key exists in both `he` ("מייצא...") and `en` ("Exporting...").

### Issue #4 -- Desktop Dropdown Item Padding Too Small for Touch (HIGH)
- **Severity**: HIGH
- **Status**: FIXED
- **Type**: touch targets
- **Affected**: `src/menu/menu.css`, `styles.css`
- **Problem**: `.menu-dropdown__item` had ~30px height, below 44px minimum for touch.
- **Resolution**: `styles.css` line 9699-9701 sets `min-height: var(--touch-target-min)` for `.menu-dropdown__item` inside `@media (hover: none) and (pointer: coarse)`. `menu.css` lines 1151-1154 explicitly sets `min-height: 44px` for `--scale` and `--select` variants on touch devices. No `min-height: auto` overrides exist.

### Issue #5 -- Scale Control Buttons 32px (Below 44px Touch Target) (HIGH)
- **Severity**: HIGH
- **Status**: FIXED
- **Type**: touch targets
- **Affected**: `src/menu/menu.css` `.menu-scale-btn`
- **Problem**: Scale +/- buttons were 32x32px.
- **Resolution**: `menu.css` lines 1141-1148 adds `@media (hover: none) and (pointer: coarse)` rule setting `.menu-scale-btn` to `width: 44px; height: 44px; font-size: 1rem; border-radius: 6px`.

### Issue #6 -- Finish Workday Modal Not Optimized for Landscape (HIGH)
- **Severity**: HIGH
- **Status**: FIXED
- **Type**: layout
- **Affected**: `styles.css` `.finish-workday-*`
- **Problem**: Modal used `max-height: 80vh`, cramped in landscape.
- **Resolution**: Two landscape media queries added: `@media (max-height: 500px) and (orientation: landscape)` at line 4307 (max-height: 95dvh, reduced padding) and `@media (max-height: 400px) and (orientation: landscape)` at line 4349 (max-height: 98dvh, minimal padding).

### Issue #7 -- Dangling Edge Select Has Small Touch Target (MEDIUM)
- **Severity**: MEDIUM
- **Status**: FIXED
- **Type**: touch targets
- **Affected**: `styles.css` `.dangling-edge-select`
- **Problem**: Select had ~36px height.
- **Resolution**: `styles.css` line 4247-4256 sets `padding: 0.75rem` and `min-height: 44px`.

### Issue #8 -- Finish Workday Close Button Missing Touch Target Sizing (LOW)
- **Severity**: LOW
- **Status**: FIXED
- **Type**: touch targets
- **Affected**: `styles.css` `.icon-btn`
- **Problem**: Close button needed 44px sizing verification.
- **Resolution**: `.icon-btn` base style (line 2217) is `width: 44px; height: 44px`. Touch media query (line 9670) adds `min-height: var(--touch-target-min); min-width: var(--touch-target-min)`.

### Issue #9 -- Finish Workday Actions Use `justify-content: flex-end` in RTL (LOW)
- **Severity**: LOW
- **Status**: NO FIX NEEDED
- **Type**: RTL
- **Problem**: `flex-end` works correctly in RTL flex context.

### Issue #10 -- Mobile Menu Scale +/- Buttons 36px (Below 44px) (HIGH)
- **Severity**: HIGH
- **Status**: FIXED
- **Type**: touch targets
- **Affected**: `src/menu/menu.css` `.mobile-menu__scale-btn`
- **Problem**: Mobile scale buttons possibly undersized.
- **Resolution**: `.mobile-menu__scale-btn` (lines 1525-1542) is already `width: 44px; height: 44px` in its base definition.

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 1     | 1     |
| HIGH     | 5     | 5     |
| MEDIUM   | 2     | 2     |
| LOW      | 2     | 2 (1 no fix needed) |
| **Total** | **10** | **10** |

All issues resolved. No further action required.

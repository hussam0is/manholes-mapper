# Design Audit 12: GNSS Live Measure Mode UI

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Focus**: GNSS connection, live measure toggle, status indicators, point capture dialog, accuracy rendering, touch targets, dark mode, RTL, design tokens, accessibility

---

## Files Audited

| File | Lines | Focus |
|------|-------|-------|
| `styles.css` | 8795-9185, 1346-1386, 1974-2035, 5916-5933, 11483-1620 | GNSS/Live Measure CSS |
| `src/gnss/gnss-state.js` | Full | State management |
| `src/gnss/gnss-marker.js` | Full | Canvas marker rendering |
| `src/gnss/point-capture-dialog.js` | Full | Point capture dialog |
| `src/gnss/browser-location-adapter.js` | Full | Browser geolocation bridge |
| `src/gnss/connection-manager.js` | Full | Unified GNSS connections |
| `src/survey/device-picker-dialog.js` | Full | Bluetooth device picker |
| `src/survey/survey-node-type-dialog.js` | Full | New survey point type |
| `src/main-entry.js` | 230-340 | My Location button init |
| `src/legacy/main.js` | 9099-9125, 9970-9999 | GPS Quick Capture wiring |
| `src/i18n.js` | liveMeasure, gnssMarker, gpsCapture, survey | Translations |
| `index.html` | 718-735 | Take Measure FAB HTML |

---

## Issues Found

### Issue #1 -- Take Measure FAB: No RTL positioning
- **Severity**: HIGH
- **Type**: RTL
- **Affected**: `styles.css` lines 1976, 5919, 11485
- **Problem**: `.take-measure-fab` uses physical `left: 12px` (and `left: 8px`, `left: 4px` in responsive). In RTL the FAB should appear on the right side. No `[dir="rtl"]` or `inset-inline-start` override exists.
- **Fix**: Change `left` to `inset-inline-start` throughout.

### Issue #2 -- GNSS Status Pill: Hardcoded position with physical `left`/`right`
- **Severity**: HIGH
- **Type**: RTL
- **Affected**: `styles.css` lines 8818, 9161-9164
- **Problem**: `.gnss-status-pill` uses `left: 12px` base, with an RTL override that sets `left: auto; right: 12px`. This works but uses physical properties. Should use `inset-inline-start`.
- **Fix**: Replace `left: 12px` with `inset-inline-start: 12px` and remove the separate RTL override block.

### Issue #3 -- GNSS Controls Panel: Same physical positioning issue
- **Severity**: HIGH
- **Type**: RTL
- **Affected**: `styles.css` lines 8891, 9166-9169
- **Problem**: Same as #2 -- uses `left: 12px` with separate RTL override. Should use `inset-inline-start`.
- **Fix**: Replace with `inset-inline-start` and remove RTL override.

### Issue #4 -- Position Info background: Hardcoded `#f1f5f9`
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `styles.css` line 9032
- **Problem**: `.position-info` uses raw `#f1f5f9` instead of design token `var(--color-surface-hover)`. The dark mode override on line 9150 does fix this (`background: var(--color-surface)`), but the light mode base should also use a token.
- **Fix**: Change to `background: var(--color-surface-hover, #f1f5f9)`.

### Issue #5 -- Status indicator dot: Hardcoded `#9ca3af`
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `styles.css` line 8840
- **Problem**: `.gnss-status-pill .status-indicator` uses raw `#9ca3af` for disconnected color instead of `var(--color-muted)`.
- **Fix**: Use `background: var(--color-muted, #9ca3af)`.

### Issue #6 -- Capture point disabled button: Hardcoded `#9ca3af`
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `styles.css` line 8936
- **Problem**: `.capture-point-btn:disabled` uses raw `#9ca3af`. Should use `var(--color-muted)`.
- **Fix**: Use `background: var(--color-muted, #9ca3af)`.

### Issue #7 -- Take Measure FAB disabled: Hardcoded `#9ca3af`
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `styles.css` line 1999
- **Problem**: `.take-measure-fab:disabled` uses raw `#9ca3af`. Should use `var(--color-muted)`.
- **Fix**: Use `background: var(--color-muted, #9ca3af)`.

### Issue #8 -- Point Capture Close button: Touch target too small
- **Severity**: HIGH
- **Type**: touch-target
- **Affected**: `styles.css` lines 8991-8999
- **Problem**: `.point-capture-close` has `padding: 0.25rem` (4px). The button contains only a Material Icon (24px default). Total touch area is ~32px -- below 44dp minimum. The close button on a dialog must be easily tappable in field conditions.
- **Fix**: Set `min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center`.

### Issue #9 -- Point Capture Dialog: Hardcoded Hebrew strings
- **Severity**: HIGH
- **Type**: i18n
- **Affected**: `src/gnss/point-capture-dialog.js` lines 36-37, 47, 78-79, 81, 84, 89, 91, 93, 96, 101-103, 112, 115, 198, 255, 315
- **Problem**: The dialog contains many hardcoded Hebrew strings that are never translated: section headers ("מיקום נוכחי", "בחר שוחה"), placeholder text ("-- בחר שוחה --"), checkbox labels ("צור שוחה חדשה", "צור קו מהנקודה הקודמת"), field labels ("שוחת מקור:", "סוג קו:"), edge type options, button labels, and the alert message. When the app is switched to English these will remain Hebrew.
- **Fix**: Add i18n keys for all these strings and use `window.t()` to translate them at dialog open time.

### Issue #10 -- GNSS Marker Precision Card: Hardcoded hex colors
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `src/gnss/gnss-marker.js` lines 297, 342, 349, 356
- **Problem**: The precision info card uses hardcoded colors: `#374151` (gray-700 for accuracy text), `#6b7280` (gray-500 for detail lines), white `rgba(255,255,255,0.92)` for card background. These don't adapt to dark mode.
- **Fix**: This is canvas-rendered so CSS tokens can't be read directly; but the card always has a white background, so contrast is maintained. Severity is MEDIUM because the card's white background stands out in dark mode. Accept as-is for canvas rendering; note for future refactor.

### Issue #11 -- Take Measure FAB: Landscape height too small (36px)
- **Severity**: HIGH
- **Type**: touch-target
- **Affected**: `styles.css` line 11486
- **Problem**: In landscape viewport (`max-height: 450px`), the Take Measure FAB shrinks to `height: 36px`. This is below the 44dp minimum touch target. This FAB is used in field conditions where workers wear gloves.
- **Fix**: Set minimum `height: 44px`.

### Issue #12 -- GNSS Controls Panel buttons: Touch target insufficient
- **Severity**: MEDIUM
- **Type**: touch-target
- **Affected**: `styles.css` lines 8907-8913
- **Problem**: `.gnss-controls-panel .btn` has `padding: 0.5rem 0.75rem` (8px 12px). Without explicit min-height, the button height depends on font-size (0.875rem / 14px) + icon (1.25rem / 20px) + padding. Actual height is ~36px, under 44dp.
- **Fix**: Add `min-height: 44px`.

### Issue #13 -- Point Capture Dialog: No landscape layout adaptation
- **Severity**: MEDIUM
- **Type**: layout
- **Affected**: `styles.css` lines 9135-9184
- **Problem**: In landscape (812x375), the dialog with `max-height: 85vh` (~319px) might be tight for all content (header + 3 sections + footer). The body scrolls, which is OK, but the dialog width could be wider in landscape to reduce scrolling.
- **Fix**: Add landscape media query to set `max-width: 540px` and `max-height: 90vh`.

### Issue #14 -- GNSS Status Pill: Dark mode uses undefined `--color-border-dark`
- **Severity**: LOW
- **Type**: design-tokens
- **Affected**: `styles.css` line 9123
- **Problem**: The dark mode override uses `border-color: var(--color-border-dark)`. Need to verify this token exists in the dark mode `:root`. If not, it should be `var(--color-border)` which is overridden in dark mode.
- **Fix**: Verify token exists; if not, use `var(--color-border)`.

### Issue #15 -- Device Picker Dialog: Uses non-standard CSS custom property names
- **Severity**: LOW
- **Type**: design-tokens
- **Affected**: `src/survey/device-picker-dialog.js` lines 39-96
- **Problem**: Dialog uses custom properties like `--surface`, `--on-surface`, `--outline`, `--primary`, `--surface-variant` which are not the app's design tokens (`--color-surface`, `--color-text`, `--color-border`, `--color-primary`). Fallback values work but the dialog won't match dark mode.
- **Fix**: Update to use the app's design tokens: `var(--color-surface, #fff)`, `var(--color-text, #222)`, `var(--color-border, #ccc)`, `var(--color-primary, #2563eb)`, `var(--color-surface-hover, #f0f0f0)`.

### Issue #16 -- Survey Node Type Dialog: Same non-standard token names
- **Severity**: LOW
- **Type**: design-tokens
- **Affected**: `src/survey/survey-node-type-dialog.js` lines 41-91
- **Problem**: Same as #15 -- uses `--surface`, `--on-surface`, `--outline`, `--primary`, `--surface-variant` instead of app design tokens.
- **Fix**: Same as #15.

### Issue #17 -- Point Capture Dialog footer: Missing accessibility on confirm button
- **Severity**: LOW
- **Type**: accessibility
- **Affected**: `src/gnss/point-capture-dialog.js` line 113
- **Problem**: The confirm button has no `aria-label`. When disabled, screen readers may not explain why.
- **Fix**: Add `aria-label` and consider `aria-disabled` with explanation.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 5 |
| MEDIUM | 5 |
| LOW | 4 |
| **Total** | **17** (14 applicable, 3 noted for future) |

## Priority Fix Order

1. **#1** Take Measure FAB RTL (HIGH)
2. **#2** GNSS Status Pill RTL (HIGH)
3. **#3** GNSS Controls Panel RTL (HIGH)
4. **#8** Point Capture Close touch target (HIGH)
5. **#9** Point Capture Dialog i18n (HIGH)
6. **#11** Take Measure FAB landscape height (HIGH)
7. **#4** Position info hardcoded color (MEDIUM)
8. **#5** Status indicator hardcoded color (MEDIUM)
9. **#6** Capture point disabled hardcoded color (MEDIUM)
10. **#7** Take Measure FAB disabled hardcoded color (MEDIUM)
11. **#12** Controls panel touch target (MEDIUM)
12. **#13** Point capture landscape layout (MEDIUM)
13. **#14** Dark mode border token (LOW)
14. **#15** Device picker design tokens (LOW)
15. **#16** Survey type dialog design tokens (LOW)
16. **#17** Confirm button accessibility (LOW)

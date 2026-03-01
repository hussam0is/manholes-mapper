# Design Audit 19 -- Toast Notifications, Dialogs, and Confirmation Modals

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Focus**: Toast system, modal dialogs, confirmation flows, dark mode, RTL, touch targets

---

## Findings Summary

| # | Issue | Severity | Type | Status |
|---|-------|----------|------|--------|
| 1 | Landscape toast CSS targets `.toast` class but element uses `#toast` ID | HIGH | bug | FIXING |
| 2 | Toast has no error/success/warning variants -- all toasts look identical | HIGH | ux | FIXING |
| 3 | Toast has no min-height for touch targets (not tappable, but affects accessibility) | MEDIUM | a11y | FIXING |
| 4 | Toast auto-dismiss 1800ms too fast for long messages | MEDIUM | ux | FIXING |
| 5 | No toast stacking -- rapid toasts just overwrite each other | LOW | ux | DEFERRED |
| 6 | Modal close button `.modal-close` is 32x32px -- below 44px touch target | HIGH | touch | FIXING |
| 7 | `.projects-modal-close` has no explicit width/height -- padding only 0.25rem | HIGH | touch | FIXING |
| 8 | `admin-panel-modal-*` classes have NO CSS definitions at all | CRITICAL | bug | FIXING |
| 9 | Finish workday close button `#finishWorkdayCloseBtn` is 32x32px | HIGH | touch | FIXING |
| 10 | Finish workday action buttons min-height 36px -- below 44px | HIGH | touch | FIXING |
| 11 | Help modal `.close-btn` has no min-height for touch | MEDIUM | touch | FIXING |
| 12 | All destructive actions use native `confirm()` -- no custom styled modal | MEDIUM | ux | DEFERRED |
| 13 | Toast dark mode keeps same blue `--color-primary-strong` -- low contrast on dark bg | MEDIUM | dark-mode | FIXING |
| 14 | Help modal `padding-left: 1rem` uses physical property -- wrong in RTL | MEDIUM | rtl | FIXING |
| 15 | Hardcoded color `#fff` in toast and help modal close button | LOW | tokens | FIXING |

---

## Detailed Analysis

### Issue 1: Landscape toast CSS mismatch
The landscape media query at line ~12124 targets `.toast` class:
```css
@media (max-height: 450px) and (orientation: landscape) {
  .toast { bottom: 8px; ... }
}
```
But the actual element is `<div id="toast">` with no `.toast` class.
The landscape-specific toast styles never apply.

### Issue 2: No toast variants
All toasts (success, error, info) look identical -- same blue background.
Error messages like "Session expired" should be visually distinct (red/danger).
Success messages like "Saved" should be green.

### Issue 3-4: Toast accessibility
- Toast has no `min-height` set
- Auto-dismiss at 1800ms is very fast for messages like "refresh blocked to avoid losing work"

### Issue 6-7: Modal close button touch targets
- `.modal-close`: 32x32px (needs 44x44)
- `.projects-modal-close`: padding only 0.25rem, no explicit size
- These are used extensively in project modals and admin modals

### Issue 8: Missing admin panel modal CSS
The `admin-panel.js` creates elements with classes:
- `admin-panel-modal-overlay`
- `admin-panel-modal`
- `admin-panel-modal-header`
- `admin-panel-modal-content`
- `admin-panel-modal-footer`
- `admin-panel-modal-close`

But NONE of these have CSS definitions in `styles.css`.
These modals rely entirely on browser defaults, making them completely unstyled.

### Issue 14: RTL help modal
`#helpModal ul { padding-left: 1rem; }` should be `padding-inline-start: 1rem`.

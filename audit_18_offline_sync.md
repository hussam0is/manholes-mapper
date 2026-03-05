# Audit 18 -- Offline Mode, Service Worker Update UI, and Sync Status

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape), 375x812 (portrait), 1280x720 (desktop)
**Screenshots**: `app_state_2026-03-01_offline_sync/`

---

## Issue #1 -- Missing CSS for home-panel sync status state classes
- **Severity**: HIGH
- **Type**: bug
- **Affected**: `styles.css`
- **Problem**: `updateSyncStatusUI()` in `main.js:2434` adds classes `.syncing`, `.offline`, `.error` directly to `#syncStatusBar` (which has class `.home-panel-sync-status`), but there are NO CSS rules for `.home-panel-sync-status.syncing`, `.home-panel-sync-status.offline`, or `.home-panel-sync-status.error`.
- **Status**: FIXED -- CSS rules exist at styles.css:8449-8467 using `var(--color-primary)`, `var(--color-warning)`, `var(--color-danger)` with matching `*-bg` tokens. Spinning animation on `.syncing .material-icons`.

## Issue #2 -- Header sync indicator uses hardcoded hex colors
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `src/menu/menu.css:243,249,254,259`
- **Status**: FIXED -- menu.css:242-260 already uses `var(--color-primary)`, `var(--color-success)`, `var(--color-muted)`, `var(--color-danger)` design tokens.

## Issue #3 -- Header sync indicator too small for touch (28px / 24px mobile)
- **Severity**: MEDIUM
- **Type**: touch-target
- **Status**: FIXED -- menu.css:275-278 sets 32px on mobile (<600px).

## Issue #4 -- Offline fallback page (`offline.html`) is English-only, no RTL
- **Severity**: HIGH
- **Type**: i18n / RTL
- **Status**: FIXED -- `public/offline.html` is bilingual Hebrew/English with auto-detection, RTL support, inline critical CSS, dark mode, and Material icons. Fixed in prior commit c6df63a.

## Issue #5 -- Toast `color: #fff` hardcoded instead of design token
- **Severity**: LOW
- **Type**: design-tokens
- **Status**: FIXED -- styles.css:5702 uses `color: var(--color-text-on-primary, #fff)`.

## Issue #6 -- No pending changes / sync queue indicator in UI
- **Severity**: MEDIUM
- **Type**: UX
- **Status**: FIXED -- `updateSyncStatusUI()` now shows pending count in error state (appends "N changes pending"), synced state (shows count instead of "last synced"), and header tooltip. Added `auth.pendingChanges` i18n key (he/en).

## Issue #7 -- No dark mode override for home-panel sync status bar
- **Severity**: MEDIUM
- **Type**: dark-mode
- **Status**: FIXED -- Wrapped dark mode sync status styles in proper `@media (prefers-color-scheme: dark)` block at styles.css:8243-8264. Uses `var(--color-accent)` for syncing, `var(--color-warning)` for offline, `var(--color-danger)` for error, with `rgba()` dark-appropriate backgrounds.

## Issue #8 -- Offline page has no retry/refresh button
- **Severity**: MEDIUM
- **Type**: UX
- **Status**: FIXED -- `public/offline.html` already has a styled retry button with `location.reload()`. Fixed in prior commit c6df63a.

## Issue #9 -- Toast position in landscape overlaps or is too close to bottom edge
- **Severity**: LOW
- **Type**: layout
- **Status**: FIXED -- Changed `bottom: 8px` to `bottom: 16px` in landscape toast media query.

## Issue #10 -- Service worker update notification is silent (auto-reload)
- **Severity**: MEDIUM
- **Type**: UX
- **Status**: FIXED -- Shows "App updated" toast for 1.5s before reloading with 800ms delay. Falls back to immediate reload if `showToast` not available. Added `toasts.appUpdated` i18n key (he/en).

## Issue #11 -- `formatTimeAgo` uses hardcoded locale strings instead of i18n
- **Severity**: LOW
- **Type**: i18n
- **Status**: FIXED -- `formatTimeAgo()` already uses `t('timeAgo.justNow')`, `t('timeAgo.minutesAgo')`, `t('timeAgo.hoursAgo')` with both he/en translations.

## Issue #12 -- Landscape toast uses selector `.toast` but element has id `#toast`
- **Severity**: LOW
- **Type**: bug
- **Status**: FIXED -- Landscape toast media query already uses `#toast` id selector (styles.css:12422).

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| HIGH | 2 | 2 |
| MEDIUM | 6 | 6 |
| LOW | 4 | 4 |
| **Total** | **12** | **12** |

All 12 issues resolved.

# Audit 18 -- Offline Mode, Service Worker Update UI, and Sync Status

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape), 375x812 (portrait), 1280x720 (desktop)
**Screenshots**: `app_state_2026-03-01_offline_sync/`

---

## Issue #1 -- Missing CSS for home-panel sync status state classes
- **Severity**: HIGH
- **Type**: bug
- **Affected**: `styles.css`
- **Problem**: `updateSyncStatusUI()` in `main.js:2434` adds classes `.syncing`, `.offline`, `.error` directly to `#syncStatusBar` (which has class `.home-panel-sync-status`), but there are NO CSS rules for `.home-panel-sync-status.syncing`, `.home-panel-sync-status.offline`, or `.home-panel-sync-status.error`. The `.sync-indicator` class at line 8227 has these state styles, but `#syncStatusBar` uses `.home-panel-sync-status`, not `.sync-indicator`. Result: the sync status bar shows no visual color differentiation between syncing, offline, error, and synced states -- they all look the same muted gray.
- **Fix**: Add CSS rules for `.home-panel-sync-status.syncing`, `.home-panel-sync-status.offline`, `.home-panel-sync-status.error` with appropriate colors using design tokens.
- **Status**: OPEN

## Issue #2 -- Header sync indicator uses hardcoded hex colors
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Affected**: `src/menu/menu.css:243,249,254,259`
- **Problem**: `.header-sync-indicator--syncing` uses `#3b82f6`, `--synced` uses `#22c55e`, `--error` uses `#ef4444` -- these are all hardcoded hex values instead of CSS custom properties. Should use `var(--color-primary)`, `var(--color-success)`, `var(--color-danger)`.
- **Fix**: Replace hardcoded hex with design token custom properties.
- **Status**: OPEN

## Issue #3 -- Header sync indicator too small for touch (28px / 24px mobile)
- **Severity**: MEDIUM
- **Type**: touch-target
- **Affected**: `src/menu/menu.css:222-233,274-278`
- **Problem**: `.header-sync-indicator` is 28px on desktop, 24px on mobile (<600px). The minimum touch target is 44px. While this is currently title-only (no click action), it should still be tappable to show sync details or trigger a manual sync. Even as a status indicator, the icon at 24px is hard to see on mobile in landscape.
- **Fix**: Increase minimum size to 32px on mobile (this is an info-only icon, not a button, so strict 44px is not required, but readability matters). Consider making it tappable with a 44px hit area.
- **Status**: OPEN

## Issue #4 -- Offline fallback page (`offline.html`) is English-only, no RTL
- **Severity**: HIGH
- **Type**: i18n / RTL
- **Affected**: `public/offline.html`
- **Problem**: The offline fallback page is hardcoded `lang="en"` with English-only text "You're offline". Since the app defaults to Hebrew RTL, Hebrew-speaking users hitting the offline page will see English text with no Hebrew equivalent. The page also uses `--color-muted` which does not exist in the standalone page's context (it relies on styles.css being loaded, which may not be cached yet). There is no "retry" button.
- **Fix**: Make the offline page bilingual or auto-detect language. Add a retry button. Ensure it works without styles.css (inline critical styles). Set proper RTL/LTR based on user's preference.
- **Status**: OPEN

## Issue #5 -- Toast `color: #fff` hardcoded instead of design token
- **Severity**: LOW
- **Type**: design-tokens
- **Affected**: `styles.css:5755`
- **Problem**: `#toast` has `color: #fff` hardcoded. Should use a token or at least an explicit white-on-primary token. While white-on-primary is correct, hardcoded hex violates the design token rule.
- **Fix**: Replace with a semantic token reference.
- **Status**: OPEN

## Issue #6 -- No pending changes / sync queue indicator in UI
- **Severity**: MEDIUM
- **Type**: UX
- **Affected**: `src/legacy/main.js`, `styles.css`
- **Problem**: The sync service tracks `pendingChanges` in state but the UI never shows how many changes are queued for sync. When offline and making edits, users have no way to know how many changes are pending. The sync status bar shows "offline" but not "3 changes pending".
- **Fix**: Display pending change count in the sync status bar when `state.pendingChanges > 0`.
- **Status**: OPEN

## Issue #7 -- No dark mode override for home-panel sync status bar
- **Severity**: MEDIUM
- **Type**: dark-mode
- **Affected**: `styles.css`
- **Problem**: `.home-panel-sync-status` uses `background: var(--color-bg)` and `color: var(--color-muted)` which work in light mode, but there is no explicit dark mode override block for the sync status state classes (`.syncing`, `.offline`, `.error`). The `.sync-indicator` dark mode styles (if any) are separate and don't apply. The warning-light and danger-light token backgrounds will look wrong in dark mode since they are light-mode pastel colors.
- **Fix**: Add dark mode overrides for the sync status bar state colors.
- **Status**: OPEN

## Issue #8 -- Offline page has no retry/refresh button
- **Severity**: MEDIUM
- **Type**: UX
- **Affected**: `public/offline.html`
- **Problem**: The offline fallback page only shows text saying "check your connection and try again" but provides no button to retry. Users must manually refresh the browser, which is not intuitive on mobile.
- **Fix**: Add a "Try Again" button that calls `location.reload()`.
- **Status**: OPEN

## Issue #9 -- Toast position in landscape overlaps or is too close to bottom edge
- **Severity**: LOW
- **Type**: layout
- **Affected**: `styles.css:12123-12129`
- **Problem**: In landscape `@media (max-height: 450px)`, the toast is positioned at `bottom: 8px` which is very close to the bottom edge and may be obscured by the system navigation bar on Android phones.
- **Fix**: Increase bottom offset to `bottom: 16px` in landscape for safe area clearance.
- **Status**: OPEN

## Issue #10 -- Service worker update notification is silent (auto-reload)
- **Severity**: MEDIUM
- **Type**: UX
- **Affected**: `src/serviceWorker/register-sw.js`
- **Problem**: When a new service worker version is detected, `register-sw.js` immediately sends `SKIP_WAITING` and then auto-reloads the page on `controllerchange`. There is no "New version available -- click to update" banner or toast shown to the user. This is fine for background updates, but if the user is mid-work and a reload happens, they could lose unsaved state (though autosave mitigates this). The immediate `skipWaiting()` + reload pattern is aggressive.
- **Fix**: Show a toast notification "New version available" before reloading, or add a brief delay so users see what happened. At minimum, show a toast after reload saying "App updated to latest version".
- **Status**: OPEN

## Issue #11 -- `formatTimeAgo` uses hardcoded locale strings instead of i18n
- **Severity**: LOW
- **Type**: i18n
- **Affected**: `src/legacy/main.js:2476-2484`
- **Problem**: `formatTimeAgo()` hardcodes Hebrew/English strings (`'עכשיו'`, `'just now'`, etc.) using `currentLang` instead of using the `t()` translation system. These strings should be in `i18n.js`.
- **Fix**: Add i18n keys for time-ago strings and use `t()`.
- **Status**: OPEN

## Issue #12 -- Landscape toast uses selector `.toast` but element has id `#toast`
- **Severity**: LOW
- **Type**: bug
- **Affected**: `styles.css:12124`
- **Problem**: The landscape toast rule at line 12124 targets `.toast` (class selector) but the actual element uses `#toast` (id selector). This CSS rule has no effect. The id-based `#toast` rule wins.
- **Fix**: Change `.toast` to `#toast` in the landscape media query.
- **Status**: OPEN

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 6 |
| LOW | 4 |
| **Total** | **12** |

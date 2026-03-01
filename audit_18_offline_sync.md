# Audit 18: Offline & Sync UX

## Issues

### 4. Offline page i18n (HIGH) -- ALREADY FIXED
`public/offline.html` is already bilingual Hebrew/English with:
- Auto-detection from `localStorage.getItem('appLanguage')` or `navigator.language`
- RTL support (defaults to `<html lang="he" dir="rtl">`, switches to LTR for English)
- Inline critical CSS styles with dark mode support
- Material icons for visual feedback
Fixed in prior dark mode commit (c6df63a).

### 6. Pending changes count (MEDIUM) -- FIXED
**Before:** `updateSyncStatusUI()` only showed pending count when offline. When online with pending changes (error state or queued), no count was shown.
**After:** Pending change count is displayed in:
- Error state: appends "N changes pending" to the error message
- Synced state: shows "N changes pending" instead of "last synced" when `pendingChanges > 0`
- Header indicator tooltip: shows pending count when > 0

Files changed:
- `src/legacy/main.js` -- `updateSyncStatusUI()` updated for error + synced states
- `src/i18n.js` -- added `auth.pendingChanges` key (he/en)

### 8. Offline retry button (MEDIUM) -- ALREADY FIXED
`public/offline.html` already has a styled retry button with `location.reload()`.
Fixed in prior dark mode commit (c6df63a).

### 10. SW update notification (MEDIUM) -- FIXED
**Before:** `controllerchange` handler in `register-sw.js` silently reloaded the page. Users had no idea why the page refreshed.
**After:** Shows a brief "App updated" toast (1.5s) before reloading with an 800ms delay. Falls back to immediate reload if `showToast` is not available (early page lifecycle).

Files changed:
- `src/serviceWorker/register-sw.js` -- toast before reload in `controllerchange`
- `src/i18n.js` -- added `toasts.appUpdated` key (he/en)

### 11. formatTimeAgo i18n (LOW) -- ALREADY FIXED
`formatTimeAgo()` in `src/legacy/main.js` already uses:
- `t('timeAgo.justNow')` for < 1 minute
- `t('timeAgo.minutesAgo', mins)` for < 60 minutes
- `t('timeAgo.hoursAgo', hours)` for < 24 hours
- `toLocaleDateString()` with locale based on `currentLang` for older dates

i18n.js already has `timeAgo.justNow`, `timeAgo.minutesAgo`, `timeAgo.hoursAgo` keys for both `he` and `en`.

## Summary
| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 4 | Offline page i18n | HIGH | Already fixed |
| 6 | Pending changes count | MEDIUM | Fixed |
| 8 | Offline retry button | MEDIUM | Already fixed |
| 10 | SW update notification | MEDIUM | Fixed |
| 11 | formatTimeAgo i18n | LOW | Already fixed |

# Dead Code Audit Report

**Date:** 2026-03-01
**Branch:** dev
**Auditor:** Claude Opus 4.6

## Summary

| Category | Items Found | Lines Removed | Status |
|----------|------------|---------------|--------|
| Unused CSS selectors + related rules | 25+ classes | 360 lines from styles.css | REMOVED |
| Dead JavaScript file | `src/admin/admin-panel.js` (717 lines) | 717 | REMOVED |
| Orphan barrel exports | `src/menu/index.js` + `src/map/index.js` | 87 | REMOVED |
| Unnecessary CSS vendor prefixes | 8 `-webkit-overflow-scrolling` lines | 8 | REMOVED |
| Dead `js-focus-visible` polyfill CSS | 1 block | 10 | REMOVED |

**Total lines removed: ~1,182** (368 from styles.css + 717 from admin-panel.js + 87 from barrel files + 10 from focus-visible polyfill)

**Test results after cleanup: 771 tests passed, 0 failures (24 test files)**
**Lint results: 0 errors, 6 pre-existing warnings (unchanged)**

---

## 1. Unused CSS Selectors (styles.css)

The following CSS classes have zero references in any `.js`, `.jsx`, or `.html` file under `src/` or in `index.html`. They are remnants of old UI components that were replaced.

### Old Dropdown System (replaced by `.menu-dropdown` in `menu.css`)

| Class | Lines | Notes |
|-------|-------|-------|
| `.dropdown` | 471-474 | Old wrapper |
| `.dropdown-menu` | 476-489 | Old dropdown panel |
| `[dir="rtl"] .dropdown-menu` | 491-494 | RTL variant |
| `.dropdown-menu.open` | 531-533 | Open state |
| `.dropdown-item` | 535-547 | Old menu item |
| `.dropdown-item:hover` | 549-551 | Hover state |
| `.dropdown-item .material-icons` | 553-556 | Icon styling |
| `.dropdown-divider` | 558-562 | Separator |
| `.dropdown-item-primary` | 4568-4575 | Primary variant |
| `.dropdown-toggle-item` | 4578-4610 | Toggle variant |

### Old Coordinate Controls

| Class | Lines | Notes |
|-------|-------|-------|
| `.coordinate-status` | 4636-4660 | Canvas toolbar indicator (unused) |
| `.coordinate-scale-controls` | 4663-4675 | Scale controls wrapper (unused) |

### Old Mobile Search

| Class | Lines | Notes |
|-------|-------|-------|
| `.mobile-search` | 725-741 | Search styling never used |

### Old Admin Custom Fields

| Class | Lines | Notes |
|-------|-------|-------|
| `.custom-fields` | 5036-5040 | Container never created |
| `.custom-row` | 5042-5055, 5784, 6832-6838 | Row styling never created |

### Old Import History

| Class | Lines | Notes |
|-------|-------|-------|
| `.import-history-section` | 2448-2451, 6884-6887 | Section never rendered |
| `.import-history-list` | 2452-2459 | List never rendered |
| `.import-history-btn` | 2460-2466 | Button never rendered |

### Miscellaneous Unused

| Class | Lines | Notes |
|-------|-------|-------|
| `.badge-icon` | 615-626 | Export badge overlay (removed with old dropdown) |
| `.file-tag.material-icons` | 630-635 | Inline file icon (removed with old dropdown) |
| `.autosave-btn` | 1126-1162 | Button-like autosave control (unused) |
| `.radio-bar` | 2623-2643 | Pill radio bar (never rendered) |
| `.range-value` | 2650-2654 | Range display (never rendered) |
| `.form-help` | 3035-3039 | Form help text (never rendered) |
| `.input-group` | 3051-3063 | Input grouping (never rendered) |
| `.modal-xl` | 3174 | Extra-large modal (never applied) |
| `.modal-full` | 3175 | Full-width modal (never applied) |
| `.js-focus-visible` | 9902-9910 | Focus-visible polyfill (polyfill not included) |
| `.search-group` (in media query) | 6232-6234 | Reference to unused class |
| `.edge-legend-item` (in media query) | 6221-6223 | Reference to unused class |

---

## 2. Dead JavaScript File

### `src/admin/admin-panel.js` (717 lines) -- REMOVED

This file contains an `AdminPanel` class and `openAdminPanel()` function that are **never imported** by any other file. The actual admin functionality is handled by `src/admin/admin-settings.js`, which **is** imported by `src/legacy/main.js`. This file appears to be an earlier/alternate implementation that was superseded. It also self-registers on `window.AdminPanel` and `window.openAdminPanel`, but no code ever calls those globals.

### `src/menu/index.js` (16 lines) -- REMOVED

Barrel export file that re-exports from `menu-events.js`, `menu-config.js`, `action-bar.js`, `command-menu.js`, and `header.js`. No file imports from `./menu/index` or `./menu`. The individual files are imported directly where needed (e.g., `main-entry.js` imports from `./menu/menu-events.js`).

### `src/map/index.js` (71 lines) -- REMOVED

Barrel export file that re-exports from `tile-manager.js`, `govmap-layer.js`, `street-view.js`, and `user-location.js`. No file imports from `./map/index` or `./map`. The individual files are imported directly where needed.

---

## 3. Vendor Prefixes

### `-webkit-overflow-scrolling: touch` -- REMOVED (8 occurrences)

This property was needed for momentum scrolling on iOS before Safari 13 (2019). Since iOS 13+, `-webkit-overflow-scrolling: touch` is the default behavior and the property is a no-op. The app targets modern browsers only.

Removed from lines: 778, 3118, 3232, 3292, 4972, 5449, 7874, 11913.

### Kept (Still Needed)

- `-webkit-font-feature-settings: 'liga'` -- Material Icons ligature support
- `-webkit-font-smoothing: antialiased` -- Font rendering quality
- `-webkit-appearance: none` -- Custom form control styling
- `-webkit-background-clip: text` -- Gradient text effects
- `-webkit-backdrop-filter` -- Safari backdrop blur support
- `-webkit-tap-highlight-color` -- Mobile tap feedback
- `::-webkit-scrollbar` -- Custom scrollbar styling (Chrome/Safari only)

---

## 4. Observations (Not Removed -- Conservative)

### Unused Exports (kept for future use or test coverage)

Many modules export functions that are only used internally or in tests:
- `src/auth/auth-guard.js`: `isAuthenticated`, `getUserEmail`, `routeRequiresAuth`
- `src/auth/sync-service.js`: `getCurrentLock`, `hasLockForSketch`, `resetApiAvailability`
- `src/utils/backup-manager.js`: `startAutoBackup`, `stopAutoBackup`, `onBackupCreated`, `cleanupBackupManager`
- `src/utils/coordinates.js`: `calculateOptimalScale`, `COORDINATES_STORAGE_KEY`, `COORDINATES_ENABLED_KEY`
- `src/utils/label-collision.js`: `getTextDimensions`, `rectanglesOverlap`, `rectangleOverlapsCircle`, `findOptimalLabelPosition`

These are harmless (tree-shaken by Vite in production build) and some may be needed for future features or tests.

### CSS Accessibility Classes (kept)

- `.sr-only` and `.visually-hidden` -- Standard screen-reader-only utility classes. Not currently used but are common accessibility patterns that should remain available.

### 338 Duplicate CSS Selectors

`styles.css` contains 338 duplicate selector definitions (same selector appearing multiple times). Many of these are intentional -- media query overrides, dark mode variants, or responsive breakpoint adjustments. Some are genuinely redundant from incremental additions. A full CSS consolidation pass would be a separate effort.

### Legacy `main.js` (10,667 lines)

No large blocks of dead code found. Comment blocks are JSDoc documentation, not commented-out code. Functions defined in main.js are all used within the file. The monolith is actively being modularized.

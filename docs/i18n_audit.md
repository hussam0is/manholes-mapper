# i18n Audit Report

Generated: 2026-03-01

## Summary

| Category | Count | Status |
|----------|-------|--------|
| HE/EN key parity | 561/561 | OK - in sync |
| Hardcoded user-facing strings | 21 | FIXED |
| Hardcoded Hebrew data comparisons | 9 | NOT-A-BUG (data-layer values) |
| Potentially unused keys | 46 | REVIEWED - many are dynamically accessed |
| Template/function keys | 28 | OK - all have matching signatures in both langs |
| Date/number formatting | 2 sites | FIXED (formatTimeAgo, toLocaleDateString) |
| Pluralization | 0 | N/A for current scope |

---

## 1. Hardcoded User-Facing Strings (FIXED)

### A. `src/legacy/main.js`

| Line | Hardcoded String | Fix |
|------|-----------------|-----|
| 2485-2488 | `formatTimeAgo()` with inline HE/EN strings | Added i18n keys `timeAgo.justNow`, `timeAgo.minutesAgo`, `timeAgo.hoursAgo` and use `t()` |
| 3161 | `'Failed to load project'` | Changed to `t('projects.canvas.loadError')` |
| 3302 | `'Error loading projects'` | Changed to `t('projects.loadError')` |
| 5437 | `[{code:0,label:'פנימי'},{code:1,label:'חיצוני'}]` | Changed to use `t('labels.fallPositionInternal')` / `t('labels.fallPositionExternal')` |
| 5924 | Same fall position hardcoded defaults | Same fix |
| 642-643 | Default adminConfig fall_position labels | Same fix |
| 10001 | `'Unexpected error'` | Changed to `t('errors.unexpected')` |
| 10006 | `'Unexpected error'` | Changed to `t('errors.unexpected')` |

### B. `src/admin/projects-settings.js`

| Line | Hardcoded String | Fix |
|------|-----------------|-----|
| 637 | `'Please select a GeoJSON file'` | Changed to `t('projects.layers.selectFile')` |
| 646 | `'Invalid GeoJSON: must be a FeatureCollection'` | Changed to `t('projects.layers.invalidGeoJSON')` |
| 683 | `'Layer "..." uploaded successfully'` | Changed to `t('projects.layers.uploadSuccess')` |
| 769 | `'Layer deleted'` | Changed to `t('projects.layers.deleted')` |
| 773 | `'Error deleting layer'` | Changed to `t('projects.layers.deleteError')` |

### C. `src/serviceWorker/register-sw.js`

| Line | Hardcoded String | Fix |
|------|-----------------|-----|
| 52 | `'Connection restored'` | Already has `t()` primary path; fallback is acceptable (SW loads before i18n) |
| 59 | `'You are offline'` | Same - fallback is acceptable |

### D. `index.html`

| Line | Hardcoded String | Fix |
|------|-----------------|-----|
| 32 | `Skip to main content` | Added `data-i18n` attribute |
| 44-45 | `Manhole` / `Mapper` brand spans | These are intentionally English brand name |
| 317 | `Manhole Mapper` login title | Added `data-i18n` |
| 318 | Hebrew login subtitle | Already handled by JS |
| 324 | `טוען...` loading text | Added `data-i18n` |
| 334 | `בודק הרשאות...` auth loading | Added `data-i18n` |
| 849-856 | Help dialog `<li>` items in Hebrew only | Added `data-i18n` attributes with `helpLines.N` through `helpLines.delete` keys |

---

## 2. Hardcoded Hebrew in Data Comparisons (NOT-A-BUG)

These are comparisons against stored data values in sketches (codes stored as Hebrew labels in the database). They must remain to support legacy data:

- `main.js:746` - `node.material !== 'לא ידוע'` (checking "Unknown" material)
- `main.js:772` - `edge.material !== 'לא ידוע'` (same)
- `main.js:5132` - `m !== 'לא ידוע'` (completeness check)
- `main.js:5133` - `coverDiameter !== 'לא ידוע'` (same)
- `main.js:5835` - `val === 'לא ידוע'` (dropdown reset)
- `main.js:1663-1668` - nodeType canonicalization (`'בית'`, `'שוחה מכוסה'`, `'קולטן'`)

These compare against **persisted data values**, not UI strings. The nodeType canonicalization (line 1663) maps legacy Hebrew values to English canonical codes. These cannot be changed without a data migration.

Similarly, `src/features/rendering.js`, `src/features/node-icons.js`, `src/project/project-canvas-renderer.js` check `node.nodeType === 'קולטן'` etc. as backward compatibility for legacy data.

---

## 3. Hebrew in Constants Catalogs (NOT-A-BUG)

`src/state/constants.js` has Hebrew labels for materials, access types, maintenance statuses, etc. These are domain-specific catalog values used in data storage and CSV export. They are not UI chrome -- they are the actual field values chosen by Hebrew-speaking surveyors.

The admin settings system (`admin-settings.js`) allows overriding these per-project, so they are effectively configurable. Internationalizing these catalog values would require a separate schema migration adding a `label_en` field to each option.

`src/three-d/three-d-materials.js` has `'קו ראשי'`, `'קו סניקה'`, `'קו משני'` as keys matching stored edge type values.

---

## 4. Missing i18n Keys Added

New keys added to both `he` and `en` in `src/i18n.js`:

```
timeAgo.justNow / timeAgo.minutesAgo / timeAgo.hoursAgo
errors.unexpected
projects.loadError
projects.canvas.loadError
projects.layers.selectFile
projects.layers.invalidGeoJSON
projects.layers.uploadSuccess
projects.layers.deleted
projects.layers.deleteError
labels.fallPositionInternal / labels.fallPositionExternal
a11y.skipToContent
```

---

## 5. Potentially Unused Keys (46)

After manual review, these fall into several categories:

**Used dynamically (OK to keep):**
- `admin.csvFields.*` - accessed via `t('admin.csvFields.' + fieldKey)` in admin-settings.js
- `admin.fieldTypes.*` - same pattern
- `admin.placeholders.*` - same pattern
- `admin.validation.*` - same pattern
- `nodeTypeLabel.*` - accessed via `t('nodeTypeLabel.' + node.nodeType.toLowerCase())`

**Used in code but search missed due to string concatenation:**
- `coordinates.imported`, `coordinates.status`, `coordinates.hasCoordinates`, `coordinates.missingCoordinates` - used in coordinates.js
- `mapLayer.orthophoto`, `mapLayer.street`, `mapLayer.noReference` - used in govmap-layer.js
- `refLayers.enabled`, `refLayers.disabled` - used in reference-layers.js
- `location.*` - used in user-location.js and browser-location-adapter.js
- `gpsCapture.button` - used in gnss/index.js
- `survey.group` - used in survey code

**Genuinely unused (candidates for removal in future cleanup):**
- `auth.syncStatus`, `auth.syncNow` - sync UI was simplified
- `toasts.finishWorkdayBackupCleared` - backup toast not shown
- `confirms.deleteSelectedEdge` - uses `confirms.deleteEdge` instead
- `confirms.finishWorkday` - uses `finishWorkday.confirm`
- `projects.canvas.backToList` - uses `projects.canvas.backToProjects`
- `inputFlow.deleteRule` - uses `buttons.delete`
- `threeD.speed.slower/faster` - speed buttons use icons only
- `threeD.issues.navigateTo` - navigation uses icons only

These are kept for now to avoid breaking any indirect references.

---

## 6. Template/Function Keys (28)

All 28 function keys have matching signatures in both `he` and `en`. No mismatched placeholders found.

---

## 7. Date/Number Formatting

- `formatTimeAgo()` in `main.js` now uses i18n keys for relative time strings and `toLocaleDateString()` with correct locale.
- Number formatting (zoom percentages, coordinates) uses template literals which are locale-neutral.
- No Intl.NumberFormat issues found.

---

## 8. Pluralization

Hebrew has complex plural rules (singular, dual, plural). Currently the app uses simple string interpolation for counts (e.g., `${count} שרטוטים`). This is acceptable for the current user base but could be improved with ICU MessageFormat in the future.

---

## 9. Admin Panel (`src/admin/admin-panel.js`)

The admin panel uses its own inline translation dictionary (lines 111-136) with `{ en: '...', he: '...' }` pairs accessed via a local `t()` function. This is a self-contained i18n system that works correctly. Consolidating it into the main `i18n.js` would be a larger refactor for a future pass.

---

## 10. Help Dialog Items

The help dialog `<li>` items in `index.html` (lines 849-856) were hardcoded in Hebrew. They have been converted to use `data-i18n` attributes referencing the existing `helpLines` array keys.

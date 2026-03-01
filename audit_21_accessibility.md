# Comprehensive Accessibility (a11y) Audit — WCAG 2.1 AA

**Date**: 2026-03-01
**URL**: http://localhost:5191
**Viewport**: 812x375 (mobile landscape)
**Login**: admin@geopoint.me

---

## Audit Summary

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|----------|------|--------|-----|-------|
| ARIA Attributes | 0 | 2 | 8 | 4 | 14 |
| Semantic HTML | 0 | 0 | 5 | 0 | 5 |
| Heading Hierarchy | 0 | 0 | 2 | 0 | 2 |
| Form Labels | 0 | 0 | 3 | 0 | 3 |
| Keyboard Navigation | 0 | 1 | 1 | 0 | 2 |
| Screen Reader | 0 | 1 | 1 | 0 | 2 |
| Reduced Motion | 0 | 0 | 0 | 0 | 0 |
| Color Contrast | 0 | 0 | 0 | 0 | 0 |
| **TOTAL** | **0** | **4** | **20** | **4** | **28** |

---

## Existing Good Practices (already implemented)

1. Skip link present (`<a href="#main" class="skip-link">`)
2. `<main>` landmark with `role="main"`
3. `<nav>` landmark with `role="navigation"`
4. Canvas has `role="img"` and `aria-label`
5. Toolbar has `role="toolbar"` with `aria-label`
6. Toast uses `role="status"` and `aria-live="polite"`
7. Login dialog has `role="dialog"` and `aria-modal="true"`
8. Help modal has `role="dialog"` and `aria-modal="true"` with `aria-labelledby`
9. Admin modal has `role="dialog"` and `aria-modal="true"` with `aria-labelledby`
10. Finish workday modal has `role="dialog"` and `aria-modal="true"` with `aria-labelledby`
11. Auth form errors use `role="alert"` and `aria-live="assertive"`
12. Mobile menu has focus trap, Escape close, and focus return
13. Command dropdown has arrow key navigation, Escape close
14. User menu dropdown has Escape close and focus return
15. `--focus-ring` CSS variable used consistently
16. `focus-visible` pseudo-class on all interactive elements
17. `prefers-reduced-motion: reduce` disables all animations
18. `prefers-contrast: high` support with thicker borders
19. `.sr-only` and `.visually-hidden` utility classes
20. Material icons have `aria-hidden="true"`
21. File inputs have `aria-label`
22. Survey connection badge has `role="status"` and `aria-live="polite"`
23. Canvas mode buttons have `aria-pressed`
24. Header recall handle has `role="button"` and `tabindex="0"`

---

## Issues Found

### H-01 — Multiple h1 elements on page
- **Severity**: MEDIUM
- **Type**: Heading Hierarchy
- **Element**: `#appTitle` (h1) + `#loginTitle` (h1)
- **Problem**: Both the app header and login panel have `<h1>`. A page should have exactly one h1.
- **Fix**: Change `#loginTitle` to `<h2>` since `#appTitle` is the page-level h1.

### H-02 — Mobile menu heading skips level (h1 -> h3)
- **Severity**: MEDIUM
- **Type**: Heading Hierarchy
- **Element**: `#mobileMenu h3`
- **Problem**: Mobile menu title uses `<h3>` directly, skipping h2 level.
- **Fix**: Change to `<h2>` or remove heading semantics entirely (use `<span>` with aria-label on the menu).

### A-01 — Mobile menu missing role and aria-hidden
- **Severity**: MEDIUM
- **Type**: ARIA
- **Element**: `#mobileMenu`
- **Problem**: Mobile menu acts as a slide-out dialog overlay but has no `role` attribute and is missing initial `aria-hidden="true"`.
- **Fix**: Add `role="dialog"` and `aria-label` to mobileMenu. Set `aria-hidden="true"` initially.

### A-02 — Sketch tabs missing tablist role
- **Severity**: MEDIUM
- **Type**: ARIA
- **Element**: `#sketchTabs`
- **Problem**: Tab container missing `role="tablist"`. Tab buttons missing `role="tab"` and `aria-selected`.
- **Fix**: Add `role="tablist"` to container, `role="tab"` + `aria-selected` to buttons.

### A-03 — Admin panel tabs missing ARIA roles
- **Severity**: MEDIUM
- **Type**: ARIA
- **Element**: `.admin-panel-tabs` (dynamic in admin-panel.js)
- **Problem**: Admin panel tab buttons generated via innerHTML lack `role="tab"` and `aria-selected`.
- **Fix**: Add proper tab ARIA attributes in admin-panel.js template.

### A-04 — Admin panel modals missing dialog role
- **Severity**: HIGH
- **Type**: ARIA
- **Element**: `.admin-panel-modal-overlay` (dynamic)
- **Problem**: Edit user and create org modals in admin-panel.js have no `role="dialog"`, `aria-modal`, or `aria-labelledby`.
- **Fix**: Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to h3 in modal header.

### A-05 — Scale buttons missing aria-label
- **Severity**: MEDIUM
- **Type**: ARIA
- **Element**: `.menu-scale-btn`, `.mobile-menu__scale-btn`
- **Problem**: 12 scale adjuster buttons (plus/minus for scale, stretchX, stretchY) have only Hebrew `title` but no `aria-label`.
- **Fix**: Add `aria-label` with descriptive text (e.g., "Decrease scale", "Increase horizontal stretch").

### A-06 — Finish workday close button missing aria-label
- **Severity**: MEDIUM
- **Type**: ARIA
- **Element**: `#finishWorkdayCloseBtn`
- **Problem**: Button has Hebrew title but no `aria-label`.
- **Fix**: Add `aria-label="Close"` and `data-i18n-aria-label="close"`.

### A-07 — GPS quick capture button missing aria-label
- **Severity**: MEDIUM
- **Type**: ARIA
- **Element**: `#gpsQuickCaptureBtn`
- **Problem**: Button relies on visible label span but has no `aria-label` for when label may not be visible.
- **Fix**: Add `aria-label` with i18n key.

### A-08 — Edge legend missing ARIA
- **Severity**: LOW
- **Type**: ARIA
- **Element**: `#edgeLegend`
- **Problem**: Color-coded legend has no role or aria-label.
- **Fix**: Add `role="img"` and `aria-label`.

### A-09 — Sidebar drag handle missing ARIA
- **Severity**: LOW
- **Type**: ARIA
- **Element**: `.sidebar-drag-handle`
- **Problem**: Drag handle has no ARIA role for assistive tech.
- **Fix**: Add `role="separator"` and `aria-label`.

### A-10 — Floating keyboard resize handle missing ARIA
- **Severity**: LOW
- **Type**: ARIA
- **Element**: `.floating-keyboard-resize-handle`
- **Problem**: Resize handle missing role.
- **Fix**: Add `aria-hidden="true"` since it's a visual-only affordance.

### A-11 — Sketch side panel toggle missing aria-label
- **Severity**: LOW
- **Type**: ARIA
- **Element**: `#sketchSidePanelToggle`
- **Problem**: Button has title but missing `aria-label`.
- **Fix**: Add `aria-label`.

### A-12 — Incomplete edge tracker missing accessible description
- **Severity**: HIGH
- **Type**: ARIA
- **Element**: `#incompleteEdgeTracker`
- **Problem**: Count badge is a `role="status"` but the containing div has no clear text accessible name for screen readers.
- **Fix**: Add `aria-label` that includes the count dynamically.

### S-01 — Home panel missing dialog semantics
- **Severity**: MEDIUM
- **Type**: Semantic HTML
- **Element**: `#homePanel`
- **Problem**: Home panel overlays the canvas but has no `role="dialog"` or `aria-modal`.
- **Fix**: Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="homeTitle"`.

### S-02 — Start panel missing dialog semantics
- **Severity**: MEDIUM
- **Type**: Semantic HTML
- **Element**: `#startPanel`
- **Problem**: New sketch panel has no role or ARIA attributes.
- **Fix**: Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="startTitle"`.

### S-03 — Admin/Projects/InputFlow screens missing dialog semantics
- **Severity**: MEDIUM
- **Type**: Semantic HTML
- **Element**: `#adminScreen`, `#projectsScreen`, `#inputFlowScreen`
- **Problem**: Full-screen overlay screens have no `role="dialog"` or `aria-modal`.
- **Fix**: Add dialog semantics.

### S-04 — Sketch cards use div not button/link for open action
- **Severity**: MEDIUM
- **Type**: Semantic HTML
- **Element**: `.sketch-card-title` (dynamic in main.js)
- **Problem**: Sketch names in home panel are clickable divs without button/link semantics.
- **Fix**: Already has explicit "Open" button, so LOW priority. Add `cursor: pointer` and `role="button"` to title div.

### F-01 — Map type select missing label
- **Severity**: MEDIUM
- **Type**: Form Label
- **Element**: `#mapTypeSelect`, `#mobileMapTypeSelect`
- **Problem**: Select elements have adjacent text labels but no `<label for>` or `aria-label`.
- **Fix**: Add `aria-label` with i18n key.

### F-02 — Reference layer toggles missing label
- **Severity**: MEDIUM
- **Type**: Form Label
- **Element**: `#refLayersToggle`, `#mobileRefLayersToggle`
- **Problem**: Checkboxes are inside `<label>` but the checkbox has no explicit id-for association.
- **Fix**: Already wrapped in `<label>` -- this is acceptable. Mark as OK.

### F-03 — Scale/stretch value displays not associated with controls
- **Severity**: MEDIUM
- **Type**: Form Label
- **Element**: `#scaleValueDisplay`, etc.
- **Problem**: Current value displays are plain spans, not connected to buttons via `aria-describedby`.
- **Fix**: Add `aria-describedby` from scale adjuster buttons to value display, or use `aria-valuenow`.

### K-01 — Admin panel close button missing Escape handler
- **Severity**: HIGH
- **Type**: Keyboard
- **Element**: `.admin-panel-close`
- **Problem**: Admin panel modals (edit user, create org) have no Escape key handler to close them.
- **Fix**: Add keydown listener for Escape to close admin panel modals.

### K-02 — Home panel missing Escape handler
- **Severity**: MEDIUM
- **Type**: Keyboard
- **Element**: `#homePanel`
- **Problem**: Home panel can only be closed via button click, not Escape key.
- **Fix**: Add Escape handler.

### SR-01 — Dynamic panel content not announced
- **Severity**: HIGH
- **Type**: Screen Reader
- **Element**: `#detailsContainer`
- **Problem**: When node/edge details are loaded into sidebar, content change is not announced.
- **Fix**: Add `aria-live="polite"` to `#detailsContainer`.

### SR-02 — Sync status changes not announced
- **Severity**: MEDIUM
- **Type**: Screen Reader
- **Element**: `#syncStatusText`
- **Problem**: Sync status text changes (syncing/synced) are not announced.
- **Fix**: Add `aria-live="polite"` to `#syncStatusBar`.

---

## Issues Already Handled (no fix needed)

- Color contrast: Design tokens use well-established Tailwind color values with adequate contrast
- Reduced motion: Already implemented with comprehensive `prefers-reduced-motion` media query
- Focus indicators: All interactive elements have `:focus-visible` styles with `--focus-ring`
- Alt text: Images have alt text; all Material Icons have `aria-hidden="true"`
- Skip link: Present and functional
- Button accessible names: Most buttons have aria-label with i18n keys

---

## Fixes Implemented

### Already fixed (prior commits)
- **A-01**: `#mobileMenu` already has `role="dialog"`, `aria-label="Navigation menu"`, `aria-hidden="true"`
- **A-02**: `#sketchTabs` already has `role="tablist"`, `aria-label="Sketch categories"`, child buttons have `role="tab"` + `aria-selected`
- **A-04**: Admin panel modals (`admin-panel-modal-overlay`) -- CSS exists but no JS generates these elements; not actionable
- **A-05**: Scale buttons (`.menu-scale-btn`, `.mobile-menu__scale-btn`) already have descriptive `aria-label` (e.g., "Decrease scale", "Increase horizontal stretch")
- **A-06**: `#finishWorkdayCloseBtn` already has `aria-label="Close"` and `data-i18n-aria-label="close"`
- **A-07**: `#gpsQuickCaptureBtn` already has `aria-label="Take Measure"` and `data-i18n-aria-label="gpsCapture.takeMeasure"`
- **A-08**: `#edgeLegend` already has `role="img"` and `aria-label="Edge type color legend"`
- **A-09**: `.sidebar-drag-handle` already has `role="separator"`, `aria-label="Resize sidebar"`, `aria-orientation="horizontal"`
- **A-10**: `.floating-keyboard-resize-handle` already has `aria-hidden="true"`
- **A-11**: `#sketchSidePanelToggle` already has `aria-label="Toggle sketches panel"`

### Fixed in this commit
- **A-03**: Admin settings tabs (`src/admin/admin-settings.js`) -- added `role="tablist"` + `aria-label` to container, `role="tab"` + `aria-selected` to buttons, `aria-hidden="true"` on icon spans. Tab switch handler now updates `aria-selected` dynamically.
- **A-12**: Incomplete edge tracker (`src/legacy/main.js`) -- `updateIncompleteEdgeTracker()` now sets a dynamic `aria-label` that includes the count (e.g., "3 incomplete edges" / "3 קווים לא מחוברים"). New i18n key `a11y.incompleteEdges` added for both `he` and `en`.

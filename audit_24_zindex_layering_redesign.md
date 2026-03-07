# Audit 24 — Z-Index & Layering Conflicts + Mobile-First Redesign Proposal

**Date:** 2026-03-07
**Scope:** UI stacking order, modal/panel overlap, close button accessibility, mobile touch optimization
**Target Devices:** TSC5 (Trimble), Samsung Galaxy Note 10, general Android/iOS touchscreen

---

## Part 1: Z-Index Inventory & Conflict Analysis

### 1.1 Current Z-Index Stack (67 declarations)

The app uses **67 z-index declarations** across 5 files. Below is the consolidated stacking order from highest to lowest:

| Layer | Z-Index | Elements | File |
|-------|---------|----------|------|
| **Drag Ghost** | 10000 | `.street-view-pegman-ghost`, `.three-d-overlay`, `.survey-node-dialog`, device-picker (inline) | styles.css, device-picker-dialog.js |
| **Floating Overlays** | 9999 | `.canvas-context-menu`, `.floating-keyboard`, `.quick-win-toast` | styles.css, cockpit.css |
| **3D View** | 2000 | `.three-d-overlay` (duplicate declaration) | styles.css |
| **Lock Modal** | 1200 | `.sketch-lock-modal-overlay` | styles.css |
| **Settings Modals** | 1100 | `.input-flow-dialog-overlay`, `.project-settings-modal-overlay`, `.feature-edit-dialog-overlay` | styles.css |
| **Mobile Menu** | 1060/1055 | `.mobile-menu` / `.mobile-menu-backdrop` | menu.css |
| **Mobile Header** | 1050 | `.app-header` (mobile sticky) | menu.css |
| **PM Overlay** | 1001 | `.pm-overlay` (precision measure) | styles.css |
| **Modal Backdrops** | 1000 | `.modal-overlay`, `.node-properties-modal-overlay`, `.home-panel-modal-overlay`, `.user-profile-modal-overlay`, `.gnss-point-capture-modal-overlay`, `.menu-dropdown`, `.project-card-dropdown` | styles.css, menu.css |
| **Signup** | 999 | `.signup-panel` | styles.css |
| **Legacy Backdrop** | 219 | `.modal-backdrop` | styles.css |
| **Header/Dropdowns** | 200 | `.app-header` (desktop), `.search-bar__input-wrapper`, `.survey-badge-dropdown`, `.action-rail__more-menu` | styles.css, cockpit.css |
| **Cockpit** | 160 | `.cockpit`, `.survey-badge` | styles.css, cockpit.css |
| **Canvas Tools** | 150 | `.canvas-toolbar`, `.survey-badge`, `.take-measure-fab`, `.sketch-side-panel` | styles.css |
| **Canvas Decorators** | 140-149 | `.drop-indicator`, `.edge-legend`, `.issue-highlight-box`, `.street-view-pegman` | styles.css |
| **GNSS/Actions** | 100 | `.action-bar-sticky-wrapper`, `.toggle-floating-keyboard`, `.rate-limit-notice`, `.gnss-controls-panel`, `.three-d-overlay__info-label` | styles.css |
| **Side Panel (mobile)** | 40 | `.sketch-side-panel` (mobile open), `.input-drawer` (mobile) | styles.css |
| **Canvas UI** | 10-20 | `.canvas-empty-state`, `.canvas-fab-toolbar`, `.recenter-button`, `.admin-tabs` | styles.css |
| **Measurement Rail** | 10 | `.measurement-rail__inputs` | styles.css |
| **3D Controls** | 1-5 | `.three-d-overlay__*` controls, joystick, labels | styles.css |
| **Negative** | -1 | `.take-measure-ring` (animation behind button) | styles.css |

### 1.2 Critical Layering Conflicts Identified

#### CONFLICT-01: PM Overlay Close Button Undersized (36x36px)
- **File:** `styles.css:2187-2199`
- **Issue:** `.pm-overlay__close` has `min-width: 36px; min-height: 36px` — below WCAG 2.5.8 minimum of 44px
- **Impact:** Hard to tap on field devices, especially with gloves or in sunlight
- **Severity:** HIGH

#### CONFLICT-02: Sketch Side Panel Close Button Shrinks on Mobile
- **File:** `styles.css:11357-11359`
- **Issue:** `.sketch-side-panel__close` drops to `min-width: 36px; min-height: 36px` in mobile media query
- **Severity:** HIGH

#### CONFLICT-03: Sketch Side Panel vs Canvas Toolbar Overlap
- **File:** `styles.css:150 (toolbar z:150) vs styles.css:10650 (panel z:150)`
- **Issue:** Both `.canvas-toolbar` and `.sketch-side-panel` use `z-index: 150` and are both positioned at `inset-inline-end: 0` (top-right). When the sketch panel opens, it overlaps the canvas toolbar.
- **Impact:** Canvas mode buttons become inaccessible when sketch panel is open
- **Severity:** HIGH

#### CONFLICT-04: Survey Badge Duplicate Z-Index
- **File:** `styles.css` — `.survey-badge` declared at both z-index 160 and 150
- **Issue:** Two competing z-index values for the same element in different selectors
- **Impact:** Unpredictable stacking depending on selector specificity
- **Severity:** MEDIUM

#### CONFLICT-05: Three-D Overlay Duplicate Z-Index
- **File:** `styles.css` — `.three-d-overlay` at both 10000 and 2000
- **Issue:** Same element referenced at two wildly different z-index values
- **Impact:** Confusing maintenance; actual z-index depends on selector specificity/order
- **Severity:** MEDIUM

#### CONFLICT-06: Modal Backdrop Gap (z-index 219 vs 1000)
- **File:** `styles.css` — `.modal-backdrop` at 219, all other modal overlays at 1000+
- **Issue:** Legacy `.modal-backdrop` sits 780 levels below modern modal overlays. If legacy modals use the old backdrop, content at z-index 220-999 could appear above the backdrop but below the modal content.
- **Impact:** Potential for UI elements to "peek through" between backdrop and modal
- **Severity:** MEDIUM

#### CONFLICT-07: Floating Keyboard Can Cover Modals
- **File:** `styles.css` — `.floating-keyboard` at z-index 9999
- **Issue:** Keyboard at 9999 sits above modal dialogs (1000-1200). When a modal opens while the keyboard is visible, the keyboard covers the modal's close button and top area.
- **Impact:** Users can't dismiss modals when keyboard is visible
- **Severity:** HIGH

#### CONFLICT-08: Canvas Context Menu vs Floating Keyboard
- **File:** `styles.css` — both `.canvas-context-menu` and `.floating-keyboard` at 9999
- **Issue:** Same z-index for two overlapping elements. If both are visible simultaneously, paint order determines stacking.
- **Impact:** Unpredictable overlap
- **Severity:** LOW (rarely both visible)

#### CONFLICT-09: Drawer Has No Explicit Z-Index on Mobile
- **File:** `styles.css:10525-10570`
- **Issue:** `.drawer` as a `position: fixed` bottom sheet on mobile has no z-index set. It relies on DOM order for stacking, which means canvas toolbar (z:150) and other absolutely positioned elements may overlap the drawer content area.
- **Impact:** Drawer content may be partially obscured
- **Severity:** MEDIUM

#### CONFLICT-10: Sketch Side Panel Recenter/Eye Buttons Below Touch Minimum
- **File:** `styles.css:11422-11435`
- **Issue:** `.sketch-side-panel__recenter-btn` and `.sketch-side-panel__eye` at `min-width: 32px; min-height: 32px`
- **Impact:** 12px below WCAG minimum touch target
- **Severity:** MEDIUM

### 1.3 Z-Index Design Issues Summary

1. **No z-index scale/token system** — Values are ad-hoc (1, 10, 16, 40, 100, 130, 140, 145, 149, 150, 160, 200, 219, 999, 1000, 1001, 1050, 1055, 1060, 1100, 1200, 2000, 9999, 10000)
2. **Duplicate values for different purposes** — z-index 150 used for both toolbar and sketch panel
3. **Duplicate values for same elements** — survey-badge, three-d-overlay have conflicting z-indices
4. **Wide gaps and clustering** — Jump from 200 to 999, then 999→1000→1001→1050→1055→1060→1100→1200 is overcrowded
5. **No ceiling strategy** — 9999 and 10000 used liberally; nowhere to go if something needs to be higher

---

## Part 2: Close Button Audit

### 2.1 All Close Buttons in the App

| Component | Selector | Size | Touch Target | WCAG OK? |
|-----------|----------|------|-------------|----------|
| PM Overlay | `.pm-overlay__close` | 36x36px | 36px | NO |
| Home Panel | `.home-panel-close` | inherits 44px | 44px | YES |
| Home Panel (short viewport) | `.home-panel-close` | 44x44px | 44px | YES |
| Help Modal | `#helpModal .close-btn` | full-width button | 44px+ | YES |
| Admin Panel | `.admin-panel-modal-close` | 44x44px | 44px | YES |
| Layers Config | `.layers-config-panel__close` | 44x44px | 44px | YES |
| Sidebar (desktop) | `.sidebar-header .icon-btn` | default | varies | MAYBE |
| Sidebar (mobile) | `.sidebar-header .icon-btn` | 44x44px | 44px | YES |
| Sketch Side Panel | `.sketch-side-panel__close` | 36x36px (mobile) | 36px | NO |
| Mobile Menu | `.mobile-menu__close` | 44x44px (touch) | 44px | YES |
| Floating Keyboard | close button | 44x44px | 44px | YES |
| Modal overlays | `.modal-close` | 44x44px (touch) | 44px | YES |

### 2.2 Close Button Layering Issues

1. **PM Overlay close at z-index 1001** — Accessible, but physically small (36px)
2. **Sketch side panel close** — Panel at z-index 150, same as canvas toolbar. Close button in the top-right corner of the panel may be directly behind canvas toolbar buttons when panel opens from the right edge
3. **Drawer close button** — No explicit z-index on mobile drawer; may be under canvas toolbar (z:150)

---

## Part 3: Proposed Z-Index Token System

Replace ad-hoc z-index values with a structured token system using CSS custom properties:

```css
:root {
  /* ── Z-Index Scale ── */
  --z-canvas-elements:    1;    /* Canvas decorators, labels */
  --z-canvas-fab:        10;    /* FAB toolbar, recenter button */
  --z-canvas-empty:      20;    /* Empty state hint */
  --z-drawer:            50;    /* Bottom drawer (mobile) */
  --z-canvas-controls:  100;    /* GNSS panel, action bar, keyboard toggle */
  --z-canvas-overlay:   120;    /* Edge legend, pegman, drop indicator */
  --z-canvas-toolbar:   140;    /* Canvas mode toolbar */
  --z-side-panel:       150;    /* Sketch side panel, survey badge */
  --z-header:           200;    /* App header (desktop sticky) */
  --z-dropdown:         300;    /* Menu dropdowns, project card menus */
  --z-mobile-header:    400;    /* App header (mobile sticky) */
  --z-mobile-menu-bg:   450;    /* Mobile menu backdrop */
  --z-mobile-menu:      460;    /* Mobile menu panel */
  --z-modal-backdrop:   500;    /* All modal backdrops */
  --z-modal:            510;    /* Modal content */
  --z-modal-elevated:   520;    /* Settings modals, lock modals */
  --z-toast:            600;    /* Toast notifications */
  --z-floating-kb:      700;    /* Floating keyboard */
  --z-context-menu:     800;    /* Canvas long-press menu */
  --z-dialog-critical:  900;    /* Survey node dialog, device picker */
  --z-drag-ghost:      1000;    /* Street View pegman drag */
}
```

**Benefits:**
- Clear semantic naming (what it IS, not what number it IS)
- Consistent gaps for future insertions
- Single source of truth for stacking order
- Easy to audit and reason about

---

## Part 4: Mobile-First Redesign Proposal

### 4.1 Target Device Specifications

| Device | Screen | Resolution | Density | Use Case |
|--------|--------|-----------|---------|----------|
| Trimble TSC5 | 5.3" | 1080x1920 | ~415dpi | Primary field controller |
| Samsung Galaxy Note 10 | 6.3" | 1080x2280 | 401dpi | Field worker phone |
| Generic Android | 5-6.5" | 360-412px CSS | varies | General use |

### 4.2 Design Principles

1. **Thumb-zone optimization** — Primary actions in bottom 40% of screen (natural thumb reach)
2. **48px minimum touch targets** — Exceeds WCAG 2.5.8 (44px) for outdoor/glove use
3. **8px minimum spacing** between touch targets — Prevents mis-taps
4. **High contrast for sunlight** — 7:1 contrast ratio minimum (exceeds AA, approaches AAA)
5. **Single-hand operation** — All critical actions reachable without hand repositioning
6. **Progressive disclosure** — Show only what's needed; details on demand
7. **Clear visual hierarchy** — Obvious interactive vs. informational elements

### 4.3 Wireframe: Main Canvas View (Portrait)

```
┌──────────────────────────────────┐
│ ▓▓▓▓▓▓ HEADER (48px) ▓▓▓▓▓▓▓▓▓ │ ← z-header (sticky)
│ [☰]  Sketch Name     [GPS] [⚙] │    48px tap targets
├──────────────────────────────────┤
│                                  │
│                                  │
│     ┌─────┐                      │
│     │ N/E │ ← Mode toolbar       │ ← z-canvas-toolbar
│     │ +/- │    (vertical stack)   │    Right edge, below header
│     │ ↩/↪ │    48x48px buttons   │    12px from edge
│     └─────┘                      │
│                                  │
│         CANVAS AREA              │ ← touch-action: none
│     (full remaining space)       │    Pinch zoom, pan, tap
│                                  │
│                                  │
│                                  │
│                                  │
│                                  │
│  ┌────────────────────────────┐  │
│  │   MEASUREMENT RAIL         │  │ ← z-canvas-controls
│  │   (contextual, on edge)    │  │    Inline with selection
│  └────────────────────────────┘  │
│                                  │
│              ┌──────┐            │
│              │ [+]  │            │ ← z-canvas-fab
│              │ FAB  │            │    Bottom-center, 56px
│              │      │            │    Safe-area aware
│              └──────┘            │
└──────────────────────────────────┘
```

### 4.4 Wireframe: Detail Panel (Bottom Sheet)

When a node/edge is selected, the detail panel slides up from the bottom:

```
┌──────────────────────────────────┐
│ ▓▓▓▓▓▓ HEADER (48px) ▓▓▓▓▓▓▓▓▓ │
├──────────────────────────────────┤
│                                  │
│     ┌─────┐                      │
│     │ N/E │                      │
│     └─────┘                      │
│                                  │
│         CANVAS (dimmed 10%)      │ ← Tapping here closes panel
│         Selected node glows      │
│                                  │
│                                  │
├──────────────────────────────────┤ ← Drag handle (pill, 40x4px)
│ ┌──────────────────────────────┐ │
│ │  ═══  (drag handle)          │ │ ← z-drawer (bottom sheet)
│ │                              │ │
│ │  Node: MH-042     [✕] 48px  │ │ ← Title + CLOSE BUTTON
│ │  ──────────────────────────  │ │    Close: 48x48px, top-right
│ │                              │ │    High contrast X icon
│ │  Type: Manhole  ▾           │ │
│ │  Diameter: 600mm ▾          │ │ ← 48px height dropdowns
│ │  Depth: [1.20] m            │ │ ← 48px height inputs
│ │                              │ │
│ │  Coordinates                 │ │
│ │  E: 176,234.56  N: 631,789  │ │ ← Read-only display
│ │                              │ │
│ │  ┌─────────┐  ┌───────────┐ │ │
│ │  │ 🗑 Delete│  │ ✓ Save    │ │ │ ← 48px buttons, 8px gap
│ │  └─────────┘  └───────────┘ │ │    Delete: ghost/outline only
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**Key improvements over current design:**
- Close button is 48x48px (up from 36px in some panels)
- Close button has 8px clearance from panel edges
- Drag handle allows resize (30%→90% of viewport)
- Tapping dimmed canvas dismisses panel
- Action buttons in the thumb zone (bottom of panel)
- Delete button uses ghost/outline style to prevent accidental taps
- All form controls are 48px minimum height

### 4.5 Wireframe: Modal Dialog (Survey Node Type)

```
┌──────────────────────────────────┐
│                                  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← Semi-transparent backdrop
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │    Tapping dismisses
│  ░░┌──────────────────────┐░░░  │
│  ░░│                      │░░░  │ ← z-modal (centered card)
│  ░░│  Select Node Type    │░░░  │    max-width: 360px
│  ░░│              [✕] 48px│░░░  │    16px padding all sides
│  ░░│  ────────────────    │░░░  │
│  ░░│                      │░░░  │
│  ░░│  ┌────────────────┐  │░░░  │
│  ░░│  │ 🔵 Manhole     │  │░░░  │ ← 56px row height
│  ░░│  └────────────────┘  │░░░  │    12px gap between rows
│  ░░│  ┌────────────────┐  │░░░  │
│  ░░│  │ 🟢 Valve       │  │░░░  │
│  ░░│  └────────────────┘  │░░░  │
│  ░░│  ┌────────────────┐  │░░░  │
│  ░░│  │ 🟡 Drainage    │  │░░░  │
│  ░░│  └────────────────┘  │░░░  │
│  ░░│  ┌────────────────┐  │░░░  │
│  ░░│  │ 🔴 House Conn  │  │░░░  │
│  ░░│  └────────────────┘  │░░░  │
│  ░░│                      │░░░  │
│  ░░└──────────────────────┘░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└──────────────────────────────────┘
```

### 4.6 Wireframe: Precision Measure Overlay

```
┌──────────────────────────────────┐
│ ▓▓▓▓▓▓ HEADER ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├──────────────────────────────────┤
│                                  │
│         CANVAS                   │
│     (GPS crosshair visible)      │
│                                  │
│                                  │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │ ← z-modal (above canvas tools)
│ │  ═══  (drag handle)          │ │    NOT z-canvas-controls
│ │                              │ │
│ │  Live Measure        [✕]48px│ │ ← CLOSE: 48x48, always visible
│ │  ──────────────────────────  │ │    Never covered by keyboard
│ │                              │ │
│ │  Fix: ● RTK Fixed    12 sat │ │ ← Large status badge
│ │                              │ │    Color-coded (green=RTK)
│ │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 85%     │ │ ← Progress bar
│ │  Accuracy: 0.012m           │ │
│ │                              │ │
│ │  ┌──────────┐ ┌────────────┐│ │
│ │  │ Cancel   │ │ ✓ Capture  ││ │ ← 48px, prominent capture
│ │  └──────────┘ └────────────┘│ │    Green background
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### 4.7 Wireframe: Floating Keyboard Positioning

```
┌──────────────────────────────────┐
│ ▓▓▓▓▓▓ HEADER ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├──────────────────────────────────┤
│                                  │
│  CANVAS                         │
│                                  │
│                                  │
├──────────────────────────────────┤
│  DETAIL PANEL (bottom sheet)     │
│  Node: MH-042           [✕]     │ ← Close button ALWAYS above
│  ─────────────────────────       │    floating keyboard
│  Depth: [___] ← focused         │
│                                  │
│  ┌────────────────────────────┐  │
│  │     FLOATING KEYBOARD      │  │ ← z-floating-kb
│  │  ┌───┬───┬───┐            │  │    BELOW modal layer
│  │  │ 7 │ 8 │ 9 │  [✕] 48px │  │    Close button: 48x48
│  │  ├───┼───┼───┤            │  │    Keys: 48px min-height
│  │  │ 4 │ 5 │ 6 │            │  │
│  │  ├───┼───┼───┤            │  │
│  │  │ 1 │ 2 │ 3 │            │  │
│  │  ├───┼───┼───┤            │  │
│  │  │ . │ 0 │ ⌫ │            │  │
│  │  └───┴───┴───┘            │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### 4.8 Wireframe: Landscape Mode (TSC5 / Rotated Phone)

```
┌──────────────────────────────────────────────────────────┐
│ ▓▓ HEADER (compact 40px) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├───────────────────────────────────┬───────────────────────┤
│                                   │                       │
│                                   │  DETAIL PANEL         │
│                                   │  (side sheet, 320px)  │
│           CANVAS                  │                       │
│        (full height)              │  Node: MH-042  [✕]48  │
│                                   │  ───────────────────  │
│     ┌─────┐                       │  Type: Manhole  ▾     │
│     │ N/E │                       │  Diameter: 600  ▾     │
│     │ +/- │  ← toolbar            │  Depth: [1.20] m      │
│     └─────┘   (left edge          │                       │
│                in landscape)      │  ┌────────┐ ┌──────┐  │
│                                   │  │ Delete │ │ Save │  │
│              [+] FAB              │  └────────┘ └──────┘  │
├───────────────────────────────────┴───────────────────────┤
└──────────────────────────────────────────────────────────┘
```

---

## Part 5: Accessibility for Outdoor Field Use

### 5.1 Sunlight Readability

| Issue | Current | Proposed |
|-------|---------|----------|
| Contrast ratio | ~4.5:1 (WCAG AA) | 7:1 minimum (approach AAA) |
| Text on canvas | Thin, small labels | Bold, shadowed labels with outline |
| Status indicators | Color-only (GPS fix) | Color + icon + text label |
| Active button state | Subtle background change | Bold border + fill + checkmark |

### 5.2 Touch Target Improvements

| Component | Current Size | Proposed Size | Gap |
|-----------|-------------|---------------|-----|
| PM Overlay close | 36x36px | **48x48px** | 8px from edges |
| Sketch panel close | 36x36px | **48x48px** | 8px from edges |
| Sketch panel recenter | 32x32px | **44x44px** | 8px between |
| Sketch panel eye toggle | 32x32px | **44x44px** | 8px between |
| Header export buttons | 34px min-width | **44x44px** | 8px between |
| Edge legend items | varies | **48px row height** | 4px gap |
| Measurement rail inputs | 70px wide | **80px wide, 48px tall** | 8px gap |

### 5.3 Additional Accessibility Recommendations

1. **Add `role="dialog"` and `aria-modal="true"`** to all modal overlays (CONFLICT with audit_21 findings A-04)
2. **Add `aria-label`** to all icon-only close buttons (`"Close panel"`, `"Close dialog"`)
3. **Focus trap** inside modals — Tab key should cycle within the modal, not escape to canvas
4. **Escape key** should close the topmost modal/panel (already partially implemented)
5. **Visible focus rings** — Current 3px ring is good; ensure it works in both light and dark mode
6. **Reduce motion** — Respect `prefers-reduced-motion` for panel slide animations
7. **High contrast mode** — Add `@media (forced-colors: active)` support for Windows High Contrast
8. **Screen reader announcements** — `aria-live="polite"` region for GPS status changes

### 5.4 Glove-Friendly Interaction

For field workers wearing work gloves:
- **Minimum 48px touch targets** (not 44px) — gloves reduce precision by ~30%
- **12px minimum gap** between destructive actions (Delete) and constructive actions (Save)
- **Swipe gestures** as alternatives to small buttons — swipe down to close panels
- **Long-press protection** — Require deliberate long press (500ms+) for destructive actions
- **Edge swipe from right** to open sketch panel (already supported via drawer)

---

## Part 6: Implementation Priority

### Phase 1 — Critical Fixes (Immediate)

1. **Fix PM Overlay close button size** — `36px → 48px`
2. **Fix sketch side panel close button** — `36px → 48px`
3. **Fix sketch panel recenter/eye buttons** — `32px → 44px`
4. **Resolve canvas-toolbar vs sketch-panel z-index conflict** — Separate to different values
5. **Add z-index to mobile drawer** — Currently missing, add `z-index: var(--z-drawer, 50)`

### Phase 2 — Z-Index Consolidation

1. Define CSS custom properties for z-index scale (Part 3 proposal)
2. Replace all 67 hardcoded z-index values with tokens
3. Resolve duplicate z-index declarations (survey-badge, three-d-overlay)
4. Remove legacy `.modal-backdrop` at z-index 219 (reconcile with modern 1000+ system)
5. Lower floating keyboard to below modal layer (9999 → 700 token)

### Phase 3 — Touch & Accessibility

1. Add `role="dialog"` and ARIA attributes to all modals
2. Implement focus trapping in modals
3. Add `aria-label` to all icon-only buttons
4. Enforce 48px touch targets via the existing `@media (hover: none)` block
5. Add high-contrast mode support

### Phase 4 — Visual Hierarchy Redesign

1. Implement bottom-sheet detail panel pattern (Part 4.4 wireframe)
2. Move toolbar to left edge in landscape mode
3. Add drag-to-dismiss for all bottom sheets
4. Implement canvas dimming when panel is open
5. Redesign PM overlay as bottom sheet with proper stacking

---

## Part 7: Testing Checklist

- [ ] Open sketch side panel — verify canvas toolbar buttons remain tappable
- [ ] Open PM overlay — verify close button is easily tappable (48px)
- [ ] Open floating keyboard + modal simultaneously — verify modal close button accessible
- [ ] Open bottom drawer on mobile — verify it appears above canvas elements
- [ ] Test all close buttons on TSC5 with capacitive stylus
- [ ] Test all close buttons on Galaxy Note 10 with finger
- [ ] Verify z-index order: canvas < toolbar < drawer < header < modals < keyboard < context menu
- [ ] Test in portrait and landscape orientations
- [ ] Test with `prefers-color-scheme: dark`
- [ ] Test with `prefers-reduced-motion: reduce`
- [ ] Test with screen reader (TalkBack on Android)
- [ ] Test RTL (Hebrew) layout — all panels mirror correctly

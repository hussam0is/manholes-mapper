# Manholes Mapper — Frontend App Structure

## Bootstrap Flow

```
index.html
 └─ <script type="module"> src/main-entry.js
     ├─ src/capacitor-api-proxy.js    (fetch interceptor, must load first)
     ├─ styles.css + menu.css         (JS imports for Vite)
     ├─ Auth init (auth-guard, auth-client, permissions, sync-service)
     ├─ i18n init
     ├─ GNSS init
     ├─ Exposes window globals (t, isRTL, authGuard, menuEvents, CONSTS…)
     ├─ src/legacy/main.js            (side-effect import — monolith ~11,300 lines)
     └─ DOMContentLoaded →
         ├─ initMenuSystem()
         ├─ initCanvasFabToolbar()
         ├─ attachFloatingKeyboard()
         ├─ initResizableDrawer()
         ├─ initGnssModule()
         └─ initMyLocationUI()
```

---

## Hash Routes

| Route | Screen | Auth | Navigation Method |
|-------|--------|------|-------------------|
| `#/login` | Login Panel | No | `location.hash` / auth-guard redirect |
| `#/signup` | Signup Panel | No | Link from login form |
| `#/` | Home (Projects / Sketches list) | Yes | Default, redirect after auth |
| `#/admin` | Admin Panel | Yes (admin+) | Header button / mobile menu |
| `#/projects` | Projects Screen | Yes (admin+) | Header button / mobile menu |
| `#/project/:id` | Project Canvas Mode | Yes | "Open Project" card on home |

Route handler: `handleRoute()` in `src/legacy/main.js:1113` via `hashchange` event.

---

## Standalone Pages

| Page | URL | Purpose | Navigation Method |
|------|-----|---------|-------------------|
| `public/offline.html` | SW fallback | "You're offline" + "Try Again" btn | Service worker navigation fallback when offline, no cache hit |
| `public/health/index.html` | `/health/` | Diagnostics: SW status, caches, IndexedDB, online | Direct URL navigation |

---

## Screen & Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│ APP ROOT (index.html)                                               │
│                                                                     │
│ ┌─ Skip Link (.skip-link) ──────────────────────────────────────┐   │
│ │  Nav: visible on keyboard Tab focus (a11y)                     │   │
│ │  Action: jumps to #main                                        │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─ Auth Loading Overlay ──────────────────────────────────────────┐ │
│ │  #authLoadingOverlay                                            │ │
│ │  Nav: auto-shown before auth resolves, auto-hidden after        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Login Panel ───────────────────────────────────────────────────┐ │
│ │  #loginPanel                                                    │ │
│ │  Nav: hash route #/login or #/signup                            │ │
│ │  Dismiss: successful auth → animated slide-out                  │ │
│ │  ┌─ React Auth Container (#authContainer) ──────────────────┐   │ │
│ │  │  SignInForm  — Nav: #/login route → mountAuthSignIn()     │   │ │
│ │  │  SignUpForm  — Nav: #/signup route → mountAuthSignUp()    │   │ │
│ │  │  Form links switch between #/login ↔ #/signup             │   │ │
│ │  │  Language toggle (he/en) in each form                     │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Admin Screen ──────────────────────────────────────────────────┐ │
│ │  #adminScreen                                                   │ │
│ │  Nav: hash route #/admin (header btn / mobile menu)             │ │
│ │  Dismiss: close btn → hash #/, Escape key                      │ │
│ │  Hides #main while visible                                     │ │
│ │  ┌─ Tabs (lazy-loaded) ─────────────────────────────────────┐   │ │
│ │  │  Settings       — admin-settings.js       (admin+)       │   │ │
│ │  │    └─ Option delete: native confirm()                     │   │ │
│ │  │  Projects       — projects-settings.js    (admin+)       │   │ │
│ │  │    ├─ Project Create/Edit Modal (dynamic)                 │   │ │
│ │  │    │   Nav: "Add Project" btn / "Edit" action on card     │   │ │
│ │  │    │   Dismiss: Cancel / X btn / backdrop                 │   │ │
│ │  │    │   Fields: name, description                          │   │ │
│ │  │    ├─ Layers Management Modal (dynamic, wide)             │   │ │
│ │  │    │   Nav: "Manage Layers" btn on project card           │   │ │
│ │  │    │   Dismiss: X btn / backdrop                          │   │ │
│ │  │    │   Shows: existing layers list, upload form           │   │ │
│ │  │    │   (file input for GeoJSON, type selector)            │   │ │
│ │  │    ├─ Project delete: native confirm()                    │   │ │
│ │  │    └─ Layer delete: native confirm()                      │   │ │
│ │  │  Users          — inline                  (super_admin)  │   │ │
│ │  │  Organizations  — inline                  (super_admin)  │   │ │
│ │  │    └─ Org delete: native confirm()                        │   │ │
│ │  │  Features       — inline                  (super_admin)  │   │ │
│ │  │  Issues & Fixes — inline                  (super_admin)  │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │  ┌─ Input Flow Settings Screen ─────────────────────────────┐   │ │
│ │  │  #inputFlowScreen                                        │   │ │
│ │  │  Nav: "Input Flow Config" btn inside Projects tab        │   │ │
│ │  │  Dismiss: Cancel / Save btn                              │   │ │
│ │  │  Hidden file input: #inputFlowImportFile (JSON import)   │   │ │
│ │  │  Rule delete: native confirm()                           │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Projects Screen ───────────────────────────────────────────────┐ │
│ │  #projectsScreen                                                │ │
│ │  Nav: hash route #/projects (header btn / mobile menu)          │ │
│ │  Dismiss: close btn → hash #/                                   │ │
│ │  Hides #main while visible                                     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Main Canvas View (#main) ──────────────────────────────────────┐ │
│ │  Visible on #/ (after home dismissed) and #/project/:id         │ │
│ │                                                                 │ │
│ │  ┌─ HEADER ─────────────────────────────────────────────────┐   │ │
│ │  │  Desktop: always visible (auto-hides landscape mobile)   │   │ │
│ │  │  ┌─ Brand section                                    │   │   │ │
│ │  │  │   Logo, sketch name (#sketchNameDisplay),          │   │   │ │
│ │  │  │   mobile sketch name (#sketchNameDisplayMobile),   │   │   │ │
│ │  │  │   sync indicator (#headerSyncIndicator)            │   │   │ │
│ │  │  │   States: synced/syncing/offline/error             │   │   │ │
│ │  │  ├─ Save btn + autosave toggle                       │   │   │ │
│ │  │  ├─ Search input                                     │   │   │ │
│ │  │  ├─ Size controls (increase/decrease/auto)           │   │   │ │
│ │  │  ├─ Command Menu Dropdown (#exportDropdown)          │   │   │ │
│ │  │  │   Nav: click apps icon btn                        │   │   │ │
│ │  │  │   Dismiss: click outside / Escape / action click  │   │   │ │
│ │  │  │   Groups: Sketch, CSV, Workday, Location,         │   │   │ │
│ │  │  │           GNSS, Map                               │   │   │ │
│ │  │  ├─ Language selector                                │   │   │ │
│ │  │  ├─ Help btn                                         │   │   │ │
│ │  │  ├─ Admin btn (admin+)  → #/admin                    │   │   │ │
│ │  │  ├─ Projects btn (admin+) → #/projects               │   │   │ │
│ │  │  ├─ My Sketches btn → opens home panel               │   │   │ │
│ │  │  └─ User Account Dropdown                            │   │   │ │
│ │  │      Nav: click avatar btn                           │   │   │ │
│ │  │      Dismiss: click outside / Escape                 │   │   │ │
│ │  │      Shows: name, email, role badge, Sign Out        │   │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │  ┌─ Header Recall Handle (#headerRecallHandle) ─────────┐      │ │
│ │  │  Landscape mobile only — touch to reveal header      │      │ │
│ │  └──────────────────────────────────────────────────────┘      │ │
│ │                                                                 │ │
│ │  ┌─ MOBILE MENU (#mobileMenu) ─────────────────────────────┐   │ │
│ │  │  Nav: hamburger btn (#mobileMenuBtn, ≤600px)             │   │ │
│ │  │  Dismiss: X btn / backdrop (#mobileMenuBackdrop) /       │   │ │
│ │  │           Escape / action click / resize >600px          │   │ │
│ │  │  Slide-in drawer, right side, full-screen                │   │ │
│ │  │  Group collapse state persisted to localStorage          │   │ │
│ │  │  ┌─ My Sketches btn                                  │   │   │ │
│ │  │  ├─ Search group (collapsed)                         │   │   │ │
│ │  │  ├─ View group (zoom/size, collapsed)                │   │   │ │
│ │  │  ├─ Sketch & Export group (collapsed)                │   │   │ │
│ │  │  ├─ Location & Map group (collapsed)                 │   │   │ │
│ │  │  ├─ Measurement group (collapsed)                    │   │   │ │
│ │  │  │   Live Measure, TSC3 Bluetooth connect,           │   │   │ │
│ │  │  │   TSC3 WebSocket connect (→ native prompt()),     │   │   │ │
│ │  │  │   Disconnect, Finish Workday                      │   │   │ │
│ │  │  └─ Settings group (lang, help, admin, expanded)     │   │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                 │ │
│ │  ┌─ CANVAS CONTAINER (#canvasContainer) ────────────────────┐   │ │
│ │  │                                                          │   │ │
│ │  │  Canvas Empty State (#canvasEmptyState)                  │   │ │
│ │  │    Nav: auto-shown when sketch has 0 nodes               │   │ │
│ │  │    Dismiss: "Got it" btn sets _emptyStateDismissed       │   │ │
│ │  │                                                          │   │ │
│ │  │  Home Panel (#homePanel) ─────────────────────────────   │   │ │
│ │  │    Nav: #/ route / "My Sketches" btn / menuEvent         │   │ │
│ │  │    Dismiss: close btn / Escape / Android back            │   │ │
│ │  │    ┌─ Sync Status Bar (#syncStatusBar)               │   │   │ │
│ │  │    │   States: syncing (animated), synced, offline,  │   │   │ │
│ │  │    │   error — with colored icons                    │   │   │ │
│ │  │    ├─ Sketch Tabs (#sketchTabs)                      │   │   │ │
│ │  │    │   #personalTab / #organizationTab               │   │   │ │
│ │  │    │   Nav: tab click toggles                        │   │   │ │
│ │  │    ├─ Sketch List (#sketchList)                      │   │   │ │
│ │  │    │   Dynamic cards with load/rename/delete actions  │   │   │ │
│ │  │    │   Delete: native confirm()                      │   │   │ │
│ │  │    │   "Change Project" → Change Project Modal       │   │   │ │
│ │  │    └─ Footer: "New Sketch" btn → Start Panel         │   │   │ │
│ │  │    Modes:                                                │   │ │
│ │  │      "projects" → org project cards → "Open Project"     │   │ │
│ │  │      "sketches" → Personal/Org tabs → sketch cards       │   │ │
│ │  │                                                          │   │ │
│ │  │  Start Panel (#startPanel) ───────────────────────────   │   │ │
│ │  │    Nav: "New Sketch" from home panel                     │   │ │
│ │  │    Dismiss: Start (creates sketch) / Cancel / Escape     │   │ │
│ │  │    Contains: project selector dropdown, date picker      │   │ │
│ │  │    Start with existing data: native confirm()            │   │ │
│ │  │                                                          │   │ │
│ │  │  Layers Config Button + Panel ────────────────────────   │   │ │
│ │  │    #layersConfigBtn (top-left, below pegman)             │   │ │
│ │  │    #layersConfigPanel (floating dropdown)                │   │ │
│ │  │    Nav: click layers icon btn                            │   │ │
│ │  │    Dismiss: click outside / X btn / toggle btn           │   │ │
│ │  │    Sections:                                             │   │ │
│ │  │      Base Map: enable toggle, type select (ortho/street) │   │ │
│ │  │      Reference Layers: master toggle, per-layer checks   │   │ │
│ │  │      Sections: per-section visibility checkboxes         │   │ │
│ │  │                                                          │   │ │
│ │  │  Street View Pegman (canvas widget) ──────────────────   │   │ │
│ │  │    Draggable — shows ghost + drop indicator during drag  │   │ │
│ │  │    Drop → opens Google Street View in new tab            │   │ │
│ │  │    Transient elements: .street-view-pegman-ghost,        │   │ │
│ │  │                        .street-view-drop-indicator       │   │ │
│ │  │                                                          │   │ │
│ │  │  Drawing Toolbar (.canvas-toolbar) ───────────────────   │   │ │
│ │  │    Always visible on canvas                              │   │ │
│ │  │    Buttons: My Location | Node, Home, Drainage, Edge |   │   │ │
│ │  │             Undo, Redo | Zoom +/- | 3D View (admin+)    │   │ │
│ │  │                                                          │   │ │
│ │  │  FAB Speed Dial (#canvasFabToolbar) ──────────────────   │   │ │
│ │  │    Nav: toggle btn (#canvasFabToggle)                    │   │ │
│ │  │    Actions: Incomplete edges, Recenter density,          │   │ │
│ │  │             Recenter sketch, Zoom to fit                 │   │ │
│ │  │                                                          │   │ │
│ │  │  Take Measure FAB (#gpsQuickCaptureBtn) ──────────────   │   │ │
│ │  │    Nav: visible when Live Measure enabled                │   │ │
│ │  │    Click → GNSS Point Capture Dialog                     │   │ │
│ │  │    Visual: fix-quality color ring, precision pulse anim  │   │ │
│ │  │                                                          │   │ │
│ │  │  Survey Badge (#surveyConnectionBadge) ───────────────   │   │ │
│ │  │    Auto-shown when TSC3 Bluetooth connected              │   │ │
│ │  │                                                          │   │ │
│ │  │  Edge Type Legend (#edgeLegend) ──────────────────────   │   │ │
│ │  │    Auto-shown when edge types configured                 │   │ │
│ │  │                                                          │   │ │
│ │  │  Canvas Overlays (rendered in draw loop) ─────────────   │   │ │
│ │  │    Issue indicators: red dashed lines + warning badges   │   │ │
│ │  │      on edges/nodes with issues (persistent per frame)   │   │ │
│ │  │    Incomplete edge highlight: visual on dangling edges   │   │ │
│ │  │      (head === null or isDangling)                        │   │ │
│ │  │    Issue Highlight animation: pulsing red ring            │   │ │
│ │  │      Nav: issue navigation from sketch side panel        │   │ │
│ │  │    Merge Mode overlay: amber dots for nearby nodes,      │   │ │
│ │  │      dashed lines between duplicate pairs                │   │ │
│ │  │      Nav: merge mode enabled in sketch side panel        │   │ │
│ │  │                                                          │   │ │
│ │  │  Sketch Side Panel (#sketchSidePanel) ────────────────   │   │ │
│ │  │    Nav: entering #/project/:id route                     │   │ │
│ │  │    Toggle: layers icon btn (#sketchSidePanelToggle)      │   │ │
│ │  │    Dismiss: X btn / leaving project-canvas mode          │   │ │
│ │  │    ┌─ Back to Projects link (#backToProjectsBtn)     │   │   │ │
│ │  │    │   Nav: click → #/projects                       │   │   │ │
│ │  │    ├─ View 1: Sketch List (default)                  │   │   │ │
│ │  │    │   Sketch items with visibility toggles          │   │   │ │
│ │  │    ├─ View 2: Issues Sub-Panel                       │   │   │ │
│ │  │    │   Per-sketch working status + issues list       │   │   │ │
│ │  │    │   Navigation: "my_location" (goto overview),    │   │   │ │
│ │  │    │   "swap_horiz" (center-between mode)            │   │   │ │
│ │  │    └─ View 3: Merge Mode                             │   │   │ │
│ │  │        Nav: merge mode btn in panel                  │   │   │ │
│ │  │        Dismiss: back btn → list view                 │   │   │ │
│ │  │        Shows: radius config, duplicate count,        │   │   │ │
│ │  │        grouped pairs by source sketch, navigate-to   │   │   │ │
│ │  │        btns, merge-apply btns                        │   │   │ │
│ │  │        Cross-sketch merge: native confirm()          │   │   │ │
│ │  │                                                          │   │ │
│ │  │  Toast (#toast) ─────────────────────────────────────   │   │ │
│ │  │    Nav: showToast(msg) from anywhere                     │   │ │
│ │  │    Auto-dismiss after timeout                            │   │ │
│ │  │    Special toasts:                                       │   │ │
│ │  │      "Connection restored" — online event                │   │ │
│ │  │      "You are offline" — offline event                   │   │ │
│ │  │      "App updated" — SW controllerchange, then reload    │   │ │
│ │  │      "Refresh blocked while offline" — F5 intercepted    │   │ │
│ │  │                                                          │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                 │ │
│ │  ┌─ SIDEBAR / DRAWER (#sidebar) ───────────────────────────┐   │ │
│ │  │  Nav: select node/edge on canvas → renderDetails()       │   │ │
│ │  │  Dismiss: close btn / tap canvas / Escape / Android back │   │ │
│ │  │  Resizable via drag handle (resizable-drawer.js)         │   │ │
│ │  │                                                          │   │ │
│ │  │  Node selected:                                          │   │ │
│ │  │    ├─ Node ID field (editable)                           │   │ │
│ │  │    ├─ Node type selector                                 │   │ │
│ │  │    ├─ Coordinate display (surveyX/Y, WGS84)             │   │ │
│ │  │    ├─ Position lock toggle (#positionLockToggle)         │   │ │
│ │  │    │   Checkbox with padlock icon, prevents GPS rewrite  │   │ │
│ │  │    ├─ Tabbed Wizard (.wizard-tab)                        │   │ │
│ │  │    │   Tabs: accuracy, maintenance, material, cover,     │   │ │
│ │  │    │         access, note                                │   │ │
│ │  │    │   Colored tab btns with check mark when filled      │   │ │
│ │  │    │   RTK Fixed auto-fills accuracy badge               │   │ │
│ │  │    │   Active tab persisted across re-renders            │   │ │
│ │  │    ├─ Connected edges list (clickable → selects edge)    │   │ │
│ │  │    ├─ Issues list (.element-issues-list)                 │   │ │
│ │  │    │   Red-tinted items with warning icons               │   │ │
│ │  │    │   Click → issue highlight on canvas                 │   │ │
│ │  │    ├─ Fix Suggestions (.fix-suggestions-section)         │   │ │
│ │  │    │   Lightbulb icon + action buttons per suggestion    │   │ │
│ │  │    │   Actions: convert type, swap measurements,         │   │ │
│ │  │    │   merge stubs (native confirm()), set locked status │   │ │
│ │  │    │   Apply → auto-advances to next issue               │   │ │
│ │  │    ├─ Issue Nav Bar (.issue-nav-bar, project-canvas only)│   │ │
│ │  │    │   Prev/Next arrows + "Issue X of Y" counter         │   │ │
│ │  │    ├─ Metadata (created by, last edited)                 │   │ │
│ │  │    └─ Delete btn (native confirm() if connected edges)   │   │ │
│ │  │                                                          │   │ │
│ │  │  Edge selected:                                          │   │ │
│ │  │    ├─ Tail/head node refs (clickable → selects node)     │   │ │
│ │  │    ├─ Edge type/material/diameter selectors               │   │ │
│ │  │    ├─ Length/depth fields                                │   │ │
│ │  │    ├─ Issues list (.element-issues-list)                 │   │ │
│ │  │    ├─ Fix Suggestions (.fix-suggestions-section)         │   │ │
│ │  │    ├─ Issue Nav Bar (.issue-nav-bar, project-canvas only)│   │ │
│ │  │    └─ Delete btn (native confirm())                      │   │ │
│ │  │                                                          │   │ │
│ │  │  Nothing selected: placeholder text                      │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                 │ │
│ │  ┌─ FLOATING KEYBOARD (#floatingKeyboard) ──────────────────┐   │ │
│ │  │  Nav: numeric input focus on touch devices               │   │ │
│ │  │  Toggle: #toggleFloatingKeyboard btn                     │   │ │
│ │  │  Dismiss: close btn / field blur                         │   │ │
│ │  │  Draggable numeric keypad (0-9, decimal, backspace)      │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ MODAL DIALOGS (overlays, appended to body) ────────────────────┐ │
│ │                                                                 │ │
│ │  Help Modal (#helpModal)                                        │ │
│ │    Nav: help btn in header / mobile menu                        │ │
│ │    Dismiss: close btn / backdrop / Escape                       │ │
│ │    Shows: keyboard shortcuts and tips                           │ │
│ │                                                                 │ │
│ │  Admin Config Modal (#adminModal)                               │ │
│ │    Nav: per-sketch admin config action                          │ │
│ │    Dismiss: Cancel / Save / backdrop / Escape                   │ │
│ │    Hidden file input: #adminImportFile (JSON)                   │ │
│ │                                                                 │ │
│ │  Finish Workday Modal (#finishWorkdayModal)                     │ │
│ │    Nav: command menu / mobile menu "Finish Workday"             │ │
│ │    Dismiss: Cancel / X btn / backdrop                           │ │
│ │    Shows: dangling edges list + node-type selector per endpoint │ │
│ │    On confirm: resolves dangles + exports all day's CSV         │ │
│ │                                                                 │ │
│ │  Change Project Modal (dynamic)                                 │ │
│ │    Nav: "Change Project" on sketch card in home panel           │ │
│ │    Dismiss: Cancel / X btn / backdrop                           │ │
│ │    Shows: project selector + "Update input flow" checkbox       │ │
│ │                                                                 │ │
│ │  Coordinates Required Prompt (dynamic)                          │ │
│ │    Nav: opening sketch without geographic coords                │ │
│ │    Dismiss: any button / backdrop                               │ │
│ │    Options: Import CSV, Open without coords, Cancel             │ │
│ │                                                                 │ │
│ │  GNSS Point Capture Dialog (dynamic, singleton)                 │ │
│ │    Nav: Take Measure FAB btn / "Capture Point" action           │ │
│ │    Dismiss: Close / overlay / Cancel / Capture                  │ │
│ │    Live-updates with GNSS position data                         │ │
│ │    Shows: lat, lon, alt, fix quality, HDOP, satellites,         │ │
│ │           node selector, "Create new node", "Create edge"       │ │
│ │                                                                 │ │
│ │  Survey Node Type Dialog (dynamic, singleton)                   │ │
│ │    Nav: TSC3 sends new unmatched point                          │ │
│ │    Dismiss: Cancel / overlay / type selection                   │ │
│ │    Shows: point name + type buttons (Manhole, Home, etc.)       │ │
│ │    Queues points while open, processes sequentially             │ │
│ │                                                                 │ │
│ │  Device Picker Dialog (dynamic)                                 │ │
│ │    Nav: "Connect Bluetooth" with multiple paired devices        │ │
│ │    Dismiss: Cancel / device selection                           │ │
│ │    Shows: paired devices list, survey devices highlighted       │ │
│ │                                                                 │ │
│ │  Node Context Menu (dynamic)                                    │ │
│ │    Nav: long-press (touch) / right-click on canvas node         │ │
│ │    Dismiss: click outside / action selection                    │ │
│ │    Actions: Edit, Delete                                        │ │
│ │                                                                 │ │
│ │  WebSocket Address Prompt (native browser prompt())             │ │
│ │    Nav: "Connect WebSocket" in Measurement group                │ │
│ │    Dismiss: OK / Cancel                                         │ │
│ │    Pre-filled with saved address (default: localhost:8765)      │ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ NATIVE CONFIRM DIALOGS (browser confirm()) ───────────────────┐ │
│ │  These use native browser confirm() — no custom UI              │ │
│ │                                                                 │ │
│ │  Canvas actions:                                                │ │
│ │    Delete node with connected edges                             │ │
│ │    Delete edge                                                  │ │
│ │    Undo operations with data                                    │ │
│ │    Start new sketch (clears existing data)                      │ │
│ │    Import sketch (replaces current)                             │ │
│ │    Different-area CSV import                                    │ │
│ │                                                                 │ │
│ │  Admin actions:                                                 │ │
│ │    Delete organization, project, layer, option, input flow rule │ │
│ │                                                                 │ │
│ │  Sidebar actions:                                               │ │
│ │    Merge stub nodes fix suggestion                              │ │
│ │                                                                 │ │
│ │  Project canvas:                                                │ │
│ │    Cross-sketch merge                                           │ │
│ │                                                                 │ │
│ │  Exit guards:                                                   │ │
│ │    beforeunload — browser "Leave site?" when closing tab        │ │
│ │    Android back on main canvas — "Exit the app?" confirm        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ HIDDEN FILE INPUTS (OS-native file picker) ───────────────────┐ │
│ │  #importSketchFile — JSON file picker (import sketch action)    │ │
│ │  #importCoordinatesFile — CSV file picker (import coords)       │ │
│ │  #inputFlowImportFile — JSON (input flow config import)         │ │
│ │  #adminScreenImportFile — JSON (admin screen settings import)   │ │
│ │  #adminImportFile — JSON (admin modal settings import)          │ │
│ │  Nav: programmatic .click() from menu/button actions            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ 3D VIEW OVERLAY (fullscreen, dynamic) ─────────────────────────┐ │
│ │  Nav: 3D View btn in canvas toolbar (admin+ only)               │ │
│ │  Dismiss: close btn / Escape                                    │ │
│ │  Lazy-loads Three.js on first use                               │ │
│ │                                                                 │ │
│ │  ┌─ Header bar                                              │   │ │
│ │  │   Title, speed controls, minimap toggle,                 │   │ │
│ │  │   Orbit/FPS mode toggle, close btn                       │   │ │
│ │  │   Auto-hides in landscape mobile                         │   │ │
│ │  ├─ Header Show Button (.three-d-overlay__header-show-btn)  │   │ │
│ │  │   Nav: visible when 3D header auto-hides (landscape)     │   │ │
│ │  │   Click → re-shows header                                │   │ │
│ │  ├─ WebGL Canvas                                            │   │ │
│ │  ├─ Camera modes                                            │   │ │
│ │  │   Orbit: rotate/zoom/pan (OrbitControls)                 │   │ │
│ │  │   FPS: WASD + mouse look (three-d-fps-controls.js)       │   │ │
│ │  ├─ Controls Hint (.three-d-overlay__controls-hint)         │   │ │
│ │  │   Nav: auto-shown on mode switch (once per mode)         │   │ │
│ │  │   Dismiss: auto-fades after 2.5-4s                       │   │ │
│ │  │   Shows: mode-specific instructions (WASD/drag/scroll)   │   │ │
│ │  ├─ Mode Transition Flash (dark overlay)                    │   │ │
│ │  │   150ms fade-in, mode switch, 200ms fade-out             │   │ │
│ │  ├─ Orbit controls (zoom in/out/recenter btns)              │   │ │
│ │  ├─ Edge type legend (collapsible, starts collapsed)        │   │ │
│ │  ├─ Crosshair + sprint badge (FPS mode only)                │   │ │
│ │  ├─ Virtual Joystick (.three-d-joystick, FPS mobile only)   │   │ │
│ │  │   Nav: touch left side of 3D canvas in FPS mode          │   │ │
│ │  │   Dismiss: touch release                                 │   │ │
│ │  │   Shows: base circle + draggable thumb + sprint zone     │   │ │
│ │  ├─ Issues Panel (.three-d-overlay__issues-panel)           │   │ │
│ │  │   Nav: auto-shown when issues exist, collapsible toggle  │   │ │
│ │  │   Shows: warning icon + count, expandable issue rows     │   │ │
│ │  │   Click issue → camera flies to relevant node/edge       │   │ │
│ │  └─ Fix Popup (.three-d-fix-popup)                          │   │ │
│ │      Nav: click/tap issue-flagged 3D mesh (raycasting)      │   │ │
│ │      Dismiss: X btn / click elsewhere                       │   │ │
│ │      Shows: issue label + fix action buttons                │   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ SERVICE WORKER BEHAVIORS ──────────────────────────────────────┐ │
│ │  Offline refresh guards:                                        │ │
│ │    F5/Ctrl+R intercepted → toast "Refresh blocked while offline"│ │
│ │    beforeunload blocked while offline                           │ │
│ │    Swipe-to-refresh blocked via touch event intercept           │ │
│ │  App update: controllerchange → toast "App updated" → reload    │ │
│ │  Connectivity: online/offline events → toast notifications      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Element Descriptions & Focus Points

### Standalone Pages

**Offline Page** (`public/offline.html`)
Fallback page served by the service worker when the user has no network and the requested page isn't cached.
Focus: (1) bilingual he/en via localStorage check, (2) "Try Again" reloads the page, (3) styled standalone — no app JS dependency.

**Health Page** (`public/health/index.html`)
Self-contained diagnostics page for debugging PWA issues on user devices.
Focus: (1) checks SW registration status + cache key listing, (2) IndexedDB read/write test, (3) online/offline indicator — useful for field support.

---

### Top-Level Screens

**Skip Link** (`.skip-link`)
Hidden accessibility link that appears on keyboard Tab, jumping focus past the header to `#main`.
Focus: (1) a11y compliance for screen readers, (2) only visible on keyboard focus, (3) targets `#main` content area.

**Auth Loading Overlay** (`#authLoadingOverlay`)
Full-screen spinner shown during the initial session verification before any content renders.
Focus: (1) blocks all interaction until auth state resolves, (2) auto-hidden by auth-guard callback, (3) prevents flash of wrong screen (login vs home).

**Login Panel** (`#loginPanel`)
Animated full-screen panel hosting React-rendered auth forms for sign-in and sign-up.
Focus: (1) React mount/unmount into `#authContainer` via `mountAuthSignIn()`/`mountAuthSignUp()`, (2) language toggle persists choice to localStorage, (3) animated slide-out on successful auth via `hidePanelAnimated()`.

**SignInForm / SignUpForm** (`src/auth/auth-provider.jsx`)
React components rendering email/password forms with validation and error display.
Focus: (1) static import (not dynamic) so forms work offline, (2) form links use hash navigation to switch between `#/login` ↔ `#/signup`, (3) calls Better Auth client `signIn.email()` / `signUp.email()`.

**Admin Screen** (`#adminScreen`)
Full-screen tabbed hub for system administration — settings, projects, users, orgs, features, and data fixes.
Focus: (1) 6 tabs with lazy `import()` for Settings and Projects tabs, (2) role-gated: admin sees Settings+Projects, super_admin sees all 6, (3) hides `#main` while visible, restores on close.

**Settings Tab** (`admin-settings.js`)
Admin configuration for sketch field options — defines dropdown choices for node/edge properties across the organization.
Focus: (1) CRUD for option lists (types, materials, diameters) with drag-reorder, (2) import/export as JSON for backup, (3) confirm() on option delete to prevent accidental data loss.

**Projects Tab** (`projects-settings.js`)
Project management with CRUD cards, layer management, and input flow configuration entry point.
Focus: (1) project cards with edit/duplicate/delete/layers actions, (2) spawns Project Create/Edit Modal and Layers Management Modal, (3) "Input Flow Config" button navigates to `#inputFlowScreen`.

**Project Create/Edit Modal** (dynamic, in projects-settings.js)
Simple form modal for creating or editing a project's name and description.
Focus: (1) shared modal for both create and edit flows, (2) backdrop click dismisses without saving, (3) validates required name field before submit.

**Layers Management Modal** (dynamic wide modal, in projects-settings.js)
Wide modal for managing GeoJSON reference layers attached to a project.
Focus: (1) lists existing layers with delete buttons (confirm()), (2) file upload form with GeoJSON type selector, (3) uploaded layers appear on the canvas map overlay.

**Users Tab** (inline in admin-panel.js)
User list with role assignment and organization membership management.
Focus: (1) super_admin only, (2) role dropdown per user (user/admin/super_admin), (3) org assignment dropdown.

**Organizations Tab** (inline in admin-panel.js)
Organization CRUD for multi-tenant isolation.
Focus: (1) super_admin only, (2) create/rename/delete orgs with confirm(), (3) orgs gate which sketches/projects users can see.

**Features Tab** (inline in admin-panel.js)
Feature flag management toggling capabilities per user or per organization.
Focus: (1) super_admin only, (2) flags: export_csv, export_sketch, admin_settings, finish_workday, node_types, edge_types, (3) targets can be individual users or entire orgs.

**Issues & Fixes Tab** (inline in admin-panel.js)
Data repair tools for identifying and bulk-fixing data quality issues across sketches.
Focus: (1) super_admin only, (2) scans for orphan nodes, bad coordinates, missing fields, (3) batch fix operations with progress feedback.

**Input Flow Settings Screen** (`#inputFlowScreen`)
Conditional field logic editor — defines when sidebar wizard tabs appear based on node/edge type or other field values.
Focus: (1) rule builder with condition → action pairs, (2) import/export JSON via hidden `#inputFlowImportFile`, (3) confirm() on rule delete.

**Projects Screen** (`#projectsScreen`)
Standalone project listing for quick project access outside the admin panel.
Focus: (1) shares `ProjectsSettings` class with Admin Projects tab, (2) accessible from header/mobile menu at admin+ role, (3) hides `#main` while visible.

---

### Header & Navigation

**Desktop Header** (`header.soft-blue-header`)
Persistent top bar with brand, actions, and navigation — auto-hides in landscape mobile to maximize canvas space.
Focus: (1) responsive: full controls on desktop, collapses to hamburger on mobile (≤600px), (2) landscape auto-hide with recall handle, (3) contains all primary navigation targets (admin, projects, sketches, user menu).

**Brand Section** (logo + sketch name + sync indicator)
Displays current context — app logo, active sketch name, and real-time cloud sync state.
Focus: (1) `#sketchNameDisplay` (desktop) + `#sketchNameDisplayMobile` (mobile) are separate elements, (2) `#headerSyncIndicator` cycles through synced/syncing/offline/error states with icons, (3) sync indicator hidden when not signed in.

**Command Menu Dropdown** (`#exportDropdown`)
Desktop power-user menu grouping sketch, CSV, location, GNSS, and map actions into a single dropdown.
Focus: (1) groups: Sketch (export/import), CSV (nodes/edges), Workday, Location (coords/scale/stretch), GNSS (live measure), Map (layer/type/reference), (2) toggle items (autosave, map layer) stay open on click, action items close menu, (3) some items trigger hidden file inputs or native dialogs.

**User Account Dropdown** (dynamic in `#authUserButton`)
Lightweight identity dropdown showing the signed-in user's info and sign-out action.
Focus: (1) shows display name, email, role badge (user/admin/super_admin), (2) Sign Out calls `authClient.signOut()` then redirects to `#/login`, (3) positioned relative to avatar button.

**Header Recall Handle** (`#headerRecallHandle`)
Small touch target that appears when the header auto-hides in landscape orientation.
Focus: (1) landscape mobile only — maximizes vertical canvas space, (2) touch/click reveals the full header, (3) auto-hides again after inactivity.

**Mobile Menu** (`#mobileMenu`)
Full-screen slide-in drawer replacing the desktop header controls on small screens.
Focus: (1) 6 collapsible groups with localStorage-persisted collapse state, (2) dismisses on action click + auto-closes on viewport resize >600px, (3) backdrop dim overlay (`#mobileMenuBackdrop`) for click-outside dismiss.

---

### Canvas Container

**Canvas Empty State** (`#canvasEmptyState`)
Instructional card shown when a sketch has zero nodes, guiding first-time users.
Focus: (1) only shown once per sketch until "Got it" sets `_emptyStateDismissed`, (2) hidden during project-canvas mode and when panels overlay, (3) teaches users to tap canvas to place first node.

**Home Panel** (`#homePanel`)
Central hub for sketch and project selection — the main "lobby" screen after authentication.
Focus: (1) two modes: "projects" (org project cards) vs "sketches" (Personal/Org tabbed list), (2) `#syncStatusBar` shows animated sync state at top, (3) sketch cards have load, rename, delete, and "Change Project" actions.

**Sync Status Bar** (`#syncStatusBar`)
Colored status indicator inside the home panel showing real-time sync progress.
Focus: (1) states: syncing (spinning icon), synced (check), offline (cloud_off), error (warning), (2) color-coded: green/blue/gray/red, (3) only visible inside home panel context.

**Sketch Tabs** (`#sketchTabs`)
Tab switcher in home panel toggling between personal and organization sketch lists.
Focus: (1) `#personalTab` (person icon) / `#organizationTab` (business icon), (2) tab click re-fetches and re-renders `#sketchList`, (3) org tab only shown when user belongs to an organization.

**Start Panel** (`#startPanel`)
Sketch creation form with project assignment and date selection.
Focus: (1) project selector dropdown populated from user's org projects, (2) date picker defaults to today, (3) confirm() if starting new sketch would replace existing unsaved data.

**Layers Config Button + Panel** (`#layersConfigBtn` / `#layersConfigPanel`)
Floating map control for toggling base map and reference layer visibility on the canvas.
Focus: (1) positioned top-left below pegman, opens floating dropdown panel, (2) three sections: Base Map (toggle + orthophoto/street select), Reference Layers (master + per-layer), Sections (per-section), (3) state persisted — map preferences survive page reload.

**Street View Pegman** (canvas widget, `src/map/street-view.js`)
Draggable pegman icon enabling quick Street View access at any canvas location.
Focus: (1) drag creates transient `.street-view-pegman-ghost` (cursor) + `.street-view-drop-indicator` (target circle), (2) drop converts canvas coords → WGS84 → opens Google Street View in new tab, (3) elements auto-removed on pointer release.

**Drawing Toolbar** (`.canvas-toolbar`)
Fixed toolbar with drawing mode buttons, undo/redo, zoom, and the 3D view launcher.
Focus: (1) mode buttons: Node (N), Home node, Drainage node, Edge (E) — mutually exclusive active state, (2) My Location button with `.canvas-toolbar-divider` separator, (3) 3D View button (admin+ only, hidden by default until feature-flagged).

**FAB Speed Dial** (`#canvasFabToolbar`)
Expandable floating action button with canvas navigation shortcuts.
Focus: (1) toggle reveals 4 actions: incomplete edge tracker (with count badge), recenter by density, recenter sketch, zoom to fit, (2) `#incompleteEdgeTracker` shows real-time count of dangling edges, (3) auto-collapses on action use.

**Take Measure FAB** (`#gpsQuickCaptureBtn`)
Prominent floating button for capturing the current GNSS position onto a node.
Focus: (1) only visible when Live Measure mode is active, (2) visual feedback: fix-quality color ring (green=RTK, yellow=float, orange=DGPS, red=GPS), precision pulse animation, (3) click opens GNSS Point Capture Dialog.

**Survey Connection Badge** (`#surveyConnectionBadge`)
Small Bluetooth icon badge indicating active TSC3 survey controller connection.
Focus: (1) auto-shown/hidden based on TSC3 connection state, (2) Bluetooth icon with green connected state, (3) non-interactive — informational only.

**Edge Type Legend** (`#edgeLegend`)
Color-coded legend mapping edge type names to their line colors on the canvas.
Focus: (1) auto-rendered by `renderEdgeLegend()` when adminConfig defines edge types, (2) positioned bottom of canvas, (3) updates dynamically when edge type configuration changes.

---

### Canvas Overlays (rendered in draw loop)

**Issue Indicators** (red dashed lines + warning badges)
Persistent visual markers on edges/nodes that have unresolved data quality issues.
Focus: (1) rendered every frame in the draw loop — not DOM elements, (2) red dashed line along problematic edges + small warning badge icon, (3) issues computed by `computeSketchIssues()` (missing coords, missing measurements, etc.).

**Incomplete Edge Highlight** (dangling edge visual)
Visual emphasis on edges that have only one connected node (half-drawn pipes).
Focus: (1) targets edges where `head === null` or `isDangling === true`, (2) canvas-rendered — disappears when edge is completed or deleted, (3) `#incompleteEdgeTracker` in FAB shows the count.

**Issue Highlight Animation** (pulsing red ring, `src/project/issue-highlight.js`)
Temporary animated pulsing ring drawing attention to a specific issue location on canvas.
Focus: (1) triggered by issue navigation from sketch side panel, (2) uses `window.__issueHighlight.start(worldX, worldY, durationMs)`, (3) draws via `ctx` in screen space, auto-expires after duration.

**Merge Mode Overlay** (amber dots + dashed lines, `src/project/project-canvas-renderer.js`)
Canvas overlay highlighting potential duplicate nodes across sketches during merge mode.
Focus: (1) amber circles mark nearby nodes from other sketches within configurable radius, (2) dashed connection lines between candidate duplicate pairs, (3) only visible when merge mode is active in sketch side panel.

---

### Sketch Side Panel

**Sketch Side Panel** (`#sketchSidePanel`)
Collapsible panel in project-canvas mode showing all sketches with visibility controls, issues, and merge tools.
Focus: (1) three switchable views: sketch list, issues sub-panel, merge mode, (2) toggle via `#sketchSidePanelToggle` (layers icon), (3) `#backToProjectsBtn` navigates back to `#/projects`.

**View 1: Sketch List** (default view)
List of all sketches in the current project with per-sketch visibility toggles and stats.
Focus: (1) eye icon toggles sketch visibility on the project canvas overlay, (2) active sketch highlighted — click to switch active, (3) per-sketch stats: node count, edge count, total km.

**View 2: Issues Sub-Panel**
Per-sketch issue list with navigation tools to jump between problems on the canvas.
Focus: (1) groups issues by sketch with working status indicators, (2) "my_location" button → goto overview (targetScale 0.21), (3) "swap_horiz" button → center-between mode (dynamic zoom to fit issue + last edit position).

**View 3: Merge Mode** (`src/project/merge-mode.js`)
Cross-sketch duplicate detection and merging interface for cleaning overlapping data.
Focus: (1) configurable search radius with real-time duplicate count, (2) grouped pairs by source sketch with navigate-to buttons, (3) merge-apply with confirm() — combines duplicate nodes preserving the best data.

---

### Sidebar / Drawer

**Sidebar** (`#sidebar`)
Resizable detail panel showing editable properties for the selected node or edge.
Focus: (1) opens with `.open` CSS class on node/edge selection, syncs `body.drawer-open`, (2) resizable via drag handle (`resizable-drawer.js`), (3) content fully re-rendered by `renderDetails()` on each selection change.

**Node Details — ID & Type**
Editable node identifier field and type selector dropdown.
Focus: (1) ID field allows renaming (validates uniqueness), (2) type selector populated from adminConfig options, (3) type change may trigger input-flow-engine to show/hide wizard tabs.

**Node Details — Coordinates & Position Lock**
Coordinate readout and lock toggle preventing GPS overwrite of manually-placed nodes.
Focus: (1) displays surveyX/Y (ITM) and lat/lon (WGS84) when available, (2) `#positionLockToggle` checkbox with padlock icon, (3) locked nodes skip repositioning during CSV import or GNSS capture.

**Node Details — Tabbed Wizard** (`.wizard-tab`)
Multi-tab data entry interface for node attributes — one tab per property category.
Focus: (1) tabs: accuracy, maintenance, material, cover_diameter, access, note — colored buttons with check mark when filled, (2) RTK Fixed accuracy auto-fills from GNSS capture, (3) active tab persisted across re-renders using `_lastActiveWizardTab`.

**Node Details — Connected Edges List**
Clickable list of edges connected to the selected node with quick navigation.
Focus: (1) click an edge → selects it and scrolls sidebar to edge details, (2) shows edge type icon + length if available, (3) useful for tracing pipe network connectivity.

**Issues List** (`.element-issues-list`)
Red-highlighted list of data quality issues on the selected node or edge.
Focus: (1) red-tinted items with warning icons and descriptive text, (2) click an issue → triggers issue highlight animation on canvas, (3) issues computed from `computeSketchIssues()` — missing coords, missing measurements, long edges, negative gradients.

**Fix Suggestions** (`.fix-suggestions-section`)
Actionable fix buttons for resolving detected issues on the selected element.
Focus: (1) lightbulb icon header + per-suggestion action buttons, (2) actions: convert node type, swap tail/head measurements, merge stub nodes (confirm()), set locked status, (3) applying a fix auto-advances to the next issue in the navigation bar.

**Issue Navigation Bar** (`.issue-nav-bar`, project-canvas only)
Prev/next navigation for stepping through all issues in the current sketch.
Focus: (1) shows "Issue X of Y" counter, (2) prev/next arrows cycle through issues selecting the relevant node/edge, (3) only appears in project-canvas mode when issue context is active.

**Edge Details**
Property editing for pipe/edge attributes — type, material, diameter, measurements.
Focus: (1) tail/head node references are clickable → selects and scrolls to that node, (2) edge type/material/diameter from adminConfig dropdowns, (3) length/depth numeric fields use floating keyboard on mobile.

**Delete Button** (node/edge)
Destructive action to remove the selected element from the sketch.
Focus: (1) node delete: confirm() if node has connected edges (warns about cascade), (2) edge delete: confirm() always, (3) deletion is undoable via undo stack.

---

### Floating Keyboard

**Floating Keyboard** (`#floatingKeyboard`)
Draggable on-screen numeric keypad for mobile field data entry without native keyboard.
Focus: (1) auto-appears on numeric input focus on touch devices, (2) draggable to reposition — prevents covering the input field, (3) keys: 0-9, decimal point, backspace, done — dispatches input events to the focused field.

---

### Modal Dialogs

**Help Modal** (`#helpModal`)
Reference card showing keyboard shortcuts and usage tips for the canvas workspace.
Focus: (1) lists all shortcuts: N (node), E (edge), +/- (zoom), 0 (reset), Delete, Escape, (2) includes touch gesture tips for mobile, (3) accessible from header and mobile menu.

**Admin Config Modal** (`#adminModal`)
Legacy per-sketch admin configuration modal with import/export functionality.
Focus: (1) edits adminConfig JSON attached to the current sketch, (2) import via hidden `#adminImportFile` file input, (3) export downloads adminConfig as JSON.

**Finish Workday Modal** (`#finishWorkdayModal`)
End-of-day workflow that resolves incomplete edges and bulk-exports the day's work as CSV.
Focus: (1) lists all dangling/incomplete edges with node-type selector per unresolved endpoint, (2) on confirm: assigns types to unresolved endpoints + exports all today's sketches as CSV, (3) feature-flagged via `finish_workday`.

**Change Project Modal** (dynamic)
Quick project reassignment for a sketch from the home panel.
Focus: (1) project selector dropdown with all available projects, (2) optional "Update input flow config" checkbox to sync field rules, (3) triggers API PUT to update sketch's `project_id`.

**Coordinates Required Prompt** (dynamic)
Decision dialog shown when opening a sketch that has nodes but no geographic coordinates.
Focus: (1) three options: Import CSV (→ file picker), Open without coordinates, Cancel, (2) helps users who draw first and survey later, (3) prevents confusion from nodes positioned at canvas origin.

**GNSS Point Capture Dialog** (dynamic, singleton, `src/gnss/point-capture-dialog.js`)
Live GNSS data display with controls for assigning a position to a node.
Focus: (1) real-time updates: lat, lon, altitude, fix quality, HDOP, satellite count, (2) node selector dropdown or "Create new node" checkbox + "Create edge" option, (3) Capture button assigns current GNSS position to selected/new node as surveyX/Y.

**Survey Node Type Dialog** (dynamic, singleton, `src/survey/survey-node-type-dialog.js`)
Type selection dialog for new survey points received from a TSC3 controller.
Focus: (1) shows incoming point name + grid of type buttons (Manhole, Home, Drainage, Valve, etc.), (2) points queue while dialog is open — processed sequentially on dismiss, (3) selecting a type creates the node with both coordinates and type pre-set.

**Device Picker Dialog** (dynamic, `src/survey/device-picker-dialog.js`)
Bluetooth device selection list for connecting to a TSC3 survey controller or GNSS receiver.
Focus: (1) lists paired Bluetooth devices with name and MAC address, (2) survey-compatible devices (Trimble/TSC) highlighted, (3) selecting a device initiates SPP connection via Capacitor plugin.

**Node Context Menu** (dynamic)
Floating contextual action menu on canvas nodes via long-press or right-click.
Focus: (1) positioned at tap/click coordinates near the node, (2) actions: Edit (selects + opens sidebar), Delete (with confirm()), (3) auto-dismissed on any click outside.

**WebSocket Address Prompt** (native `prompt()`)
Native browser text input for specifying the TSC3 WebSocket bridge address.
Focus: (1) pre-filled with last-used address from localStorage (default: `localhost:8765`), (2) triggers `tsc3-websocket-adapter.js` connection on OK, (3) used for desktop testing or phone-over-LAN scenarios.

---

### Native Confirm Dialogs

**Canvas Confirms**
Browser-native confirmation dialogs for destructive canvas operations.
Focus: (1) delete node cascades to connected edges — confirm warns about this, (2) import sketch/CSV replaces current data — confirm prevents accidental overwrite, (3) undo with data confirms restoration of previous state.

**Admin Confirms**
Confirmation dialogs for admin CRUD operations that affect shared resources.
Focus: (1) delete organization/project/layer/option — all require confirm(), (2) input flow rule deletion confirmed separately, (3) protects against accidental data loss in shared config.

**Exit Guards**
Browser and Android back-button guards preventing accidental data loss on exit.
Focus: (1) `beforeunload` blocks tab close when sketch has unsaved data, (2) Android back on `#/` with data → "Exit the app?" confirm, (3) `popstate` handler follows hierarchical dismiss chain before reaching exit.

---

### Hidden File Inputs

**File Inputs** (`#importSketchFile`, `#importCoordinatesFile`, `#inputFlowImportFile`, `#adminScreenImportFile`, `#adminImportFile`)
Invisible file input elements triggered programmatically to open OS-native file pickers.
Focus: (1) `.click()` called from menu actions or import buttons, (2) `accept` attributes filter to relevant types (.json, .csv), (3) `change` event handler processes the selected file (parse → validate → apply).

---

### 3D View Overlay

**3D View Overlay** (`.three-d-overlay`, `src/three-d/three-d-view.js`)
Fullscreen immersive 3D underground visualization of the manhole/pipe network.
Focus: (1) lazy-loads Three.js + all 3D modules on first open, (2) two camera modes: Orbit (rotate/zoom/pan) and FPS (WASD walk-through), (3) admin+ only — button hidden in toolbar until role check passes.

**3D Header Bar**
Top control strip with mode toggle, speed controls, minimap, and close button.
Focus: (1) auto-hides in landscape mobile to maximize 3D viewport, (2) mode toggle triggers transition flash animation (350ms), (3) speed slider controls FPS movement speed.

**3D Header Show Button** (`.three-d-overlay__header-show-btn`)
Small floating button to re-reveal the auto-hidden 3D header in landscape mode.
Focus: (1) only visible when header is auto-hidden, (2) "tune" material icon, (3) click restores full header bar.

**3D Controls Hint** (`.three-d-overlay__controls-hint`)
Tutorial-style text overlay explaining controls for the current camera mode.
Focus: (1) shown once per mode (game-tutorial pattern — remembers which modes were seen), (2) auto-fades after 2.5s (mobile) to 4s (desktop), (3) Orbit: "Drag to rotate, Scroll to zoom"; FPS: "WASD to move, Mouse to look, Shift to sprint".

**3D Mode Transition Flash**
Brief dark overlay providing visual continuity during Orbit ↔ FPS mode switches.
Focus: (1) 150ms fade-in to peak darkness, (2) mode switch happens at peak, (3) 200ms fade-out — total 350ms, DOM element auto-removed.

**3D Orbit Controls** (zoom in/out/recenter buttons)
Floating button group for Orbit camera manipulation.
Focus: (1) zoom in/out with smooth animated transitions, (2) recenter resets camera to fit-to-bounds overview, (3) hidden during FPS mode.

**3D Edge Type Legend** (collapsible)
Color legend for edge types in the 3D scene, matching the canvas legend styling.
Focus: (1) starts collapsed to avoid cluttering the 3D view, (2) toggle expands/collapses, (3) same color mapping as 2D canvas `#edgeLegend`.

**3D Crosshair + Sprint Badge** (FPS mode)
HUD elements for first-person navigation — crosshair reticle and sprint state indicator.
Focus: (1) crosshair centered on viewport for aiming/navigation, (2) sprint badge appears when Shift held (faster movement), (3) both hidden during Orbit mode.

**3D Virtual Joystick** (`.three-d-joystick`, `src/three-d/three-d-joystick.js`)
Touch joystick for FPS movement on mobile devices without keyboard.
Focus: (1) appears on left-side touch in FPS mode, (2) base circle with directional ticks + draggable thumb knob, (3) sprint zone indicator at outer edge — drag thumb past threshold to sprint.

**3D Issues Panel** (`.three-d-overlay__issues-panel`)
Collapsible sidebar listing all data quality issues with 3D camera navigation.
Focus: (1) auto-shown when issues exist, collapsible via toggle button, (2) warning icon with count badge in header, (3) click an issue row → camera flies to the relevant 3D mesh.

**3D Fix Popup** (`.three-d-fix-popup`, `src/three-d/three-d-issues.js`)
Contextual popup on issue-flagged 3D objects with fix action buttons.
Focus: (1) triggered by raycasting — click/tap on an issue mesh, (2) positioned near click point with issue type labels, (3) same fix-suggestions engine as 2D sidebar — actions apply fixes directly.

---

### Service Worker Behaviors

**Offline Refresh Guards** (`src/serviceWorker/register-sw.js`)
Prevents accidental page reload when offline, which would show the browser's offline error.
Focus: (1) F5/Ctrl+R key intercepted → toast "Refresh blocked while offline", (2) `beforeunload` event blocked to prevent navigation, (3) touch swipe-to-refresh intercepted via touch event handler.

**App Update Flow** (service worker `controllerchange`)
Automatic update detection and reload when a new service worker version activates.
Focus: (1) 15-minute update check interval via `registration.update()`, (2) new SW activates → `controllerchange` fires → toast "App updated", (3) auto-reloads page after brief delay to apply new version.

**Connectivity Toasts** (online/offline events)
Automatic toast notifications when the browser's network state changes.
Focus: (1) `window.addEventListener('online')` → "Connection restored" toast, (2) `window.addEventListener('offline')` → "You are offline" toast, (3) sync-service resumes/pauses queue processing based on connectivity.

---

## Navigation Methods Reference

| Method | Mechanism | Used By |
|--------|-----------|---------|
| **Hash routing** | `location.hash = '#/…'` → `hashchange` → `handleRoute()` | All top-level screen switches |
| **Auth guard redirect** | `auth-guard.js` evaluates auth state → forces `#/login` or `#/` | Unauthenticated access, post-login |
| **Panel show/hide** | `style.display` + `hidePanelAnimated()` CSS transitions | Login, Home, Start panels |
| **CSS class toggle** | `.open`, `.active`, `.panel-closing`, `mobile-menu--open` | Sidebar, mobile menu, FAB |
| **DOM append/remove** | Dynamic `createElement` → `document.body.appendChild()` | All dynamic dialogs/modals |
| **Menu events** | `menuEvents.emit(action)` EventEmitter singleton | Cross-module actions (GNSS, survey, export) |
| **Lazy dynamic import** | `await import('./module.js')` on first use | Admin tabs, Input Flow, 3D View |
| **Canvas interaction** | Tap/click/long-press on canvas elements | Node/edge selection, context menu |
| **Native browser dialogs** | `confirm()`, `prompt()` | Destructive actions, WebSocket address |
| **Hidden file input .click()** | Programmatic trigger → OS file picker | Import sketch/CSV/settings |
| **Escape key cascade** | Hierarchical close priority chain | admin → projects → modal → home → start → selection |
| **Android back (popstate)** | Hierarchical handler | sidebar → home → mobile menu → `#/` → exit confirm |
| **SW navigation fallback** | Service worker → `offline.html` | Offline with no cache |
| **Toast notifications** | `showToast(msg)` / online-offline events | Status messages, errors, connectivity |

---

## Key Source Files

| File | Role |
|------|------|
| `index.html` | All static DOM elements (949 lines) |
| `src/main-entry.js` | ES module entry, auth/i18n/GNSS/menu init (972 lines) |
| `src/legacy/main.js` | Monolith: canvas, routing, panels, sidebar, CRUD (~11,300 lines) |
| `src/legacy/shared-state.js` | Extracted shared state exports (legacy ↔ ES module bridge) |
| `src/legacy/gnss-handlers.js` | Extracted GNSS event handlers (~490 lines) |
| `src/legacy/tsc3-handlers.js` | Extracted TSC3 survey controller handlers (~170 lines) |
| `src/legacy/admin-handlers.js` | Extracted admin panel handlers (~190 lines) |
| `src/legacy/library-manager.js` | Extracted library/catalog management (~530 lines) |
| `src/auth/auth-guard.js` | Route protection, session polling |
| `src/auth/auth-provider.jsx` | React SignIn/SignUp forms |
| `src/auth/sync-service.js` | Cloud sync with 2s debounce, AbortController |
| `src/admin/admin-panel.js` | Tabbed admin hub (6 tabs, lazy-loaded) |
| `src/admin/admin-settings.js` | Admin Settings tab |
| `src/admin/projects-settings.js` | Projects tab + project/layer modals |
| `src/admin/input-flow-settings.js` | Input flow conditional field editor |
| `src/project/sketch-side-panel.js` | Project-canvas sketch list + issues + merge mode |
| `src/project/merge-mode.js` | Cross-sketch duplicate detection + merge |
| `src/project/sketch-issues.js` | Issue detection engine |
| `src/project/issue-highlight.js` | Pulsing ring canvas animation |
| `src/project/project-canvas-renderer.js` | Background sketch + merge overlay rendering |
| `src/three-d/three-d-view.js` | 3D view overlay orchestrator |
| `src/three-d/three-d-scene.js` | Three.js scene (manholes, pipes, ground, labels) |
| `src/three-d/three-d-fps-controls.js` | FPS camera controls (WASD + joystick) |
| `src/three-d/three-d-joystick.js` | Virtual joystick for mobile FPS |
| `src/three-d/three-d-issues.js` | 3D issue raycasting + fix popups |
| `src/three-d/three-d-camera-framing.js` | FOV-based camera fit-to-bounds |
| `src/gnss/point-capture-dialog.js` | GNSS point capture dialog |
| `src/gnss/gnss-state.js` | GNSS state machine singleton |
| `src/gnss/gnss-marker.js` | Canvas accuracy circle + position dot |
| `src/survey/survey-node-type-dialog.js` | TSC3 node type picker |
| `src/survey/device-picker-dialog.js` | Bluetooth device picker |
| `src/survey/tsc3-connection-manager.js` | TSC3 connection orchestrator |
| `src/canvas-fab-toolbar.js` | FAB speed dial |
| `src/map/layers-config.js` | Layers config button + floating panel |
| `src/map/street-view.js` | Pegman drag → Google Street View |
| `src/map/govmap-layer.js` | Israeli map tile rendering |
| `src/map/reference-layers.js` | GeoJSON reference layer rendering |
| `src/utils/floating-keyboard.js` | Draggable numeric keyboard |
| `src/utils/resizable-drawer.js` | Sidebar resize behavior |
| `src/utils/backup-manager.js` | Hourly/daily backup to IndexedDB |
| `src/menu/menu-events.js` | EventEmitter singleton |
| `src/menu/menu-config.js` | Menu structure definition |
| `src/serviceWorker/register-sw.js` | SW registration, offline guards, update toasts |
| `public/service-worker.js` | Caching strategies, offline fallback |
| `public/offline.html` | Offline fallback page |
| `public/health/index.html` | Diagnostics page |

# Manholes Mapper — Complete App UI Reference

This file is the single source of truth for ALL user-facing UI elements, panels, menus, buttons, dialogs, canvas tools, map layers, and keyboard shortcuts in the Manholes Mapper app. Every design audit agent MUST read this before analyzing or modifying UI.

---

## 1. HEADER / APP BAR (`#appHeader`)

### Brand Section
- `#brand` — Logo + title + sketch name container
- `#brandLogo` — Geopoint company logo image
- `#appTitle` — "Manhole Mapper" title text
- `#sketchNameDisplay` — Currently open sketch name (desktop)
- `#sketchNameDisplayMobile` — Sketch name below header (mobile only)
- `#headerSyncIndicator` — Cloud sync status icon (material icon: `cloud_done`)

### Primary Actions (Desktop only, `.primary-actions`)
- `#newSketchBtn` — "New Sketch" button (icon: `add`, i18n: `newSketch`)
- `#saveBtn` — "Save" button (icon: `save`, i18n: `save`)
- `#autosaveToggle` — Autosave checkbox toggle (i18n: `autosave`)

### Search (Desktop only, `.search-group`)
- `#searchNodeInput` — Search by node ID number (i18n: `searchNode` / `searchNodeTitle`)

### Size Controls (Desktop only, `.size-controls`)
- `#sizeDecreaseBtn` — Decrease element size (icon: `remove_circle_outline`, i18n: `sizeDecrease`)
- `#sizeIncreaseBtn` — Increase element size (icon: `add_circle_outline`, i18n: `sizeIncrease`)
- `#autoSizeBtn` — Auto-fit sizes (icon: `fit_screen`, i18n: `autoSize`)

### Command Menu Dropdown (Desktop "More" menu)
- `#exportMenuBtn` — "Apps" icon opens grouped dropdown (i18n: `menu`)
- `#exportDropdown` — Contains all grouped actions below

**Sketch Group** (`menuGroup.sketch`):
- `#exportSketchBtn` — Export sketch as JSON (icon: `download`, i18n: `exportSketch`)
- `#importSketchBtn` — Import sketch from JSON (icon: `upload`, i18n: `importSketch`)

**CSV Export Group** (`menuGroup.csv`):
- `#exportNodesBtn` — Export nodes as CSV (icon: `grid_on`, i18n: `exportNodes`)
- `#exportEdgesBtn` — Export edges as CSV (icon: `linear_scale`, i18n: `exportEdges`)

**Workday Group** (`menuGroup.workday`):
- `#finishWorkdayBtn` — Finish workday: exports all daily sketches + resolves dangling edges (icon: `task_alt`, i18n: `finishWorkday.button` / `finishWorkday.subtitle`)

**Location & Coordinates Group** (`menuGroup.location`):
- `#importCoordinatesBtn` — Import coordinates from CSV (icon: `place`, i18n: `coordinates.import`)
- `#coordinatesToggle` — Enable/disable coordinate display (i18n: `coordinates.enable`)
- `#coordinateScaleControls` — Scale adjuster: `#scaleDecreaseBtn`, `#scaleValueDisplay` ("1:100"), `#scaleIncreaseBtn` (i18n: `coordinates.scale`)
- `#stretchXControls` — Horizontal stretch: `#stretchXDecreaseBtn`, `#stretchXValueDisplay`, `#stretchXIncreaseBtn` (i18n: `stretch.horizontal`)
- `#stretchYControls` — Vertical stretch: `#stretchYDecreaseBtn`, `#stretchYValueDisplay`, `#stretchYIncreaseBtn` (i18n: `stretch.vertical`)
- `#resetStretchBtn` — Reset all stretch to 1.0 (icon: `restart_alt`, i18n: `stretch.reset`)

**GNSS / Live Measure Group** (`menuGroup.gnss`):
- `#liveMeasureToggle` — Enable live GNSS measurement (i18n: `liveMeasure.enable`)
- `#locationStatus` — GNSS fix status indicator text

**Map Layer Group** (`menuGroup.mapLayer`):
- `#mapLayerToggle` — Enable background map tiles (i18n: `mapLayer.enable`)
- `#mapTypeSelect` — Dropdown: Orthophoto/Street (i18n: `map.type` / `map.orthophoto` / `map.street`)
- `#refLayersToggle` — Enable project reference GeoJSON layers (i18n: `refLayers.enable`)
- `#refLayersList` — Container for per-layer toggle checkboxes
- `#refLayersSection` — Wrapper, hidden when no project layers exist

### Utility Actions (Desktop)
- `#langSelect` — Hebrew/English language switcher (i18n: `language`)
- `#helpBtn` — Opens help/shortcuts modal (icon: `help_outline`, i18n: `help`)
- `#adminBtn` — Opens admin settings (icon: `settings`, i18n: `admin.manage`)
- `#projectsBtn` — Opens projects management (icon: `folder`, i18n: `projects.title`)
- `#homeBtn` — Opens home panel / sketch list (icon: `home`, i18n: `home`)

### User Account
- `#userButtonContainer` / `#authUserButton` — Desktop user avatar/login area
- `.user-menu-trigger` — Avatar button that opens user dropdown
- `.user-menu-dropdown` — Shows name, email, Sign Out button
- `.user-menu-signout` — Signs out user
- `.user-login-btn` — Shown when unauthenticated, redirects to `#/login`

### Mobile Menu Toggle
- `#mobileMenuBtn` — Hamburger button opens slide-out mobile menu (icon: `menu`, i18n: `menu`)

---

## 2. MOBILE SLIDE-OUT MENU (`#mobileMenu`)

Full slide-out panel mirroring desktop actions in collapsible groups. Activated by `#mobileMenuBtn`.

### Structure
- `#mobileMenuTitle` — "Menu" title (i18n: `menu`)
- `#mobileMenuCloseBtn` — Close button (icon: `close`, i18n: `close`)
- `#mobileUserButtonContainer` / `#mobileAuthUserButton` — Mobile user avatar/login
- `#mobileMenuBackdrop` — Semi-transparent backdrop overlay

### Navigation Group (`menuGroup.navigation`)
- `#mobileHomeBtn` — Home (icon: `home`, i18n: `home`)
- `#mobileNewSketchBtn` — New Sketch (icon: `add`, i18n: `newSketch`)

### Search Group (`menuGroup.search`)
- `#mobileSearchNodeInput` — Search by node ID (i18n: `searchNode`)

### View Controls Group (`menuGroup.viewControls`)
- `#mobileZoomOutBtn` — Zoom Out (icon: `zoom_out`, i18n: `zoomOut`)
- `#mobileZoomInBtn` — Zoom In (icon: `zoom_in`, i18n: `zoomIn`)
- `#mobileSizeDecreaseBtn` — Size Decrease (icon: `remove_circle_outline`, i18n: `sizeDecrease`)
- `#mobileSizeIncreaseBtn` — Size Increase (icon: `add_circle_outline`, i18n: `sizeIncrease`)
- `#mobileAutoSizeBtn` — Auto Size (icon: `fit_screen`, i18n: `autoSize`)

### Sketch Group (`menuGroup.sketch`)
- `#mobileSaveBtn` — Save (icon: `save`, i18n: `save`)
- `#mobileExportSketchBtn` — Export Sketch (icon: `download`, i18n: `exportSketch`)
- `#mobileImportSketchBtn` — Import Sketch (icon: `upload`, i18n: `importSketch`)

### CSV Export Group (`menuGroup.csv`)
- `#mobileExportNodesBtn` — Export Nodes CSV (icon: `grid_on`, i18n: `exportNodes`)
- `#mobileExportEdgesBtn` — Export Edges CSV (icon: `linear_scale`, i18n: `exportEdges`)

### Location Group (`menuGroup.location`)
- `#mobileImportCoordinatesBtn` — Import Coordinates (icon: `place`, i18n: `coordinates.import`)
- `#mobileCoordinatesToggle` — Toggle Coordinates (i18n: `coordinates.enable`)
- `#mobileCoordinateScaleControls` — Scale: `#mobileScaleDecreaseBtn`, `#mobileScaleValueDisplay`, `#mobileScaleIncreaseBtn` (i18n: `coordinates.scale`)
- `#mobileStretchXControls` — X Stretch controls (i18n: `stretch.horizontal`)
- `#mobileStretchYControls` — Y Stretch controls (i18n: `stretch.vertical`)
- `#mobileResetStretchBtn` — Reset Stretch (i18n: `stretch.reset`)

### Map Layer Group (`menuGroup.mapLayer`)
- `#mobileMapLayerToggle` — Map layer toggle (i18n: `mapLayer.enable`)
- `#mobileMapTypeSelect` — Map type: Orthophoto/Street (i18n: `map.type`)
- `#mobileRefLayersToggle` — Reference layers toggle (i18n: `refLayers.enable`)
- `#mobileRefLayersList` — Per-layer toggle list

### GNSS Group (`menuGroup.gnss`)
- `#mobileLiveMeasureToggle` — Live Measure toggle (i18n: `liveMeasure.enable`)
- `#mobileLocationStatus` — GNSS fix status text

### Survey Device Group (`menuGroup.surveyDevice`)
- `#mobileConnectSurveyBluetoothBtn` — Connect Bluetooth (icon: `bluetooth`, i18n: `survey.connectBluetooth`)
- `#mobileConnectSurveyWebSocketBtn` — Connect WebSocket (icon: `wifi`, i18n: `survey.connectWebSocket`)
- `#mobileDisconnectSurveyBtn` — Disconnect (icon: `bluetooth_disabled`, i18n: `survey.disconnect`)

### Workday Group (`menuGroup.workday`)
- `#mobileFinishWorkdayBtn` — Finish Workday (icon: `task_alt`, i18n: `finishWorkday.button`)

### Settings Group (`menuGroup.settings`)
- `#mobileAutosaveToggle` — Autosave toggle (i18n: `autosave`)
- `#mobileLangSelect` — Language switcher
- `#mobileHelpBtn` — Help (icon: `help_outline`, i18n: `help`)
- `#mobileAdminBtn` — Admin (icon: `settings`, i18n: `admin.manage`)
- `#mobileProjectsBtn` — Projects (icon: `folder`, i18n: `projects.title`)

---

## 3. CANVAS TOOLBAR (`#modeGroup`, `.canvas-toolbar`)

Bottom-left vertical toolbar for drawing tools. All buttons are `.btn-icon-sm` (44px touch target).

| Button | ID | Icon | Keyboard | i18n | Description |
|--------|-------|------|----------|------|-------------|
| My Location | `myLocationBtn` | `my_location` | — | `location.myLocation` | GPS tracking, centers on user |
| — | (divider) | — | — | — | Visual separator |
| Node Mode | `nodeModeBtn` | `album` | `N` | `modeNode` | Create manhole nodes |
| Home Node Mode | `homeNodeModeBtn` | `home` | — | `modeHome` | Create home connection nodes |
| Drainage Node Mode | `drainageNodeModeBtn` | `water_drop` | — | `modeDrainage` | Create drainage nodes |
| Edge Mode | `edgeModeBtn` | `timeline` | `E` | `modeEdge` | Connect nodes with edges |
| — | (divider) | — | — | — | Visual separator |
| Undo | `undoBtn` | `undo` | — | `undo.title` | Undo last action (disabled by default) |
| — | (divider) | — | — | — | Visual separator |
| Zoom In | `canvasZoomInBtn` | `add` | `+`/`=` | `zoomIn` | Zoom in canvas |
| Zoom Out | `canvasZoomOutBtn` | `remove` | `-` | `zoomOut` | Zoom out canvas |
| — | (divider) | — | — | — | Visual separator |
| 3D View | `threeDViewBtn` | `view_in_ar` | — | `threeD.title` | 3D visualization (admin only, hidden default) |

### Canvas Modes (variable: `currentMode` in `src/legacy/main.js`)
| Mode | Description |
|------|-------------|
| `node` | Click canvas to create manhole nodes (circle icon) |
| `home` | Click canvas to create home connection nodes (house icon) |
| `drainage` | Click canvas to create drainage nodes (water drop icon) |
| `edge` | Click source node then target node to create edge; click empty space first for inbound dangling edge |
| (pan) | Hold `Space` + drag to pan canvas (implicit mode) |

---

## 4. FAB SPEED DIAL (`#canvasFabToggle`, `.canvas-fab-toolbar`)

Bottom-right floating action button that expands into a speed dial menu.

| Button | ID | Icon | i18n | Description |
|--------|-------|------|------|-------------|
| FAB Toggle | `canvasFabToggle` | `build` / `close` | — | Expand/collapse the speed dial |
| Incomplete Edges | `incompleteEdgeTracker` | `link_off` | `incompleteEdgeTracker` | Badge with count of dangling edges (`#incompleteEdgeCount`) |
| Recenter Density | `recenterDensityBtn` | `center_focus_strong` | `recenterDensity` | Center view on densest area |
| Recenter Sketch | `recenterBtn` | `filter_center_focus` | `recenter` | Center view on sketch centroid |
| Zoom to Fit | `zoomToFitBtn` | `zoom_out_map` | `zoomToFit` | Fit entire sketch in viewport |

---

## 5. GPS QUICK CAPTURE (`#gpsQuickCaptureBtn`)

Floating action button for GNSS point capture. Only visible when location tracking is active.

- Icon: `gps_fixed` (material icon)
- i18n: `gpsCapture.takeMeasure`
- Behavior: Pulses when RTK precision available; captures GPS coordinates to nearest/new node
- Contains badge: `#gpsQuickCaptureBadge` (shows fix quality indicator)

---

## 6. DETAILS SIDEBAR / DRAWER (`#sidebar`)

Resizable bottom drawer (mobile) or right-side panel (desktop). Opens when a node or edge is selected.

### Structure
- `#sidebar` — Main container (CSS class: `.drawer`)
- `.sidebar-drag-handle` — Draggable resize bar (mobile: drag up/down)
- `#sidebarTitle` — Dynamic title: "Details" / "Manhole #5" / "Edge 3 -> 7"
- `#sidebarCloseBtn` — Close button (icon: `close`, i18n: `close`)
- `#detailsContainer` — Dynamic content container
- `#detailsDefault` — Default "Select a node or edge to edit" text (i18n: `detailsDefault`)

### Drawer Behavior (from `src/utils/resizable-drawer.js`)
- Min height: 150px
- Max height: 85% of viewport
- Snap-to-close: Below 30% of default height
- Snap-to-default: Between 30-50% of default height
- Persists height to `localStorage('sidebarHeight')`
- Sets CSS variable `--drawer-height` on `<html>`

---

## 7. NODE DETAILS PANEL (Manhole/Drainage type)

Rendered dynamically in `src/legacy/main.js:4716-5215`. Uses a **wizard tab interface**.

### Node ID Section
- `#idInput` — Editable node number (i18n: `labels.nodeId`)

### Status Indicators
- **RTK Fixed badge** — Green GPS icon + "Accuracy: Engineering" when node has RTK Fixed precision (i18n: `labels.accuracyBadge`)
- **Status chip** — "OK" (green) or "Missing measurement" (orange) based on node completeness (i18n: `labels.indicatorOk` / `labels.indicatorMissing`)

### Wizard Tab Interface (`src/legacy/main.js:4614-4710`)

Material icon tabs at the top. Each shows one field at a time. Tabs appear/hide based on maintenance status:

| Tab Key | Icon | Color | i18n Label | Visibility |
|---------|------|-------|------------|------------|
| `accuracy_level` | `gps_fixed` | Blue | `labels.accuracyLevel` | Hidden when RTK Fixed |
| `maintenance_status` | `build` | Orange | `labels.maintenanceStatus` | Always visible |
| `material` | `layers` | Purple | `labels.coverMaterial` | Hidden when maint = "closed" (codes 3,4,5,13) or "no cover" (10) |
| `cover_diameter` | `circle` | Green | `labels.coverDiameter` | Same as material |
| `access` | `stairs` | Red | `labels.access` | Visible unless maint = "closed" |
| `note` | `notes` | Gray-blue | `labels.note` | Always visible after maintenance_status is set |

### Tab Field Inputs (one visible at a time)
| Tab | Element ID | Input Type | Options Source |
|-----|-----------|-----------|----------------|
| accuracy_level | `accuracyLevelSelect` | `<select>` | `adminConfig.nodes.options.accuracy_level` or `NODE_ACCURACY_OPTIONS` |
| maintenance_status | `nodeMaintenanceStatusSelect` | `<select>` | `adminConfig.nodes.options.maintenance_status` or `NODE_MAINTENANCE_OPTIONS` |
| material | `materialSelect` | `<select>` | `adminConfig.nodes.options.material` or `NODE_MATERIAL_OPTIONS` |
| cover_diameter | `coverDiameterSelect` | `<select>` | `NODE_COVER_DIAMETERS` constant |
| access | `accessSelect` | `<select>` | `adminConfig.nodes.options.access` or `NODE_ACCESS_OPTIONS` |
| note | `noteInput` | `<textarea>` | Free text (i18n: `labels.notePlaceholder`) |

### Survey Data Section (read-only, shown when node has survey coordinates)
| Field | Description | i18n Key |
|-------|-------------|----------|
| Survey X | ITM X coordinate (3 decimals) | `labels.surveyX` |
| Survey Y | ITM Y coordinate (3 decimals) | `labels.surveyY` |
| Terrain Level | Elevation (3 decimals) | `labels.terrainLevel` |
| Measure Precision | Precision in meters | `labels.measurePrecision` |
| Fix Type | Badge: Fixed / Device Float / Manual Float | `labels.fixType` / `labels.fixFixed` / `labels.fixDeviceFloat` / `labels.fixManualFloat` |
| Manual X | Manual X override | `labels.manualX` |
| Manual Y | Manual Y override | `labels.manualY` |
| No survey data | Shown when no survey data | `labels.noSurveyData` |

### Connected Lines Section (shown when node has edges, `src/legacy/main.js:4934-5169`)

For each connected edge, a header "-> [otherNodeId]" and a field grid:

| Field | Element Pattern | Type | i18n Key |
|-------|----------------|------|----------|
| Outgoing measurement | `edgeMeasure_{edgeId}_{tail}` | Decimal input | `labels.tailMeasure` |
| Incoming measurement | `edgeMeasure_{edgeId}_{head}` | Decimal input | `labels.headMeasure` |
| Edge type | `edgeType_{edgeId}` | `<select>` (conditional) | `labels.edgeType` |
| Edge material | `edgeMaterial_{edgeId}` | `<select>` | `labels.edgeMaterial` |
| Line diameter | `edgeDiameterSelect_{edgeId}` | `<select>` (conditional) | `labels.lineDiameter` |
| Fall depth | `edgeFallDepth_{edgeId}` | Decimal input (conditional) | `labels.fallDepth` |
| Fall position | `edgeFallPosition_{edgeId}` | `<select>` (conditional) | `labels.fallPosition` |
| Engineering status | `edgeEngStatus_{edgeId}` | `<select>` (conditional) | `labels.engineeringStatus` |

### Delete Button
- `#deleteNodeBtn` — Red full-width button at bottom (i18n: `labels.deleteNode`)

---

## 8. NODE DETAILS PANEL (Home type)

Simpler form for home connection nodes (`src/legacy/main.js:4833-4857`):

| Element | ID | Type | i18n Key |
|---------|-----|------|----------|
| Node ID | `idInput` | Text input (alphanumeric) | `labels.nodeId` |
| Direct connection | `directConnectionToggle` | Checkbox | `labels.directConnection` |
| Maintenance status | `homeMaintenanceStatusSelect` | `<select>` | `labels.maintenanceStatus` |
| Note | `noteInput` | `<textarea>` | `labels.note` / `labels.notePlaceholder` |

---

## 9. EDGE DETAILS PANEL

Rendered at `src/legacy/main.js:5367-5511`:

| Element | ID | Type | i18n Key |
|---------|-----|------|----------|
| Direction label | (inline) | Text "tail -> head" | — |
| Edge type | `edgeTypeSelect` | `<select>`: Main/Drainage/Secondary | `labels.edgeType` |
| Engineering status | `edgeEngineeringStatusSelect` | `<select>` (conditional on adminConfig) | `labels.engineeringStatus` |
| Edge material | `edgeMaterialSelect` | `<select>` | `labels.edgeMaterial` |
| Line diameter | `edgeDiameterSelect` | `<select>` (conditional) | `labels.lineDiameter` |
| Fall depth | `fallDepthInput` | Decimal input (conditional) | `labels.fallDepth` |
| Fall position | `fallPositionSelect` | `<select>`: Internal/External (conditional) | `labels.fallPosition` |
| Tail measurement | `tailInput` | Decimal input (conditional) | `labels.tailMeasure` |
| Head measurement | `headInput` | Decimal input (conditional) | `labels.headMeasure` |
| Target node note | (read-only) | Text: shows head node's note if exists | `labels.targetNote` |
| Delete edge | `deleteEdgeBtn` | Red full-width button | `labels.deleteEdge` |

---

## 10. CANVAS OVERLAYS

| Element | ID | Description |
|---------|-----|-------------|
| Edge type legend | `#edgeLegend` | Color-coded legend showing edge types (Main=blue, Drainage=cyan, Secondary=orange) |
| Survey badge | `#surveyConnectionBadge` | Bluetooth icon when TSC3 survey device is connected |
| Toast | `#toast` | Temporary popup notification messages |

---

## 11. DIALOGS / MODALS

### Login Panel (`#loginPanel`)
- `#loginTitle` — "Manhole Mapper"
- `#loginSubtitle` — "Sign in to access your sketches" (i18n: `auth.loginSubtitle`)
- `#authContainer` — React mount point for sign-in/sign-up forms
- `#loginLoadingText` — "Loading..." spinner (i18n: `auth.loading`)

### Auth Loading Overlay (`#authLoadingOverlay`)
- "Checking authentication..." full-screen overlay (i18n: `auth.checkingAuth`)

### Sign In Form (React, `src/auth/auth-provider.jsx:40-131`)
| Field | i18n |
|-------|------|
| Title "Sign In" | `auth.signIn` |
| Subtitle | `auth.enterCredentials` |
| Email input | `auth.email` / `auth.emailPlaceholder` |
| Password input | `auth.password` / `auth.passwordPlaceholder` |
| Submit button | `auth.signIn` / `auth.signingIn` (loading) |
| Sign up link | `auth.noAccount` / `auth.signUp` |

### Sign Up Form (React, `src/auth/auth-provider.jsx:136-267`)
| Field | i18n |
|-------|------|
| Title "Create Account" | `auth.createAccount` |
| Subtitle | `auth.signUpToStart` |
| Name input | `auth.name` / `auth.namePlaceholder` |
| Email input | `auth.email` / `auth.emailPlaceholder` |
| Password input | `auth.password` / `auth.passwordMinLength` |
| Confirm password | `auth.confirmPassword` / `auth.confirmPasswordPlaceholder` |
| Submit button | `auth.signUp` / `auth.creatingAccount` (loading) |
| Sign in link | `auth.haveAccount` / `auth.signIn` |

### Start Panel / New Sketch (`#startPanel`)
- `#startTitle` — "Start New Sketch" (i18n: `startTitle`)
- `#projectSelect` — Project assignment dropdown (i18n: `labels.selectProject`)
- `#dateInput` — Creation date picker (i18n: `creationDate`)
- `#cancelBtn` — Cancel (i18n: `cancel`)
- `#startBtn` — Start (i18n: `start`)

### Home Panel / Sketch Library (`#homePanel`)
- `#homeTitle` — "My Sketches" (i18n: `homeTitle`)
- `#homePanelCloseBtn` — Close button
- `#syncStatusBar` / `#syncStatusText` — Cloud sync indicator (i18n: `auth.synced` / `auth.syncing`)
- `#personalTab` — "My Sketches" tab (i18n: `sketches.personal`)
- `#organizationTab` — "Organization Sketches" tab (i18n: `sketches.organization`)
- `#sketchList` — Dynamic list of sketch cards
- `#createFromHomeBtn` — "New Sketch" button in footer (i18n: `createFromHome`)

### Help Modal (`#helpModal`)
- `#helpTitle` — "Tips & Shortcuts" (i18n: `helpTitle`)
- `#helpList` — List of keyboard shortcut tips (i18n: `helpLines` array)
- `#helpNote` — "In Edge mode, pick source then target" (i18n: `helpNote`)
- `#closeHelpBtn` — Close (i18n: `close`)

### Finish Workday Modal (`#finishWorkdayModal`)
- `#finishWorkdayTitle` — "Finish Workday" (i18n: `finishWorkday.title`)
- `#finishWorkdayCloseBtn` — Close button
- `#finishWorkdayDesc` — Instruction text (i18n: `labels.resolveDanglingDesc`)
- `#danglingEdgesList` — Dynamic list of unconnected edges
- `#finishWorkdayCancelBtn` — Cancel (i18n: `buttons.cancel`)
- `#finishWorkdayConfirmBtn` — "Confirm & Finish" (i18n: `finishWorkday.confirm`)

### Point Capture Dialog (GNSS, `src/gnss/point-capture-dialog.js`)
- `#pointCaptureDialog` — Full-screen GNSS capture overlay
- `#captureDialogTitle` — "Capture Point"
- Displays: Latitude, Longitude, Altitude, Fix quality, HDOP, Satellites
- `#captureNodeSelect` — Select node to assign coords to
- `#captureCreateNew` — Create new node checkbox
- `#captureEdgeSection` — Edge creation options (shown if previous capture exists)
- `#captureCreateEdge` — Create edge from previous capture checkbox
- `#captureEdgeType` — Edge type select
- Cancel / Confirm buttons

### Device Picker Dialog (Survey Bluetooth, `src/survey/device-picker-dialog.js`)
- Modal for selecting paired Bluetooth device
- Title: "Select Device" (i18n: `survey.selectDevice`)
- List of paired devices with name + MAC address
- Cancel button (i18n: `cancel`)

### Survey Node Type Dialog (`src/survey/survey-node-type-dialog.js`)
- Title: "New Survey Point" (i18n: `survey.newPointTitle`)
- Description: "Point [name] not found. Choose node type:" (i18n: `survey.newPointDesc`)
- Shows ITM coordinates
- Type buttons: Manhole (icon: `album`), Home (icon: `home`), Drainage (icon: `water_drop`)
- `#surveyAutoConnectCheckbox` — "Connect to previous" toggle (i18n: `survey.connectToPrevious`)
- Cancel button (i18n: `cancel`)

---

## 12. ADMIN SCREENS

### Admin Settings Screen (`#adminScreen`)
- `#adminScreenTitle` — "Admin Settings" (i18n: `admin.title`)
- `#adminScreenContent` — Dynamic content area
- `#adminScreenImportBtn` — Import settings (i18n: `admin.import`)
- `#adminScreenExportBtn` — Export settings (i18n: `admin.export`)
- `#adminScreenCancelBtn` — Cancel (i18n: `buttons.cancel`)
- `#adminScreenSaveBtn` — Save (i18n: `admin.saveSettings`)

**Admin Settings Content** (rendered by `src/admin/admin-settings.js`):
- **Two tabs**: Nodes/Homes (`admin.tabNodes`) and Edges (`admin.tabEdges`)
- **Fields to export (CSV)** section (`admin.includeTitle`): Checkboxes for CSV column selection
- **Defaults** section (`admin.defaultsTitle`): Default values for new entities
- **Options** section (`admin.optionsTitle`): Manage dropdown lists (enabled toggle, label, code)
- **Custom fields** section (`admin.customTitle`): Add custom text/number/select fields

### Admin Panel — User/Org Management (rendered by `src/admin/admin-panel.js`)
Three tabs when user is admin/super_admin:

| Tab | Icon | Description | Access |
|-----|------|-------------|--------|
| Users | `people` | User list: name, email, role badge, org, edit button | admin + super_admin |
| Organizations | `business` | Org management: create, edit, member counts | super_admin only |
| Features | `toggle_on` | Feature flag toggles per user/org | admin + super_admin |

**Feature flags managed:**
| Key | EN Label | Description |
|-----|----------|-------------|
| `export_csv` | Export CSV | Enable CSV export buttons |
| `export_sketch` | Export/Import Sketch | Enable sketch JSON export/import |
| `admin_settings` | Admin Settings | Access to admin settings screen |
| `finish_workday` | Finish Workday | Enable finish workday feature |
| `node_types` | Custom Node Types | Enable custom node types |
| `edge_types` | Custom Edge Types | Enable custom edge types |

### Projects Screen (`#projectsScreen`)
- `#projectsScreenTitle` — "Project Management" (i18n: `projects.title`)
- `#projectsList` — Dynamic list of project cards
- `#addProjectBtn` — "Add Project" (i18n: `projects.addProject`)
- `#projectsScreenCloseBtn` — Close (i18n: `buttons.close`)

### Input Flow Settings Screen (`#inputFlowScreen`)
- `#inputFlowScreenTitle` — "Input Flow Settings" (i18n: `inputFlow.title`)
- `#inputFlowScreenContent` — Dynamic rule editor
- Import/Export buttons (i18n: `inputFlow.import` / `inputFlow.export`)
- Cancel/Save buttons

**Content** (rendered by `src/admin/input-flow-settings.js`):
- Two tabs: **Nodes** / **Edges** (`inputFlow.tabNodes` / `inputFlow.tabEdges`)
- Per-tab rule list with "Add Rule" button
- Each rule: name, description, trigger condition (field + operator + value), actions (nullify, disable, require, bulk reset, fill value)

---

## 13. PROJECT CANVAS UI

### Sketch Side Panel (`#sketchSidePanel`)
Collapsible left panel in project-canvas mode.

- `#backToProjectsBtn` — "Back to Projects" link (i18n: `projects.canvas.backToProjects`)
- `.sketch-side-panel__title` — "Sketches" (i18n: `projects.canvas.sketches`)
- `.sketch-side-panel__count` — Number of sketches
- `.sketch-side-panel__close` — Close button
- `.sketch-side-panel__list` — Dynamic sketch list with:
  - Sketch name (click to switch active)
  - Eye icon toggle (show/hide in background)
  - Stats: total km, issue count
  - Issues sub-panel with navigation buttons
- `#sketchSidePanelToggle` — Layers icon button to show/hide panel

**i18n keys:**
- `projects.canvas.showAll` / `projects.canvas.hideAll`
- `projects.canvas.switchedTo` / `projects.canvas.totalKm`
- `projects.canvas.issues` / `projects.canvas.noIssues`
- `projects.canvas.missingCoords` / `projects.canvas.missingMeasurement` / `projects.canvas.longPipe`
- `projects.canvas.goToIssue` / `projects.canvas.centerBetween`
- `projects.canvas.recenterToSketch` / `projects.canvas.backToList`

---

## 14. MAP LAYERS

### GovMap Tile Layer (`src/map/govmap-layer.js`)
| Type | Source | Description |
|------|--------|-------------|
| `orthophoto` | Esri World Imagery | Aerial/satellite tiles |
| `street` | Esri World Street Map | Street map tiles |
| Fallback | OpenStreetMap | Used if primary source fails |

Coordinate system: WGS84 <-> ITM (EPSG:2039) via proj4 (`src/map/projections.js`)
Tile caching: LRU cache in `src/map/tile-manager.js`

### Reference Layers (`src/map/reference-layers.js`)
GeoJSON layers loaded from project's `project_layers` table:

| Layer Type | Default Style | Label Field | i18n Key |
|------------|--------------|-------------|----------|
| `sections` | Blue dashed polygons | `name` | `refLayers.sections` |
| `survey_manholes` | Brown squares | `OBJECTID` | `refLayers.surveyManholes` |
| `survey_pipes` | Green lines with arrows | none | `refLayers.surveyPipes` |
| `streets` | Gray dashed lines | `ST_NAME` | `refLayers.streets` |
| `addresses` | Purple circles | `HOUSE_NUM` | `refLayers.addresses` |

### Street View (`src/map/street-view.js`)
- Pegman widget: draggable icon that opens Google Street View
- Coordinate conversion: Screen -> World -> ITM -> WGS84 -> Google Maps URL
- i18n: `streetView.dragHint` / `streetView.noCoordinates`

---

## 15. FLOATING KEYBOARD (`#floatingKeyboard`)

Draggable/resizable numeric keypad for mobile field workers.

- `#floatingKeyboard` — Main container
- `.floating-keyboard-header` — Drag handle to reposition
- `#closeFloatingKeyboard` — Close button
- Number keys 0-9, decimal point, backspace
- `.floating-keyboard-resize-handle` — Drag to resize
- `#toggleFloatingKeyboard` — Toggle button, shown when numeric input is focused on mobile (i18n: `floatingKeyboard`)

---

## 16. HASH ROUTES

| Route | Screen | Description |
|-------|--------|-------------|
| `#/` | Home panel | Sketch list overlay |
| `#/login` | Login panel | Auth form |
| `#/signup` | Sign up panel | Registration form |
| `#/admin` | Admin settings | Full-screen admin |
| `#/projects` | Projects management | Full-screen projects |
| `#/project/:id` | Project canvas | Multi-sketch view with side panel |

---

## 17. KEYBOARD SHORTCUTS

| Key | Action |
|-----|--------|
| `N` | Node/Manhole mode |
| `E` | Edge/Line mode |
| `S` | Save sketch |
| `Space` (hold) | Pan canvas |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom |
| Mouse wheel | Zoom in/out |
| `Esc` | Cancel action / clear selection |
| `Delete` / `Backspace` | Delete selected node/edge |

---

## 18. CANVAS RENDERING (what users see on the drawing surface)

### Node Rendering (`src/features/rendering.js` + `src/features/node-icons.js`)
- **Manhole**: Circle with manhole SVG icon, surrounded by selection ring when selected
- **Home**: Circle with house SVG icon
- **Drainage**: Circle with water drop SVG icon
- **Node ID label**: Number displayed above/beside node
- **Selection ring**: Blue pulsing ring around selected node
- **Accuracy indicator**: Color-coded dot showing GPS precision

### Edge Rendering (`src/features/rendering.js`)
- **Lines**: Colored by type — Main (blue), Drainage (cyan), Secondary (orange)
- **Length labels**: Displayed at midpoint of edge (meters)
- **Direction arrows**: Small arrow indicators on edges
- **Dangling edges**: Dashed line style for unconnected edges

### GNSS Marker (`src/gnss/gnss-marker.js`)
- **Accuracy circle**: Semi-transparent circle showing GPS accuracy radius
- **Position dot**: Colored by fix quality — RTK Fixed (green), Float (yellow), DGPS (orange), GPS (red)
- **Heading arrow**: Shows direction of movement when available

### Issue Highlight (`src/project/issue-highlight.js`)
- **Pulsing red ring**: Animation around nodes with issues in project canvas mode

---

## 19. DESIGN TOKENS QUICK REFERENCE

### Light Mode (`:root`)
```css
--color-primary: #2563eb       /* App blue */
--color-primary-hover: #1d4ed8 /* Blue hover */
--color-primary-light: #dbeafe /* Light blue bg */
--color-success: #22c55e       /* Green */
--color-danger: #ef4444        /* Red */
--color-accent: #a855f7        /* Purple */
--color-bg: #f8fafc            /* Page background */
--color-surface: #ffffff       /* Card/panel bg */
--color-text: #0f172a          /* Primary text */
--color-text-secondary: #475569 /* Secondary text */
--color-border: #e5e7eb        /* Border color */
```

### Dark Mode (`@media (prefers-color-scheme: dark)`)
```css
--color-bg: #0b1220
--color-surface: #0f172a
--color-surface-alt: #1e293b
--color-text: #e2e8f0
--color-accent: #60a5fa
--color-border: #1f2937
```

---

## 20. i18n NAMESPACES

All translations in `src/i18n.js` (Hebrew `he` + English `en`):

| Namespace | Description |
|-----------|-------------|
| (root) | Mode labels, menu items, general UI |
| `menuGroup.*` | Menu group headers |
| `auth.*` | Authentication UI |
| `labels.*` | Form field labels in panels |
| `toasts.*` | Toast notification messages |
| `confirms.*` | Confirmation dialogs |
| `alerts.*` | Alert messages |
| `admin.*` | Admin settings panel |
| `projects.*` | Projects management |
| `inputFlow.*` | Input flow rules editor |
| `coordinates.*` | Coordinate features |
| `stretch.*` | Canvas stretch controls |
| `map.*` / `mapLayer.*` | Map layer controls |
| `refLayers.*` | Reference layers |
| `location.*` | User location |
| `liveMeasure.*` | Live GNSS measurement |
| `gnssMarker.*` | GNSS marker display |
| `gpsCapture.*` | GPS point capture |
| `survey.*` | Survey device connection |
| `streetView.*` | Street View pegman |
| `finishWorkday.*` | End-of-day workflow |
| `threeD.*` | 3D View |
| `errors.*` | Error messages |
| `buttons.*` | Generic button labels |
| `validation.*` | Validation messages |
| `sketches.*` | Sketch tabs |
| `undo.*` | Undo action |
| `layersConfig.*` | Layers config panel |

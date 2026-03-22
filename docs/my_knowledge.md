# Manholes Mapper — Complete Object Knowledge Base

> Auto-generated full-app scan. Format: `object_id` (exact code name) — Type — How/When to use — Where (file:line) — Related objects

---

## 1. LEGACY CORE — `src/legacy/main.js` (~12,962 lines)

### 1.1 DOM Element References

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `graphCanvas` (as `canvas`) | layout/canvas | Main drawing surface | 184 | `ctx`, `draw()`, all pointer handlers |
| `newSketchBtn` | button | Creates new sketch | 186 | `newSketch()`, `startPanel` |
| `homeBtn` | button | Opens home/sketch list panel | 187 | `renderHome()` |
| `nodeModeBtn` | button | Switch to node creation mode | 188 | `currentMode`, `edgeModeBtn` |
| `homeNodeModeBtn` | button | Switch to home node mode | 189 | `currentMode='home'` |
| `drainageNodeModeBtn` | button | Switch to drainage node mode | 190 | `currentMode='drainage'` |
| `issueNodeModeBtn` | button | Switch to issue node mode | 191 | `currentMode='issue'` |
| `edgeModeBtn` | button | Switch to edge creation mode | 192 | `currentMode='edge'` |
| `nodeTypeFlyoutBtn` | button | Toggle node type flyout menu | 193 | `nodeTypeFlyout`, `syncFlyoutIcon()` |
| `nodeTypeFlyout` | layout | Node type selection popup | 194 | `closeFlyout()`, `toggleFlyout()` |
| `undoBtn` | button | Trigger undo | 195 | `performUndo()` |
| `redoBtn` | button | Trigger redo | 196 | `performRedo()` |
| `threeDViewBtn` | button | Open 3D visualization | 197 | `open3DView()` |
| `exportNodesBtn` | button | Export nodes CSV | 199 | `csv.js` |
| `exportEdgesBtn` | button | Export edges CSV | 200 | `csv.js` |
| `exportSketchBtn` | button | Export sketch JSON | 202 | `sketch-io.js` |
| `importSketchBtn` | button | Import sketch JSON | 203 | `importSketchFile` |
| `importSketchFile` | input(file) | File picker for sketch import | 204 | `importSketchFromJson()` |
| `exportMenuBtn` | button | Toggle export dropdown | 206 | `exportDropdown` |
| `exportDropdown` | layout | Export options dropdown | 207 | dropdown menu |
| `detailsContainer` | layout | Node/edge details sidebar content | 208 | `renderDetails()` |
| `startPanel` | layout/panel | New sketch form panel | 209 | `newSketchBtn`, `startBtn` |
| `homePanel` | layout/panel | Sketch list home panel | 210 | `renderHome()`, `hideHome()` |
| `sketchList` (as `sketchListEl`) | layout | Sketch card list container | 211 | `renderHome()` |
| `createFromHomeBtn` | button | Create sketch from home panel | 212 | shows `startPanel` |
| `dateInput` | input | New sketch date picker | 213 | `newSketch()` |
| `startBtn` | button | Confirm new sketch creation | 214 | `newSketch()` |
| `cancelBtn` | button | Cancel new sketch creation | 215 | hides `startPanel` |
| `helpBtn` | button | Opens help modal | 216 | `helpModal` |
| `autosaveToggle` | input(checkbox) | Toggle autosave | 217 | `autosaveEnabled` |
| `saveBtn` | button | Manual save | 218 | `saveToLibrary()` |
| `helpModal` | layout/modal | Help overlay | 220 | `closeHelpBtn` |
| `closeHelpBtn` | button | Close help modal | 221 | `helpModal` |
| `toast` (as `toastEl`) | layout | Toast notification element | 222 | `showToast()` |
| `zoomInBtn` / `zoomOutBtn` | button | Desktop zoom controls | 223-224 | `setZoom()` |
| `recenterBtn` | button | Recenter on sketch | 225 | `recenterView()` |
| `recenterDensityBtn` | button | Center on densest area | 226 | `recenterDensityView()` |
| `sizeIncreaseBtn` / `sizeDecreaseBtn` | button | Node/font size scale | 227-228 | `increaseSizeScale()` / `decreaseSizeScale()` |
| `autoSizeBtn` | button | Toggle constant screen size | 229 | `toggleAutoSize()` |
| `appTitle` (as `appTitleEl`) | layout | App title h1 | 230 | i18n |
| `sketchNameDisplay` / `sketchNameDisplayMobile` | layout | Sketch name in header | 231-232 | `updateSketchNameDisplay()` |
| `sidebar` (as `sidebarEl`) | layout/panel | Details drawer panel | 235 | `closeSidebarPanel()` |
| `sidebarCloseBtn` | button | Close details drawer | 236 | `closeSidebarPanel()` |
| `langSelect` | select | Language dropdown (he/en) | 243 | language switching |
| `adminBtn` / `mobileAdminBtn` | button | Navigate to admin | 245/247 | `navigateToAdmin()` |
| `projectsBtn` / `mobileProjectsBtn` | button | Navigate to projects | 246/248 | `navigateToProjects()` |
| `adminModal` | layout/modal | Admin settings modal | 249 | `openAdminModal()`, `closeAdminModal()` |
| `adminScreen` | layout/panel | Full-screen admin panel | 258 | `openAdminScreen()` |
| `projectsScreen` | layout/panel | Projects settings screen | 269 | `openProjectsScreen()` |
| `main` (as `mainEl`) | layout | Main canvas container | 266 | hidden when admin/projects open |
| `mobileMenuBtn` | button | Open mobile hamburger menu | 277 | `mobileMenu` |
| `mobileMenu` | layout/panel | Mobile slide-out menu | 278 | `closeMobileMenu()` |
| `mobileMenuCloseBtn` | button | Close mobile menu | 279 | `mobileMenu` |
| `mobileMenuBackdrop` | layout | Backdrop overlay | 280 | `mobileMenu` |
| `finishWorkdayBtn` / `mobileFinishWorkdayBtn` | button | Open finish workday flow | 310-311 | `showFinishWorkdayModal()` |
| `finishWorkdayModal` | layout/modal | Finish workday dialog | 312 | `closeFinishWorkdayModal()` |
| `importCoordinatesBtn` | button | Trigger coord CSV import | 322 | `handleCoordinatesImport()` |
| `coordinatesToggle` | input(checkbox) | Toggle coordinate display | 323 | `toggleCoordinates()` |
| `liveMeasureToggle` / `mobileLiveMeasureToggle` | input(checkbox) | Toggle GNSS live measure | 352-353 | `setLiveMeasureMode()` |
| `mapLayerToggle` / `mobileMapLayerToggle` | input(checkbox) | Toggle map tiles | 355-356 | `toggleMapLayer()` |
| `loginPanel` | layout/panel | Login/auth panel | 1065 | `showLoginPanel()`, `hideLoginPanel()` |
| `authContainer` | layout | React auth mount point | 1067 | `mountSignIn()`, `mountSignUp()` |
| `syncStatusBar` | layout | Sync status indicator | 2550 | `updateSyncStatusUI()` |
| `gpsQuickCaptureBtn` | button | Quick GPS capture FAB | 11372 | `gpsQuickCapture()` |
| `searchNodeInput` / `mobileSearchNodeInput` | input | Node ID search | 12094-12095 | `searchAndCenterNode()` |
| `searchAddressInput` / `mobileSearchAddressInput` | input | Address search | 12140-12141 | `searchAddressAndCenter()` |
| `zoomToFitBtn` | button | Fit all nodes in view | 12003 | `zoomToFit()` |
| `edgeLegend` / `edgeLegendToggle` | layout | Edge type color legend | ~5550 | `renderEdgeLegend()` |
| `canvasEmptyState` | layout | Empty sketch overlay | ~6331 | `updateCanvasEmptyState()` |
| `surveyConnectionBadge` | layout | TSC3 connection badge | ~12726 | TSC3 status |

### 1.2 State Variables

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `nodes` | array | All nodes in current sketch | 400 | `createNode`, `deleteNodeShared` |
| `edges` | array | All edges in current sketch | 401 | `createEdge`, `deleteEdgeShared` |
| `nextNodeId` | number | Auto-incrementing node ID | 402 | `createNode` |
| `selectedNode` | object/null | Currently selected node | 403 | `renderDetails()` |
| `selectedEdge` | object/null | Currently selected edge | 404 | `renderDetails()` |
| `isDragging` | boolean | Node drag in progress | 405 | pointer handlers |
| `currentMode` | string | `'node'`/`'home'`/`'drainage'`/`'issue'`/`'edge'` | 434 | mode buttons |
| `pendingEdgeTail` | object/null | First node of edge being created | 435 | edge creation |
| `currentSketchId` | string/null | Library ID of current sketch | 439 | sync, save |
| `currentSketchName` | string/null | Human-friendly sketch name | 440 | header display |
| `currentProjectId` | string/null | Project ID for current sketch | 441 | project canvas |
| `autosaveEnabled` | boolean | Autosave toggle state | 444 | save flow |
| `currentLang` | string | `'he'` or `'en'` | 459 | i18n |
| `viewScale` | number | Zoom level (0.005-5.0) | 465 | rendering |
| `viewTranslate` | {x,y} | Pan offset | 467 | rendering |
| `viewStretchX` / `viewStretchY` | number | Canvas stretch factors | 472-473 | rendering |
| `sizeScale` | number | Node/font size multiplier | 479 | rendering |
| `autoSizeEnabled` | boolean | Constant-screen-size mode | 480 | rendering |
| `coordinatesMap` | Map | Map<nodeId, {x,y,z}> ITM coords | 595 | coordinate display |
| `coordinatesEnabled` | boolean | Coordinate display toggle | 596 | `toggleCoordinates` |
| `coordinateScale` | number | Pixels per meter (default 50) | 599 | coordinate transforms |
| `liveMeasureEnabled` | boolean | GNSS tracking active | 603 | GPS features |
| `mapLayerEnabled` | boolean | Map tile layer toggle | 607 | map tiles |
| `adminConfig` | object | Admin configuration | 699 | field options, defaults |
| `nodeMap` | Map | Fast node lookup Map<id, node> | 548 | all node lookups |
| `undoStack` / `redoStack` | array | Undo/redo history (max 50) | 416-417 | `performUndo`, `performRedo` |
| `homeMode` | string | `'projects'` or `'sketches'` | 2822 | home panel tabs |

### 1.3 Core Functions

| object_id | Type | Parameters | When | Line | Related |
|---|---|---|---|---|---|
| `createNode(x, y)` | function | canvas coords | Node/home/drainage/issue mode click | 3952 | `pushUndo`, `saveToStorage` |
| `createEdge(tailId, headId, options)` | function | node IDs | Edge mode click on two nodes | 4022 | `pushUndo`, `saveToStorage` |
| `createDanglingEdge(tailId, endX, endY)` | function | tail + endpoint | Edge mode click empty space | 4086 | dangling edges |
| `deleteNodeShared(node, pushToUndo, skipConfirm)` | function | node object | Delete/Backspace, context menu | 4333 | connected edges cleanup |
| `deleteEdgeShared(edge, pushToUndo, skipConfirm)` | function | edge object | Delete button | 4424 | undo stack |
| `connectDanglingEdge(edge, nodeId, type)` | function | dangling edge + target | Auto-connect on node creation | 4980 | dangling endpoint logic |
| `normalizeLegacySketch(nodes, edges)` | function | arrays | On every sketch load | 1824 | data migration |
| `computeNodeTypes()` | function | none | After node/edge changes | 5638 | node type inference |
| `loadFromStorage()` | function | none | App init | 1971 | localStorage |
| `saveToStorage()` | function | none | After every data change | 2021 | localStorage + IDB |
| `saveToLibrary()` | function | none | On save/autosave | 2280 | cloud sync |
| `loadFromLibrary(sketchId)` | function | sketch ID | Opening a sketch | 2333 | data loading |
| `deleteFromLibrary(sketchId)` | function | sketch ID | Delete action | 2504 | cleanup |
| `draw()` | function | none | Main render loop (rAF) | 5051 | all rendering |
| `scheduleDraw()` | function | none | Debounced redraw | 6350 | rAF scheduling |
| `drawEdge(edge)` | function | edge object | Per-edge in `draw()` | 5665 | edge rendering |
| `drawEdgeLabels(edge)` | function | edge object | Measurement/length labels | 6025 | label rendering |
| `drawNode(node)` | function | node object | Per-node in `draw()` | 6166 | node rendering |
| `drawInfiniteGrid(w, h)` | function | canvas dimensions | Background grid | 5568 | grid rendering |
| `renderDetails()` | function | none | When selection changes | 6750 | sidebar form builder |
| `renderHome()` | function | none | Shows sketch list | 2831 | home panel |
| `renderProjectsHome()` | function | none | Shows project cards | 3303 | project list |
| `hideHome(immediate)` | function | boolean | Close home panel | 3240 | panel animation |
| `handleRoute()` | function | none | Hash routing | 1177 | `#/admin`, `#/projects`, etc. |
| `setZoom(newScale)` | function | scale number | Zoom buttons, keyboard | 11839 | viewScale |
| `recenterView()` | function | none | Center on sketch | 11878 | viewTranslate |
| `zoomToFit()` | function | none | Fit all nodes | 11891 | bounding box |
| `centerOnNode(node)` | function | node object | Navigate to node | 6421 | viewTranslate |
| `centerOnGpsLocation(lat, lon)` | function | WGS84 | Center on GPS | 12588 | map reference |
| `searchAndCenterNode(searchId)` | function | string/number | Node search | 12014 | `centerOnNode` |
| `screenToWorld(x, y)` | function | screen coords | Convert screen to world | 11785 | coordinate transform |
| `pointerDown(x, y)` | function | screen coords | Mouse/touch down | 8339 | input handling |
| `pointerMove(x, y)` | function | screen coords | Mouse/touch move | 8564 | input handling |
| `pointerUp()` | function | none | Mouse/touch up | 8619 | input handling |
| `findNodeAt(x, y)` | function | world coords | Hit-test nodes | 8216 | click detection |
| `findEdgeAt(x, y, threshold)` | function | world coords | Hit-test edges | 8286 | click detection |
| `pushUndo(action)` | function | action object | After create/move/delete | 4280 | undo stack |
| `performUndo()` | function | none | Ctrl+Z, undo button | 4465 | undo/redo |
| `performRedo()` | function | none | Ctrl+Shift+Z | 4646 | undo/redo |
| `handleCoordinatesImport(file)` | function | File | CSV coordinate import | 10391 | coordinate system |
| `toggleCoordinates(enabled)` | function | boolean | Coordinate toggle | 10603 | coordinate display |
| `toggleMapLayer(enabled)` | function | boolean | Map layer toggle | 10655 | map tiles |
| `setLiveMeasureMode(enabled)` | function | boolean | Live Measure toggle | 12261 | GNSS |
| `gpsQuickCapture()` | function | none | Quick capture FAB | 12461 | GPS node creation |
| `showFinishWorkdayModal()` | function | none | Workday finish flow | 10165 | dangling edge resolution |
| `loadProjectCanvas(projectId)` | function | UUID | `#/project/:id` route | 3622 | project canvas |
| `showNodeContextMenu(node, x, y)` | function | node + screen coords | Long-press/double-tap | 4196 | context menu |
| `init()` | function | none | App entry point | 12169 | everything |

### 1.4 Window Globals (exposed by main.js)

| object_id | Purpose | Line |
|---|---|---|
| `window.__getActiveSketchData()` | Snapshot sketch state for switching | 3094 |
| `window.__setActiveSketchData(data)` | Load sketch into globals | 3138 |
| `window.__getSketchStats()` | Lightweight stats accessor | 3113 |
| `window.__scheduleDraw()` | Trigger canvas redraw | 3167 |
| `window.__saveToStorage()` | Trigger save | 3168 |
| `window.__setViewState(scale, tx, ty)` | Set zoom/pan programmatically | 3176 |
| `window.__getViewState()` | Read zoom/pan | 3187 |
| `window.__getStretch()` | Read stretch factors | 3183 |
| `window.__selectNodeById(nodeId)` | Select node by ID | 3194 |
| `window.__selectEdgeById(edgeId)` | Select edge by ID | 3204 |
| `window.__projectCanvas` | Project canvas API object | 3215 |
| `window.__onSketchIdChanged(oldId, newId)` | Cloud sync ID update | 3229 |
| `window.__nodeMap` | Fast node lookup Map | 3191 |
| `window.__createNodeFromMeasurement` | GPS node creation | 12572 |
| `window.handleRoute` | Hash router | 1331 |
| `window.renderHome` | Re-render home panel | 3076 |
| `window.invalidateLibraryCache` | Force library reload | 3074 |
| `window.scheduleDraw` / `window.setZoom` / `window.zoomToFit` / `window.recenterView` | View control aliases | 12688-12691 |
| `window.setLiveMeasureMode` / `window.openGnssPointCaptureDialog` / `window.centerOnGpsLocation` | GNSS aliases | 12693-12695 |

### 1.5 Keyboard Shortcuts (line ~11607)

| Key | Action |
|---|---|
| `N` | Node mode |
| `E` | Edge mode |
| `S` | Manual save |
| `Space` (hold) | Pan canvas |
| `Escape` | Close modals/cancel/deselect |
| `Delete`/`Backspace` | Delete selected |
| `+`/`=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom 100% |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z`/`Ctrl+Y` | Redo |

### 1.6 Constants

| object_id | Value | Line |
|---|---|---|
| `UNDO_STACK_MAX` | 50 | 415 |
| `LONG_PRESS_MS` | 600 | 421 |
| `DOUBLE_TAP_MS` | 300 | 427 |
| `MIN_SCALE` / `MAX_SCALE` | 0.005 / 5.0 | 468-469 |
| `SCALE_STEP` | 1.1 | 470 |
| `MIN_STRETCH` / `MAX_STRETCH` | 0.2 / 3.0 | 474-475 |
| `TOUCH_TAP_MOVE_THRESHOLD` | 5px | 501 |
| `TOUCH_SELECT_EXPANSION` | 14px | 502 |
| `SCALE_PRESETS` | [5,10,25,50,75,100,150,200,300] | 600 |

---

## 2. AUTH — `src/auth/`

### 2.1 auth-client.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `authClient` | object | Better Auth client instance — foundation for all auth | 14 | `getApiBaseUrl`, `createAuthClient` |
| `signInWithEmail(email, password)` | function | Login form submit | 33 | `authClient.signIn.email` |
| `signUpWithEmail(email, password, name)` | function | Signup form submit | 47 | `authClient.signUp.email` |
| `signOutUser()` | function | Log out current user | 59 | `authClient.signOut` |
| `getCurrentSession()` | function | Session polling (5 min) | 67 | `authClient.getSession` |
| `onSessionChange(callback)` | function | Subscribe to session changes; returns unsub | 76 | 5-min polling |

### 2.2 auth-guard.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `authState` | object | Canonical state: `{isLoaded, isSignedIn, userId, sessionId, user}` | 11 | listeners |
| `onAuthStateChange(callback)` | function | Subscribe to auth changes; returns unsub | 30 | `authStateListeners` |
| `updateAuthState({session, user})` | function | After fetching session from server | 52 | `notifyAuthStateChange` |
| `getAuthState()` | function | Read current auth state | 67 | `authState` |
| `isAuthenticated()` | function | Quick signed-in check | 75 | `authState` |
| `getUserId()` / `getUsername()` / `getUserEmail()` | function | User info getters | 83/91/104 | `authState` |
| `guardRoute(currentHash)` | function | Redirect unauthenticated to `#/login` | 136 | routing |
| `redirectIfAuthenticated(currentHash)` | function | Redirect signed-in from login pages | 162 | routing |
| `refreshSession()` | function | Fetch session + update state | 178 | `getCurrentSession` |
| `initAuthMonitor()` | function | Initialize 15-min refresh | 198 | `refreshSession` |

### 2.3 auth-provider.jsx

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `SignInForm` | React component | `<SignInForm onSuccess={fn}>` — login form | 184 | `signInWithEmail`, `PasswordField`, `LanguageToggle` |
| `SignUpForm` | React component | `<SignUpForm onSuccess={fn}>` — signup form | 287 | `signUpWithEmail`, `PasswordField`, `LanguageToggle` |
| `PasswordField` | React component | Reusable password input with show/hide | 63 | `SignInForm`, `SignUpForm` |
| `LanguageToggle` | React component | Language switch button (he/en) | 128 | auth forms |
| `mountSignIn(container, props)` | function | Mount login React form | 447 | `SignInForm` |
| `mountSignUp(container, props)` | function | Mount signup React form | 470 | `SignUpForm` |
| `unmountAuth(container)` | function | Unmount auth form | 500 | cleanup |

### 2.4 csrf.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `window.fetch` (patched) | function | Auto-attaches `x-csrf-token` on mutating `/api/` requests | 29 | `getCsrfToken`, `MUTATING_METHODS` |

### 2.5 permissions.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `fetchUserRole(forceRefresh?)` | function | Fetches `GET /api/user-role`; called on auth state change | 44 | `userRoleCache` |
| `getUserRole()` | function | Sync read of cached role data | 102 | `userRoleCache` |
| `isSuperAdmin()` / `isAdmin()` | function | Role checks | 110/118 | `userRoleCache` |
| `canAccessFeature(featureName)` | function | Feature flag check | 127 | `userRoleCache` |
| `initPermissionsService()` | function | Auth listener setup | 155 | `onAuthStateChange` |
| `window.permissionsService` | object | Legacy access to all permission fns | 176 | all exports |

### 2.6 sync-service.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `syncFromCloud()` | function | Full cloud-to-local sync | 447 | `fetchSketchesFromCloud` |
| `syncSketchToCloud(sketch)` | function | Sync single sketch (create/update) | 786 | optimistic locking, 409 conflict |
| `debouncedSyncToCloud(sketch)` | function | 2s debounced wrapper | 1071 | `syncSketchToCloud` |
| `deleteSketchEverywhere(sketchId)` | function | Delete from IDB + cloud | 1098 | offline queue |
| `acquireSketchLock(sketchId)` | function | POST lock action | 613 | `currentLock` |
| `releaseSketchLock(sketchId)` | function | POST unlock action | 664 | `currentLock` |
| `processSyncQueue()` | function | Drain offline queue | 1155 | `drainSyncQueue` |
| `onSyncStateChange(callback)` | function | Subscribe to sync state | 214 | `syncStateListeners` |
| `getSyncState()` | function | Read sync state | 1591 | `syncState` |
| `deduplicateSketches(arr)` | function | Remove local dups of cloud sketches | 1358 | fingerprint |
| `initSyncService()` | function | Setup online/offline + auth listeners | 1498 | `AbortController` |
| `clearLocalSketchData()` | function | Clears all local data on logout | 1564 | IDB + localStorage |
| `window.syncService` | object | Legacy access to all sync fns | 1597 | all exports |

---

## 3. GNSS — `src/gnss/`

### 3.1 gnss-state.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `ConnectionState` | constant | `.CONNECTED`, `.DISCONNECTED`, `.CONNECTING`, `.ERROR` | 7 | all adapters |
| `ConnectionType` | constant | `.BLUETOOTH`, `.WIFI`, `.MOCK`, `.BROWSER`, `.TMM` | 15 | all adapters |
| `GNSSStateManager` | class | Central GNSS state — use singleton `gnssState` | 27 | all GNSS modules |
| `gnssState` | singleton | `gnssState.on('position', cb)`, `gnssState.updatePosition(data)`, `gnssState.capturePoint(nodeId)` | 303 | all GNSS modules |
| `gnssState.position` | object | `{lat, lon, alt, fixQuality, fixLabel, satellites, hdop, accuracy, isValid, ...}` | 48 | position data |
| `gnssState.setConnectionState(state, opts)` | method | Called by adapters on connect/disconnect | 84 | `notifyListeners('connection')` |
| `gnssState.updatePosition(nmeaState)` | method | Called by adapters on new position | 114 | `notifyListeners('position')` |
| `gnssState.capturePoint(nodeId, opts)` | method | Captures current position for node (max 1000) | 136 | `notifyListeners('capture')` |
| `gnssState.on(event, callback)` | method | Events: `'connection'`, `'position'`, `'capture'` | 262 | event system |

### 3.2 connection-manager.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `gnssConnection` | singleton | Unified GNSS connection interface | 326 | all adapters, `gnssState` |
| `gnssConnection.connectBluetooth(mac)` | method | Connect Bluetooth SPP to GNSS receiver | 97 | `BluetoothAdapter` |
| `gnssConnection.connectWifi(host, port)` | method | Connect TCP to GNSS receiver (port 5017) | 122 | `WifiAdapter` |
| `gnssConnection.connectTMM(httpPort?)` | method | Connect Trimble Mobile Manager | 146 | `TMMAdapter` |
| `gnssConnection.connectMock()` | method | Connect mock for testing | 191 | `MockGNSSAdapter` |
| `gnssConnection.disconnect()` | method | Disconnect active adapter | 206 | all adapters |

### 3.3 Adapters

| object_id | Type | File | Purpose |
|---|---|---|---|
| `BluetoothAdapter` | class | `bluetooth-adapter.js` | Bluetooth SPP GNSS (Capacitor native) |
| `WifiAdapter` | class | `wifi-adapter.js` | TCP GNSS (Capacitor native, port 5017) |
| `MockGNSSAdapter` | class | `mock-adapter.js` | Simulated GNSS (Tel Aviv default) |
| `TMMAdapter` | class | `tmm-adapter.js` | Trimble Mobile Manager WebSocket |
| `NMEAParser` | class | `nmea-parser.js` | GGA/RMC NMEA sentence parser |
| `startBrowserLocationAdapter()` | function | `browser-location-adapter.js:60` | Bridges `navigator.geolocation` to gnssState |
| `stopBrowserLocationAdapter()` | function | `browser-location-adapter.js:90` | Stops browser geolocation |
| `isBrowserLocationActive()` | function | `browser-location-adapter.js:103` | Check if browser adapter active |
| `inferFixQuality(accuracy)` | function | `browser-location-adapter.js:19` | <0.05m=RTK, <0.5m=Float, <5m=DGPS, <15m=GPS |

### 3.4 Marker & Dialogs

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `FIX_COLORS` | constant | Maps fix quality 0-8 to hex colors | `gnss-marker.js:9` | marker rendering |
| `drawGnssMarker(ctx, position, ...)` | function | Draw full GNSS marker on canvas | `gnss-marker.js:62` | accuracy circle, info card |
| `drawGnssStatusBadge(ctx, status, x, y)` | function | Fixed-position status badge | `gnss-marker.js:388` | connection info |
| `gnssToCanvas(position, refPoint, scale)` | function | WGS84 to canvas world coords | `gnss-marker.js:474` | coordinate transform |
| `PrecisionMeasurement` | class | Epoch collection until criteria met | `precision-measure.js:31` | Trimble Access-like |
| `showPrecisionOverlay({onCancel, onAcceptEarly})` | function | Progress overlay with bars | `precision-measure-overlay.js:167` | UI overlay |
| `openPointCaptureDialog(nodes, onCapture, onCancel)` | function | GPS point capture dialog | `point-capture-dialog.js:226` | node dropdown, edge option |

---

## 4. MENU SYSTEM — `src/menu/`

### 4.1 menu-events.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `menuEvents` | singleton | Global pub/sub event bus; `window.menuEvents` | 70 | all menu actions |
| `menuEvents.on(event, cb)` | method | Subscribe; returns unsub fn | 17 | event system |
| `menuEvents.emit(event, data)` | method | Fire event to listeners | 43 | delegation |
| `setupEventDelegation(container)` | function | Wires `data-action` attrs to menuEvents | 76 | header init |
| `bridgeAllToLegacy(mappings)` | function | Bridge action IDs to legacy DOM IDs | 133 | migration |
| `legacyMappings` | constant | `{save: 'saveBtn', exportSketch: 'exportSketchBtn', ...}` | 140 | bridging |

### 4.2 menu-config.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `menuConfig` | constant | Declarative menu structure | 6 | all renderers |
| `menuConfig.primary` | array | Save button + autosave | 8 | `createPrimaryActions` |
| `menuConfig.secondaryGroups` | array | Grouped dropdown items (sketch, csv, workday, location, gnss, survey) | 31 | `createCommandMenu` |
| `menuConfig.mobileGroups` | array | Mobile menu groups | 206 | `createMobileMenu` |
| `breakpoints` | constant | `{mobile: 600, tablet: 900, desktop: 1100}` | 250 | responsive |
| `getAllActionIds()` | function | Flat array of all action IDs | 257 | enumeration |

### 4.3 Header & Components

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `HeaderComponent` | class | Main header UI manager | `header.js:237` | `initHeader` |
| `initHeader(selector, t, getLang)` | function | Create + render header | `header.js:465` | app init |
| `createActionBar(t, lang)` | function | Full `<nav>` with all groups | `action-bar.js:184` | header |
| `createCommandMenu(t)` | function | Dropdown menu HTML | `command-menu.js:70` | secondary actions |
| `initCommandMenu(container)` | function | Wire dropdown behavior | `command-menu.js:127` | keyboard nav |

---

## 5. ADMIN — `src/admin/`

### 5.1 admin-panel.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `AdminPanel` | class | `new AdminPanel({container, adminConfig, t, showToast, onSaveSettings, onClose})` | 36 | all admin tabs |
| `TABS` | constant | 7 tabs: settings, projects, users, orgs, features, fixes, statistics | 26 | role-filtered |
| `AdminPanel.render()` | method | Async — fetches role, builds tabs, loads active | 59 | `_fetchCurrentUser` |
| `AdminPanel._switchTab(tabId)` | method | Toggle active tab, lazy-load | 120 | tab UI |

### 5.2 Tab Classes

| object_id | Type | Purpose | File |
|---|---|---|---|
| `AdminSettings` | class | Node/edge field config (include, defaults, options) | `admin-settings.js` |
| `ProjectsSettings` | class | Project CRUD + layers + input flow | `projects-settings.js` |
| `AdminUsers` | class | User list with role/org management | `admin-users.js` |
| `AdminOrganizations` | class | Organization CRUD (super_admin) | `admin-organizations.js` |
| `AdminFeatures` | class | Feature flags per org/user | `admin-features.js` |
| `AdminFixes` | class | Issues aggregation with fix suggestions | `admin-fixes.js` |
| `AdminStatistics` | class | KPI dashboard, charts, heatmaps | `admin-statistics.js` |
| `InputFlowSettings` | class | Visual rule builder for conditional fields | `input-flow-settings.js` |

---

## 6. MAP & FEATURES — `src/map/`, `src/features/`

### 6.1 Projections & Tiles

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `wgs84ToItm(lat, lon)` | function | WGS84 to ITM conversion | `projections.js:22` | proj4 |
| `itmToWgs84(x, y)` | function | ITM to WGS84 conversion | `projections.js:39` | proj4 |
| `MAP_TYPES` | constant | `.ORTHOPHOTO`, `.STREET` | `govmap-layer.js:25` | map type |
| `setMapReferencePoint({itm, canvas})` | function | Link ITM to canvas coords | `govmap-layer.js:202` | tile positioning |
| `drawMapTiles(ctx, ...)` | function | Render map tiles on canvas | `govmap-layer.js:266` | main draw loop |
| `TILE_SIZE` | constant | 256px | `tile-manager.js:14` | tile system |
| `calculateZoomLevel(pixelsPerMeter)` | function | Scale to zoom level (5-21) | `tile-manager.js:250` | tile loading |
| `getTileFromCache(x,y,z,type)` | function | LRU cache lookup | `tile-manager.js:94` | performance |
| `findParentTile(x,y,z,type)` | function | Blurry placeholder from parent | `tile-manager.js:429` | progressive loading |

### 6.2 Reference Layers

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `setReferenceLayers(arr)` | function | Load GIS layers from API | `reference-layers.js:116` | layer data |
| `drawReferenceLayers(ctx, ...)` | function | Draw all visible GIS layers | `reference-layers.js:457` | main draw loop |
| `isRefLayersEnabled()` / `setRefLayersEnabled(bool)` | function | Global layer toggle | `reference-layers.js:180/172` | layer state |
| `saveRefLayerSettings()` / `loadRefLayerSettings()` | function | Persist layer prefs | `reference-layers.js:288/304` | localStorage |

### 6.3 Drawing Primitives & Icons

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `drawNodeIcon(ctx, node, radius, colors, selectedNode, opts)` | function | Master dispatcher — LOD, type dispatch | `node-icons.js:381` |
| `drawManholeIcon(ctx, x, y, r, ...)` | function | Circle + crosshatch | `node-icons.js:16` |
| `drawDrainageIcon(ctx, x, y, r, ...)` | function | Rectangle + water droplet | `node-icons.js:60` |
| `drawCoveredIcon(ctx, x, y, r, ...)` | function | Circle + diagonal stripes | `node-icons.js:110` |
| `drawHomeIcon(ctx, x, y, r, ...)` | function | Circle + house icon | `node-icons.js:155` |
| `drawForLaterIcon(ctx, x, y, r, ...)` | function | Dashed circle + "?" | `node-icons.js:221` |
| `drawIssueIcon(ctx, x, y, r, ...)` | function | Circle + "!" exclamation | `node-icons.js:256` |
| `drawCoordinateStatusIndicator(ctx, ...)` | function | Green/yellow badge top-left | `node-icons.js:302` |
| `drawEdge(ctx, edge, tail, head, opts)` | function | Directed edge + arrowhead + glow | `rendering.js:138` |
| `drawDanglingEdge(ctx, edge, tail, opts)` | function | Dashed purple dangling edge | `rendering.js:85` |
| `drawInfiniteGrid(ctx, ...)` | function | Background grid | `rendering.js:52` |
| `showMeasurementRail(edge)` / `hideMeasurementRail()` | function | Inline depth inputs | `measurement-rail.js:118/131` |

---

## 7. PROJECT CANVAS — `src/project/`

### 7.1 State Management

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `loadProjectSketches(projectId)` | function | Load all project sketches from API | `project-canvas-state.js:44` | enters project mode |
| `switchActiveSketch(sketchId)` | function | Switch active sketch (snapshots current) | `project-canvas-state.js:140` | toast notification |
| `getBackgroundSketches()` | function | All visible sketches except active | `project-canvas-state.js:96` | rendering |
| `isProjectCanvasMode()` | function | Check if in project mode | `project-canvas-state.js:186` | state check |
| `clearProjectCanvas()` | function | Leave project mode | `project-canvas-state.js:200` | cleanup |
| `findNodeInBackground(x, y)` | function | Hit-test background sketch nodes | `project-canvas-state.js:224` | click handling |
| `selectAllSketches()` | function | View All — select everything | `project-canvas-state.js:334` | multi-select |
| `onProjectCanvasChange(fn)` | function | Subscribe to state changes | `project-canvas-state.js:360` | listeners |

### 7.2 Rendering & Issues

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `drawBackgroundSketches(ctx, sketches, opts)` | function | Cached offscreen buffer rendering | `project-canvas-renderer.js:301` | performance |
| `invalidateBackgroundCache()` | function | Force re-render on next draw | `project-canvas-renderer.js:50` | state changes |
| `computeSketchIssues(nodes, edges)` | function | Detect 6 issue types + compute totalKm | `sketch-issues.js:99` | issue detection |
| `getFixSuggestions(issue, nodes, edges)` | function | Fix suggestions with `apply()` fns | `fix-suggestions.js:13` | issue fixing |
| `startIssueHighlight(worldX, worldY, ms)` | function | Pulsing red ring animation | `issue-highlight.js:21` | navigation |
| `window.__issueHighlight` | global | `{start, draw}` — cross-module access | `issue-highlight.js:102` | main.js |
| `window.__issueNav` | global | Issue navigation API | `issue-nav-state.js:170` | main.js |

### 7.3 Side Panel & Merge

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initSketchSidePanel()` | function | One-time DOM setup | `sketch-side-panel.js:83` | project mode |
| `showSketchSidePanel()` | function | Show panel, enable View All | `sketch-side-panel.js:142` | enter project |
| `hideSketchSidePanel()` | function | Hide panel, disable merge | `sketch-side-panel.js:162` | leave project |
| `setMergeMode(enabled, context)` | function | Toggle merge mode | `merge-mode.js:92` | cross-sketch merge |
| `getNearbyNodes()` | function | Nearby nodes from other sketches | `merge-mode.js:113` | overlay rendering |
| `getCrossMergeIssues()` | function | Detected duplicate pairs | `merge-mode.js:118` | merge panel |

---

## 8. UTILS & STATE — `src/utils/`, `src/state/`, `src/dom/`, `src/graph/`

### 8.1 Coordinates & CSV

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `parseCoordinatesCsv(csvContent)` | function | Parse coords CSV → Map | `coordinates.js:10` |
| `applyCoordinatesToNodes(nodes, map, ...)` | function | Apply survey coords to nodes | `coordinates.js:445` |
| `repositionNodesFromEmbeddedCoordinates(...)` | function | Reposition from embedded coords | `coordinates.js:684` |
| `exportNodesCsv(nodes, adminConfig, t)` | function | Generate nodes CSV string | `csv.js:99` |
| `exportEdgesCsv(edges, adminConfig, t)` | function | Generate edges CSV string | `csv.js:152` |
| `csvQuote(value)` | function | Quote with formula injection prevention | `csv.js:84` |
| `encodeUtf16LeWithBom(text)` | function | UTF-16LE encoding for Excel | `encoding.js:6` |

### 8.2 Sketch I/O & Backup

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `exportSketchToJson(sketch, filename?)` | function | Download sketch JSON (v1.1) | `sketch-io.js:9` |
| `importSketchFromJson(file)` | function | Import + validate sketch JSON | `sketch-io.js:60` |
| `initBackupManager(getSketchData)` | function | Start 3-hour auto-backup | `backup-manager.js:212` |
| `createBackup(type?)` | function | Create hourly/daily backup in IDB | `backup-manager.js:36` |
| `window.backupManager` | global | Backup API for legacy code | `backup-manager.js:239` |

### 8.3 Input Flow Engine

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `evaluateRules(config, entityType, entity)` | function | Evaluate all rules → actions | `input-flow-engine.js:56` |
| `applyActions(entity, ruleResults, defaults?)` | function | Apply rules to entity copy | `input-flow-engine.js:133` |
| `isFieldVisible(ruleResults, key)` | function | Check field visibility | `input-flow-engine.js:207` |
| `validateInputFlowConfig(config)` | function | Validate config structure | `input-flow-engine.js:338` |

### 8.4 Canvas Performance

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `SpatialGrid` | class | Viewport culling grid (default 200 units) | `spatial-grid.js:14` |
| `buildNodeGrid(nodes, radius, ...)` | function | Build spatial grid for nodes | `spatial-grid.js:136` |
| `buildEdgeGrid(edges, nodeMap, ...)` | function | Build spatial grid for edges | `spatial-grid.js:158` |
| `progressiveRenderer` | singleton | Time-budgeted rendering (10ms) | `progressive-renderer.js:105` |
| `renderCache` | singleton | Off-screen canvas layer cache | `render-cache.js:120` |
| `renderPerf` | singleton | Frame time + FPS tracker | `render-perf.js:172` |
| `processLabels(ctx, labels, nodes, edges)` | function | Batch label collision avoidance | `label-collision.js:230` |
| `distanceToSegment(x0,y0,x1,y1,x2,y2)` | function | Point-to-segment distance | `geometry.js:11` |

### 8.5 UI Utilities

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `showToast(msg, variant?, duration?)` | function | Toast notification; `window.showToast` | `toast.js:13` |
| `FloatingKeyboard` | class | Mobile draggable numeric keyboard | `floating-keyboard.js:6` |
| `attachFloatingKeyboard(selector?)` | function | Wire keyboard to numeric inputs | `floating-keyboard.js:380` |
| `initResizableDrawer()` | function | Resizable details panel | `resizable-drawer.js:6` |
| `syncAppHeightVar()` | function | CSS `--app-height` sync | `dom-utils.js:23` |
| `syncHeaderHeightVar()` | function | CSS `--header-h` sync | `dom-utils.js:59` |

### 8.6 State Constants

| object_id | Type | Value | File:Line |
|---|---|---|---|
| `NODE_RADIUS` | constant | 20 | `constants.js:4` |
| `COLORS` | Proxy | Dynamic light/dark color accessor | `constants.js:152` |
| `isDarkMode()` | function | Detects dark mode (system/light/dark/auto) | `constants.js:33` |
| `NODE_MATERIAL_OPTIONS` | constant | 14 material options | `constants.js:164` |
| `EDGE_TYPES` | constant | `['קו ראשי', 'קו סניקה', 'קו משני']` | `constants.js:245` |
| `DEFAULT_INPUT_FLOW_CONFIG` | constant | 5 default rules | `constants.js:328` |
| `STORAGE_KEYS` | constant | All localStorage keys | `persistence.js:7` |
| `SKILL_LEVELS` | constant | APPRENTICE(1), SURVEYOR(2), EXPERT(3), ADMIN(4) | `skill-level.js:8` |
| `isFeatureVisible(feature)` | function | Progressive disclosure check | `skill-level.js:80` |

### 8.7 Graph & Service Worker

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `isNumericId(id)` | function | Distinguish numeric IDs from UUIDs | `id-utils.js:6` |
| `generateHomeInternalId()` | function | `'home_' + base36 + random` | `id-utils.js:17` |
| `registerServiceWorker` | IIFE | Register SW, 15-min updates, skip-waiting | `register-sw.js:4` |
| `setupOfflineRefreshGuards` | IIFE | Block F5/pull-to-refresh when offline | `register-sw.js:55` |

---

## 9. SURVEY — `src/survey/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `tsc3Connection` | singleton | TSC3 connection manager | `tsc3-connection-manager.js:208` | all TSC3 ops |
| `tsc3Connection.connectBluetooth(addr)` | method | Connect BT to TSC3 controller | 154 | `TSC3BluetoothAdapter` |
| `tsc3Connection.connectWebSocket(host, port)` | method | Connect WS to TSC3 (port 8765) | 173 | `TSC3WebSocketAdapter` |
| `TSC3BluetoothAdapter` | class | Bluetooth SPP for TSC3 (Capacitor) | `tsc3-bluetooth-adapter.js:36` | parser |
| `TSC3WebSocketAdapter` | class | WebSocket bridge for TSC3 | `tsc3-websocket-adapter.js:13` | reconnect |
| `parseSurveyLine(line)` | function | Parse survey CSV line (auto-detect format) | `tsc3-parser.js:45` | ITM heuristics |
| `processDataChunk(chunk, state)` | function | Streaming parser with buffer | `tsc3-parser.js:108` | both adapters |
| `openDevicePickerDialog(devices, t)` | function | Modal device picker → Promise | `device-picker-dialog.js:140` | BT connect |
| `openSurveyNodeTypeDialog(name, coords, onChoose, ...)` | function | Node type selection for survey points | `survey-node-type-dialog.js:90` | Manhole/Home/Drainage |
| `getSurveyAutoConnect()` | function | Auto-connect checkbox state | `survey-node-type-dialog.js:130` | edge creation |

---

## 10. 3D VIEW — `src/three-d/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `open3DView({selection?})` | function | Main orchestrator for 3D overlay | `three-d-view.js:43` | everything 3D |
| `buildScene(THREE, data, CSS2DObject, issues)` | function | Build 3D scene from sketch data | `three-d-scene.js:142` | manholes, pipes, houses |
| `computeInitialCamera({selection, ...})` | function | Camera placement based on selection | `three-d-camera-framing.js:13` | overview/node/edge |
| `FPSControls` | class | WASD + mouse FPS navigation | `three-d-fps-controls.js:34` | FPS mode |
| `VirtualJoystick` | class | Mobile touch joystick | `three-d-joystick.js:18` | FPS mobile |
| `createMaterials(THREE)` | function | All PBR materials | `three-d-materials.js:23` | scene |
| `EDGE_TYPE_COLORS` | constant | Edge type → hex color | `three-d-materials.js:14` | pipe colors |
| `setMiniatureMode(THREE, meshRefs, mini)` | function | Toggle real ↔ icon geometry | `three-d-miniature.js:26` | miniature button |
| `setup3DIssueInteraction(THREE, opts)` | function | Raycasting + fix popups | `three-d-issues.js:24` | issue fixing |

---

## 11. COCKPIT — `src/cockpit/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initCockpit()` | function | Setup: DOM, orientation listener, events | `cockpit.js:754` | landscape mode |
| `updateCockpit()` | function | Refresh all cockpit displays (5s interval) | `cockpit.js:689` | completion, GPS, sync |
| `isCockpitActive()` | function | Check if landscape cockpit is active | `cockpit.js:814` | state check |
| `computeSketchCompletion()` | function | 40% coords + 30% measures + 20% issues + 10% fields | `completion-engine.js:46` | health ring |
| `initIntelStrip()` | function | Wire GNSS + sync listeners | `intel-strip.js:13` | Zone A |
| `updateIntelStrip(completion)` | function | Update ring, stats, GPS, condensed | `intel-strip.js:60` | `updateCockpit` |
| `initActionRail()` | function | Wire action rail buttons + more menu | `action-rail.js:15` | Zone C |
| `initQuickWins()` | function | Achievement notifications | `quick-wins.js:18` | milestones |
| `initSessionTracker()` | function | Session timer + streak tracking | `session-tracker.js:21` | duration, nodes, edges |
| `getSessionStats()` | function | `{durationSeconds, nodesPlaced, edgesDrawn, streak}` | `session-tracker.js:268` | profile page |

### Key Cockpit DOM Elements

| ID | Purpose |
|---|---|
| `#intelStrip` | Zone A container |
| `#gpsDot` / `#gpsLabel` / `#gpsAccuracy` | GPS status |
| `#completionRing` / `#completionFill` / `#completionText` | Health ring |
| `#syncIcon` / `#syncLabel` / `#syncPending` | Sync status |
| `#sessionDuration` / `#sessionNodes` / `#sessionEdges` | Session stats |
| `#streakCount` | Day streak |
| `#actionRail` | Zone C toolbar |
| `#railGpsBtn` / `#railTsc3Btn` / `#railUndoBtn` / `#railRedoBtn` | Action buttons |
| `#railMoreBtn` / `#railMoreMenu` | More menu |
| `#cockpitProgressFill` | Bottom progress bar |
| `#microCockpit` | Portrait mini strip |

---

## 12. PAGES — `src/pages/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `renderProfilePage()` | function | `#/profile` route — user stats | `profile-page.js:12` | localStorage data |
| `hideProfilePage()` | function | Back button or navigate away | `profile-page.js:121` | cleanup |
| `renderLeaderboardPage(projectId?)` | function | `#/leaderboard` route — org leaderboard | `leaderboard-page.js:13` | `/api/stats/leaderboard` |
| `hideLeaderboardPage()` | function | Back button | `leaderboard-page.js:102` | cleanup |
| `renderProjectStatsPage(projectId)` | function | `#/project/:id/stats` route | `project-stats-page.js:13` | `/api/projects/:id` |
| `hideProjectStatsPage()` | function | Back button | `project-stats-page.js:146` | cleanup |

---

## 13. ENTRY POINTS — `src/main-entry.js`, `src/canvas-fab-toolbar.js`, `src/capacitor-api-proxy.js`, `src/db.js`, `src/i18n.js`

### 13.1 main-entry.js Window Globals

| object_id | Purpose | Line |
|---|---|---|
| `window.escapeHtml(str)` | XSS prevention | 62 |
| `window.__authClient` | Better Auth client | 82 |
| `window.__gnssState` / `window.__gnssConnection` | GNSS access | 85-86 |
| `window.authGuard` | Auth guard API | 226 |
| `window.t(key, ...args)` | i18n translator | 246 |
| `window.isRTL()` | RTL check | 249 |
| `window.CONSTS` | State constants | 253 |
| `window.__getFixSuggestions` / `window.__computeSketchIssues` | Issue engine | 256-257 |
| `window.__showMeasurementRail` / `window.__hideMeasurementRail` | Measurement UI | 258-259 |
| `window.__isFeatureVisible` | Progressive disclosure | 260 |
| `window.menuEvents` | Event bus | 563 |
| `window.__startPrecisionMeasure` | Precision measure flow | 456 |

### 13.2 Other Entry Files

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `initCanvasFabToolbar()` | function | Speed dial FAB setup | `canvas-fab-toolbar.js:2` |
| `isCapacitorNative()` | function | Check Capacitor runtime | `capacitor-api-proxy.js:15` |
| `getApiBaseUrl()` | function | Production URL or empty | `capacitor-api-proxy.js:23` |
| `openDb()` | function | Open IndexedDB (cached) | `db.js:32` |
| `saveCurrentSketch(sketch)` / `loadCurrentSketch()` | function | IDB current sketch CRUD | `db.js:91/111` |
| `i18n` | constant | Full translation dict (he/en) | `i18n.js:2` |
| `createTranslator(dictRef, getLang)` | function | Create `t()` function | `i18n.js:2351` |

---

## 14. API ROUTES — `api/`

### 14.1 Route Handlers

| Route | Methods | Handler | File |
|---|---|---|---|
| `/api/auth/*` | ALL | Better Auth (sign-in/up/out/session) | `api/auth/index.js` |
| `/api/sketches` | GET, POST | List (role-filtered), create, assign orphans | `api/sketches/index.js` |
| `/api/sketches/[id]` | GET, PUT, DELETE, POST | CRUD + lock ops (lock/unlock/refresh/forceUnlock) | `api/sketches/index.js` |
| `/api/projects` | GET, POST | List projects, create | `api/projects/index.js` |
| `/api/projects/[id]` | GET, PUT, DELETE, POST | CRUD + duplicate | `api/projects/index.js` |
| `/api/organizations` | GET, POST | List/create orgs | `api/organizations/index.js` |
| `/api/organizations/[id]` | GET, PUT, DELETE | Org CRUD (super_admin) | `api/organizations/index.js` |
| `/api/users` | GET | List users (paginated) | `api/users/index.js` |
| `/api/users/[id]` | GET, PUT | User details, update role/org | `api/users/index.js` |
| `/api/user-role` | GET | Current user role + features | `api/user-role/index.js` |
| `/api/features/:type/:id` | GET, PUT | Feature flags per org/user | `api/features/index.js` |
| `/api/layers` / `[id]` | GET, POST, PUT, DELETE | GeoJSON layers CRUD | `api/layers/index.js` |
| `/api/issue-comments` | GET, POST | Issue comments + @mentions | `api/issue-comments/index.js` |
| `/api/notifications` | GET, POST | Unread notifications, mark read | `api/notifications/index.js` |
| `/api/org-members` | GET | Org members for @mentions | `api/org-members/index.js` |
| `/api/stats/leaderboard` | GET | Accuracy leaderboard | `api/stats/index.js` |
| `/api/stats/workload` | GET | Full analytics payload | `api/stats/index.js` |

### 14.2 API Library (`api/_lib/`)

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `verifyAuth(request)` | function | Session check → `{userId, error, user}` | `auth.js:166` |
| `parseBody(request, maxSize?)` | function | JSON body with 15MB limit, content-type check | `auth.js:79` |
| `handleCors(req, res)` | function | CORS + OPTIONS preflight; returns true if preflight | `cors.js:60` |
| `verifyCsrf(req, res)` | function | Double-submit cookie CSRF; returns true if blocked | `csrf.js:58` |
| `applyRateLimit(req, res, max?)` | function | 100/min sliding window; returns true if limited | `rate-limit.js:130` |
| `handleApiError(error, res, label)` | function | Centralized error handler (503/400/500) | `error-handler.js:19` |
| `ensureDb()` | function | Init all tables (idempotent) | `db.js:278` |
| `validateSketchInput(body)` | function | Validate sketch payload | `validators.js:91` |
| `validateUUID(id)` | function | UUID v4 regex check | `validators.js:81` |

### 14.3 Database Operations (`api/_lib/db.js`)

| object_id | Type | Purpose | Line |
|---|---|---|---|
| `getSketchesByUser(userId, opts)` | function | User's sketches (paginated) | 304 |
| `getSketchById(id, userId)` | function | Single sketch (owner filtered) | 336 |
| `getSketchByIdAdmin(id)` | function | Sketch with owner info (no filter) | 350 |
| `createSketch(userId, data)` | function | INSERT sketch | 529 |
| `updateSketch(id, userId, data)` | function | UPDATE with optimistic locking | 575 |
| `acquireSketchLock(id, userId, username)` | function | Atomic lock acquire (30-min expiry) | 377 |
| `releaseSketchLock(id, userId)` | function | Release lock if held | 427 |
| `getOrCreateUser(userId, data)` | function | Upsert user record | 667 |
| `getAllOrganizations()` | function | Orgs with user_count | 783 |
| `createProject(orgId, data)` | function | INSERT project | 908 |
| `getFeatures(targetType, targetId)` | function | Feature flags with defaults | 1125 |
| `getEffectiveFeatures(userId, orgId)` | function | Cascaded org → user features | 1150 |
| `getIssueComments(sketchId, nodeId, opts)` | function | Comments ordered by date | 1327 |
| `addIssueComment(sketchId, nodeId, userId, ...)` | function | INSERT comment | 1342 |
| `createIssueNotifications(...)` | function | Notify participants | 1370 |
| `getUnreadNotifications(userId)` | function | Unread with comment content | 1409 |

### 14.4 Database Tables

| Table | Key Columns | Purpose |
|---|---|---|
| `organizations` | id, name | Organization entities |
| `projects` | id, organization_id, name, input_flow_config, target_km | Project entities |
| `sketches` | id, user_id, nodes (JSONB), edges (JSONB), project_id, version, locked_by | Sketch data |
| `users` | id, username, email, role, organization_id | User records |
| `user_features` | target_type, target_id, feature_key, enabled | Feature flags |
| `project_layers` | project_id, name, layer_type, geojson (JSONB), style | GIS layers |
| `issue_comments` | sketch_id, node_id, user_id, content | Issue comments |
| `issue_notifications` | user_id, sketch_id, comment_id, type, read | Notifications |
| `rate_limit_log` | ip, endpoint, created_at | Rate limiting |

---

## 15. MIDDLEWARE CHAIN (all routes except `/api/auth/*`)

```
1. handleCors(req, res)        → CORS + OPTIONS preflight
2. verifyCsrf(req, res)        → CSRF double-submit cookie
3. applyRateLimit(req, res)    → 100 req/min per IP
4. ensureDb()                  → Initialize tables
5. verifyAuth(request)         → Session check
6. Role-based access control   → Per-route RBAC
```

---

## 16. FIELD COMMANDER — `src/field-commander/`

Gamified field survey experience overlay — XP system, achievements, gestures, territory, panels.

### 16.1 fc-shell.js (Entry Point)

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initFieldCommander()` | function | Initializes FC mode: builds shell DOM, wires orientation listener, starts sub-modules | exported | `buildShellDOM`, `activate`, `deactivate` |
| `isFieldCommanderActive()` | function | Check if FC mode is active | exported | `_active` |
| `activateFieldCommander()` | function | Enable FC shell, add `fc-mode` class to body | exported | `initXPTracker`, `initAchievements`, `initGestures`, `initTerritory` |
| `deactivateFieldCommander()` | function | Disable FC shell, cleanup | exported | all sub-modules |
| `#fcShell` | layout | Main FC overlay container | DOM | sub-panels |
| `#fcXpBar` | layout | XP progress bar | DOM | `xpTracker` |
| `#fcXpBadge` | layout | XP amount badge | DOM | `xpTracker.showFloatingXP` |
| `#fcLevelBadge` | layout | Current level badge | DOM | `xpTracker` |
| `#fcToolbar` | layout | FC action toolbar | DOM | action buttons |

### 16.2 fc-xp.js (XP System)

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `XPTracker` | class | XP tracking with combo multiplier system | 14 | `xpTracker` singleton |
| `xpTracker` | singleton | `xpTracker.award('node_placed')` — awards XP with combo | 103 | `XP_VALUES`, `initXPTracker` |
| `XP_VALUES` | constant | `{node_placed: 10, edge_drawn: 5, gps_captured: 25, issue_resolved: 50, ...}` | 18 | `award` |
| `COMBO_WINDOW_MS` | constant | 30000 (30s combo window) | 16 | combo multiplier |
| `initXPTracker()` | function | Wires menuEvents: `node:added`, `edge:added`, `gnss:captured`, etc. | 110 | `menuEvents` |
| `xpTracker.award(action)` | method | Award XP with combo (1 + comboCount * 0.2, max 2x) | 47 | `showFloatingXP` |
| `xpTracker.showFloatingXP(xp)` | method | Animate floating "+XP" badge | 82 | `#fcXpBadge` |
| `xpTracker.getLevel()` | method | Level from total XP (every 500 XP) | 94 | level calculation |

### 16.3 fc-achievements.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initAchievements()` | function | Wires `node:added`, `sketch:complete`, `issues:allResolved`, gnss position | exported | `menuEvents`, `gnssState` |
| `showAchievement(type, icon, message)` | function | Toast with cooldown (5 min), daily dedup | internal | `COOLDOWN_MS`, `SHOWN_KEY` |
| Milestones | triggers | 10, 25, 50, 100 nodes → achievement toast | internal | `checkNodeMilestone` |

### 16.4 fc-gestures.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initGestures()` | function | Swipe recognition on canvas for mode switching | exported | touch events |
| `handleSwipe(direction)` | function | Left=edge mode, right=node mode, up=undo, down=redo | internal | canvas touch |

### 16.5 fc-panels.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initPanels()` | function | Setup FC info panels (XP stats, achievements list, territory map) | exported | `#fcInfoPanel` |
| `toggleFCPanel(panelId)` | function | Open/close FC sub-panels | exported | panel state |
| `renderXPStats()` | function | Render XP level, progress bar, recent awards | internal | `xpTracker` |

### 16.6 fc-territory.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initTerritory()` | function | Territory claiming based on surveyed area | exported | GPS data |
| `updateTerritory(position)` | function | Expand claimed territory polygon | internal | `gnssState` |
| `renderTerritoryOverlay(ctx)` | function | Draw territory fill on canvas | internal | draw loop |

---

## 17. NOTIFICATIONS — `src/notifications/`

### notification-bell.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initNotificationBell()` | function | Creates bell icon + dropdown, starts 60s polling | 18 | `#notifBell`, `#notifBadge`, `#notifDropdown` |
| `destroyNotificationBell()` | function | Clears interval, removes DOM | 49 | cleanup |
| `POLL_INTERVAL_MS` | constant | 60000 (60s polling) | 6 | `fetchCount` |
| `fetchCount()` | function | `GET /api/notifications?count=true` | 57 | badge update |
| `updateBadge(count)` | function | Show/hide count badge | 68 | `#notifBadge` |
| `toggleDropdown()` | function | Open/close notification dropdown | 78 | `openDropdown`, `closeDropdown` |
| `openDropdown()` | function | `GET /api/notifications`, render list, mark read | 91 | `renderNotifications` |
| `renderNotifications(notifications)` | function | Build HTML: header + item rows + "mark all read" btn | 109 | `#notifDropdown` |
| `#notifBell` | button | Bell icon with badge | DOM | header area |
| `#notifBadge` | layout | Unread count badge | DOM | `updateBadge` |
| `#notifDropdown` | layout | Notification list dropdown | DOM | `renderNotifications` |
| `#markAllReadBtn` | button | Mark all notifications as read | DOM | `POST /api/notifications {all: true}` |

---

## 18. WORKERS — `src/workers/`

### 18.1 worker-manager.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `postTask(type, payload)` | function | Send task to Web Worker; returns Promise with result | 68 | `getWorker`, `_pending` |
| `isWorkerAvailable()` | function | Check if Web Workers are supported | 86 | `typeof Worker` |
| `terminateWorker()` | function | Kill worker, clear pending tasks | 93 | `_worker`, `_pending` |
| `getWorker()` | function | Lazy-create singleton Worker from `data-processor.worker.js` | 19 | `_worker` |
| `_pending` | Map | `Map<requestId, {resolve, reject}>` — tracks in-flight tasks | 12 | message handler |

### 18.2 data-processor.worker.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `computeEdgeLabels(data)` | function | Offload edge label position computation to worker | 48 | `edges`, `nodeMap`, measurement text |
| `buildSpatialIndex(data)` | function | Build spatial grid in worker thread | 113 | `nodes`, `cellSize`, `radius` |
| `computeDataBounds(data)` | function | Compute min/max bounds of all nodes | 140 | `nodes`, `stretchX/Y` |
| `validateSketchData(data)` | function | Validate node/edge integrity in worker | 161 | `nodes`, `edges` |
| `onmessage` handler | event | Dispatches `{type, payload}` to appropriate function | 1 | `postMessage` result back |

---

## 19. ADDITIONAL MAP ENTRIES — `src/map/`

### layers-config.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initLayersConfig({canvasContainer, scheduleDraw, t, ...})` | function | Setup layers config button + floating panel | `layers-config.js:41` | `#layersConfigBtn` |
| `updateLayersPanel()` | function | Refresh panel after layers load | `layers-config.js:280` | `populatePanel` |
| `#layersConfigBtn` | button | Layers toggle in canvas toolbar | DOM | `togglePanel` |
| `#layersConfigPanel` | layout | Floating panel with layer toggles + map type | DOM | `populatePanel` |
| `#lc-map-toggle` | checkbox | Map tile toggle inside panel | DOM | `toggleMapLayer` |
| `#lc-map-type` | select | Orthophoto/street switcher | DOM | `setMapType` |
| `#lc-ref-toggle` | checkbox | Global ref layers toggle | DOM | `setRefLayersEnabled` |

### street-view.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initStreetView({canvasContainer, canvas, ...})` | function | Setup pegman drag-and-drop | `street-view.js:247` | `createPegmanElements` |
| `setStreetViewVisible(bool)` | function | Show/hide pegman when ref point available | `street-view.js:108` | `pegmanEl` |
| `#streetViewPegman` | layout | Draggable pegman widget | DOM | drag-and-drop to open Google Street View |

### user-location.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `requestLocationPermission()` | function | Request permission + single GPS fix | `user-location.js:72` | `currentPosition` |
| `startWatchingLocation(callback)` | function | Begin continuous GPS tracking | `user-location.js:120` | `watchPosition` |
| `stopWatchingLocation()` | function | Stop GPS tracking | `user-location.js:179` | `watchId` |
| `getCurrentPosition()` | function | Last known GPS position | `user-location.js:210` | `currentPosition` |
| `getCurrentPositionItm()` | function | Last position in ITM coords | `user-location.js:218` | `wgs84ToItm` |
| `calculateCenterOnUser(position, ...)` | function | ViewTranslate to center on user | `user-location.js:341` | `wgs84ToItm` |
| `drawUserLocationMarker(ctx, ...)` | function | Blue dot + accuracy circle + heading | `user-location.js:251` | canvas rendering |
| `toggleLocation(callback)` | function | Toggle location on/off | `user-location.js:394` | `isLocationEnabled` |

### project-loading-overlay.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `showProjectLoadingOverlay()` | function | Full-screen loading overlay with steps | `project-loading-overlay.js:117` | project load |
| `updateLoadingStep(stepId, state, detail?)` | function | Update step: pending/loading/done/error | `project-loading-overlay.js:164` | progress bar |
| `hideProjectLoadingOverlay()` | function | Fade-out (300ms) and hide | `project-loading-overlay.js:176` | cleanup |
| `STEPS` | constant | sketches(40%), layers(20%), canvas(30%), tiles(10%) | `project-loading-overlay.js:18` | weighted progress |
| `#projectLoadingOverlay` | layout | Overlay container | DOM | loading UI |
| `#projectLoadingBarFill` | layout | Progress bar fill | DOM | weighted % |

---

*Total objects cataloged: ~2200+ across 90+ files*

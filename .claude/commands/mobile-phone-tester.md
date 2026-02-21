# Manholes Mapper — Mobile Phone Testing Skill

You are a **mobile QA engineer** testing the Manholes Mapper PWA on a **physical Android phone** connected via USB. You have ADB, Chrome DevTools Protocol (via phone-debug MCP), Playwright (for desktop comparison), and the full codebase. Your job is to set up the phone connection, interact with the app on the phone, test GNSS/location features, and debug issues in real time.

---

## Equipment & Environment

| Component | Details |
|-----------|---------|
| **Phone** | Samsung Galaxy Note 10 (SM-N970F), Android 12, 1080x2280, density 420 |
| **GNSS Receiver** | Trimble R2 (connects via Bluetooth to phone) |
| **Mock Location Provider** | Trimble Mobile Manager (TMM) — feeds RTK position as Android mock location |
| **Browser** | Chrome 144+ on Android (CDP WebSocket broken — use ADB-only testing) |
| **App URL (Production)** | `https://manholes-mapper.vercel.app` (see Deploy-and-Test Workflow below) |
| **App URL (Preview/Dev)** | `https://manholes-mapper-git-dev-hussam0is-projects.vercel.app` |
| **App URL (Local full-stack)** | `http://localhost:3000` via `npm start` (Vercel dev) |
| **App URL (Local frontend-only)** | `http://localhost:5173` via `npm run dev` (NO API routes) |
| **Auth Credentials** | `admin@geopoint.me` / `Geopoint2026!` |

### Critical: Local Dev Server Limitations
- `npm run dev` (Vite) serves **frontend only** — `/api/*` routes will 404
- `npm start` (Vercel dev) serves **full stack** including serverless API routes
- The **production URL** always works for full testing (auth + API + frontend)
- When using local dev from phone, use `adb reverse tcp:PORT tcp:PORT` for USB access

### Deploy-and-Test Workflow

**CRITICAL: Pushing to `dev` creates a PREVIEW deployment, NOT production.**
The production URL (`manholes-mapper.vercel.app`) does NOT auto-update from `dev` pushes.

After code changes:
1. Commit and push to `dev` branch
2. **Wait 2 minutes** for Vercel Preview deployment to complete
3. **Promote to production** (required for phones using the production URL):
   ```bash
   # List deployments to find the latest Preview
   npx vercel ls 2>&1 | head -10
   # Promote it to production (auto-confirm with echo "y")
   echo "y" | npx vercel promote <preview-deployment-url>
   # Wait ~1 minute for production build
   ```
4. **Bump service worker version** if code in non-hashed files changed (e.g., `main.js`):
   - Edit `public/service-worker.js`: increment `APP_VERSION` (e.g., `'v26'` → `'v27'`)
   - Commit and push, then promote again
   - Without this, phones serve stale-while-revalidate cached JS indefinitely
5. Navigate phone to production URL, take screenshot to verify new code is running

**Why the SW bump matters:** Vite fingerprints `/assets/*.js` files (cache-first, new hash = new file).
But `main.js`, `styles.css`, and other root files are NOT fingerprinted. They use stale-while-revalidate,
meaning the phone returns the cached version immediately and only updates the cache in the background.
Bumping `APP_VERSION` forces the new SW to `skipWaiting()` and delete old caches on activate.

---

## App Architecture Quick Reference

### Hash-Based Routing

The app uses hash-based SPA routing (`window.handleRoute()`). No React Router.

| Hash | Description | Auth Required |
|------|-------------|---------------|
| `#/` | Main app canvas (sketch editor) | Yes — redirects to `#/login` |
| `#/login` | Sign-in form | No — redirects to `#/` if signed in |
| `#/signup` | Sign-up form | No — redirects to `#/` if signed in |
| `#/admin` | Admin settings (full page) | Yes |
| `#/projects` | Project management (full page) | Yes |

**Route guard:** If auth not loaded → spinner overlay. If not signed in → redirect to `#/login`.

### Responsive Breakpoints
- **Mobile:** `max-width: 600px` — hamburger menu shown, desktop `#controls` nav hidden
- **Desktop:** `> 600px` — full desktop nav visible
- **Dark mode:** `prefers-color-scheme: dark` supported

### Internationalization
- **Languages:** Hebrew (`he`, default RTL) and English (`en`)
- **Language select:** `#langSelect` (desktop), `#mobileLangSelect` (mobile)
- **Translator:** `window.t(key)` — returns translated string
- **RTL check:** `window.isRTL()` — true for Hebrew
- **Static strings:** `data-i18n="key"` attributes in HTML

### PWA / Service Worker
- **Service Worker:** `public/service-worker.js`, version `v26` (bump this to force cache refresh on phones)
- **Cache strategy:** Shell = cache-first, API = skip (no cache), Navigation = network-first, `/assets/*` = cache-first, other same-origin GET = stale-while-revalidate
- **Offline:** Canvas drawing works fully offline (localStorage/IndexedDB). API calls fail gracefully.
- **Manifest:** `display: standalone`, `theme_color: #2563eb`, `start_url: .`
- **Health check:** `/health/index.html` (survives offline — useful for connectivity testing)

### State & Persistence
- **localStorage** — primary sketch storage (nodes, edges, settings)
- **IndexedDB** — mirror for durability, restored if localStorage empty
- **Cloud sync** — via `src/auth/sync-service.js`, tracks `syncState.isOnline`

### External Services
- `server.arcgisonline.com` — map tiles (Esri Orthophoto/Street)
- `tile.openstreetmap.org` — fallback tiles
- `fonts.googleapis.com` — Inter font (Material Icons are self-hosted at `public/fonts/material-icons.woff2` due to CSP)
- Neon PostgreSQL — backend database (via Vercel serverless)

---

## Phase 1: Phone Connection Setup

### Step 1: Verify ADB
```bash
adb version    # Should show Android Debug Bridge
adb devices    # Should show device ID with "device" status
```

If ADB is not installed: `scoop install adb` (Windows with Scoop)

### Step 2: Enable USB Debugging on Phone
1. Settings > About Phone > tap "Build Number" 7 times
2. Settings > Developer Options > enable "USB Debugging"
3. Connect USB cable, select "File Transfer / MTP" mode
4. Accept USB debugging prompt on phone

### Step 3: Set Up Port Forwarding

**Chrome DevTools (phone → PC):**
```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

**Dev server access (PC → phone) — only if using local dev:**
```bash
adb reverse tcp:5173 tcp:5173   # For vite dev
adb reverse tcp:3000 tcp:3000   # For vercel dev
```

### Step 4: Verify Chrome DevTools Socket
```bash
# Check if Chrome's debug socket exists
adb shell "cat /proc/net/unix | grep devtools"
# Should show: @chrome_devtools_remote

# If socket is missing, force-restart Chrome (use am force-stop, NEVER pm clear):
adb shell "am force-stop com.android.chrome"
sleep 2
adb shell "am start -n com.android.chrome/com.google.android.apps.chrome.Main -d 'https://manholes-mapper.vercel.app/'"
sleep 5
# Re-establish forwarding after Chrome restart:
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

**Chrome First-Run Dialogs (after data clear):**
If Chrome data was accidentally cleared (`pm clear`), Chrome shows setup dialogs before loading any URL:
1. **"Make Chrome your own"** — "Continue as Phone1" / "Stay signed out" → Use uiautomator to find and tap button
2. **"Save time, type less"** (sync) — "Yes, I'm in" / "No thanks" → Tap "No thanks"
3. **"You can zoom in or out on sites you visit"** tooltip — Dismiss by tapping elsewhere

These dialogs have `resource-id` attributes visible to uiautomator (e.g., `com.android.chrome:id/signin_fre_continue_button`).

### Step 5: Connect via MCP
```
mcp__phone-debug__cdp_list_tabs    → List available Chrome tabs (HTTP — works on Chrome 144+)
mcp__phone-debug__cdp_connect      → Auto-detect and connect to app tab (WebSocket — FAILS on Chrome 144+)
```

**Known Issue (Chrome 144+): CDP WebSocket consistently fails.**
- `cdp_list_tabs` **WORKS** (uses HTTP) — useful to verify which tabs are open
- `cdp_connect` **ALWAYS FAILS** with "socket hang up" (WebSocket broken through ADB forwarding)
- All other CDP tools (evaluate, screenshot, console, network) require `cdp_connect` so they also fail

**Workaround:** Fall back to ADB-only testing (Method B). Use `adb exec-out screencap`, `adb shell input tap/text/keyevent`, and `adb logcat` instead.

---

## Phase 2: Phone Interaction Methods

### Method A: MCP Phone-Debug Tools (Only when CDP works — rarely on Chrome 144+)
```
cdp_evaluate      → Run JavaScript in page context
cdp_screenshot    → Capture phone screen as image
cdp_get_console_logs → Read JS console output
cdp_network_log   → Monitor API requests
```

**GNSS-specific tools:**
```
gnss_get_state         → Full state: connection, position, captures
gnss_get_position      → Current lat/lon/alt/accuracy/fixQuality
gnss_get_connection_info → Connection type and status
gnss_watch_position    → Collect N position updates over time
gnss_trigger_mock      → Start mock adapter (no real receiver needed)
gnss_capture_point     → Capture position for a node ID
```

### Method B: ADB Commands (Primary method — always works)

**NOTE:** Due to Chrome 144+ CDP WebSocket issues, ADB is the **only reliable method** for phone interaction. Always prefer ADB.

**Screenshots:**
```bash
# ALWAYS use this command to take phone screenshots (auto-downsizes to prevent Claude Code image dimension errors):
adb exec-out screencap -p > phone-screenshot-raw.png && python -c "from PIL import Image; img=Image.open('phone-screenshot-raw.png'); img.thumbnail((2000,2000)); img.save('phone-screenshot.png')" && rm phone-screenshot-raw.png
# Then use Read tool to view the image
```

**IMPORTANT — Screenshot Size Management:**
The Galaxy Note 10 captures at 1080x2280 native pixels. When many screenshots accumulate in a conversation, Claude Code rejects images exceeding 2000px in any dimension. **Always** use the resize command above instead of the raw `adb exec-out screencap -p > phone-screenshot.png`. Code examples later in this document use the short form for brevity — **you must substitute the resize version every time.** If you see the error *"An image in the conversation exceeds the dimension limit for many-image requests (2000px)"*, run `/compact` to clear old images from context.

**UI Element Discovery (native views only):**
```bash
adb shell "uiautomator dump /data/local/tmp/ui.xml && cat /data/local/tmp/ui.xml" 2>&1 \
  | tr '>' '\n' | grep -iE "SEARCH_TERM" | head -10
```
Each element has `bounds="[left,top][right,bottom]"`. Tap center: `((left+right)/2, (top+bottom)/2)`.

**CRITICAL:** `uiautomator` can only see **native Android views**, NOT web content inside Chrome's compositor. For web page elements (input fields, buttons rendered in HTML), uiautomator will only show Chrome's container `FrameLayout`. You MUST:
1. Take a screenshot and visually estimate coordinates
2. Use the **Screen Coordinate Reference** section for known element positions
3. Test with exploratory taps (tap, screenshot, check result, adjust)

**Tapping:**
```bash
adb shell input tap X Y
```

**Long-press (for elements that need it):**
```bash
adb shell input swipe X Y X Y 500   # swipe to same point with 500ms duration = long press
```

**Typing text:**
```bash
# Simple text (no special chars):
adb shell input text "hello"

# Text with special characters (use single quotes around the ADB shell command):
adb shell 'input text "Geopoint2026!"'

# CRITICAL: The '!' character gets eaten by bash history expansion.
# Always use single quotes around the outer adb shell command.
# If special chars still fail, use keyevent codes instead.
```

**Keyboard navigation (reliable for forms):**
```bash
adb shell input keyevent 66     # Enter (submit form)
adb shell input keyevent 67     # Backspace/Delete
```

**CRITICAL: AVOID these keyevents — they EXIT Chrome:**
- `keyevent 4` (Back) — EXITS Chrome entirely, doesn't navigate back
- `keyevent 111` (Escape) — EXITS Chrome entirely
- `keyevent 61` (Tab) — can EXIT Chrome on some pages; unreliable for form navigation

**Instead of Tab for form fields:** Tap the next field directly using coordinates. See Login Flow below.

**Opening URLs:**
```bash
adb shell "am start -a android.intent.action.VIEW -d 'https://manholes-mapper.vercel.app/' com.android.chrome"
```

**Chrome management:**
```bash
# Force stop Chrome
adb shell "am force-stop com.android.chrome"

# Open Chrome with URL
adb shell "am start -n com.android.chrome/com.google.android.apps.chrome.Main -d 'URL_HERE'"

# Check if Chrome is running
adb shell "ps -A | grep chrome"

# Get Chrome version
adb shell "dumpsys package com.android.chrome | grep versionName"
```

**Logcat (JS errors and system logs):**
```bash
# Chrome-specific logs (renderer crashes, errors):
adb logcat -d -s "chromium" | tail -30

# Look for renderer crashes:
adb logcat -d -s "chromium" | grep "Child process died"

# GNSS/Location logs (TMM mock location):
adb logcat -d | grep -iE "GnssEngine|FusedLocation|mock location" | tail -20

# Clear log buffer before a test:
adb logcat -c
```

### Method C: ADB Login Flow

When you need to log in on the phone and CDP is unavailable:

**PREREQUISITES:**
- The phone must already be past Vercel deployment protection (SSO cookie present). If navigating to the production URL redirects to `accounts.google.com`, ask the user to sign in manually first.
- Chrome saved passwords may interfere — see "Chrome Saved Password Autofill Blocks Login" in Phase 4.

**IMPORTANT:** Web input fields are INVISIBLE to uiautomator. You must use **tested coordinates** from the Screen Coordinate Reference.

```bash
# 1. Navigate to login page
adb shell "am start -a android.intent.action.VIEW -d 'https://manholes-mapper.vercel.app/#/login' com.android.chrome"
sleep 5

# 2. Take a screenshot to verify login page loaded
adb exec-out screencap -p > phone-screenshot.png
# Use Read tool to view

# 3. Tap email field at TESTED coordinates (y≈1340, NOT y≈900!)
#    Previous y=855-880 attempts FAILED — the field is much lower than it appears
adb shell input tap 400 1340
sleep 2

# 4. Take screenshot to verify keyboard appeared and field is focused (blue border)
adb exec-out screencap -p > phone-screenshot.png

# 5. Chrome may show autofill chips above keyboard (e.g., "admin@geopoint.me")
#    If the correct email chip appears, tap it (approx y=810) to auto-fill
#    Otherwise, type email manually:
adb shell input text "admin@geopoint.me"

# 6. Tap password field DIRECTLY (do NOT use Tab — it can exit Chrome!)
#    When keyboard is open, page scrolls up, so password field moves.
#    After email is filled, password field is approximately at y=640
adb shell input tap 400 640
sleep 1

# 7. Type password (use SINGLE QUOTES for '!' char)
adb shell 'input text "Geopoint2026!"'

# 8. Press Enter to submit
adb shell input keyevent 66
sleep 5

# 9. Verify login succeeded
adb exec-out screencap -p > phone-screenshot.png
```

**Coordinate Discovery Strategy (when coordinates don't work):**
1. Start with an exploratory tap at y=1100 (middle of page content)
2. Take screenshot to see what was hit (Chrome may highlight/select text)
3. If tap hit text ABOVE the target: move DOWN (increase Y)
4. If tap hit text BELOW the target: move UP (decrease Y)
5. Repeat until the target element responds (field focuses, keyboard appears)
6. Record the working coordinates for future use

**Chrome Autofill Chips:**
When an email field gains focus, Chrome may show saved email chips above the keyboard:
- `testuser@test.com` | `admin@geopoint.me`
- Tapping a chip auto-fills the email AND may auto-advance focus to password
- If it auto-advanced to password field, type password directly
- If it didn't fill correctly, navigate to login URL fresh and start over

**If taps don't reach web content:**
1. Force-stop Chrome and reopen: `adb shell "am force-stop com.android.chrome"` then relaunch
2. Try slightly different coordinates (the field position shifts with zoom/layout)
3. As a last resort, ask the user to type the credentials manually on the phone

---

## Phase 2B: DOM Element Reference

### Key DOM IDs for Interaction

**Header (always visible):**
| ID | Element | Notes |
|----|---------|-------|
| `#brand` | Logo + title + sketch name | Tap to go home |
| `#sketchNameDisplayMobile` | Mobile sketch name | Only shown on mobile |
| `#mobileMenuBtn` | Hamburger menu button | Only on mobile (`≤600px`) |
| `#authUserButton` | Desktop user avatar/login | |
| `#mobileAuthUserButton` | Mobile user avatar | Inside mobile menu |

**Canvas area:**
| ID | Element | Notes |
|----|---------|-------|
| `#graphCanvas` | Main drawing canvas | Touch events: pan, zoom, tap nodes |
| `#nodeModeBtn` | Manhole node draw mode | In `.canvas-toolbar` |
| `#homeNodeModeBtn` | Home node draw mode | |
| `#drainageNodeModeBtn` | Drainage node draw mode | |
| `#edgeModeBtn` | Edge/line draw mode | |
| `#myLocationBtn` | "My Location" crosshair | In `#locationGroup` |
| `#recenterBtn` | Re-center sketch FAB | Canvas overlay |
| `#recenterDensityBtn` | Re-center by density FAB | Canvas overlay |
| `#toast` | Toast notification | `role="status"`, auto-hides |
| `#edgeLegend` | Edge type legend | Canvas overlay |
| `#toggleFloatingKeyboard` | Numeric keypad toggle | Shown on mobile when input focused |
| `#sidebar` / `.drawer` | Right-side details panel | Resizable via drag handle |
| `#sidebarCloseBtn` | Close details sidebar | |

**Mobile menu (slide-in drawer from right):**
| ID | Element | Category |
|----|---------|----------|
| `#mobileMenu` | Menu panel container | `mobile-menu--open` class |
| `#mobileMenuCloseBtn` | X close button | |
| `#mobileMenuBackdrop` | Dark overlay behind menu | |
| `#mobileHomeBtn` | Home / My Sketches | Navigation |
| `#mobileNewSketchBtn` | New Sketch | Navigation |
| `#mobileZoomOutBtn` / `#mobileZoomInBtn` | Zoom controls | View |
| `#mobileSizeDecreaseBtn` / `#mobileSizeIncreaseBtn` | Node size controls | View |
| `#mobileSaveBtn` | Save sketch | Sketch |
| `#mobileExportSketchBtn` | Export sketch JSON | Sketch |
| `#mobileImportSketchBtn` | Import sketch JSON | Sketch |
| `#mobileExportNodesBtn` | Export nodes CSV | CSV |
| `#mobileExportEdgesBtn` | Export edges CSV | CSV |
| `#mobileImportCoordinatesBtn` | Import coordinates | Location |
| `#mobileCoordinatesToggle` | Toggle coordinate display | Location |
| `#mobileLiveMeasureToggle` | Live Measure checkbox | GNSS |
| `#mobileLocationStatus` | GNSS status text | GNSS |
| `#mobileMapLayerToggle` | Toggle map layer | Map |
| `#mobileMapTypeSelect` | Map type dropdown | Map |
| `#mobileFinishWorkdayBtn` | Finish workday | Workday |
| `#mobileAutosaveToggle` | Autosave checkbox | Settings |
| `#mobileLangSelect` | Language dropdown | Settings |
| `#mobileHelpBtn` | Help/shortcuts | Settings |
| `#mobileAdminBtn` | Admin settings | Settings |
| `#mobileProjectsBtn` | Projects | Settings |

**Survey Device group (TSC3):**
| Selector | Element | Notes |
|----------|---------|-------|
| `[data-action="connectSurveyBluetooth"]` | Connect Bluetooth | Opens device picker dialog or auto-connects |
| `[data-action="connectSurveyWebSocket"]` | Connect WebSocket | Prompts for host:port |
| `#mobileDisconnectSurveyBtn` | Disconnect survey device | `data-action="disconnectSurvey"` |
| `#surveyConnectionBadge` | Green BT badge (canvas overlay) | Shows while connected, hides on disconnect |
| `#devicePickerDialog` | Device picker modal | Created dynamically by `device-picker-dialog.js` |

**Overlay panels (initially `display: none`):**
| ID | Panel | Trigger |
|----|-------|---------|
| `#loginPanel` | Login/signup full-screen | Route `#/login` or `#/signup` |
| `#authLoadingOverlay` | "Checking permissions" spinner | On page load before auth resolves |
| `#homePanel` | Sketch list (personal + org tabs) | Home button |
| `#startPanel` | New sketch form (project + date) | New Sketch button |
| `#helpModal` | Keyboard shortcuts | Help button |
| `#adminModal` | Admin settings modal | Admin button (when in sketch) |
| `#finishWorkdayModal` | Dangling edge resolution | Finish Workday button |
| `#adminScreen` | Full-page admin | Route `#/admin` |
| `#projectsScreen` | Full-page projects | Route `#/projects` |
| `#floatingKeyboard` | Floating numeric keypad | Auto-shown on mobile input focus |

### Auth Form DOM Structure
The login form is React-mounted into `#authContainer`:
```html
<form class="auth-form">
  <input type="email" id="email">      <!-- Email field -->
  <input type="password" id="password"> <!-- Password field -->
  <button type="submit" class="auth-form-submit">Sign In</button>
  <div class="auth-form-error">...</div> <!-- Error messages -->
</form>
```

### API Endpoints (Vercel Serverless)

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/auth` | `*` | Better Auth handler (sign-in/up/out, session) |
| `/api/sketches` | `GET, POST` | List/create user's sketches |
| `/api/sketches/[id]` | `GET, PUT, DELETE` | CRUD single sketch |
| `/api/projects` | `GET, POST` | List/create projects |
| `/api/projects/[id]` | `GET, PUT, DELETE` | CRUD single project |
| `/api/organizations` | `GET, POST` | List/create organizations |
| `/api/organizations/[id]` | `GET, PUT, DELETE` | CRUD organization |
| `/api/users` | `GET` | List users |
| `/api/users/[id]` | `GET, PUT` | Get/update user |
| `/api/user-role` | `GET` | Current user's role |
| `/api/layers` | `GET` | Map layer data |
| `/api/features/[...slug]` | `GET, PUT` | Feature flags per user/org |

**Auth:** Cookie-based sessions (Better Auth). No token headers needed — cookies sent automatically.
**Vercel rewrites:** `/api/auth/:path*` → `/api/auth`, `/api/layers/:path*` → `/api/layers`

### Useful Window Globals for Debugging

When CDP `evaluate` is available, or for `adb logcat` analysis:
```js
window.__gnssState          // GNSS state manager (position, connection, captures)
window.__gnssConnection     // GNSS connection manager
window.gnssState            // Same as above (alias)
window.gnssConnection       // Same as above (alias)
window.__authClient         // Better Auth client instance
window.authGuard            // Auth state: { isLoaded, isSignedIn, userId, user }
window.t('key')             // i18n translator
window.isRTL()              // RTL language check
window.showToast('msg', ms) // Show toast (default 1800ms; pass longer for debug, e.g. 10000)
window.menuEvents           // Menu event bus
window.handleRoute()        // Trigger route evaluation
window.centerOnGpsLocation(lat, lon)  // Center map on GPS position
window.closeMobileMenu()    // Close mobile menu programmatically
window.CONSTS               // App constants catalog
```

---

## Phase 3: GNSS/Location Testing

### TMM (Trimble Mobile Manager) Overview
TMM receives RTK position from Trimble R2 via Bluetooth and injects it as Android mock location. Chrome's `navigator.geolocation` with `enableHighAccuracy: true` reads this mock location automatically.

**TMM Overlay Indicators (top of phone screen):**
- `P: X/Y` — Position count
- `dX/dY` — Deltas
- `Xv/Yv` — Velocities
- `Prs` — Pressure (1.0 = active)
- `Size` — Touch size (shows touch contact size, NOT an intercept — taps still pass through)

### Test: Browser Location Adapter

The unified location system uses `src/gnss/browser-location-adapter.js`:
- `startBrowserLocationAdapter()` → starts `navigator.geolocation.watchPosition`
- Maps browser accuracy → fix quality:
  - `< 0.05m` → RTK Fixed (fixQuality: 4)
  - `< 0.5m` → RTK Float (fixQuality: 5)
  - `< 5m` → DGPS (fixQuality: 2)
  - `< 15m` → GPS (fixQuality: 1)
  - `>= 15m` → Low Accuracy (fixQuality: 0)

### Coordinate System Architecture

The app uses **four coordinate systems** in a pipeline:

| System | Use | Conversion |
|--------|-----|------------|
| **WGS84** (EPSG:4326) | GPS lat/lon, browser geolocation | `wgs84ToItm()` via proj4 |
| **ITM** (EPSG:2039) | Israel survey data, node positions | `itmToWgs84()` via proj4 |
| **Web Mercator** (EPSG:3857) | Tile server URLs (Esri/OSM) | `latLonToTile()` / `tileToLatLon()` |
| **Canvas World** (pixels) | Drawing surface, node rendering | `referencePoint` + `coordinateScale` |

**Draw pipeline:** `screen = world * stretch * viewScale + viewTranslate`

Key files: `src/map/projections.js`, `src/map/tile-manager.js`, `src/map/govmap-layer.js`

**Known bugs fixed (commit 9883bea):**
- GNSS marker was **double-transformed** (manual screen calc + ctx transform)
- `calculateCenterOnUser()` was missing `viewScale` and `stretch` factors
- Both fixed by resetting ctx to identity in markers and passing scale params to centering

### Test Workflow: Live Measure Toggle

1. Open a sketch on the phone
2. Open the mobile menu — hamburger position depends on language:
   - **Hebrew (RTL):** hamburger is at **LEFT** side: bounds `[49,260][168,381]`, tap **(109, 320)**
   - **English (LTR):** hamburger is at RIGHT side: bounds `[910,260][1029,381]`, tap **(970, 320)**
   - **Always verify with uiautomator:** `grep -iE "mobileMenuBtn"`
3. Scroll down in menu (swipe up inside menu area) to find "מדידה חיה" / "Live Measure" section
4. Toggle the Live Measure checkbox (use uiautomator to find `mobileLiveMeasureToggle` bounds)
5. **Expected:** Chrome asks for location permission (first time only)
6. After granting permission:
   - GNSS marker should appear on canvas (color-coded by fix quality)
   - "המיקום שלי" / "My Location" label appears below the marker
   - Status text should show accuracy and fix type
   - Coordinates display should auto-enable
7. **The marker may be off-screen** — tap My Location button to center on it

**Via ADB (when CDP unavailable):**
```bash
# Check if location permission was granted
adb shell "dumpsys package com.android.chrome | grep -i location"

# Monitor location updates in logcat
adb logcat -d | grep -iE "GnssEngine|isMock|accuracy" | tail -10
```

### Test: My Location Button

1. Tap the crosshair icon (my_location) on the drawing toolbar — bounds `[782,470][916,578]`, tap **(849, 524)**
2. **If Live Measure is active:** Should immediately center on current GNSS position
3. **If Live Measure is off:** Should do a one-shot geolocation request then center (but NO marker drawn — marker only renders when Live Measure is on)
4. **Verify:** Marker should be centered on screen at the GPS position with "המיקום שלי" label below it

### Test: Point Capture

1. Enable Live Measure
2. Wait for RTK fix (green marker, fixQuality >= 4)
3. Select a manhole node on the canvas
4. The point capture dialog should show current GNSS position
5. Capture should store lat/lon/accuracy on the node

---

## Phase 3B: Survey Device (TSC3) Testing

### Overview

The TSC3 (Trimble Survey Controller 3) connection enables importing survey points directly from a Trimble controller via **Bluetooth SPP** (Serial Port Profile) or **WebSocket bridge**. Survey points are streamed as CSV lines, parsed, and matched to existing canvas nodes or placed as new nodes.

### Architecture

```
TSC3 Controller → Bluetooth SPP → tsc3-bluetooth-adapter.js → tsc3-parser.js → tsc3-connection-manager.js → main.js
                  (or WebSocket)   tsc3-websocket-adapter.js ↗
```

**Key files:**
| File | Purpose |
|------|---------|
| `src/survey/tsc3-bluetooth-adapter.js` | Capacitor Bluetooth SPP adapter. Uses `list()` for paired devices. Requests runtime BT permissions on Android 12+. |
| `src/survey/tsc3-websocket-adapter.js` | WebSocket bridge adapter. Auto-detects `wss://` on HTTPS. Reconnects with exponential backoff (5 attempts). |
| `src/survey/tsc3-parser.js` | Streaming CSV parser. Auto-detects delimiter (comma/tab/space) and column order (NEN vs NNE). Validates ITM coordinate ranges (E: 100k–300k, N: 375k–800k). |
| `src/survey/tsc3-connection-manager.js` | Singleton orchestrator. Matches incoming points to existing nodes, queues points while dialog is open. |
| `src/survey/survey-node-type-dialog.js` | Modal for choosing node type (Manhole/Home/Drainage) when a new survey point arrives. |
| `src/survey/device-picker-dialog.js` | Touch-friendly device picker dialog (replaces broken `window.prompt()`). |

### Test: Connect Bluetooth (Capacitor only)

**NOTE:** Bluetooth connection only works in the **Capacitor native app** (`com.geopoint.manholemapper`), NOT in Chrome browser. The `@e-is/capacitor-bluetooth-serial` plugin has no web implementation.

1. Open a sketch on the phone (must be the Capacitor app, not Chrome)
2. Open the mobile menu
3. Scroll to "Survey Device" (מכשיר מדידה) group
4. Tap **"Connect Bluetooth"** (חיבור Bluetooth)
5. **Expected flow:**
   - App requests Bluetooth runtime permissions (Android 12+ — BLUETOOTH_CONNECT, BLUETOOTH_SCAN)
   - Fetches paired devices via `BluetoothSerial.list()` (bonded devices only, no scanning)
   - If **1 survey device** found: auto-connects
   - If **2+ devices** found: opens device picker dialog (touch-friendly modal with tappable device buttons)
   - If **0 devices** found: shows toast "No paired devices found"
6. On successful connect:
   - Toast: "Connected to [device name]"
   - Green Bluetooth badge (`#surveyConnectionBadge`) appears on canvas
   - Survey data streams start being parsed and dispatched

### Test: Connect WebSocket

WebSocket works in **both Chrome and Capacitor** — useful for development and testing.

1. Start a WebSocket bridge on a PC (e.g., `android-bridge/` Node.js app)
2. Open the mobile menu → Survey Device → **"Connect WebSocket"**
3. Enter host:port in the prompt (e.g., `192.168.1.100:8765`)
4. **Expected:** Connects via `wss://` on HTTPS pages or `ws://` on HTTP. Shows connected toast + green badge.
5. **Reconnect:** If connection drops, auto-reconnects up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s)

### Test: Incoming Survey Points

When connected (via BT or WS):

1. Send a CSV line from the TSC3: `1,178000.000,650000.000,100.000`
2. **Expected:** Node-type dialog appears asking Manhole/Home/Drainage
3. Choose a type → new node created on canvas at center of viewport
4. Send another line with same point name: `1,178000.100,650000.100,100.100`
5. **Expected:** Coordinates updated silently (no dialog, existing node matched by ID + `hasCoordinates` flag)
6. Send a different point: `2,178001.000,650001.000,99.000`
7. **Expected:** New dialog for point 2

**Point queue test:** Send 3 rapid points while dialog is open. After closing dialog for point 1, the dialog should open for point 2, then point 3.

**ID collision guard:** If a manually-created node already has ID "1" but `hasCoordinates === false`, the survey system creates a new node with prefixed ID `S-1` rather than overwriting.

**Coordinate validation:** Points with easting/northing outside ITM range (E: 100k–300k, N: 375k–800k) are rejected by the parser.

### Test: Disconnect

1. Open mobile menu → Survey Device → **"Disconnect"** (נתק מכשיר)
2. **Expected:** Toast "Survey device disconnected", green badge disappears
3. Point queue is cleared

### Test: Connection Badge

- Badge element: `#surveyConnectionBadge` (canvas overlay, `position: fixed`)
- While connected: green Bluetooth icon with pulse animation
- After disconnect: hidden (`display: none`)
- Badge should NOT interfere with canvas touch events (it's pointer-events-aware)

---

## Phase 4: Debugging Common Issues

### Issue: Playwright MCP Fails to Launch Chrome (Windows)
**Symptoms:** `browserType.launchPersistentContext: Failed to launch the browser process` — Chrome exits immediately with "Opening in existing browser session."
**Cause:** An existing Chrome process is running and the `--user-data-dir` profile is locked. Enterprise/managed Chrome instances on Windows resist `taskkill /F`, `wmic process delete`, and even `SingletonLock` removal.
**Fix:** Do NOT waste time trying to kill Chrome. Fall back to **code-only analysis** (run tests, read code, review logic) or use **ADB-only phone testing**. Playwright desktop testing is not available on this machine when Chrome is running.
**Alternative:** Use `browser_install` if Playwright supports a separate Chromium binary — but on this machine it still tries system Chrome.

### Issue: Chrome Translate Bar Blocks Web Content
**Symptoms:** After navigating to the app, Chrome shows a "Translate this page?" bar below the toolbar, shifting web content down by ~40px.
**Fix:** Dismiss by tapping the X button on the translate bar. Approximate position: `adb shell input tap 75 213` (X icon on the left side of the bar). After dismissing, web content coordinates return to normal.

### Issue: `am start VIEW` Opens New Tab Instead of Navigating
**Symptoms:** Using `adb shell "am start -a android.intent.action.VIEW -d 'URL' com.android.chrome"` sometimes opens a new Chrome tab instead of navigating the existing tab.
**Cause:** Chrome decides whether to reuse a tab based on the URL and current tab state. If the URL differs from the current tab, Chrome opens a new tab.
**Fix:** Navigate to the same base URL each time (`https://manholes-mapper.vercel.app/`). If a new tab opens, use the back button or close the extra tab. For hash-based routing, change the hash via CDP evaluate or ADB JavaScript URL (if possible).

### Issue: Screenshot Coordinate Mapping (Downscaled Images)
**Problem:** Screenshots are downscaled via PIL `thumbnail((2000,2000))` for Claude Code image limits. This means the displayed image is smaller than native 1080x2280. Tapping at visual coordinates from the downscaled image will miss the target.
**Formula:**
```
scale = native_width / displayed_width = 1080 / displayed_px_width
native_x = displayed_x * scale
native_y = displayed_y * scale
```
**Example:** If the screenshot renders at 710px wide: `scale = 1080/710 ≈ 1.52`. A button at displayed `(176, 693)` → native `(268, 1053)`.
**Best practice:** Always use native coordinates from the **Screen Coordinate Reference** section or **uiautomator** instead of estimating from screenshots. Reserve screenshot coordinate mapping as a last resort.

### Issue: Chrome Native confirm() Dialogs — Updated Coordinates
**Symptoms:** `confirm()` dialogs rendered by Chrome are invisible to uiautomator prior to Chrome 132 but **are visible** on Chrome 144+.
**Fix:** Use uiautomator to find the OK/Cancel buttons:
```bash
adb shell "uiautomator dump /data/local/tmp/ui.xml && cat /data/local/tmp/ui.xml" 2>&1 \
  | tr '>' '\n' | grep -iE "OK|Cancel|button" | head -10
```
**Known positions (Chrome 144, Galaxy Note 10):**
- OK button: bounds `[780,1345][1011,1471]`, center **(895, 1408)**
- Cancel button: bounds `[548,1345][779,1471]`, center **(664, 1408)**
These coordinates shift slightly depending on dialog text length — always verify with uiautomator.

### Issue: Tapping Chrome Toolbar Instead of App Header
**Symptoms:** Tapping at y ≈ 220 opens Chrome's 3-dot menu instead of the app's hamburger.
**Cause:** Chrome toolbar occupies y=90–237. The app header starts at y ≈ 260.
**Fix:** The app hamburger is at **(970, 320)** in LTR English / **(109, 320)** in RTL Hebrew. Never tap above y=260 when targeting web content — you'll hit Chrome UI instead.

### Issue: Chrome Tab Keeps Crashing (Renderer Dies)
**Symptoms:** "Child process died (type=6)" in logcat
**Causes:**
- Memory pressure on Galaxy Note 10
- Heavy Vite HMR module loading
- Infinite loop in draw code
**Fix:** Use production URL instead of local dev server. Force-stop Chrome and reopen.

### Issue: CDP "socket hang up"
**Cause:** Chrome 144+ WebSocket bug through ADB forwarding
**Status:** `cdp_list_tabs` works (HTTP), `cdp_connect` always fails (WebSocket)
**Fix:** Fall back to ADB-only testing. Do NOT waste time debugging CDP.

### Issue: NEVER use `pm clear com.android.chrome`
**Why:** `pm clear` wipes ALL Chrome data including:
- Login sessions and cookies (must re-login everywhere)
- **Vercel deployment protection cookies** (production URL redirects to Google SSO)
- Chrome first-run dialogs re-appear (must dismiss "Make Chrome your own", sync prompts)
- Saved passwords trigger autofill interference on subsequent logins

**Instead use `am force-stop`** to restart Chrome without losing data.

### Issue: NEVER use `adb kill-server`
**Why:** Restarting the ADB server causes the device to show "unauthorized" status. The user must physically tap "Allow" on the USB debugging prompt on the phone before ADB works again. Only use this as an absolute last resort.

### Issue: Chrome Saved Password Autofill Blocks Login
**Symptoms:** Tapping the email field triggers Chrome's "Use saved password?" bottom sheet instead of focusing the field. The autofill may submit the form with wrong credentials (e.g., `testuser@test.com`).
**Fix:**
- If the popup appears, do NOT press Back (exits Chrome). Instead, tap the X button on the popup (use uiautomator to find its bounds)
- After dismissing, the field should be tappable
- If credentials were auto-filled incorrectly, navigate to the login URL again fresh

### Issue: Chrome Text Selection Triggers Search
**Symptoms:** Tapping on text in the page highlights/selects a word and Chrome shows "Tap to see search results" bar at bottom.
**Cause:** The tap landed on text content, not an interactive element (button, input).
**Fix:** Adjust Y coordinate — you're tapping too high or too low. The search bar can be dismissed by tapping elsewhere on the page.

### Issue: Production URL Redirects to Google SSO
**Cause:** Vercel deployment protection requires authentication.
**Fix:**
- Ask the user to manually sign in to Vercel SSO on the phone
- Once signed in, the deployment protection cookie persists until Chrome data is cleared
- **Do NOT clear Chrome data** (`pm clear`) as it removes this cookie

### Issue: Login Fails on Local Dev Server
**Cause:** `npm run dev` (Vite) doesn't serve `/api/*` routes
**Fix:** Use production URL or `npm start` (Vercel dev)

### Issue: ADB Special Characters in Input
**Problem:** `!`, `$`, `(`, etc. get interpreted by bash
**Fix:** Wrap the entire `adb shell` argument in single quotes:
```bash
adb shell 'input text "password_with_special!"'
```
If that still fails, type character-by-character using keycodes or ask the user to type manually.

### Issue: Location Errors Shown as Toast
The app shows toast messages for geolocation failures:
- **"Location permission denied..."** → User denied or Chrome blocked
- **"Location unavailable..."** → GPS disabled or no signal
- **"Location request timed out..."** → TMM not providing mock location
- **"Location not supported..."** → Very old browser or insecure context (HTTP)

**Toast element:** `#toast` with `role="status"` — auto-hides after 1.8s. Check `adb logcat` for timing.

### Issue: No Location Permission Dialog
**Cause:** Permission already denied or site not served over HTTPS
**Fix:**
- Production URL uses HTTPS (permissions work)
- Local dev over HTTP may block geolocation on Android
- Clear Chrome site data: Settings > Site Settings > manholes-mapper > Clear & reset
- **Permissions-Policy header:** `geolocation=(self)` — only same-origin can request

### Issue: Chrome Native confirm() Dialogs
**Symptoms:** A `confirm()` dialog appears (e.g., "השרטוט ריק... לשמור בכל זאת?").
**Cause:** Chrome renders `alert()`/`confirm()`/`prompt()` dialogs in its compositor.
**Fix (Chrome 144+):** These dialogs ARE visible to uiautomator. Use `grep -iE "OK|Cancel|button"` to find bounds. See **"Chrome Native confirm() Dialogs — Updated Coordinates"** above for known positions.
**Caution:** Tapping outside the dialog may land on Android system UI (e.g., opening the Phone dialer near the nav bar area).

### Issue: Incoming Phone Calls During Testing
**Fix:** Dismiss with `adb shell input keyevent 6` (KEYCODE_ENDCALL). Do NOT use keyevent 4 (Back).

### Issue: Phone Screen Turns Off During Wait
**Fix:** Wake with `adb shell input keyevent 26` (power button toggle), then swipe to unlock: `adb shell input swipe 540 2000 540 1000 300`

### Issue: Stale Code After Deployment (Service Worker Cache)
**Symptoms:** New code changes don't appear on the phone even after promoting to production.
**Cause:** Service worker stale-while-revalidate serves old cached JS for non-hashed files.
**Fix:**
1. Bump `APP_VERSION` in `public/service-worker.js` (e.g., `'v26'` → `'v27'`)
2. Commit, push, wait for build, promote to production
3. Reload the page on the phone — new SW installs and clears old caches
4. Reload once more to get the fresh files from the new cache

### Issue: TMM Not Providing Mock Location
**Check:** Look for `isMock=true` in logcat:
```bash
adb logcat -d | grep "isMock" | tail -5
```
If `isMock=false` or no entries: TMM is not injecting mock location. Check:
- TMM app is running and connected to Trimble R2
- "Mock location app" is set to TMM in Developer Options
- Trimble R2 Bluetooth is connected

---

## Phase 5: Screen Coordinate Reference (Galaxy Note 10, 1080x2280, density 420)

### CRITICAL: Coordinate Calibration Notes

The screencap output is 1080x2280 native pixels. `adb shell input tap X Y` uses the **same native pixel coordinates**. However, **web page elements render much lower than they appear** in the displayed screenshot because:
- The screenshot is 2280px tall but may be shown scaled down
- Chrome's toolbar and status bar consume the top ~237px
- Web content occupies y=237 to y=2064 (1827px of vertical space)

**Always verify coordinates by tap-screenshot-check cycle.** Never assume coordinates from visual inspection alone.

### Chrome UI Regions (from uiautomator)
| Region | Y Range (native px) | Notes |
|--------|---------------------|-------|
| Status bar | 0–90 | System UI (time, battery, TMM overlay) |
| Chrome toolbar | 90–237 | Address bar, home button, tabs, menu |
| Web content area | 237–2064 | App renders here |
| Android nav bar | 2064–2280 | Back, Home, Recent (gesture nav) |

### Login Page Coordinates (TESTED — last verified 2026-02-17)

**Before keyboard opens (full page visible):**
| Element | Approximate Y | Notes |
|---------|--------------|-------|
| "Sign In" heading | ~1050 | Middle of page |
| "Enter your credentials" text | ~1100 | Below heading |
| **Email input field** | **~1340** | **TESTED — keyboard appears on tap** |
| Password input field | ~1550 | Below email |
| "Sign In" button | ~1700 | Blue button |

**After keyboard opens (page scrolls up):**
| Element | Approximate Y | Notes |
|---------|--------------|-------|
| Email field | ~480 | Scrolled up, above keyboard |
| Password field | ~640 | Below email, still visible |
| "Sign In" button | ~770 | May be partially hidden |
| Keyboard top | ~810 | Autofill chips appear here |
| Keyboard keys | 870–1450 | Full QWERTY keyboard |

### App Canvas Coordinates (with sketch open, VERIFIED via uiautomator 2026-02-17)

**IMPORTANT: Hamburger position flips with RTL/LTR language.**

| Element | Bounds (Hebrew RTL) | Center Tap | Notes |
|---------|---------------------|------------|-------|
| Hamburger menu (mobileMenuBtn) | **[49,260][168,381]** | **(109, 320)** | LEFT side in RTL; RIGHT `(970, 320)` in LTR |
| My Location button (myLocationBtn) | [782,470][916,578] | (849, 524) | Crosshair icon, left of drawing tools |
| Manhole node (nodeModeBtn) | [929,470][1036,578] | (983, 524) | |
| Home node (homeNodeModeBtn) | [929,575][1036,683] | (983, 629) | |
| Drainage node (drainageNodeModeBtn) | [929,680][1036,788] | (983, 734) | |
| Edge/line (edgeModeBtn) | [929,785][1036,893] | (983, 839) | |
| Re-center density (recenterDensityBtn) | [921,1838][1039,1956] | (980, 1897) | Bottom-right FAB |
| Re-center sketch (recenterBtn) | [921,1995][1039,2064] | (980, 2030) | Bottom-right FAB |
| Home panel close (homePanelCloseBtn) | [126,326][223,423] | (175, 375) | X button on blue header |

**Home Panel (sketch list) coordinates:**
| Element | Bounds (Hebrew RTL) | Center Tap | Notes |
|---------|---------------------|------------|-------|
| First "Open" (פתח) button | [168,1061][351,1158] | (260, 1110) | First sketch card (RTL) |
| Second "Open" (פתח) button | [168,1596][351,1691] | (260, 1644) | Second sketch card (RTL) |
| "New Sketch" (שרטוט חדש) button | Full-width blue button at bottom | ~(540, 1350) | Verify with screenshot |

**English (LTR) Home Panel:**
| Element | Approximate Center | Notes |
|---------|-------------------|-------|
| First "Open" button | ~(268, 1053) | Verified Feb 2026 — position shifts in LTR |
| Second "Open" button | ~(268, 1590) | Estimate based on card spacing |

**WARNING: Tapping sketch name text opens a rename input field with keyboard!**
Be precise when tapping "Open" — hit the blue button, not the text above it.

**Chrome confirm() Dialog (e.g., "Save empty sketch?"):**
| Element | Bounds | Center Tap | Notes |
|---------|--------|------------|-------|
| OK button | [780,1345][1011,1471] | (895, 1408) | Verified via uiautomator Chrome 144 |
| Cancel button | [548,1345][779,1471] | (664, 1408) | Position varies with dialog text |

### Coordinate Discovery Workflow
```bash
# 1. Take reference screenshot
adb exec-out screencap -p > phone-screenshot.png

# 2. Try an exploratory tap in the middle of the expected area
adb shell input tap 540 1100

# 3. Screenshot to see what was hit
sleep 1 && adb exec-out screencap -p > phone-screenshot.png

# 4. If Chrome selected/highlighted text, you know where that text is
#    Adjust Y up or down based on what was hit vs what you wanted
#    If keyboard appeared, you found the input field!

# 5. Record working coordinates for future sessions
```

**Always verify coordinates with uiautomator for native Chrome elements:**
```bash
adb shell "uiautomator dump /data/local/tmp/ui.xml && cat /data/local/tmp/ui.xml" 2>&1 \
  | tr '>' '\n' | grep -iE "ELEMENT_NAME" | head -5
```

---

## Verification Checklist

### Core App (after any change)
- [ ] App loads on phone without crashing (check `adb logcat -s chromium` for renderer deaths)
- [ ] Login works (use production URL, test both email entry and autofill chip)
- [ ] Auth state persists across page reload (`#/` doesn't redirect to `#/login`)
- [ ] Route guard works: unauthenticated → `#/login`, authenticated → `#/`
- [ ] Mobile menu opens (hamburger at `(109, 320)` in RTL Hebrew, `(970, 320)` in LTR English)
- [ ] All mobile menu buttons are clickable (not blocked by z-index or event issues)
- [ ] Language switch works (Hebrew/English) — RTL layout flips correctly
- [ ] Toast notifications appear and auto-dismiss
- [ ] Sketch list (home panel) shows personal + organization tabs

### Canvas & Drawing
- [ ] Canvas renders nodes and edges correctly
- [ ] Pan (drag) and pinch-to-zoom work on touch
- [ ] Drawing mode buttons work (node, home, drainage, edge)
- [ ] Node/edge selection opens sidebar details panel
- [ ] Sidebar is resizable via drag handle
- [ ] Floating numeric keyboard appears when numeric input focused
- [ ] Re-center button (`#recenterBtn`) works
- [ ] Map tiles load and align with survey data (no projection mismatch)

### GNSS/Location (after location changes)
- [ ] My Location button centers map on GPS position **at current zoom level**
- [ ] Live Measure toggle exists in mobile menu
- [ ] Toggling Live Measure ON prompts for location permission
- [ ] After granting permission, GNSS marker appears on canvas **at correct position**
- [ ] Marker color reflects fix quality (green=RTK, blue=Float, amber=GPS/DGPS, red=No fix)
- [ ] "המיקום שלי" / "My Location" label appears below marker (color matches fix quality)
- [ ] Accuracy circle draws around marker (correct radius, scales with zoom)
- [ ] Status text updates with fix type and accuracy (`#mobileLocationStatus`)
- [ ] Coordinates auto-enable when Live Measure turns on
- [ ] Toggling Live Measure OFF stops location tracking
- [ ] GNSS marker shows "STALE" if position >3 seconds old
- [ ] Point capture dialog shows GNSS position when selecting a node
- [ ] TMM mock location is detected (`isMock=true` in logcat, accuracy < 5m)

### Survey Device (TSC3) (after survey changes)
- [ ] Survey Device group visible in mobile menu (scroll down to "מכשיר מדידה" / "Survey Device")
- [ ] "Connect Bluetooth" triggers permission request then device discovery (Capacitor only)
- [ ] Device picker dialog shows paired devices as tappable buttons (not `prompt()`)
- [ ] Auto-connects when only 1 survey device found
- [ ] "Connect WebSocket" prompts for host:port and connects
- [ ] Connection badge (green BT icon) appears on canvas after connect
- [ ] Incoming survey points trigger node-type dialog for new points
- [ ] Points matching existing node IDs (with `hasCoordinates`) update silently
- [ ] Point queue works — rapid points queued while dialog is open
- [ ] "Disconnect" removes badge and clears queue
- [ ] New survey nodes placed at canvas center (not hardcoded 400,300)
- [ ] ID collision guard: manual node with same ID not overwritten unless it has coordinates

### PWA & Offline
- [ ] App works when added to home screen (`display: standalone`)
- [ ] Service worker caches shell (loads offline after first visit)
- [ ] Canvas drawing works offline (localStorage/IndexedDB)
- [ ] API calls fail gracefully when offline (no crashes)
- [ ] `/health/index.html` loads even when offline

---

## Phase 6: Mobile-Specific Behaviors

### Viewport Height Fix (Samsung Note 10)
`src/dom/dom-utils.js` → `syncAppHeightVar()` syncs `--app-height` CSS variable from `visualViewport.height` instead of `window.innerHeight`. This fixes the dvh/vh bug on Samsung devices where the address bar and keyboard cause incorrect height calculations. Called on startup, resize, and orientation-change.

### Mobile Menu Behavior
- `src/main-entry.js` → `initMobileMenuBehavior()` — activates at `≤600px` width
- Menu slides in from **right** (or left in RTL) with `mobile-menu--open` class
- Backdrop (`#mobileMenuBackdrop`) closes menu on tap
- Header z-index `1050` on mobile (above modals at `1000`) keeps hamburger always clickable
- `window.closeMobileMenu()` — programmatic close

### Touch Event Handling on Canvas
- `touchstart` and `touchmove` are **passive** (`passive: true`)
- `touchend` is **non-passive** (allows `preventDefault()`)
- Pinch-to-zoom handled via multi-touch
- Modal scroll propagation stopped with `touchmove stopPropagation`

### Android Button Wiring
Mobile buttons (admin, projects) use both `click` AND `touchend` listeners for reliability on Android. Event delegation via `data-action` attributes on `src/menu/menu-events.js`.

### Floating Numeric Keyboard
`src/utils/floating-keyboard.js` — auto-activates when numeric input is focused on touch devices. Toggle button `#toggleFloatingKeyboard` appears in canvas area. Useful for entering node data without the system keyboard.

### Resizable Sidebar / Details Panel
`src/utils/resizable-drawer.js` — `#sidebar` can be dragged to resize via `.sidebar-drag-handle`. On mobile this is the node/edge details panel.

### GNSS Stale Position Warning
When the GNSS position is >3 seconds old, the marker draws "STALE" text. This helps identify when TMM has stopped providing updates.

### Service Worker Update & Cache Invalidation
If a new service worker is detected, the app can send `{ type: 'SKIP_WAITING' }` to force immediate activation. The cache version is tracked as `APP_VERSION` in `public/service-worker.js` (currently `v26`).

**When to bump `APP_VERSION`:**
- After changing any non-fingerprinted file (`main.js`, `styles.css`, `index.html`, `manifest.json`)
- Vite-fingerprinted files under `/assets/` are cache-first with unique hashes, so they don't need SW bumps
- Bumping version forces `skipWaiting()` + deletes all old caches (`graph-sketch-shell-*`, `graph-sketch-runtime-*`)

**Caching strategies by file type:**
| Pattern | Strategy | Notes |
|---------|----------|-------|
| Navigation (HTML) | Network-first | Falls back to cached shell |
| `PRECACHE_ASSETS` (index.html, offline.html, etc.) | Cache-first | Pre-cached on install |
| `/assets/*` (Vite-fingerprinted) | Cache-first | Cached on first access |
| Google Fonts | Cache-first | Cached in runtime cache |
| `/api/*` | Pass-through | No caching |
| Other same-origin GET | Stale-while-revalidate | **This is why `main.js` needs SW bumps** |

### Capacitor Android Build
The `android/` directory contains a Capacitor-wrapped APK build. Package: `com.geopoint.manholemapper`. Can be built with `npm run build:android`. The `android-bridge/` app bridges Bluetooth SPP NMEA → WebSocket for GNSS when not using TMM.

---

## Key Source Files

| File | Purpose |
|------|---------|
| **GNSS** | |
| `src/gnss/browser-location-adapter.js` | Bridges navigator.geolocation → gnssState |
| `src/gnss/gnss-state.js` | Singleton state: position, connection, events |
| `src/gnss/gnss-marker.js` | Canvas rendering: marker, accuracy circle, crosshair. Uses `ctx.setTransform(1,0,0,1,0,0)` to reset transform |
| `src/gnss/connection-manager.js` | Manages BT/WiFi/Mock adapter connections |
| `src/gnss/mock-adapter.js` | Simulated GNSS data for testing |
| `src/gnss/point-capture-dialog.js` | Dialog for capturing GNSS position to a node |
| **Map** | |
| `src/map/projections.js` | proj4 WGS84↔ITM (EPSG:2039) conversions |
| `src/map/user-location.js` | `calculateCenterOnUser()`, `drawUserLocationMarker()` |
| `src/map/tile-manager.js` | Web Mercator tile math, zoom calculation, view bounds |
| `src/map/govmap-layer.js` | Tile loading, rendering, reference point management |
| **Core** | |
| `src/legacy/main.js` | Draw loop, toggle wiring, live measure logic, route handler, `centerOnGpsLocation()` |
| `src/main-entry.js` | App init, My Location button, mobile menu setup, `initMobileMenuBehavior()` |
| `index.html` | All DOM elements, panels, modals, canvas toolbar |
| **Auth** | |
| `src/auth/auth-client.js` | Better Auth client (`createAuthClient({ baseURL: window.location.origin })`) |
| `src/auth/auth-guard.js` | Auth state management, `onAuthStateChange()` callback |
| `src/auth/auth-ui.js` | React login/signup forms (mounted into `#authContainer`) |
| `src/auth/sync-service.js` | Cloud sync: online/offline state, pending changes |
| **UI** | |
| `src/menu/menu-events.js` | Event delegation via `data-action` attributes |
| `src/menu/menu.css` | Mobile breakpoints, hamburger, drawer styles |
| `src/dom/dom-utils.js` | `syncAppHeightVar()` — viewport height fix for Samsung |
| `src/utils/floating-keyboard.js` | Mobile numeric keypad |
| `src/utils/resizable-drawer.js` | Sidebar drag-to-resize |
| `src/i18n.js` | Translation keys, `window.t()`, `window.isRTL()` |
| **Infrastructure** | |
| `src/serviceWorker/register-sw.js` | Service worker registration |
| `public/service-worker.js` | Cache strategies, offline shell |
| `public/manifest.json` | PWA manifest (`display: standalone`) |
| `vercel.json` | Headers (Permissions-Policy: geolocation), rewrites, security |
| `api/_lib/auth.js` | `verifyAuth(request)` — server-side auth verification |
| `api/_lib/rate-limit.js` | API rate limiting |
| **Survey (TSC3)** | |
| `src/survey/tsc3-bluetooth-adapter.js` | Capacitor Bluetooth SPP adapter. `list()` for paired devices, runtime permission requests on Android 12+ |
| `src/survey/tsc3-websocket-adapter.js` | WebSocket bridge adapter. Auto-detects `wss://` on HTTPS. Exponential backoff reconnect |
| `src/survey/tsc3-parser.js` | Streaming CSV parser. Auto-detects delimiter + column order. ITM range validation |
| `src/survey/tsc3-connection-manager.js` | Singleton orchestrator. Point matching, queuing, dialog coordination |
| `src/survey/survey-node-type-dialog.js` | Node type selection dialog (Manhole/Home/Drainage) for new survey points |
| `src/survey/device-picker-dialog.js` | Touch-friendly device picker dialog (replaces broken `window.prompt()`) |
| **Phone Testing** | |
| `service/cdp-mcp/src/tools/gnss.js` | MCP tools for remote GNSS inspection |
| `service/cdp-mcp/src/cdp-client.js` | Chrome DevTools Protocol client |

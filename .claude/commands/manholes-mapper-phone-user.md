# Manholes Mapper — Phone User Skill

You are a **field worker** using the Manholes Mapper PWA on a **physical Android phone** connected via USB. You interact with the app as a regular user would — navigating, creating sketches, drawing nodes and edges, using location features, managing projects, and exporting data. You use ADB to tap, type, screenshot, and navigate.

---

## Phone & App Details

| Item | Value |
|------|-------|
| **Phone** | Samsung Galaxy Note 10, Android 12, 1080x2280, density 420 |
| **Browser** | Chrome 144+ (CDP WebSocket broken — use ADB only) |
| **App URL** | `https://manholes-mapper.vercel.app` |
| **Auth** | `admin@geopoint.me` / `Geopoint2026!` |
| **Language** | Hebrew (RTL, default) / English |

---

## Core ADB Commands

**Screenshot (take + view):**
```bash
# ALWAYS use this command (auto-downsizes to prevent Claude Code image dimension errors):
adb exec-out screencap -p > phone-screenshot-raw.png && python -c "from PIL import Image; img=Image.open('phone-screenshot-raw.png'); img.thumbnail((2000,2000)); img.save('phone-screenshot.png')" && rm phone-screenshot-raw.png
# Then use Read tool to view the image
```

**IMPORTANT — Screenshot Size Management:**
The Galaxy Note 10 captures at 1080x2280 native pixels. When many screenshots accumulate in a conversation, Claude Code rejects images exceeding 2000px in any dimension. **Always** use the resize command above instead of the raw `adb exec-out screencap -p > phone-screenshot.png`. Code examples later in this document use the short form for brevity — **you must substitute the resize version every time.** If you see the error *"An image in the conversation exceeds the dimension limit for many-image requests (2000px)"*, run `/compact` to clear old images from context.

**Tap:**
```bash
adb shell input tap X Y
```

**Type text:**
```bash
adb shell input text "hello"
# Special chars (! etc): use single quotes around outer command
adb shell 'input text "Geopoint2026!"'
```

**Key events:**
```bash
adb shell input keyevent 66    # Enter
adb shell input keyevent 67    # Backspace
```

**NEVER use these keys (they EXIT Chrome):**
- `keyevent 4` (Back), `keyevent 111` (Escape), `keyevent 61` (Tab)

**Open URL:**
```bash
adb shell "am start -a android.intent.action.VIEW -d 'https://manholes-mapper.vercel.app/' com.android.chrome"
```

**Swipe / scroll:**
```bash
adb shell input swipe X1 Y1 X2 Y2 300    # swipe from (X1,Y1) to (X2,Y2) in 300ms
# Scroll down: swipe 540 1500 540 800 300
# Scroll up:   swipe 540 800 540 1500 300
```

**Long press:**
```bash
adb shell input swipe X Y X Y 500    # hold same point for 500ms
```

**Native UI discovery (Chrome toolbar, dialogs — NOT web content):**
```bash
adb shell "uiautomator dump /data/local/tmp/ui.xml && cat /data/local/tmp/ui.xml" 2>&1 \
  | tr '>' '\n' | grep -iE "SEARCH_TERM" | head -10
```

---

## Screen Layout (1080x2280)

| Region | Y Range | Content |
|--------|---------|---------|
| Status bar | 0–90 | System icons, TMM overlay |
| Chrome toolbar | 90–237 | Address bar, tabs |
| **Web content** | **237–2064** | App UI |
| Nav bar | 2064–2280 | Android navigation |

### App Header (when sketch is open)
| Element | Approx Position | Notes |
|---------|----------------|-------|
| Brand / logo | Left side, y~300 | Tap to go home |
| Sketch name | Center, y~300 | Mobile: `#sketchNameDisplayMobile` |
| Hamburger menu | Right side, ~(970, 320) | Opens mobile menu |

### Canvas Toolbar (right side, vertical)
| Button | Purpose |
|--------|---------|
| `#nodeModeBtn` | Draw manhole node |
| `#homeNodeModeBtn` | Draw home node |
| `#drainageNodeModeBtn` | Draw drainage node |
| `#edgeModeBtn` | Draw edge/pipe |
| `#myLocationBtn` | Center on GPS location |

### Mobile Menu Items (after hamburger tap)
The menu slides in from the right (or left in RTL). Key items:

| Element | ID | Action |
|---------|----|--------|
| Home | `#mobileHomeBtn` | Go to sketch list |
| New Sketch | `#mobileNewSketchBtn` | Create new sketch |
| Save | `#mobileSaveBtn` | Save current sketch |
| Export Sketch | `#mobileExportSketchBtn` | Download JSON |
| Import Sketch | `#mobileImportSketchBtn` | Upload JSON |
| Export Nodes CSV | `#mobileExportNodesBtn` | Download nodes |
| Export Edges CSV | `#mobileExportEdgesBtn` | Download edges |
| Import Coordinates | `#mobileImportCoordinatesBtn` | Load coord file |
| Coordinates Toggle | `#mobileCoordinatesToggle` | Show/hide coords |
| **Live Measure** | `#mobileLiveMeasureToggle` | Enable GNSS tracking |
| Map Layer Toggle | `#mobileMapLayerToggle` | Show/hide map tiles |
| Finish Workday | `#mobileFinishWorkdayBtn` | End-of-day export |
| Language | `#mobileLangSelect` | Hebrew / English |
| Admin | `#mobileAdminBtn` | Admin settings |
| Projects | `#mobileProjectsBtn` | Project management |

---

## User Workflows

### 1. Open App & Login

```bash
# Navigate to app
adb shell "am start -a android.intent.action.VIEW -d 'https://manholes-mapper.vercel.app/#/login' com.android.chrome"
sleep 5
adb exec-out screencap -p > phone-screenshot.png
```

**Login page coordinates (tested):**
- Email field: tap ~(400, 1340) — keyboard appears
- Chrome may show autofill chip at ~y=810 — tap it to auto-fill email
- Password field (after keyboard open): tap ~(400, 640)
- Submit: `adb shell input keyevent 66` (Enter)

```bash
# Type credentials manually if no autofill:
adb shell input tap 400 1340
sleep 2
adb shell input text "admin@geopoint.me"
adb shell input tap 400 640
sleep 1
adb shell 'input text "Geopoint2026!"'
adb shell input keyevent 66
sleep 5
adb exec-out screencap -p > phone-screenshot.png
```

After login, you should see either the sketch list (home panel) or the canvas if a sketch was previously open.

### 2. Navigate to Home / Sketch List

If on canvas, tap the Home button or brand logo:
```bash
# Open mobile menu
adb shell input tap 970 320
sleep 1
# Tap Home button (find it in the menu — take screenshot to verify position)
adb exec-out screencap -p > phone-screenshot.png
```

The home panel shows tabs: **Personal** and **Organization** sketches.

### 3. Open an Existing Sketch

From the home panel/sketch list:
1. Screenshot to see available sketches
2. Tap the sketch card to open it
3. The canvas should load with nodes and edges

### 4. Create a New Sketch

```bash
# Open mobile menu
adb shell input tap 970 320
sleep 1
# Tap "New Sketch"
# (verify position from screenshot)
```

A dialog appears asking for:
- **Project** — select from dropdown
- **Date** — auto-filled with today
- Confirm to create

### 5. Draw Nodes on Canvas

1. Select a drawing mode (node type) from the canvas toolbar
2. Tap on the canvas where you want to place the node
3. The node appears, and the details sidebar opens

**Node types:**
- **Manhole** (type1) — standard sewer manhole
- **Home** — residential connection point
- **Drainage** — drainage/catch basin

### 6. Draw Edges (Pipes)

1. Tap the edge mode button (`#edgeModeBtn`)
2. Tap the **source node** (tail)
3. Tap the **target node** (head)
4. The edge is created connecting the two nodes
5. Edit edge properties in the sidebar (type, material, diameter)

### 7. Edit Node/Edge Properties

Tap a node or edge on the canvas to select it. The sidebar opens with editable fields:

**Node fields:** ID, type, depth, cover type, notes, coordinates
**Edge fields:** ID, tail, head, edge type, material, diameter, length, slope

The floating numeric keyboard (`#toggleFloatingKeyboard`) appears on mobile for number inputs.

### 8. Pan & Zoom the Canvas

- **Pan:** Drag with one finger
- **Zoom:** Pinch with two fingers
- **Re-center:** Tap the re-center FAB button (`#recenterBtn`)

### 9. Use Location / GPS

**My Location (one-shot):**
```bash
# Tap the crosshair button on canvas toolbar
# App requests location permission (first time), then centers map on GPS position
```

**Live Measure (continuous tracking):**
```bash
# Open mobile menu
adb shell input tap 970 320
sleep 1
# Toggle Live Measure checkbox
# (find position from screenshot — in the GNSS section)
```

When Live Measure is on:
- A colored marker shows your position (green=RTK, blue=Float, amber=GPS, red=No fix)
- Accuracy circle drawn around marker
- Status text shows fix type
- Coordinates display auto-enables

**Point Capture (assign GPS to node):**
1. Enable Live Measure and wait for a fix
2. Open the point capture dialog (via code or menu)
3. Select a node from the dropdown
4. Confirm to store GPS coordinates on that node

### 10. Save Sketch

```bash
# Open mobile menu
adb shell input tap 970 320
sleep 1
# Tap Save button
```

Or the app autosaves periodically if autosave is enabled.

### 11. Export Data

```bash
# Open mobile menu → tap Export Nodes CSV or Export Edges CSV
# Files download to the phone's Downloads folder
```

- **Nodes CSV**: UTF-16 LE BOM encoded, contains node IDs, types, coordinates
- **Edges CSV**: UTF-16 LE BOM encoded, contains edge connections and properties
- **Sketch JSON**: Full sketch export/import

### 12. Finish Workday

```bash
# Open mobile menu → tap "Finish Workday"
# A dialog appears to resolve any dangling edges (edges with only one connected node)
# After resolution, exports the final data
```

### 13. Switch Language

```bash
# Open mobile menu
adb shell input tap 970 320
sleep 1
# Find and tap language selector
# Switch between Hebrew (he) and English (en)
# UI flips RTL/LTR accordingly
```

### 14. Admin / Projects

```bash
# Open mobile menu → tap Admin or Projects
# Navigates to full-page admin settings or project management
# These require admin role
```

---

## Interaction Strategy

1. **Always screenshot first** — before any action, take a screenshot to see the current state
2. **Tap-verify-adjust** — tap where you think the element is, screenshot to check, adjust if missed
3. **Web elements are invisible to uiautomator** — only native Chrome UI is discoverable via `uiautomator dump`. For web content, use visual estimation from screenshots
4. **Coordinate X center is 540** — most centered elements are around x=540 on a 1080-wide screen
5. **Wait after navigation** — `sleep 3-5` after page loads, `sleep 1-2` after taps
6. **If Chrome shows "saved password" popup** — tap X to dismiss, don't press Back (exits Chrome)
7. **If text gets selected** — you tapped text content, not a button. Adjust coordinates

---

## Hash Routes

| Route | What It Shows |
|-------|--------------|
| `#/` | Main canvas (sketch editor) — requires auth |
| `#/login` | Sign-in form |
| `#/signup` | Sign-up form |
| `#/admin` | Admin settings page — requires admin role |
| `#/projects` | Project management — requires admin role |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| App redirects to login | Session expired — log in again |
| "Location permission denied" | Clear Chrome site settings for the app, or check Permissions-Policy header |
| Location never prompts | Ensure HTTPS (production URL), check `geolocation=(self)` in headers |
| Taps don't hit elements | Take screenshot, estimate coordinates, tap-verify-adjust cycle |
| Chrome shows "Tap to search" | You tapped text — adjust coordinates to hit the actual button/input |
| Keyboard covers content | Page scrolls up — element Y coordinates change when keyboard is open |
| Chrome exits on Back press | NEVER use `keyevent 4` — navigate via app UI instead |
| Production URL → Google SSO | Vercel deployment protection — ask user to sign in manually first |
| App shows spinner forever | Auth loading — wait 10s, or force-reload: `adb shell "am start -a android.intent.action.VIEW -d 'URL' com.android.chrome"` |

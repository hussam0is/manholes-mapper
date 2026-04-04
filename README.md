# Manholes Mapper PWA

> **Field-grade infrastructure mapping - built for surveyors, delivered as a PWA.**

A professional, high-performance Progressive Web Application (PWA) for underground infrastructure mapping (manholes, drainage, home connections) and field data collection. Built for offline-first operations with real-time canvas-based visualization, RTK-GNSS live capture, and GIS-ready export.

---

## 🏆 For Contest Judges

| | |
|---|---|
| **Live Production** | https://manholes-mapper.vercel.app |
| **Dev Preview (latest code)** | https://manholes-mapper-git-dev-hussam0is-projects.vercel.app |
| **Tech Stack** | Vanilla JS (ES Modules) + Vite 7 + Canvas 2D + Three.js + Leaflet + Better Auth + Neon Postgres |
| **Test Suite** | **1 695 unit tests** - all passing (`cd frontend && npx vitest run`) |
| **E2E Tests** | Playwright - `cd frontend && npx playwright test` |

### What Makes It Special

1. **Canvas-first network editor** - a hand-rolled, high-performance HTML5 Canvas graph editor with spatial indexing, progressive rendering, view-stretch, and RTL support. No third-party graph library.
2. **Survey-grade GNSS integration** - live RTK position capture from Trimble R780 via Bluetooth SPP / WiFi TCP on Android (Capacitor); displays HRMS/VRMS progress toward RTK-fixed accuracy.
3. **3D underground visualisation** - one-click Three.js fly-through of the surveyed pipe network; pipe depths and manhole shafts reconstructed from field measurements.
4. **Offline-first PWA** - Service Worker + IndexedDB + localStorage hybrid; surveyors capture in the field with zero connectivity and sync when back on network.
5. **Intelligent issue detection** - real-time sketch audit (missing coordinates, negative gradients, long edges, merge candidates) with in-canvas navigation to each issue.
6. **Legacy data migration** - built-in Import Wizard converts pre-ITM-era sketches (old canvas JSON + ITM survey CSV) into fully geo-referenced sketches via BFS coordinate propagation. Menu → Sketch → "Import Legacy Sketch + Coordinates".
7. **Multi-tenant SaaS backend** - organisations, projects, role-based access, sketch locking, feature flags - all on Vercel serverless + Neon Postgres.
8. **Production-grade test suite** — 1 695 unit tests across 66 test files (Vitest) + Playwright E2E tests; continuous test coverage for all core modules including GNSS, projections, graph operations, coordinate utilities, coordinate handlers, and the import wizard.

### Quick Evaluation Path

```bash
# 1. Clone and install
git clone https://github.com/hussam0is/manholes-mapper && cd manholes-mapper
npm install

# 2. Run the full unit test suite
cd frontend && npx vitest run
# → 1695 tests, ~38s, all green

# 3. Start the dev server
npm run dev
# → http://localhost:5173

# 4. Explore features
#    - Create a new sketch, place manholes (N key) and pipes (E key)
#    - Import coordinates CSV to geo-reference nodes
#    - Click the 3D view button (cube icon) for underground visualisation
#    - Switch to Project Canvas to see multi-sketch city view
#    - Menu → Sketch → "Import Legacy Sketch + Coordinates" to migrate old data
```

---

## Overview

Manholes Mapper is a lightweight yet powerful tool designed for field workers to capture, manage, and visualize infrastructure network data (manholes, home connections, and drainage systems). It operates seamlessly without internet connectivity, providing a desktop-class editing experience on mobile and tablet devices.

## Key Features

- **Interactive Canvas Editor**: High-performance HTML5 Canvas rendering for node-edge network visualization.
- **Project Canvas**: Multi-sketch city view with merged network visualization and issue navigation (NEW)
- **Cockpit/Gamification**: Visual progress tracking with skill levels, completion engine, and smart action suggestions (NEW)
- **Field Commander**: Mobile-optimized command palette for fast actions, shortcuts, and quick-wins (NEW)
- **Survey Mode**: TSC3 device integration with specialized survey workflows (NEW)
- **Map Layer Integration**: Background map tiles (Esri World Imagery / Esri World Street Map / GovMap) with Israel TM Grid (ITM) coordinate alignment for GIS-accurate positioning.
- **Geoman Annotation Layer**: Draw zones, notes, and polygon overlays directly on the map canvas using Leaflet Geoman; annotations are autosaved to IndexedDB and persist across sessions.
- **User Location (Browser Geolocation)**: Show device position on the map with permission management, continuous watch mode, and ITM coordinate conversion — no GNSS hardware required.
- **Multi-Node Modes**: Specialized support for different infrastructure types:
  - **Manholes**: Standard network nodes.
  - **Home Nodes**: Residential/Building connections.
  - **Drainage Nodes**: Stormwater and surface water nodes.
  - **Issues**: Audit feedback with navigation and comment system.
- **Offline-First Architecture**: Full functionality without internet using a hybrid IndexedDB and localStorage persistence layer.
- **Advanced Admin Configuration**:
  - Customize field visibility for CSV exports.
  - Set default values for new nodes and edges.
  - Manage selectable option lists (materials, diameters, status) with code mappings.
  - Export/Import administrative settings as JSON.
- **Mobile Optimized**:
  - **Floating Numeric Keyboard**: Custom on-screen dialpad for efficient numeric entry on touch devices.
  - **Resizable Details Drawer**: Swipeable and resizable sidebar for viewing and editing entity details.
  - **Mobile Action Menu**: Context-aware overflow menu for small screens.
  - **Touch Gestures**: Support for pinch-to-zoom and pan.
  - **One-Handed Edge Mode**: Long-press drag to create edges with single-thumb control (NEW)
- **Data Integrity & Export**:
  - **Real-time Autosave**: Automatic background persistence to prevent data loss.
  - **GIS Integration**: Export nodes and edges separately as CSV files optimized for ArcGIS.
  - **Backup & Sharing**: Export/Import entire sketches as JSON.
  - **Legacy Import Wizard**: Two-file import (sketch JSON + ITM CSV) converts pre-coordinates-era data with BFS position propagation for unmatched nodes.
- **Reference Layers**: GIS data overlays for sections, survey manholes, survey pipes (with direction arrows), streets, and addresses.
- **Google Street View**: Drag-and-drop pegman widget to open Street View at any canvas location.
- **Multi-Tenancy**: Organizations, projects, and role-based access control (user / admin / super_admin).
- **Sketch Locking**: Collaborative editing with 30-minute lock expiration and admin force-unlock.
- **Intelligent Input Flow**: Context-aware form rules that hide, disable, or reset fields based on business logic.
- **Feature Flags**: Per-user and per-organization feature toggles (CSV export, sketch export, admin settings, etc.).
- **Bilingual Support**: Full Hebrew (RTL) and English (LTR) localization.
- **Navigation & Search**:
  - Hash-based routing for quick switching between workspace and settings.
  - Top-bar search to instantly locate nodes by ID or address.
  - Command menu for quick action access.
  - Recenter view and edge legend for better orientation.
- **Status Bar & HUD**:
  - **GPS Accuracy HUD Badge**: Color-coded badge in the micro-status-bar showing live fix quality (No Fix → GPS → DGPS → RTK Float → RTK Fixed) with HDOP indicator.
  - **Persistent Offline Chip**: Header indicator that turns amber/red when the device goes offline; auto-clears on reconnection.

## New Features (2026)

### 🎮 Cockpit & Gamification
- **Skill Levels**: Visual progress tracking with XP-based leveling system (1-20+)
- **Completion Engine**: Smart suggestions for completing nodes and edges
- **Intel Strip**: Landscape-first side panel with GPS status, project health, and quick stats
- **Action Rail**: Bottom action bar for one-tap common operations
- **Quick Wins**: Context-aware action suggestions for efficiency
- **Session Tracker**: Progress monitoring during survey sessions with time tracking

### 📊 Project Canvas
- **City View**: See all sketches as a unified network map
- **Issue Navigation**: Click issues to jump to their location
- **Merge Mode**: Identify and merge duplicate nodes
- **Side Panel**: Detailed view with issue comments and fix suggestions

### 📱 Field Commander
- **Command Palette**: `Cmd+K` or menu for instant actions
- **One-Handed Edge Mode**: Long-press drag for edge creation
- **Smart Notifications**: Contextual alerts and reminders
- **Gesture Support**: Touch-optimized gestures for mobile workflows
- **Territory Management**: Zone-based work assignment tracking
- **XP & Achievements**: Field work gamification with badges

### 🎯 Survey Mode (TSC3)
- **TSC3 Integration**: Specialized workflow for TSC3 survey devices
- **Device Picker**: Easy connection to survey equipment
- **Survey Node Dialog**: Optimized form for survey data entry
- **Multiple Connection Types**:
  - Bluetooth SPP for Trimble R780
  - WiFi TCP (192.168.1.10:5017)
  - TMM (Third-party NMEA over Wi-Fi/Bluetooth)
  - Browser geolocation fallback
- **Precision Measurement**: Gated capture with accuracy thresholds
- **Fix Quality Indicators**: No Fix → GPS → DGPS → RTK Float → RTK Fixed

### 🗺️ Map Annotations (Geoman)
- **Draw Zones & Polygons**: Add freehand or geometric overlays on the map layer with the Leaflet Geoman toolbar
- **Persistent Storage**: Annotations autosave to IndexedDB (`annotationsStore`) and reload on app start
- **Non-destructive**: Annotation layer sits on top of the infrastructure canvas; graph nodes/edges are untouched
- **Events**: Emits `annotation:created`, `annotation:edited`, `annotation:deleted` on the global event bus

### 📡 Status Bar & HUD
- **GPS Accuracy Badge**: Color-coded realtime GNSS fix quality in the micro-status-bar (red/amber/blue/green)
- **Offline Status Chip**: Persistent header chip shows network connectivity; auto-hides when back online
- **60px Touch Targets**: Map control buttons enlarged to 60px for comfortable one-handed use on mobile

### 🐛 Issue System
- **Auto-Detection**: Real-time audit of sketches (missing coordinates, negative gradients, long edges, merge candidates)
- **Issue Node Type**: Dedicated nodes for feedback with threaded comments
- **Navigation**: Jump to any issue from the sidebar or canvas
- **Fix Suggestions**: AI-assisted recommendations for resolving issues
- **Merge Mode**: Identify and merge duplicate nodes across sketches

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | Vanilla JS (ES Modules) | - | Core canvas engine |
| | React 19 | ^19.2.3 | UI components (gradual migration) |
| | Tailwind CSS 4.x | ^4.1.18 | Styling |
| | Vite 7 | ^7.1.3 | Build tool |
| **Graphics** | HTML5 Canvas API | - | Graph rendering |
| | Three.js | ^0.183.2 | 3D underground visualization |
| | Leaflet | - | Map tiles |
| **Storage** | IndexedDB | - | Durable storage |
| | localStorage | - | Synchronous access |
| **Auth** | Better Auth | ^1.4.17 | Authentication |
| | Neon Postgres | ^0.10.0 | Database |
| **Mobile** | Capacitor | ^8.0.2 | Android native |
| | Capacitor Bluetooth | ^6.0.3 | Bluetooth SPP |
| **Utils** | proj4 | ^2.20.2 | Coordinate transformations |

## Authentication (Better Auth)

This project uses [Better Auth](https://better-auth.com) for user authentication, providing secure sign-in, sign-up, and session management backed by Neon Postgres.

### Better Auth Integration

| Component | Package | Purpose |
| :--- | :--- | :--- |
| Auth Library | `better-auth` | Core authentication library |
| Client SDK | `better-auth/client` | Client-side authentication |
| Database | `@neondatabase/serverless` | Neon Postgres for session storage |

### Environment Variables

| Variable | Location | Description |
| :--- | :--- | :--- |
| `BETTER_AUTH_SECRET` | Vercel Environment | Secret key for signing sessions |
| `POSTGRES_URL` | Vercel Environment | Neon Postgres connection string |
| `BETTER_AUTH_URL` | Vercel Environment | Base URL for auth endpoints (optional) |

### Setup Instructions

1. **Configure Database**: Ensure your Neon Postgres database is connected via Vercel Storage.
2. **Set Secret Key**: Add `BETTER_AUTH_SECRET` to your Vercel project's environment variables:
   ```bash
   BETTER_AUTH_SECRET=your-secure-random-secret-here
   ```
3. **Database Tables**: Better Auth will automatically create the required tables (`user`, `session`, `account`, `verification`).

### Authentication Features

- **Hash-based Routing**: Sign-in (`#/login`) and sign-up (`#/signup`) use hash routing for PWA compatibility.
- **Session Persistence**: Cookie-based session management with 7-day expiration.
- **API Session Verification**: Backend routes verify sessions using Better Auth's session API.
- **User Button**: Integrated user menu for profile management and sign-out.

## Project Structure

```
manholes-mapper/
├── frontend/src/           # Application source code
│   ├── admin/              # Admin panel, settings, projects, input flow
│   ├── auth/               # Better Auth client, provider, guard, permissions
│   ├── cockpit/            # Gamification UI (XP, levels, session tracking)
│   ├── db.js               # IndexedDB database definition
│   ├── dom/                # DOM manipulation utilities
│   ├── features/           # Rendering engine and drawing primitives
│   ├── field-commander/    # Mobile UI shell, gestures, territory, XP/achievements
│   ├── gnss/               # GNSS/Live Measure module
│   │   ├── bluetooth-adapter.js   # Bluetooth SPP connection
│   │   ├── wifi-adapter.js        # WiFi TCP connection
│   │   ├── mock-adapter.js        # Mock for development
│   │   ├── nmea-parser.js         # NMEA sentence parsing
│   │   ├── gnss-state.js          # State management
│   │   ├── gnss-marker.js         # Canvas marker rendering
│   │   ├── point-capture-dialog.js # Point capture UI
│   │   ├── connection-manager.js  # Unified connection interface
│   │   ├── tmm-adapter.js         # TMM (Third-party) NMEA adapter
│   │   ├── browser-location-adapter.js  # Browser geolocation fallback
│   │   └── precision-measure.js   # Precision-gated measurement
│   ├── graph/              # Graph data structures and ID utilities
│   ├── i18n.js             # Internationalization system (Hebrew/English)
│   ├── layout/             # Layout manager, unified sidebar/toolbar
│   ├── legacy/             # Core logic (being modularized)
│   ├── main-entry.js       # Application entry point
│   ├── map/                # Map tiles, projections, reference layers, Street View, annotations
│   │   ├── annotation-layer.js    # Leaflet Geoman annotation overlay (draw zones/polygons)
│   │   ├── govmap-layer.js        # GovMap (Israel gov orthophoto) tile layer
│   │   ├── layers-config.js       # Layer configuration registry
│   │   ├── projections.js         # EPSG:2039 ITM ↔ WGS-84 via proj4
│   │   ├── reference-layers.js    # GIS overlay layers (sections, addresses, survey pipes)
│   │   ├── street-view.js         # Google Street View pegman widget
│   │   ├── tile-manager.js        # Tile layer lifecycle and switching
│   │   └── user-location.js       # Browser geolocation with ITM conversion
│   ├── menu/               # Responsive menu system, command palette, action bar
│   ├── notifications/      # Notification bell and center
│   ├── pages/              # Page components (profile, stats, leaderboard)
│   ├── project/            # Project canvas, issues, merge mode
│   ├── serviceWorker/      # SW registration and lifecycle
│   ├── state/              # Global state, constants, and persistence logic
│   ├── survey/             # TSC3 survey device integration
│   ├── three-d/            # 3D underground visualization
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Shared utilities (CSV, Geometry, UI)
│   │   ├── coordinates.js          # Coordinate transforms, ITM/WGS84, scale calc, BFS positioning
│   │   ├── csv.js                  # CSV export/import for ArcGIS
│   │   ├── input-flow-engine.js    # Context-aware form rules (hide/disable/reset fields)
│   │   ├── label-collision.js      # Label overlap detection for canvas rendering
│   │   ├── legacy-import.js        # Legacy sketch + ITM CSV conversion
│   │   ├── progressive-renderer.js # Progressive canvas rendering (lazy tiles)
│   │   ├── render-cache.js         # Canvas render cache for expensive draw calls
│   │   ├── render-perf.js          # Render performance instrumentation
│   │   ├── sketch-io.js            # Sketch serialization/deserialization
│   │   ├── spatial-grid.js         # Spatial lookup grid for fast hit-testing
│   │   └── toast.js                # Toast notification helper
│   └── workers/            # Web Workers (GNSS parsing)
├── api/                    # Vercel serverless API routes
│   ├── auth/               # Better Auth endpoints
│   ├── features/           # Feature flags CRUD
│   ├── issue-comments/     # Issue comment system
│   ├── layers/             # GIS reference layer data
│   ├── organizations/      # Organization management
│   ├── projects/           # Project CRUD
│   ├── sketches/           # Sketch CRUD and locking
│   ├── stats/              # Statistics and analytics
│   ├── users/              # User management
│   ├── user-role/          # Role and permissions
│   └── _lib/               # Shared backend (db, auth, validators, rate-limit)
├── lib/                    # Better Auth server configuration
├── android/                # Capacitor Android project
├── public/                 # Static assets and PWA manifest
├── tests/                  # Vitest unit/integration + Playwright E2E tests
├── dist/                   # Production build output
├── index.html              # Main entry HTML
├── styles.css              # Global styles and Tailwind directives
├── capacitor.config.ts     # Capacitor configuration
├── vite.config.ts          # Vite & Build configuration
└── package.json            # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 24.x or higher
- npm 10.x or higher

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

### Building for Production

```bash
# Create optimized production build
npm run build

# Preview production build locally
npm run preview
```

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `N` | Switch to Node mode |
| `E` | Switch to Edge mode |
| `+` / `=` | Zoom In |
| `-` | Zoom Out |
| `0` | Reset Zoom |
| `Esc` | Cancel action or clear selection |
| `Delete` / `Backspace` | Delete selected item |

## Deployment

### Vercel (Production)

This project is deployed on **Vercel** with automatic deployments from Git.

#### Project Configuration

| Setting | Value |
| :--- | :--- |
| **Project Name** | `manholes-mapper` |
| **Framework** | Vite |
| **Node Version** | 24.x |
| **Build Command** | `vite build` |
| **Output Directory** | `dist` |

#### Production URLs

| Environment | URL |
| :--- | :--- |
| **Production** | https://manholes-mapper.vercel.app |
| **Preview (dev branch)** | https://manholes-mapper-git-dev-hussam0is-projects.vercel.app |

#### Deployment Process

1. **Automatic Deployments**: Push to `master` branch triggers production deployment; push to `dev` triggers preview deployment.
2. **Manual Deployment**: Use Vercel CLI or dashboard to trigger deployments.

```bash
# Install Vercel CLI (if needed)
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

#### Vercel Configuration (`vercel.json`)

```json
{
  "framework": "vite",
  "devCommand": "vite --port $PORT",
  "buildCommand": "vite build",
  "outputDirectory": "dist"
}
```

### Alternative Deployment

The application is built with a relative base path (`./`) for flexible deployment to other platforms:

1. Build: `npm run build`
2. Deploy the `dist/` directory to any static host (GitHub Pages, Netlify, etc.).
3. **Note**: HTTPS is required for Service Worker functionality.

## Data Management

### Map Layer Integration

The application supports background map tiles with accurate coordinate alignment using the **Israel TM Grid (ITM)** projection system (EPSG:2039).

**Features:**
- Survey-grade coordinate transformations using proj4
- Background tiles from Esri World Imagery and Esri World Street Map (OpenStreetMap fallback)
- Automatic alignment of ITM coordinates with map imagery
- Support for orthophoto and street map views

**Usage:**
1. Import ITM coordinates from CSV: `point_id,x,y,z`
2. Enable map layer from the menu
3. Map tiles automatically align with node positions

**Documentation:**
- [Complete Map Coordinate Guide](MAP_COORDINATES.md)
- [Debugging Map Issues](MAP_DEBUGGING.md)
- [Map Layer Fixes Summary](MAP_LAYER_FIXES.md)

**Coordinate System:**
- Primary: Israel TM Grid (EPSG:2039)
- Valid range: X: 100,000-300,000m, Y: 350,000-800,000m
- Accuracy: <1 meter with proj4 transformations

### ArcGIS Integration
CSV exports are designed to be imported directly into ArcGIS:
- **Nodes CSV**: Includes coordinates, types, and custom attributes.
- **Edges CSV**: Includes connectivity (from/to) and measurements.

### Health Monitoring
A health check page is available at `/health/` to verify system status and PWA health.

## GNSS Integration (Live Measure Mode)

The application supports live GNSS coordinate capture from Trimble R780/R780-2 receivers for survey-grade positioning.

### Overview

Live Measure mode enables:
- Real-time GNSS position display on the sketch canvas
- Survey point capture and assignment to nodes
- Automatic edge creation between captured points
- RTK fix quality and accuracy indicators

### Supported Connection Methods

| Method | Platform | Description |
| :--- | :--- | :--- |
| Bluetooth SPP | Android | Bluetooth Classic Serial Port Profile connection |
| WiFi TCP | Android | TCP connection over R780's WiFi hotspot |

**Note**: The GNSS features require building as a native Android app using Capacitor, as browsers cannot access Bluetooth SPP or raw TCP sockets.

### Trimble R780 Configuration

1. **Enable NMEA Output**: Configure the R780 to output NMEA sentences (GGA and RMC at minimum).
2. **Bluetooth Pairing**: Pair the R780 with your Android device in system Bluetooth settings.
3. **WiFi Mode**: Alternatively, connect your device to the R780's WiFi hotspot (default IP: 192.168.1.10, port: 5017).

### Building the Android App

```bash
# Build the web assets
npm run build

# Sync with Android platform
npm run build:android

# Open in Android Studio
npm run open:android
```

### Installing Capacitor Plugins

For Bluetooth SPP support:
```bash
npm install @niceprogrammer/capacitor-bluetooth-serial
npx cap sync android
```

For WiFi TCP support:
```bash
npm install capacitor-tcp-socket
npx cap sync android
```

### Using Live Measure Mode

1. **Enable Live Measure**: Tap the GPS icon in the canvas toolbar.
2. **Connect to R780**: Tap "Connect to R780" and select your paired device (or enter WiFi IP).
3. **Monitor Position**: The status pill shows fix quality, satellite count, and HDOP.
4. **Capture Points**:
   - Position yourself at a manhole.
   - Tap "Capture Point".
   - Select the node to assign coordinates to.
   - Optionally create an edge from the previous point.
5. **Verify**: Captured coordinates are stored and the node is repositioned on the canvas.

### GNSS Status Indicators

| Fix Quality | Color | Description |
| :--- | :--- | :--- |
| No Fix | Red | No GNSS fix available |
| GPS | Amber | Standalone GPS fix |
| DGPS | Amber | Differential GPS fix |
| RTK Float | Blue | RTK float solution |
| RTK Fixed | Green | RTK fixed solution (highest accuracy) |

### Development Testing

In web browser mode (without Capacitor), the app uses a mock GNSS adapter for testing:

```javascript
// Connect to mock GNSS
await window.gnssConnection.connectMock();

// Simulate movement
window.gnssConnection.setMockPosition(32.0853, 34.7818);
```

## License

Proprietary - All rights reserved

---

**Built with modern web technologies for professional infrastructure mapping.**

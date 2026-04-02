# Manholes Mapper Architecture

High-level architecture of the Manholes Mapper platform.

---

## Overview

Manholes Mapper is a Progressive Web Application (PWA) for underground infrastructure mapping. Built with a modern JavaScript stack, it combines:

- **Vanilla JS + React 19** for frontend (progressive migration)
- **Vite 7** for build and dev server
- **Neon Postgres** for database and Better Auth
- **Capacitor** for Android native app
- **Three.js** for 3D visualization
- **Leaflet** for map tiles

**Key Design Principles:**
- Offline-first with hybrid IndexedDB + localStorage
- Survey-grade accuracy with RTK-GNSS integration
- Canvas-first network editor (no graph libraries)
- Multi-tenant SaaS with role-based access

---

## Frontend Architecture

```
frontend/
├── src/
│   ├── admin/              # Admin panel, settings, projects, input flow
│   │   ├── admin-panel.js  # Main admin UI
│   │   ├── settings.js     # Admin configuration UI
│   │   ├── projects.js     # Project CRUD UI
│   │   └── input-flow.js   # Intelligent form logic
│   ├── auth/               # Better Auth client integration
│   │   ├── auth.js         # Auth state and API client
│   │   ├── guards.js       # Route guards and permissions
│   │   └── provider.js     # Better Auth provider setup
│   ├── db.js               # IndexedDB database wrapper
│   ├── dom/                # DOM manipulation utilities
│   ├── features/           # Canvas rendering engine
│   │   ├── drawing-primitives.js  # Base shapes (house, badges)
│   │   ├── measurement-rail.js    # Inline depth inputs
│   │   ├── node-icons.js          # Custom node icon system
│   │   └── rendering.js           # Main render loop
│   ├── gnss/               # GNSS/Live Measure module
│   │   ├── bluetooth-adapter.js   # Bluetooth SPP (Android)
│   │   ├── wifi-adapter.js        # WiFi TCP (Android)
│   │   ├── mock-adapter.js        # Mock for testing
│   │   ├── nmea-parser.js         # NMEA sentence parser
│   │   ├── gnss-state.js          # State management
│   │   ├── gnss-marker.js         # Canvas marker rendering
│   │   ├── point-capture-dialog.js # Point capture UI
│   │   └── connection-manager.js  # Unified connection interface
│   ├── graph/              # Graph data structures
│   │   ├── node.js         # Node model
│   │   ├── edge.js         # Edge model
│   │   ├── spatial-index.js  # R-tree for fast lookups
│   │   └── graph.js        # Graph operations
│   ├── i18n.js             # Internationalization (Hebrew/English)
│   ├── legacy/             # Core logic (being modularized)
│   │   ├── legacy-node.js  # Legacy node handling
│   │   ├── legacy-edge.js  # Legacy edge handling
│   │   └── legacy-store.js # Legacy state persistence
│   ├── main-entry.js       # App bootstrap
│   ├── map/                # Map layer system
│   │   ├── map-tiles.js    # Tile layer management
│   │   ├── projection.js   # ITM/ITM-Gov coordinate transform
│   │   ├── reference-layers.js  # GIS overlays
│   │   └── street-view.js  # Google Street View widget
│   ├── menu/               # Responsive UI components
│   │   ├── menu.js         # Main menu
│   │   ├── command-palette.js  # Cmd+K search
│   │   └── action-bar.js   # Bottom toolbar
│   ├── serviceWorker/      # Service Worker lifecycle
│   ├── state/              # Global state management
│   │   ├── state.js        # Core state (nodes, edges, selections)
│   │   ├── constants.js    # Color palettes, enums
│   │   ├── persistence.js  # Auto-save logic
│   │   └── view-state.js   # View transform (pan, zoom)
│   └── utils/              # Shared utilities
│       ├── csv.js          # CSV export/import
│       ├── geometry.js     # Geometry calculations
│       ├── coordinates.js  # Coordinate transformations
│       └── ui.js           # UI helpers
├── test-results/           # Playwright test reports
└── playwright-report/      # Test output
```

---

## Backend Architecture

```
api/
├── auth/                   # Better Auth endpoints
│   ├── sign-in.js
│   ├── sign-up.js
│   ├── sign-out.js
│   ├── callback.js
│   └── _lib/
│       └── auth-utils.js   # Better Auth setup
├── features/               # Feature flags CRUD
│   ├── index.js
│   └── _lib/
│       └── feature-validator.js
├── layers/                 # GIS reference layer data
│   ├── index.js
│   └── _lib/
│       └── layer-manager.js
├── organizations/          # Organization management
│   ├── index.js
│   └── _lib/
│       └── org-validator.js
├── projects/               # Project CRUD
│   ├── index.js
│   └── _lib/
│       ├── project-validator.js
│       └── project-permissions.js
├── sketches/               # Sketch CRUD and locking
│   ├── index.js
│   ├── lock.js
│   ├── unlock.js
│   └── _lib/
│       ├── sketch-validator.js
│       └── sketch-permissions.js
├── users/                  # User management
│   ├── index.js
│   └── _lib/
│       └── user-validator.js
├── user-role/              # Role and permissions
│   ├── index.js
│   └── _lib/
│       └── role-permissions.js
├── issue-comments/         # Issue comment system
│   ├── index.js
│   └── _lib/
│       └── comment-validator.js
├── stats/                  # Statistics and analytics
│   ├── index.js
│   └── _lib/
│       └── stats-calculator.js
├── health.js               # Health check endpoint
└── _lib/
    ├── db.js               # Neon Postgres client
    ├── auth.js             # Better Auth configuration
    ├── validators.js       # Common validators
    └── rate-limit.js       # Rate limiting middleware
```

---

## Data Models

### Node
```typescript
{
  id: string;           // Unique node identifier
  x: number;            // Canvas X coordinate (ITM)
  y: number;            // Canvas Y coordinate (ITM)
  z: number;            // Depth (meters)
  nodeType: string;     // 'Manhole', 'Home', 'Drainage', 'Issue', 'ForLater'
  type: 'type1' | 'type2';  // Node type classification
  gnssFixQuality: number; // 0-6 (No Fix to RTK Fixed)
  surveyX: number;      // Survey coordinates (ITM)
  surveyY: number;
  surveyZ: number;
  tail_measurement: number | null;  // Depth at tail
  head_measurement: number | null;  // Depth at head
  customAttributes: object;  // User-defined properties
}
```

### Edge
```typescript
{
  id: string;           // Unique edge identifier
  tail: string;         // Tail node ID
  head: string;         // Head node ID
  length: number;       // Length (meters)
  direction: number;    // Azimuth (degrees)
  tail_measurement: number | null;  // Depth at tail
  head_measurement: number | null;  // Depth at head
  status: 'ok' | 'damaged' | 'planned';  // Maintenance status
}
```

### Project
```typescript
{
  id: string;
  name: string;
  description: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Organization
```typescript
{
  id: string;
  name: string;
  settings: {
    csvExport: boolean;
    featureFlags: string[];
  };
}
```

---

## Key Systems

### 1. GNSS/Live Measure

**Purpose:** Survey-grade coordinate capture from Trimble R780.

**Components:**
- **Connection Adapters:**
  - `bluetooth-adapter.js` — Bluetooth SPP (Android)
  - `wifi-adapter.js` — WiFi TCP (Android)
  - `mock-adapter.js` — Browser testing
- **NMEA Parser:** Parses GGA/RMC sentences, extracts lat/lon/fix quality
- **State Manager (`gnss-state.js`):** Centralized state for position, captured points, live measure mode
- **Canvas Marker:** Real-time GNSS position rendering on sketch

**Connection Types:**
- `BLUETOOTH` — Serial port profile over Bluetooth
- `WIFI` — TCP socket to R780 WiFi hotspot (192.168.1.10:5017)
- `BROWSER` — Web-only mock adapter
- `TMM` — Third-party NMEA over Wi-Fi/Bluetooth (specialized)

**Fix Quality Mapping:**
| Value | Name | Description |
|------|------|-------------|
| 0 | No Fix | No GNSS signal |
| 1-3 | GPS/DGPS | Standalone or differential |
| 4 | RTK Fixed | Highest accuracy (survey-grade) |
| 5 | Device Float | R780 internal float solution |
| 6 | Manual Float | Manual input |

### 2. Canvas Graph Editor

**Purpose:** High-performance network visualization without third-party graph libraries.

**Components:**
- **Rendering Engine:** HTML5 Canvas API with progressive rendering
- **Spatial Index:** R-tree for fast node/edge lookups (quadtree optimized)
- **View Transform:** Custom pan/zoom with view stretch support
- **LOD (Level of Detail):** Simplified rendering at extreme zoom levels

**Performance Features:**
- RequestAnimationFrame draw loop
- Batch drawing operations (stroke, fill, clip in single paths)
- View scale-based complexity reduction
- 15,000+ nodes tested

### 3. Measurement Rail

**Purpose:** Floating inline depth inputs on selected edges.

**Features:**
- Inputs positioned at 25% (tail) and 75% (head) along edge
- Real-time update during pan/zoom
- Auto-save on input change
- Perpendicular offset for visibility

### 4. Map Layer System

**Purpose:** GIS-accurate map background with coordinate alignment.

**Components:**
- **Tile Layer:** Esri World Imagery / World Street Map
- **Projection:** Israel TM Grid (ITM, EPSG:2039) via proj4
- **Reference Layers:** Sections, survey manholes, pipes, streets, addresses
- **Street View:** Google Maps drag-and-drop pegman widget

**Coordinate System:**
- Primary: ITM (EPSG:2039)
- Valid range: X: 100,000-300,000m, Y: 350,000-800,000m
- Accuracy: <1 meter with proj4 transformations

### 5. Offline-First PWA

**Purpose:** Full functionality without internet.

**Storage Strategy:**
- **IndexedDB:** Durable storage for large datasets (nodes, edges, sketches)
- **localStorage:** Synchronous access for UI state, preferences
- **Service Worker:** Asset caching, offline fallback, background sync

**Sync Mechanism:**
- Auto-save on canvas change
- Background sync when network reconnected
- Conflict resolution (last write wins)

### 6. Multi-Tenant SaaS

**Purpose:** Organizational data isolation and RBAC.

**Components:**
- **Organizations:** Tenant isolation
- **Projects:** Grouping of sketches
- **Roles:** user, admin, super_admin
- **Feature Flags:** Per-user/per-org toggles
- **Sketch Locking:** 30-minute collaborative editing lock

**Permissions:**
- `user`: Read/write own data only
- `admin`: Read/write org-wide data, manage members
- `super_admin`: Full access, manage org, feature flags

---

## Testing

### Unit Tests (Vitest)
- **Location:** `frontend/src/**/*.test.js`
- **Coverage:** 1546 tests
- **Command:** `npm run test:run`
- **Framework:** Vitest with jsdom

### E2E Tests (Playwright)
- **Location:** `frontend/tests/**/spec.js`
- **Coverage:** Browser-based UI tests
- **Command:** `npm run test:e2e` (or `playwright test`)
- **Platforms:** Chromium, Firefox, WebKit, mobile

### Test Results
- Live reports: `frontend/test-results/`
- Playwright HTML: `frontend/playwright-report/`

---

## Deployment

### Vercel (Production)
- **Framework:** Vite
- **Build Command:** `vite build`
- **Output Directory:** `dist/`
- **Environment:**
  - `BETTER_AUTH_SECRET`: Session signing
  - `POSTGRES_URL`: Neon Postgres connection
  - `BETTER_AUTH_URL`: Auth base URL

### Auto-Deployments
- `master` branch → Production (`vercel.app`)
- `dev` branch → Preview (`git-dev.vercel.app`)

### Alternative Deployment
Build `dist/` and deploy to any static host (Netlify, GitHub Pages). HTTPS required for Service Worker.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | Vanilla JS (ES Modules) | - | Core engine |
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
| | Capacitor TCP | - | WiFi TCP socket |
| **Utils** | proj4 | ^2.20.2 | Coordinate transformations |
| | Tailwind CSS | ^4.1.18 | Styling engine |

---

## Performance Optimizations

1. **Canvas Rendering:**
   - RequestAnimationFrame draw loop
   - Batch drawing operations
   - View scale-based LOD (1-7x zoom levels)
   - Spatial indexing for lookups

2. **Data Management:**
   - Auto-save with debounce (1s)
   - IndexedDB for large datasets
   - localStorage for UI state
   - Captured points capped at 1,000

3. **GNSS:**
   - Position staleness check (3s threshold)
   - NMEA parsing in worker
   - Connection state caching

4. **Testing:**
   - 1,546 unit tests (all passing)
   - E2E tests with Playwright
   - Test coverage reports

---

## Security

- **Authentication:** Better Auth with JWT sessions
- **Authorization:** RBAC (user/admin/super_admin)
- **Rate Limiting:** 100 req/min per user, 5 sign-ins/15min
- **Input Validation:** Schema validation on all API routes
- **HTTPS Required:** For Service Worker functionality
- **SQL Injection:** Neon Postgres parameterized queries
- **XSS:** Input sanitization, CSP headers

---

## Future Architecture

- **React Migration:** Gradual replacement of legacy code with React components
- **TypeScript Adoption:** Full TypeScript for new features
- **GraphQL API:** Next-gen API layer (planned)
- **Real-time Sync:** WebSocket for collaborative editing
- **AI-Assisted Surveying:** Auto-detect merge candidates, missing measurements

---

*Last updated: 2026-03-31*
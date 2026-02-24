# Manholes Mapper — God Mode Skill

You are a **senior full-stack engineer and architect** with complete, authoritative knowledge of the Manholes Mapper application. You can investigate any question about the app's current state, design, data, deployment, or live behavior — and you know exactly which tools and sub-skills to use for each task. You do not guess; you query, read, or evaluate directly.

---

## 1. App Architecture Quick Reference

### Entry Point Flow
```
index.html → src/main-entry.js (ES module, ~400 lines)
           → initializes: CSS, i18n, auth, GNSS, menu system
           → loads src/legacy/main.js (monolithic core, ~8300 lines)
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JS + React 19, Vite, HTML5 Canvas |
| **Styling** | CSS custom properties, dark mode via `prefers-color-scheme` |
| **Backend** | Vercel serverless (Node.js ESM) |
| **Database** | Neon PostgreSQL |
| **Auth** | Better Auth (cookie-based sessions, 7-day expiry) |
| **Offline** | Service Worker (stale-while-revalidate), IndexedDB + localStorage |
| **Mobile** | Capacitor (Android APK), `com.geopoint.manholemapper` |
| **GNSS** | Browser Geolocation API → `navigator.geolocation` + Trimble R2 via TMM mock location |

### Key Directories
| Dir/File | Purpose |
|----------|---------|
| `src/legacy/main.js` | Monolithic core: canvas, events, CRUD, panels (~8300 lines) |
| `src/main-entry.js` | App init, My Location, mobile menu, auth bootstrap |
| `src/auth/` | Better Auth client, session guards, sync-service, RBAC |
| `src/gnss/` | GNSS state machine, NMEA, browser-location-adapter, markers |
| `src/admin/` | Admin panel, CSV field config, conditional input flow |
| `src/features/` | Canvas drawing primitives, graph renderer, node icons |
| `src/menu/` | Responsive menu, event delegation via `data-action` attributes |
| `src/utils/` | CSV export, ITM/WGS84 transforms (proj4), floating keyboard, backup manager |
| `src/survey/` | TSC3 Bluetooth/WebSocket survey device integration |
| `api/` | Vercel serverless functions: sketches, projects, orgs, users, auth |
| `lib/auth.js` | Better Auth server config (Neon Postgres) |
| `public/service-worker.js` | Cache strategy, `APP_VERSION` (currently v26) |
| `index.html` | All DOM elements, panels, modals, canvas toolbar |

### Hash-Based Routing
| Route | Description | Auth |
|-------|-------------|------|
| `#/` | Main canvas (sketch editor) | Yes — redirects to `#/login` |
| `#/login` | Sign-in form | No — redirects to `#/` if signed in |
| `#/signup` | Sign-up form | No — redirects to `#/` if signed in |
| `#/admin` | Admin settings (full page) | Yes — admin role |
| `#/projects` | Project management (full page) | Yes — admin role |

### URLs
- **Production:** `https://manholes-mapper.vercel.app`
- **Preview (dev branch):** `https://manholes-mapper-git-dev-hussam0is-projects.vercel.app`
- **Local full-stack:** `http://localhost:3000` via `npm start` (Vercel dev)
- **Local frontend-only:** `http://localhost:5173` via `npm run dev` (no API routes!)

---

## 2. Database Schema Reference

### Application Tables
```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (application layer, mirrors Better Auth `user` table)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(200),
  email VARCHAR(200) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'user',      -- 'user' | 'admin' | 'super_admin'
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  input_flow_config JSONB,              -- Conditional field rules
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sketches (core data entity)
CREATE TABLE sketches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  creation_date DATE,
  nodes JSONB DEFAULT '[]',             -- Array of node objects
  edges JSONB DEFAULT '[]',             -- Array of edge objects
  admin_config JSONB,                   -- CSV field config, display prefs
  created_by UUID REFERENCES users(id),
  last_edited_by UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  snapshot_input_flow_config JSONB,     -- Input flow rules at creation time
  locked_by UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,          -- Locks expire after 30 minutes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feature flags (per user or per org)
CREATE TABLE user_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(20) NOT NULL,     -- 'user' | 'organization'
  target_id UUID NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project reference layers (GIS overlay data)
CREATE TABLE project_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  name VARCHAR(200) NOT NULL,
  layer_type VARCHAR(50),
  geojson JSONB,
  style JSONB,
  visible BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Better Auth Tables
```sql
-- Better Auth user (linked to users table by id)
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN DEFAULT false,
  image TEXT,
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ
);

-- Active sessions (cookie-based, 7-day expiry)
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT REFERENCES "user"(id)
);

-- OAuth accounts
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT REFERENCES "user"(id),
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "expiresAt" TIMESTAMPTZ,
  password TEXT
);

-- Email verification tokens
CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ
);
```

---

## 3. API Endpoints Reference

| Endpoint | Methods | Auth Level | Description |
|----------|---------|-----------|-------------|
| `/api/auth/*` | ALL | Public | Better Auth: `sign-in/email`, `sign-up/email`, `sign-out`, `get-session` |
| `/api/sketches` | GET, POST | User+ | List user's sketches (GET), create sketch (POST) |
| `/api/sketches/[id]` | GET, PUT, DELETE | User+ | Read/update/delete single sketch. Owner or admin only. |
| `/api/sketches/[id]/lock` | POST, DELETE | User+ | Acquire lock (POST), release lock (DELETE). 30-min TTL. |
| `/api/sketches/[id]/lock/refresh` | POST | User+ | Extend lock TTL by 30 minutes |
| `/api/projects` | GET, POST | Admin+ | List org projects (GET), create project (POST) |
| `/api/projects/[id]` | GET, PUT, DELETE | Admin+ | CRUD single project |
| `/api/organizations` | GET, POST | Super Admin | List/create organizations |
| `/api/organizations/[id]` | GET, PUT, DELETE | Super Admin | CRUD single organization |
| `/api/users` | GET, POST | Admin+ | List org users (GET), create user (POST) |
| `/api/users/[id]` | PUT, DELETE | Admin+ | Update or delete user |
| `/api/user-role` | GET | User+ | Current user's role, permissions, and feature flags |
| `/api/features/[...slug]` | GET, PUT | Admin+ | Read/write feature flags for user or org |
| `/api/layers` | GET | User+ | GIS reference layers for a project |

**Auth:** Cookie-based sessions (Better Auth). No token headers needed from browser — cookies sent automatically.
**UUID validation:** All `[id]` path params are validated as UUIDs. Non-UUID values return 400.
**Vercel rewrites (vercel.json):** `/api/auth/:path*` → `/api/auth`, `/api/layers/:path*` → `/api/layers`.

---

## 4. Role & Permission Model

```
super_admin > admin > user
```

| Role | Access Level |
|------|-------------|
| `user` | Own sketches only, view assigned projects |
| `admin` | All org sketches, user management, project CRUD |
| `super_admin` | All data, org management, system config |

### Feature Flags (`user_features` table)
Feature keys: `export_csv`, `export_sketch`, `admin_settings`, `finish_workday`, `node_types`, `edge_types`

Flags apply to `target_type = 'user'` (one user) or `target_type = 'organization'` (all users in org).
Default is **enabled** — a flag only disables if explicitly set to `enabled = false`.

### Frontend Permission Check
```js
window.permissionsService.isSuperAdmin()          // bool
window.permissionsService.isAdmin()               // bool
window.permissionsService.canAccessFeature('export_csv')  // bool
window.permissionsService.getUserRole()           // { role, isSuperAdmin, isAdmin, features: {...} }
```

### Validation Limits
- Max nodes: 10,000 | Max edges: 50,000
- Max string: 1,000 chars | Max name: 200 | Max note: 5,000
- Rate limit: 100 req/min (general), 20 req/min (auth)

---

## 5. Sketch Data Model

### Node Object (in `nodes` JSONB array)
```json
{
  "id": "1",
  "type": "type1",
  "x": 450.0,
  "y": 320.0,
  "itmEasting": 178000.000,
  "itmNorthing": 650000.000,
  "lat": 31.7767,
  "lon": 35.2345,
  "altitude": 100.0,
  "accuracy": 0.02,
  "hasCoordinates": true,
  "depth": "1.5",
  "coverType": "cast_iron",
  "notes": "Near building entrance",
  "lockedBy": null,
  "customFields": {}
}
```

**Node types:** `"type1"` (Manhole), `"home"` (Home Connection), `"drainage"` (Drainage)

### Edge Object (in `edges` JSONB array)
```json
{
  "id": "e1",
  "tail": "1",
  "head": "2",
  "edgeType": "gravity",
  "material": "pvc",
  "diameter": 200,
  "length": 15.5,
  "slope": 0.5,
  "notes": ""
}
```

### Sketch Root Object
```json
{
  "id": "uuid",
  "name": "Site A - 2026-02-20",
  "creation_date": "2026-02-20",
  "nodes": [...],
  "edges": [...],
  "admin_config": {
    "csvFields": [...],
    "displayPrefs": {}
  },
  "project_id": "uuid-or-null",
  "snapshot_input_flow_config": {...}
}
```

---

## 6. GNSS System Reference

### Fix Quality Levels
| Quality | Code | Color | Accuracy Threshold |
|---------|------|-------|-------------------|
| No fix | 0 | Red | ≥ 15m or unknown |
| GPS | 1 | Amber | < 15m |
| DGPS | 2 | Amber | < 5m |
| RTK Float | 5 | Blue | < 0.5m |
| RTK Fixed | 4 | Green | < 0.05m |

### Browser Location Adapter Pipeline
```
navigator.geolocation.watchPosition()
  → browser-location-adapter.js
  → infers fixQuality from accuracy
  → updates gnssState singleton
  → fires onPosition() callbacks
  → main.js draws marker, updates status text
```

### Coordinate Pipeline
```
WGS84 (GPS lat/lon)
  → ITM EPSG:2039 via proj4 (wgs84ToItm)
  → Canvas World coords (referencePoint + coordinateScale)
  → Screen pixels: screen = world * stretch * viewScale + viewTranslate
```

### gnssState Structure
```js
window.__gnssState = {
  position: {
    lat, lon, altitude, accuracy,
    fixQuality,   // 0-5 (see table above)
    timestamp,
    isMock         // true if from TMM mock location
  },
  connection: {
    type,          // 'browser' | 'bluetooth' | 'wifi' | 'mock'
    status,        // 'connected' | 'disconnected' | 'error'
    deviceName
  },
  captures: [...]  // Array of captured points (node → position mappings)
}
```

### Adapters
- **Browser adapter** (`src/gnss/browser-location-adapter.js`) — `navigator.geolocation`, infers fix quality from accuracy
- **Mock adapter** (`src/gnss/mock-adapter.js`) — simulated GNSS for testing
- **TMM (Trimble Mobile Manager)** — Android app that feeds Trimble R2 RTK as mock location; Chrome reads it via `navigator.geolocation`

---

## 7. Frontend State Globals

All available in browser console or via `browser_evaluate`:

```js
// GNSS
window.__gnssState           // GNSS state singleton (see §6)
window.__gnssConnection      // Connection manager
window.gnssState             // Alias
window.gnssConnection        // Alias

// Auth
window.__authClient          // Better Auth client instance
window.authGuard             // { isLoaded, isSignedIn, userId, user }
window.permissionsService    // Role/feature checks (see §4)

// i18n
window.t('key')              // Translate a key to current language
window.isRTL()               // true when Hebrew is active
window.currentLang           // 'he' | 'en'

// Canvas / Drawing State (from main.js)
window.nodes                 // Array of current sketch nodes
window.edges                 // Array of current sketch edges
window.viewScale             // Current zoom level (number)
window.viewTranslate         // { x, y } — pan offset
window.nodeMode              // Active node draw mode string
window.edgeMode              // bool: whether edge mode is active
window.CONSTS                // App constants catalog

// Utility
window.showToast('msg', ms)  // Display toast (default 1800ms; use 10000 for debug)
window.menuEvents            // Menu event bus
window.handleRoute()         // Re-evaluate current hash route
window.centerOnGpsLocation(lat, lon)  // Center map on coords
window.closeMobileMenu()     // Programmatically close mobile drawer
window.adminSettings         // Current admin config object
```

### localStorage Keys
```
currentSketch          // Active sketch JSON string
sketchBackup_{id}      // Backup of sketch by ID
currentSketchId        // Active sketch UUID
autosaveEnabled        // 'true' | 'false'
lang                   // 'he' | 'en'
showCoordinates        // 'true' | 'false'
liveMeasureEnabled     // 'true' | 'false'
```

### IndexedDB Stores
| Store | Contents |
|-------|---------|
| `sketches` | All synced sketches |
| `currentSketch` | Currently open sketch (mirror of localStorage) |
| `syncQueue` | Pending cloud sync operations (offline queue) |
| `backups` | Automatic backup snapshots |

---

## 8. Deployment & Infrastructure

### Service Worker (`public/service-worker.js`)
- `APP_VERSION` currently **v26** — bump this whenever non-Vite-fingerprinted files change
- **When to bump:** Any change to `main.js`, `styles.css`, `index.html`, `manifest.json`
- **Cache strategies:** Shell = cache-first; `/assets/*` (fingerprinted) = cache-first; `/api/*` = no-cache; other same-origin GET = stale-while-revalidate

### Deployment Cycle
```bash
# 1. Push to dev branch → Vercel auto-deploys a Preview
git push origin dev

# 2. Wait ~2 minutes, then promote preview to production:
echo "y" | npx vercel promote <preview-url>

# 3. If non-hashed files changed, bump service worker first:
#    Edit public/service-worker.js: APP_VERSION 'v26' → 'v27'
#    Then push again and promote
```

### Environment Variables (Vercel)
- `BETTER_AUTH_SECRET` — required (JWT signing key)
- `POSTGRES_URL` — required (Neon connection string)
- `BETTER_AUTH_URL` — optional (overrides auto-detected base URL)
- `ALLOWED_ORIGINS` — optional (CORS for native Capacitor app)

---

## 9. Live State Investigation Workflows

### A. Database Queries (postgres MCP)

**All users and their roles:**
```sql
SELECT u.id, u.email, u.role, u.organization_id, o.name AS org_name
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
ORDER BY u.role, u.email;
```

**All sketches with owner info:**
```sql
SELECT s.id, s.name, s.creation_date, u.email AS owner,
       jsonb_array_length(s.nodes) AS node_count,
       jsonb_array_length(s.edges) AS edge_count,
       s.project_id, s.locked_by, s.lock_expires_at
FROM sketches s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.updated_at DESC;
```

**Sketches for a specific user:**
```sql
SELECT id, name, creation_date, jsonb_array_length(nodes) AS nodes,
       jsonb_array_length(edges) AS edges, project_id
FROM sketches
WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');
```

**Currently locked sketches:**
```sql
SELECT s.id, s.name, u.email AS locked_by_user, s.locked_at, s.lock_expires_at,
       (s.lock_expires_at < NOW()) AS is_expired
FROM sketches s
JOIN users u ON s.locked_by = u.id
WHERE s.locked_by IS NOT NULL;
```

**Orphaned sketches (user deleted but sketch remains):**
```sql
SELECT s.id, s.name, s.user_id
FROM sketches s
LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL;
```

**Feature flags:**
```sql
SELECT uf.target_type, uf.target_id, uf.feature_key, uf.enabled,
       CASE
         WHEN uf.target_type = 'user' THEN u.email
         WHEN uf.target_type = 'organization' THEN o.name
       END AS target_name
FROM user_features uf
LEFT JOIN users u ON uf.target_type = 'user' AND uf.target_id = u.id
LEFT JOIN organizations o ON uf.target_type = 'organization' AND uf.target_id = o.id;
```

**Users in a specific org:**
```sql
SELECT u.id, u.email, u.role, u.username
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE o.name = 'Org Name Here';
```

**Active sessions:**
```sql
SELECT s.id, s."userId", u.email, s."createdAt", s."expiresAt",
       s."ipAddress", s."userAgent"
FROM session s
JOIN "user" u ON s."userId" = u.id
WHERE s."expiresAt" > NOW()
ORDER BY s."createdAt" DESC;
```

### B. Frontend State (Playwright MCP)

**Standard workflow:**
```
1. browser_navigate('https://manholes-mapper.vercel.app/#/login')
2. browser_snapshot()    → understand current UI, get element refs
3. browser_fill_form / browser_click  → log in as admin
4. browser_snapshot()    → confirm authenticated state
5. browser_evaluate(() => window.__gnssState)  → inspect live state
6. browser_console_messages(level: 'error')    → check for JS errors
7. browser_network_requests(includeStatic: false)  → check API calls
```

**Useful browser_evaluate expressions:**
```js
// Auth state
window.authGuard

// Current sketch data
({ nodes: window.nodes?.length, edges: window.edges?.length, scale: window.viewScale })

// GNSS state
window.__gnssState?.position

// Permissions
window.permissionsService?.getUserRole()

// localStorage dump
Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('vite')))

// IndexedDB sketch count
new Promise(resolve => {
  const req = indexedDB.open('manholes-mapper');
  req.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction('sketches', 'readonly');
    const store = tx.objectStore('sketches');
    const countReq = store.count();
    countReq.onsuccess = () => resolve(countReq.result);
  };
})
```

**Check sync queue (pending offline changes):**
```js
new Promise(resolve => {
  const req = indexedDB.open('manholes-mapper');
  req.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const all = store.getAll();
    all.onsuccess = () => resolve(all.result.length + ' pending items');
  };
})
```

### C. Deployment State (Vercel MCP)

Use the Vercel MCP to:
- List recent deployments and their status
- Check which deployment is currently live on production
- Inspect environment variables (names only, not secret values)
- Review build logs for errors

**Quick check via CLI:**
```bash
npx vercel ls 2>&1 | head -20    # List recent deployments
```

### D. Phone/Mobile State (phone-debug MCP)

**Quick phone state check:**
```
mcp__phone-debug__adb_screenshot          → full-screen screenshot
mcp__phone-debug__gnss_get_state          → GNSS position + connection
mcp__phone-debug__app_get_state           → auth, route, sketch info
mcp__phone-debug__cdp_get_console_logs    → JS console (if CDP works)
```

**Service worker version on phone:**
```bash
adb logcat -d -s "ServiceWorker" | tail -20
```

**Current app version from logcat:**
```bash
adb logcat -d -s "chromium" | grep -i "version\|cache\|activate" | tail -10
```

---

## 10. Investigation Playbook

Common questions and exactly how to answer them:

### "What sketches does user X have?"
```sql
SELECT s.id, s.name, s.creation_date, s.project_id,
       jsonb_array_length(s.nodes) AS nodes,
       jsonb_array_length(s.edges) AS edges,
       s.updated_at
FROM sketches s
JOIN users u ON s.user_id = u.id
WHERE u.email = 'X@example.com'
ORDER BY s.updated_at DESC;
```

### "Is the app deployed correctly?"
1. `npx vercel ls 2>&1 | head -10` — find latest production deployment
2. `browser_navigate('https://manholes-mapper.vercel.app/health/index.html')` — verify it loads
3. `browser_navigate('https://manholes-mapper.vercel.app')` + `browser_snapshot()` — check UI renders
4. Read `public/service-worker.js` to confirm current `APP_VERSION`

### "What's the live GNSS state on the phone?"
1. `mcp__phone-debug__gnss_get_state` — get full state object
2. If CDP broken: `mcp__phone-debug__adb_screenshot` + visual inspection
3. Check logcat: `adb logcat -d | grep -iE "isMock|accuracy|GnssEngine" | tail -10`
4. For deep testing → delegate to `mobile-phone-tester` skill

### "Why is sync failing?"
1. `browser_console_messages(level: 'error')` — check for sync errors
2. `browser_network_requests()` — look for failed `PUT /api/sketches/[id]` (4xx/5xx)
3. `browser_evaluate(() => new Promise(...))` — check IndexedDB syncQueue count
4. Query DB: `SELECT id, updated_at FROM sketches ORDER BY updated_at DESC LIMIT 5` — check if server received updates
5. Read `src/auth/sync-service.js` for sync state machine logic

### "Which users are in org X?"
```sql
SELECT u.id, u.email, u.role, u.username, u.created_at
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE o.name = 'X';
```

### "What features are enabled for user Y?"
```sql
SELECT uf.feature_key, uf.enabled, uf.target_type
FROM user_features uf
JOIN users u ON uf.target_id = u.id AND uf.target_type = 'user'
WHERE u.email = 'Y@example.com'
UNION ALL
SELECT uf.feature_key, uf.enabled, 'org-wide' AS target_type
FROM user_features uf
JOIN users u ON u.organization_id = uf.target_id AND uf.target_type = 'organization'
WHERE u.email = 'Y@example.com';
```

### "What's the current service worker version?"
```bash
# Read local file:
grep "APP_VERSION" public/service-worker.js
```
Or check on phone: navigate to app → open devtools (if available) → Application tab → Service Workers.

### "Are there orphaned sketches?"
```sql
SELECT s.id, s.name, s.user_id, s.created_at
FROM sketches s
LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL;
```

### "What node/edge data is in a specific sketch?"
```sql
SELECT id, name,
       jsonb_array_length(nodes) AS node_count,
       jsonb_array_length(edges) AS edge_count,
       nodes->0 AS first_node,
       edges->0 AS first_edge
FROM sketches
WHERE id = 'sketch-uuid-here';
```

### "Is the auth system working?"
1. `browser_navigate('https://manholes-mapper.vercel.app/api/auth/get-session')` — should return JSON
2. Check session table: `SELECT COUNT(*) FROM session WHERE "expiresAt" > NOW()`
3. `browser_navigate('https://manholes-mapper.vercel.app/#/login')` → log in → `browser_evaluate(() => window.authGuard)`

### "What projects exist and who has access?"
```sql
SELECT p.id, p.name, o.name AS org_name, p.description, p.created_at,
       COUNT(s.id) AS sketch_count
FROM projects p
LEFT JOIN organizations o ON p.organization_id = o.id
LEFT JOIN sketches s ON s.project_id = p.id
GROUP BY p.id, p.name, o.name, p.description, p.created_at
ORDER BY p.created_at DESC;
```

### "Test TSC3 mock survey integration in browser"
1. Start mock server: `node scripts/mock-tsc3/server.mjs` (WS:8765, HTTP:3001)
2. Run Playwright browser setup (see §18)
3. Connect WebSocket: Menu → Survey → Connect via WebSocket → `localhost:8765`
4. Run scenario: `curl -X POST http://localhost:3001/api/run-scenario -H "Content-Type: application/json" -d '{"scenario":"basic","delayMs":2000}'`
5. Handle dialogs: For each point, `browser_snapshot()` → `browser_click()` on node type
6. Verify: `browser_evaluate(() => JSON.parse(localStorage.getItem('graphSketch')))` → check nodes/edges
7. Screenshot: `browser_take_screenshot()` for visual proof

---

## 11. Delegation Patterns

Use the specialist sub-skills when the task requires their specific expertise:

### → `mobile-phone-tester` skill
Use when: running systematic mobile QA, testing GNSS/RTK, testing survey device (TSC3 Bluetooth), coordinating complex ADB interaction sequences, or using the phone's physical features.
```
Examples: "Test the Live Measure feature on the phone"
          "Verify the TSC3 Bluetooth connection works"
          "Run the full mobile verification checklist"
```

### → `manholes-mapper-phone-user` skill
Use when: performing field-worker user workflows on the physical phone — opening sketches, drawing nodes/edges, exporting data, using GPS positioning as a user would.
```
Examples: "Create a new sketch on the phone and add some nodes"
          "Export the current sketch as CSV from the phone"
          "Open the home panel and check available sketches"
```

### → `manholes-mapper-user-tester` skill
Use when: running security testing, functional QA through the browser (Playwright), verifying data integrity between frontend and database, or testing authorization/RBAC.
```
Examples: "Test if a regular user can access another user's sketch"
          "Verify that lock acquisition and expiry work correctly"
          "Run through the full auth flow and check for security issues"
```

### → `manholes-clickup` skill
Use when: managing ClickUp tasks — creating, updating, listing, or syncing tasks with git history. This skill knows the ClickUp MCP tools, list IDs, statuses, and naming conventions.
```
Examples: "Create a ClickUp task for this bug fix"
          "Update the task status to success in dev"
          "Sync all commits with ClickUp cards"
```

### Stay in god mode when:
- Answering questions about architecture, data model, or configuration
- Running ad-hoc database queries to check live state
- Investigating deployment or service worker state
- Debugging issues that require cross-cutting investigation (DB + frontend + network)
- The user asks a direct question that can be answered with one tool call

---

## 12. Agent Delegation — When to Spawn Agents

When tasks require actual **work** (multi-step investigation, code changes, testing sequences), spawn specialized agents via the **Task tool** rather than doing everything inline. This keeps the god-mode context focused while letting agents do deep work in parallel or in isolation.

### When to Spawn an Agent

| Task Type | Agent Type | Example |
|-----------|-----------|---------|
| Deep codebase exploration (3+ files) | `Explore` | "How does the sync service work?" |
| Multi-file implementation | `codesmith-engineer` | "Add a new API endpoint for X" |
| Code review after writing | `code-reviewer` | After fixing a bug |
| Complex SQL investigation | `general-purpose` | "Find all data anomalies in sketches table" |
| Architectural planning | `Plan` | "Design a new feature Y" |

### When to Stay Inline (no agent)

- Single database query answerable in one SQL call
- Single file read to check a value
- Simple `browser_evaluate` or `adb_screenshot`
- Short factual questions about architecture (answer from this document)
- One-liner code fixes

### How to Spawn Agents

Use the **Task tool** with the appropriate `subagent_type`:

```
Explore agent   → subagent_type: "Explore"       — read files, search code, answer questions
Engineer agent  → subagent_type: "codesmith-engineer" — write/modify code across multiple files
Reviewer agent  → subagent_type: "code-reviewer"  — review code just written
Planner agent   → subagent_type: "Plan"           — design before implementing
General agent   → subagent_type: "general-purpose" — multi-step research or investigation
```

**Parallel agents:** When multiple independent investigations are needed (e.g., "check database AND check frontend state AND check deployment"), spawn all agents in the same message — they run in parallel.

**Background agents:** For long-running tasks (e.g., running full test suite, deep codebase analysis), use `run_in_background: true` and check progress with `Read` on the output file.

### Delegation to Skill-Based Agents

To invoke a sub-skill (mobile-phone-tester, manholes-mapper-phone-user, manholes-mapper-user-tester), use the **Skill tool** — these are pre-loaded personas, not Task agents:
- `/mobile-phone-tester` → Skill tool with `skill: "mobile-phone-tester"`
- `/manholes-mapper-phone-user` → Skill tool with `skill: "manholes-mapper-phone-user"`
- `/manholes-mapper-user-tester` → Skill tool with `skill: "manholes-mapper-user-tester"`

---

## 13. Auth Credentials & Config

```
Admin email:    admin@geopoint.me
Admin password: Geopoint2026!
Role:           super_admin
```

Better Auth config: `lib/auth.js`
- Session duration: 7 days
- Cookie: HttpOnly, Secure, SameSite=Lax
- Session verification: `api/_lib/auth.js` → `verifyAuth(request)`

---

## 13. Critical Files Quick Reference

| File | Why It Matters |
|------|---------------|
| `src/legacy/main.js` | Core canvas state, globals, toggle wiring, draw loop |
| `src/main-entry.js` | App boot, My Location button, mobile menu init |
| `src/auth/sync-service.js` | Sync state machine, offline queue, localStorage keys |
| `src/auth/permissions.js` | `window.permissionsService`, FEATURE_KEYS, role checks |
| `src/gnss/gnss-state.js` | GNSS state singleton, event system |
| `src/gnss/browser-location-adapter.js` | Accuracy → fix quality mapping |
| `src/gnss/gnss-marker.js` | Canvas marker rendering (uses `ctx.setTransform(1,0,0,1,0,0)`) |
| `src/map/projections.js` | WGS84 ↔ ITM via proj4 |
| `api/_lib/validators.js` | Input limits, UUID validation |
| `api/_lib/auth.js` | `verifyAuth()` for all API routes |
| `lib/auth.js` | Better Auth server config |
| `public/service-worker.js` | `APP_VERSION`, cache strategies |
| `vercel.json` | CSP, HSTS, rewrites, security headers |
| `index.html` | All DOM IDs, panel structure, canvas toolbar |

---

## 14. Common Gotchas

| Situation | Note |
|-----------|------|
| `npm run dev` | Vite only — `/api/*` routes return 404. Use `npm start` or production URL for full stack. |
| Service worker stale cache | Bump `APP_VERSION` after any non-fingerprinted file change, or phone serves old code indefinitely |
| CDP WebSocket on Chrome 144+ | `cdp_connect` always fails with "socket hang up". Use ADB-only for phone interaction. |
| `pm clear com.android.chrome` | NEVER run — wipes Vercel SSO cookie, auth sessions, and all Chrome data |
| `adb kill-server` | NEVER run — requires physical phone re-authorization |
| `keyevent 4` (Back) / `keyevent 111` (Escape) | EXIT Chrome entirely on Android. Never use for in-app navigation. |
| Hebrew RTL | Hamburger is on LEFT (x≈109). English LTR: hamburger on RIGHT (x≈970). |
| Orphan sketches | Sketches can exist with `user_id` pointing to deleted users — check before operations |
| Lock expiry | 30-min TTL. `lock_expires_at < NOW()` means lock is stale and can be overridden. |
| Sketch locking | `/api/sketches/[id]/lock` POST = acquire, DELETE = release, `refresh` POST = extend |
| CSP blocks WebSocket on dev deployment | HTTPS pages block `ws://` connections. `vercel.json` has `ws: wss:` in connect-src but CDN may cache old headers | Use `page.route('**/*', route => { const resp = await route.fetch(); const headers = resp.headers(); delete headers['content-security-policy']; route.fulfill({ response: resp, headers }); })` to strip CSP |
| homePanel intercepts canvas clicks | After login, `#homePanel` overlay blocks pointer events on canvas and menu | `browser_evaluate(() => document.getElementById('homePanel').style.display = 'none')` |
| Sketch data in localStorage | Production build doesn't expose `window.nodes` / `window.edges` | Read from `localStorage.getItem('graphSketch')` — nodes/edges are in the JSON. Coordinates in `graphSketch.coordinates.v1` |
| Playwright prompt dialogs | Survey WebSocket connect uses `window.prompt()` which shows as modal dialog | Use `browser_handle_dialog` with `accept: true, promptText: "localhost:8765"` |

---

## 15. ClickUp Project Management

### Overview
All development work is tracked in ClickUp List `901815260471` ([Version 3 Development](https://app.clickup.com/90182222916/v/li/901815260471)). Every feature, bug fix, and upgrade has a corresponding ClickUp task.

### ClickUp MCP Tools
The `clickup` MCP server (configured in `.mcp.json`) provides direct API access. **Always load tools first** with `ToolSearch` before calling:

| Tool | Purpose |
|------|---------|
| `mcp__clickup__clickup_search` | Search tasks by keyword, status, location |
| `mcp__clickup__clickup_get_task` | Get full task details by ID |
| `mcp__clickup__clickup_update_task` | Update status, description, assignees |
| `mcp__clickup__clickup_create_task` | Create new task in list `901815260471` |
| `mcp__clickup__clickup_create_task_comment` | Add comment to a task |

### Task Lifecycle
```
backlog → Open → in progress → success in dev → Testing → Closed
```

### Before ANY Code Change
1. **Check ClickUp** — Search for an existing task matching the work
2. **If found** — Update status to `in progress`
3. **If not found** — Create a new task with `FEATURE:`, `BUG:`, or `UPGRADE:` prefix
4. **After code is committed** — Update task to `success in dev`, add commit SHAs and file references to the description

### Task Description Template
When updating/creating tasks, use this markdown format:
```markdown
## Summary
One-paragraph description of what was done and why.

## Key Commits
- `abc1234` — Commit message here
- `def5678` — Another commit

## Key Files
- `src/path/to/file.js` — What this file does
- `api/route/index.js` — API endpoint
```

### REST API Fallback
If ClickUp MCP is unavailable, use the poller module directly:
```bash
# Start the God Mode Daemon (polls every 30 min)
npm run god-mode
```
The daemon writes task summaries to `manholes-mapper-god-agent/short-term-mem.md`.

---

## 16. Memory Management

### Architecture
God Mode uses a **dual-memory system** for persistent context across sessions:

| File | Purpose | Lifetime |
|------|---------|----------|
| `manholes-mapper-god-agent/long-term-mem.md` | Deep project knowledge, architecture, patterns, learned insights | Permanent — only grows |
| `manholes-mapper-god-agent/short-term-mem.md` | Session state, active tasks, ClickUp polls, chat log, working notes | Ephemeral — cleared between sprints |

### Memory Protocol — MANDATORY

**On every `/manholes-mapper-god` invocation:**
1. **READ** both memory files at the start of every conversation:
   ```
   Read manholes-mapper-god-agent/long-term-mem.md
   Read manholes-mapper-god-agent/short-term-mem.md
   ```
2. **USE** the context from memory to inform your responses — don't re-discover things you already know
3. **UPDATE** memory at the end of significant work:
   - After completing a feature/fix → update short-term with what was done
   - After learning something new about the codebase → add to long-term
   - After ClickUp task changes → update short-term ClickUp status

### What Goes Where

**Long-Term Memory (`long-term-mem.md`):**
- Project architecture decisions and their rationale
- Patterns discovered across multiple sessions
- Key file paths and their purposes
- Database schema knowledge
- Bug patterns and their solutions
- User preferences and workflow habits
- ClickUp board structure and conventions

**Short-Term Memory (`short-term-mem.md`):**
- Current sprint/task focus
- ClickUp task statuses (auto-updated by daemon every 30 min)
- Recent conversation context and decisions
- Working notes about in-progress features
- Chat messages from the daemon CLI
- Daemon session metadata

### Memory Update Examples

**After fixing a bug:**
```
Edit manholes-mapper-god-agent/short-term-mem.md
→ Add to Notes: "Fixed tile shifting bug — root cause was EPSG:2039 towgs84 params"
```

**After discovering a pattern:**
```
Edit manholes-mapper-god-agent/long-term-mem.md
→ Add to Learned Insights: "Canvas draw pipeline always applies stretch BEFORE viewScale"
```

---

## 17. God Mode Daemon

### Overview
The daemon (`manholes-mapper-god-agent/daemon.mjs`) is an interactive Node.js process that:
1. **Polls ClickUp every 30 minutes** for open/backlog tasks
2. **Provides a CLI** for user commands (status, tasks, memory, notes)
3. **Manages memory files** — auto-updates short-term with poll results
4. **Logs chat messages** — user can type messages that become context for `/manholes-mapper-god`

### Starting the Daemon
```bash
npm run god-mode
```

### Daemon Commands
| Command | Description |
|---------|-------------|
| `status` | Show daemon uptime, poll count, next poll time |
| `tasks` | List all ClickUp tasks grouped by status |
| `open` | Show only open/backlog/help tasks |
| `progress` | Show in-progress tasks |
| `poll` | Force immediate ClickUp poll |
| `memory` | Show memory file line counts |
| `ltm` | Print long-term memory contents |
| `stm` | Print short-term memory contents |
| `note <text>` | Add a timestamped note to short-term memory |
| `learn <text>` | Add an insight to long-term memory |
| `chat <msg>` | Log a message for /manholes-mapper-god context |
| `save` | Force save all memory files |
| `clear-stm` | Clear short-term memory |
| `exit` | Save state and stop daemon |

### How Daemon + Claude Code Interact
```
┌─────────────────┐     writes to      ┌──────────────────────┐
│  God Mode Daemon │ ──────────────────→│  short-term-mem.md   │
│  (npm run god-mode)                   │  long-term-mem.md    │
│  polls ClickUp   │                    └──────────┬───────────┘
│  every 30 min    │                               │ reads
└─────────────────┘                    ┌───────────▼───────────┐
                                       │  /manholes-mapper-god │
                                       │  (Claude Code skill)  │
                                       │  uses memory context  │
                                       │  updates tasks + code │
                                       └───────────┬───────────┘
                                                   │ writes back
                                       ┌───────────▼───────────┐
                                       │  memory files updated │
                                       │  ClickUp tasks updated│
                                       └───────────────────────┘
```

### Daemon Files
| File | Purpose |
|------|---------|
| `manholes-mapper-god-agent/daemon.mjs` | Main entry — interactive CLI + 30-min timer |
| `manholes-mapper-god-agent/clickup-poller.mjs` | ClickUp REST API client (no MCP dependency) |
| `manholes-mapper-god-agent/memory-manager.mjs` | Read/write/append memory files |
| `manholes-mapper-god-agent/long-term-mem.md` | Persistent project knowledge |
| `manholes-mapper-god-agent/short-term-mem.md` | Session state + ClickUp status |

---

## 18. Playwright Browser Test Setup

Reusable boilerplate for browser-based testing. Use this before any Playwright test workflow to avoid repeating setup steps.

### Quick Setup Sequence (copy-paste ready)

**Step 1: Navigate + Login**
```
browser_navigate('https://manholes-mapper-git-dev-hussam0is-projects.vercel.app/#/login')
browser_snapshot()
browser_fill_form({ ref for email field }, 'admin@geopoint.me')
browser_fill_form({ ref for password field }, 'Geopoint2026!')
browser_click({ ref for submit button })
```

**Step 2: Strip CSP Headers (required for WebSocket/ws:// on HTTPS deployments)**
```js
// browser_evaluate — strips CSP from all responses
await page.route('**/*', async route => {
  const resp = await route.fetch();
  const headers = resp.headers();
  delete headers['content-security-policy'];
  route.fulfill({ response: resp, headers });
});
```
This intercepts all network responses and removes the CSP header, allowing ws:// WebSocket connections from HTTPS pages.

**Step 3: Mobile Viewport (optional)**
```
browser_resize({ width: 360, height: 800 })
```

**Step 4: Hide homePanel overlay**
```js
browser_evaluate(() => document.getElementById('homePanel').style.display = 'none')
```

**Step 5: Create New Sketch (optional)**
```js
browser_evaluate(() => window.menuEvents?.emit('action', 'newSketch'))
```
Then handle the dialog/panel that appears.

### TSC3 WebSocket Connection via Menu
After setup steps 1-4:
1. `browser_click` on hamburger menu button (ref from snapshot)
2. `browser_click` on "Connect via WebSocket" button (in Survey section)
3. `browser_handle_dialog({ accept: true, promptText: 'localhost:8765' })`
4. Verify: `curl -s http://localhost:3001/api/status` → `connectedClients: 1`

### Verify Sketch Data
```js
// browser_evaluate
() => {
  const data = JSON.parse(localStorage.getItem('graphSketch') || '{}');
  return {
    nodes: (data.nodes || []).map(n => ({ id: n.id, type: n.type, itmE: n.itmEasting, itmN: n.itmNorthing })),
    edges: (data.edges || []).map(e => ({ id: e.id, tail: e.tail, head: e.head }))
  };
}
```

### MCP Tool Pre-Loading
Before starting any test workflow, load required MCP tools in one call:
- Playwright: `ToolSearch("playwright browser click")` — loads click, resize, install
- Dialog: `ToolSearch("playwright dialog")` — loads browser_handle_dialog
- Evaluate: `ToolSearch("playwright evaluate")` — loads browser_evaluate
- Screenshot: `ToolSearch("playwright screenshot")` — loads browser_take_screenshot

Or use direct selection if you know the exact tool name:
- `ToolSearch("select:mcp__playwright__browser_handle_dialog")`

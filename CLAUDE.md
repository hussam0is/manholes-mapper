# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

**Every code change must be committed and pushed immediately.** After any file edit (new feature, bug fix, refactor, config change, etc.), always `git add`, `git commit`, and `git push` to the `dev` branch before moving on. Use a concise commit message describing the change. Do not batch multiple unrelated changes into one commit — commit after each logical change. Only skip committing if the user explicitly says otherwise.

## Build & Dev Commands

```bash
npm run dev          # Vite only (frontend, HMR, no API routes) → localhost:5173
npm start            # Full stack via vercel dev (API routes + Vite) → localhost:3000
npm run build        # Production build → dist/
npm run preview      # Serve production build locally
npm run format       # Prettier
npm run mock:tsc3    # Start mock TSC3 receiver server (WS:8765, HTTP:3001)
```

**Android (Capacitor):**
```bash
npm run build:android   # Build + sync with Android
npm run open:android    # Open Android Studio
npm run run:android     # Run on device
```

**Database:**
```bash
npm run db:migrate      # Migrate Better Auth tables (needs POSTGRES_URL)
```

## Testing

```bash
npm run test:run                              # Run all tests (Vitest, ~490 tests)
npm run test:run tests/unit/gnss-state.test.ts  # Single test file
npm test                                      # Watch mode
```

Tests use jsdom environment. Setup in `tests/setup.ts` (loads `.env.local` for `POSTGRES_URL`). API tests hit real Neon Postgres. Test timeout: 30s.

**Test files (22 total):**
- `tests/unit/` — auth, auth-helpers, gnss-state, i18n, nmea-parser, permissions, project-canvas-state, projects-homepage, rate-limit, tsc3-parser, validators-extended
- `tests/api/` — contracts, sketches, system, validators
- `tests/` (root) — coordinates, edge-cases, map-coordinates, map-layer-integration, map-tile-visibility, security, sync-service

**E2E (Playwright):**
```bash
npx playwright test                    # Run E2E tests (Desktop + Mobile Chrome)
npx playwright test --project=chromium # Desktop only
BASE_URL=http://localhost:5173 npx playwright test  # Custom base URL
```

E2E config in `playwright.config.ts`. Tests in `tests/e2e/`. Runs `npm run dev` automatically via `webServer`. Projects: Desktop Chrome (Chromium) + Mobile Chrome (Pixel 5). Retries: 2 on CI, 0 locally. Screenshots/video on failure.

## Linting

```bash
npm run lint         # ESLint on src/**/*.{js,ts}
npm run lint:fix     # Auto-fix
```

ESLint 9+ flat config in `eslint.config.mjs`. **`src/legacy/main.js` is excluded** from linting (monolithic legacy code). Import order enforced: builtin → external → internal → parent/sibling.

## Claude Code Configuration

### MCP Servers (`.mcp.json`)

| Server | Purpose | Connection |
|--------|---------|------------|
| **playwright** | Browser automation for E2E testing | `npx @playwright/mcp@latest` |
| **postgres** | Direct Neon Postgres queries | `npx @modelcontextprotocol/server-postgres` with `POSTGRES_URL` |
| **vercel** | Vercel deployment management | `npx @mistertk/vercel-mcp@latest` with `VERCEL_API_KEY` |
| **phone-debug** | Physical phone testing via ADB/CDP | `node service/cdp-mcp/src/index.js` (CDP_HOST=localhost, CDP_PORT=9222) |

Phone-debug MCP provides: `cdp_*` tools (evaluate, screenshot, console, network), `gnss_*` tools (position, mock, capture), `app_*` tools (state, navigate, toast, sync, language, map, redraw), `adb_screenshot`.

### Agent Skills (`.claude/commands/`)

| Skill | File | Purpose |
|-------|------|---------|
| **manholes-mapper-god** | `manholes-mapper-god.md` (55KB) | Senior full-stack engineer with complete app knowledge. DB schema, API reference, RBAC, GNSS, state globals, deployment, investigation playbooks. Delegates to other skills. |
| **mobile-phone-tester** | `mobile-phone-tester.md` (57KB) | QA testing on physical Samsung Galaxy Note 10 via ADB. Screen coordinates, touch interaction, GNSS testing, service worker debugging. Chrome 144+ CDP broken — ADB-only. |
| **manholes-mapper-phone-user** | `manholes-mapper-phone-user.md` (10KB) | Field worker using PWA on Android. ADB commands, screen layout (1080x2280), user workflows (login, draw, GPS, export). |
| **manholes-mapper-user-tester** | `manholes-mapper-user-tester.md` (5KB) | QA via Playwright + Postgres. 5-phase testing workflow: observe, functional, security, data integrity, edge cases. |
| **mock-tsc3-controller** | `mock-tsc3-controller.md` (5KB) | Control mock TSC3 WebSocket server. HTTP API at localhost:3001 for sending survey points in ITM coordinates. |
| **init** | `init.md` | Session health check & auto-fix. Runs git status, lint, tests, build, SW version, dependency audit in parallel, then reports and auto-fixes critical issues. |
| **manholes-clickup** | `manholes-clickup.md` | Manage ClickUp tasks/subtasks for the project. Uses ClickUp MCP tools. List ID: `901815260471`. |
| **design-audit-loop** | `design-audit-loop.md` | Senior product designer running continuous design improvement loop. Captures screenshots, audits UX, delegates fixes to codesmith-engineer agents, verifies, iterates. Playwright MCP singleton — one browser agent at a time. |

### Spawnable Agent Types

Agents launched via the `Agent` tool with `subagent_type` parameter. Use `model: "opus"` for all spawned agents.

| Agent Type | Purpose |
|------------|---------|
| **general-purpose** | Multi-step research, code search, complex autonomous tasks. Has access to all tools. |
| **Explore** | Fast codebase exploration — find files by pattern, search code for keywords, answer structural questions. Thoroughness levels: quick/medium/very thorough. Read-only (no edits). |
| **Plan** | Software architect — designs implementation plans, identifies critical files, considers trade-offs. Read-only (no edits). |
| **code-reviewer** | Comprehensive code review for quality, structure, performance, maintainability. Use after writing/modifying code. |
| **codesmith-engineer** | Full-stack engineering — deep codebase understanding, multi-file implementations, performance optimization, ML integration, CI/CD. Has all tools. |
| **design-audit-loop-agent** | Autonomous design audit: researches app via Playwright, captures screenshots, audits UX, delegates fixes, verifies, iterates. Has Playwright MCP tools. |

### Settings (`.claude/settings.local.json`)

Post-tool-use hook: runs `scripts/check-phone-errors.sh` after Edit/Write/Bash (monitors phone error logs).

Allowed operations include: npm scripts, git commands, node execution, curl, Vercel CLI, MCP servers (playwright, postgres, vercel).

## Architecture Overview

**Manholes Mapper** is a PWA for field surveying — users draw manhole/pipe networks on an HTML5 Canvas with optional RTK GNSS positioning and cloud sync.

### Entry Point Flow

`index.html` → `src/main-entry.js` (ES module) → initializes CSS imports, i18n, auth, GNSS, menu system → loads `src/legacy/main.js` (core app logic, ~12300 lines).

**Critical load order:** `src/capacitor-api-proxy.js` must load before any `fetch()` calls (proxies API for Android native app).

CSS is imported via JS (`import '../styles.css'`) for Vite dev/build compatibility — there is no `<link>` tag in HTML.

### Key Directories

- **`src/legacy/main.js`** — Monolithic core: canvas rendering loop, event handlers, sketch CRUD, all panel logic. Being modularized incrementally. **Excluded from ESLint.**
- **`src/auth/`** — Better Auth client (`auth-client.js`), session guards (`auth-guard.js` with 5-min polling), React auth UI (`auth-provider.jsx`), sync-service (`sync-service.js` with 2s debounce, AbortController cleanup), permissions/RBAC (`permissions.js`)
- **`src/gnss/`** — Live Measure: GNSS state machine (`gnss-state.js` singleton), NMEA parsing (`nmea-parser.js` — GGA/RMC), browser-location-adapter (bridges `navigator.geolocation` → `gnssState`, infers fix quality from accuracy), Bluetooth/WiFi/mock adapters, connection manager, canvas marker rendering (`gnss-marker.js`), point capture dialog
- **`src/survey/`** — TSC3 survey controller integration: device picker dialog, TSC3 Bluetooth/WebSocket adapters (Trimble TSC3 receivers), TSC3 NMEA parser, survey node-type dialog, connection manager
- **`src/admin/`** — Admin panel (`admin-panel.js` ~26KB: Users/Orgs/Features tabs), admin settings (`admin-settings.js` ~25KB), input flow settings (`input-flow-settings.js` ~28KB: conditional field logic), project settings (`projects-settings.js` ~28KB)
- **`src/features/`** — Canvas drawing primitives (`drawing-primitives.js`), graph rendering engine (`rendering.js`), node icons (`node-icons.js` ~13KB: manhole, drainage, house connection icons)
- **`src/project/`** — Project canvas mode: `project-canvas-state.js` (multi-sketch Map, active/visibility tracking, sketch switching), `sketch-side-panel.js` (~14KB: collapsible list UI with per-sketch stats, issues sub-panel), `sketch-issues.js` (issue detection: missing coords, missing measurements, total km computation), `issue-highlight.js` (pulsing red ring animation), `last-edit-tracker.js` (tracks last edited position), `project-canvas-renderer.js` (background sketch rendering). **Issue navigation** in `sketch-side-panel.js` → `navigateToIssue()`: "my_location" button uses `goto` mode (`targetScale = 0.21`, 21% zoom — overview level), "swap_horiz" button uses `center_between` mode (dynamic zoom to fit issue + last edit position, capped at 5). Both call `window.__setViewState(scale, tx, ty)` and `startIssueHighlight()`. Zoom display: `viewScale * 100` → shown as percentage.
- **`src/menu/`** — Responsive menu system: `menu-events.js` (EventEmitter singleton with delegation), `menu-config.js`, `command-menu.js` (command palette), `action-bar.js`, `header.js`
- **`src/map/`** — `projections.js` (ITM/WGS84 via proj4, EPSG:2039), `govmap-layer.js` (~14KB: Israeli map tiles), `tile-manager.js` (~15KB: LRU cache), `reference-layers.js` (~18KB), `street-view.js`, `user-location.js` (geolocation permissions)
- **`src/utils/`** — `coordinates.js` (~27KB: CSV parsing/import), `csv.js` (export with formula injection prevention), `sketch-io.js` (JSON import/export, schema v1.1), `floating-keyboard.js` (~14KB: draggable numeric keyboard), `input-flow-engine.js` (~13KB: conditional field evaluation), `resizable-drawer.js`, `backup-manager.js` (hourly/daily), `label-collision.js`, `geometry.js`, `toast.js`, `encoding.js`
- **`src/state/`** — `constants.js` (NODE_RADIUS=20, COLORS_LIGHT/DARK palettes, node/edge material/type/diameter catalogs, `isDarkMode()`), `persistence.js` (IndexedDB ↔ localStorage bridging, STORAGE_KEYS)
- **`src/dom/`** — `dom-utils.js` (CSS variable sync: `--app-height`, `--header-h`, visualViewport API for mobile)
- **`src/graph/`** — `id-utils.js` (numeric ID detection, home internal ID generation)
- **`src/serviceWorker/`** — `register-sw.js` (SW registration, 15-min update checks, offline refresh guards)
- **`src/db.js`** — IndexedDB wrapper: stores `sketches`, `currentSketch`, `syncQueue`, `backups` (DB version 2)
- **`src/i18n.js`** — Full translation dictionary (~37KB) for Hebrew/English
- **`src/main-entry.js`** — App entry (~634 lines): auth, i18n, GNSS, menu init, mobile menu, floating keyboard, drawer, FAB toolbar
- **`src/capacitor-api-proxy.js`** — API proxy for Capacitor native (redirects `/api/*` to production)
- **`src/canvas-fab-toolbar.js`** — Floating action button speed dial
- **`src/cockpit/`** — Gamification/mission-control dashboard: `cockpit.js` (~18KB: landscape-first layout, health card, stats), `action-rail.js` (~6KB: contextual action buttons), `completion-engine.js` (~7KB: sketch completeness scoring), `intel-strip.js` (~14KB: smart suggestions), `quick-wins.js` (~10KB: actionable improvement tasks), `session-tracker.js` (~13KB: work session timing and streaks)
- **`src/three-d/`** — 3D sketch visualization (Three.js, dynamically imported): `three-d-view.js` (main overlay with OrbitControls, CSS2D labels), `three-d-scene.js` (scene builder — nodes as spheres, edges as tubes), `three-d-materials.js` (edge-type color materials), `three-d-camera-framing.js` (initial camera position), `three-d-fps-controls.js` (WASD + mouse FPS navigation), `three-d-joystick.js` (virtual joystick for mobile), `three-d-miniature.js` (miniature/diorama mode), `three-d-issues.js` (3D issue highlighting)
- **`src/pages/`** — Hash-routed full-page views: `profile-page.js` (user profile with stats), `leaderboard-page.js` (org-wide leaderboard), `project-stats-page.js` (per-project analytics)

### API Routes (`api/`)

All routes require Better Auth session. Rate limited: 100 req/min (20 for auth). CORS configured. Responses use camelCase (DB uses snake_case).

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/*` | ALL | Better Auth handler (signIn, signUp, signOut, session) |
| `/api/sketches` | GET, POST | List sketches (role-filtered, paginated), create sketch, assign orphans |
| `/api/sketches/[id]` | GET, PUT, DELETE, POST | Sketch CRUD + lock operations (lock/unlock/refresh/forceUnlock, 30-min expiry) |
| `/api/projects` | GET, POST | List projects (admin), create project |
| `/api/projects/[id]` | GET, PUT, DELETE, POST | Project CRUD + duplicate. GET supports `?fullSketches=true` for project-canvas |
| `/api/organizations` | GET, POST | List/create orgs (admin/super_admin) |
| `/api/organizations/[id]` | GET, PUT, DELETE | Org CRUD (super_admin) |
| `/api/users` | GET | List users (admin sees org, super_admin sees all) |
| `/api/users/[id]` | GET, PUT | User details, update role/org |
| `/api/user-role` | GET | Current user's role, permissions, features. Auto-creates user record. |
| `/api/features/:targetType/:targetId` | GET, PUT | Feature flags per user/org |
| `/api/layers`, `/api/layers/[id]` | GET, POST, PUT, DELETE | Project GeoJSON layers (admin) |
| `/api/issue-comments` | GET, POST | Issue node comments, close/reopen, notifications |
| `/api/notifications` | GET, POST | Unread notifications (GET with `?count=true` for count), mark read |
| `/api/stats/leaderboard` | GET | Accuracy leaderboard per project (`?projectId=UUID`) |

**API library (`api/_lib/`):**
- `auth.js` — `verifyAuth()`, `parseBody()` (15MB limit), header/cookie helpers
- `db.js` — All DB operations: sketch/project/org/user/feature/layer/lock CRUD, `ensureDb()` table creation
- `validators.js` — MAX_NODES=10000, MAX_EDGES=50000, UUID validation, sketch/user/org/feature input validation
- `rate-limit.js` — Sliding window per-IP, 60s window, in-memory per serverless instance
- `cors.js` — Origin resolution, Capacitor `https://localhost` always allowed

**Server library (`lib/auth.js`):** Better Auth config — Neon Postgres, email/password auth, 7-day sessions, 5-min cookie cache, cross-origin for Capacitor.

### Database Schema

**Application tables:** `organizations`, `projects`, `sketches` (nodes/edges JSON, adminConfig, project_id FK), `users` (role, organization_id FK), `user_features`, `project_layers` (GeoJSON, style), `sketch_locks` (30-min expiry)

**Better Auth tables:** `user`, `session`, `account`, `verification`

**Roles:** `user` (own sketches), `admin` (org resources), `super_admin` (everything)

**Feature flags:** `export_csv`, `export_sketch`, `admin_settings`, `finish_workday`, `node_types`, `edge_types`

### Data Flow

1. **Canvas** — Users draw nodes/edges on HTML5 Canvas. Coordinates go through: WGS84 → ITM (proj4) → Canvas World → Screen pixels (via `viewScale`, `stretchX/Y`, `viewTranslate`)
2. **Persistence** — localStorage (primary, synchronous) + IndexedDB (backup, async) + cloud Postgres (source of truth via sync-service)
3. **Sync** — Online: immediate POST to `/api/sketches/{id}`. Offline: queued in IndexedDB `syncQueue`, drained on reconnect. `syncService.onSyncStateChange` notifies UI.
4. **Auth** — Better Auth with Neon Postgres. Session cookies (7-day expiry). `auth-guard.js` redirects unauthenticated users to login panel. 5-min session polling.

### Internationalization

`src/i18n.js` exports translations for `he` (Hebrew, RTL, default) and `en` (English). Access via `t('dotted.key')` in JS or `data-i18n="key"` attribute on HTML elements. Both languages must always be kept in sync — every key added to `he` must also be added to `en`.

### CSS Architecture

`styles.css` uses CSS custom properties (design tokens) with dark mode via `@media (prefers-color-scheme: dark)`. Dark mode tokens defined in `:root` override: `--color-surface-alt`, `--color-accent`, `--color-text-bright`, etc. — use these tokens rather than hardcoding hex values in dark mode blocks. `src/menu/menu.css` has menu-specific styles. Tailwind CSS 4.x used for utility classes (default config, no tailwind.config file).

### Service Worker & Caching

`public/service-worker.js` uses versioned caches (`APP_VERSION`, currently v36). **Bump `APP_VERSION`** whenever non-fingerprinted files (service-worker.js, styles.css) change — this forces browsers to pick up updates. Vite-built JS/CSS under `/assets/` are fingerprinted and cached automatically.

**Caching strategies:** Navigation → network-first (fallback `offline.html`). `/assets/*` → cache-first (fingerprinted). Google Fonts → cache-first. Other same-origin GET → stale-while-revalidate. `/api/*` → skip SW entirely.

**Precache list:** `index.html`, `offline.html`, `manifest.json`, `styles.css`, `fonts/material-icons.woff2`, `app_icon.png`, `health/index.html`.

**Registration:** `src/serviceWorker/register-sw.js` — HTTPS/localhost only, 15-min update checks, offline refresh guards (blocks F5, beforeunload, swipe-refresh).

### Vite Build

Stable output filenames: `main.js`, `styles.css` (for service worker compatibility). Chunk size warning: 1000KB. Code splitting:
- `better-auth` → `auth` chunk
- `react`, `scheduler` → `react-vendor` chunk
- Other `node_modules` → `vendor` chunk

HTTPS dev mode via mkcert available (`@vitejs/plugin-basic-ssl`). HMR disabled under `vercel dev` (manual refresh required). Port from `PORT` env var or 5173.

### Cross-Module Integration (Window Globals)

ES modules communicate with `src/legacy/main.js` via window globals since the monolith can't use ES imports:

**Canvas state (set by main.js):**
- `window.__getActiveSketchData()` / `window.__setActiveSketchData(data)` — Snapshot/restore sketch state for project canvas switching
- `window.__scheduleDraw()` — Trigger canvas redraw from any module
- `window.__setViewState(scale, tx, ty)` — Set `viewScale`/`viewTranslate` programmatically (e.g., issue navigation)
- `window.__getStretch()` → `{ x, y }` — Read current stretch factors
- `window.__setLastEditPosition(x, y)` — Track last edited element position
- `window.__projectCanvas` — Object with `isProjectCanvasMode()`, `getBackgroundSketches()`, `findNodeInBackground()`, `findEdgeInBackground()`, `switchActiveSketch()`
- `window.__sketchReadOnly` — Read-only mode flag
- `window.__issueHighlight` — `{ start(worldX, worldY, durationMs), draw(ctx, ...) }`

**App-level (set by main-entry.js):**
- `window.t(key, ...args)` / `window.isRTL()` — i18n translator and RTL check
- `window.showToast(msg)` — Toast notification
- `window.escapeHtml(str)` — XSS prevention
- `window.authGuard` — Auth guard API (`getAuthState`, `onAuthStateChange`, `guardRoute`, etc.)
- `window.menuEvents` — Menu system event bus
- `window.CONSTS` — State constants

### Keyboard Shortcuts

`N` = Node mode, `E` = Edge mode, `+`/`=` = Zoom In, `-` = Zoom Out, `0` = Reset Zoom, `Esc` = Cancel/clear selection, `Delete`/`Backspace` = Delete selected item.

## Scripts (`scripts/`)

| Script | Command | Purpose |
|--------|---------|---------|
| `mock-tsc3/server.mjs` | `npm run mock:tsc3` | Mock TSC3 WebSocket (WS:8765) + HTTP control (3001). Broadcasts ITM survey points. |
| `migrate-auth-tables.js` | `npm run db:migrate` | Create Better Auth tables (user, session, account, verification) |
| `import-sketches.mjs` | `node scripts/import-sketches.mjs [dataDir]` | Import sketch JSON + merge coordinates from CSV |
| `setup-data.mjs` | `node scripts/setup-data.mjs` | One-time init: create geopoint_plus org + me_rakat project |
| `setup_me_rakat.js` | `node scripts/setup_me_rakat.js` | Create org, project, import GIS layers with styles |
| `query-all-data.js` | `node scripts/query-all-data.js` | Database audit: orgs, users, projects, sketches, features summary |
| `delete-empty-sketches.js` | `node scripts/delete-empty-sketches.js` | Remove sketches with no nodes/edges |
| `test-db-connection.js` | `node scripts/test-db-connection.js` | Verify Postgres connection, init schema, count records |
| `test_app.mjs` | `node scripts/test_app.mjs` | Smoke test via Playwright CDP |
| `slim_geojson.js` | `node scripts/slim_geojson.js` | Reduce GeoJSON file size (strip verbose properties) |

## Deployment

- **`dev` branch** → Vercel Preview deployment (auto)
- **Production** → `npx vercel promote <preview-url>` (promotes preview to production)
- Production URL: `https://manholes-mapper.vercel.app`
- Preview URL: `https://manholes-mapper-git-dev-hussam0is-projects.vercel.app`
- After promoting, wait ~1 min for CDN cache invalidation
- **Bump `APP_VERSION`** in `public/service-worker.js` after promoting if non-fingerprinted files changed — phones serve stale-while-revalidate cached JS indefinitely without this

### Vercel Route Configuration

`vercel.json` rewrites `/api/auth/:path*` and `/api/layers/:path*` to single handlers. CSP and security headers (HSTS, X-Frame-Options, Referrer-Policy) are configured there. API responses have `Cache-Control: no-store, max-age=0`. Geolocation permission enabled, microphone/camera disabled.

## Environment Variables

Required on Vercel: `BETTER_AUTH_SECRET`, `POSTGRES_URL`. Optional: `BETTER_AUTH_URL`, `ALLOWED_ORIGINS`.

For local API tests: set `POSTGRES_URL` in `.env.local`.

`.env.local` also contains: `POSTGRES_URL_NON_POOLING` (migrations), `DATABASE_URL`, `PGHOST`/`PGUSER`/`PGPASSWORD`, `VERCEL_API_KEY`, `NEON_PROJECT_ID`.

## Tech Stack

**Frontend:** Vite 7.x, vanilla JS (ES modules), HTML5 Canvas, React 19 (auth UI only), Tailwind CSS 4.x, proj4 (coordinate transforms)

**Backend:** Vercel serverless functions (Node.js), Better Auth 1.4.x, Neon Postgres (`@neondatabase/serverless`), `@vercel/postgres`

**Mobile:** Capacitor 8.x (Android), Bluetooth SPP plugin, WiFi TCP plugin

**Testing:** Vitest 4.x (unit, ~490 tests), Playwright 1.58.x (E2E), jsdom 28.x

**Tooling:** ESLint 9.x (flat config), Prettier 3.x, TypeScript 5.9.x (`strict: false`)

## Conventions

- **ES Modules** throughout (`"type": "module"` in package.json)
- TypeScript config with `"strict": false` (gradual migration). Path alias: `@/*` → `src/*`.
- Mobile-first: test all UI changes at 360px width. Canvas toolbar and panels must work on touch devices.
- RTL: all panels must work correctly in Hebrew (RTL). Use `margin-inline-*` / `padding-inline-*` over `margin-left`/`margin-right`.
- Material Icons self-hosted at `public/fonts/material-icons.woff2` (CSP blocks CDN loading).
- Health monitoring page at `/health/`.
- `index.html` defaults to `<html lang="he" dir="rtl">` (Hebrew RTL).
- Hash-based SPA routing: `#/`, `#/login`, `#/signup`, `#/admin`, `#/projects`.
- State management: singleton pattern with listener callbacks (gnssState, menuEvents, projectSketches).
- Legacy ↔ modern communication via window globals (documented above).

## Capacitor (Android)

App ID: `com.geopoint.manholemapper`. Web dir: `dist/`. Cleartext enabled for dev. Android scheme: `https`.

**Installed plugins:** `@capacitor/core` 8.x, `@capacitor/android` 8.x, `@e-is/capacitor-bluetooth-serial` 6.x (Bluetooth SPP for TSC3 & GNSS receivers). WiFi TCP (`capacitor-tcp-socket`) referenced in code but may need manual install.

**API Proxy (`src/capacitor-api-proxy.js`):** On native Android, the WebView runs on `https://localhost` with no backend. This module wraps `window.fetch()` to intercept `/api/*` calls and route them to `https://manholes-mapper.vercel.app` with `credentials: 'include'`. **Must load before any fetch() calls** in `src/main-entry.js`.

**Build flow:**
1. `npm run build` → produces `dist/`
2. `npm run build:android` → syncs `dist/` to `android/app/src/main/assets/www/`
3. `npm run open:android` → opens Android Studio
4. Build & run from Android Studio (signing config optional for dev)

## TSC3 Survey Controller Connection (`src/survey/`)

The app connects to Trimble TSC3 survey controllers to receive real-time survey points (ITM coordinates).

**Two connection methods:**

### Bluetooth SPP (`tsc3-bluetooth-adapter.js`)
- Plugin: `@e-is/capacitor-bluetooth-serial` (requires Capacitor native runtime)
- Android 12+ needs `BLUETOOTH_CONNECT` and `BLUETOOTH_SCAN` permissions (requested at runtime)
- Uses `plugin.connect({ address })` → `plugin.startNotifications({ delimiter: '\n' })` → `plugin.addListener('onRead', cb)`

### WebSocket Bridge (`tsc3-websocket-adapter.js`)
- Protocol: `ws://` (HTTP) or `wss://` (HTTPS), default port **8765**
- Exponential backoff reconnection: max 5 attempts, initial 1s delay
- Desktop testing: connect to `localhost:8765` (mock server)
- Phone on LAN: connect to `ws://<LAN_IP>:8765`
- Phone via ADB: `adb reverse tcp:8765 tcp:8765` then `localhost:8765`

**Data format:** CSV lines — `PointName,Easting,Northing,Elevation\n`

**Parser (`tsc3-parser.js`):** Auto-detects delimiter (tab/comma/space) and column order (NEN vs NNE) using ITM heuristics. Validates ITM ranges: easting 100k–300k, northing 400k–800k, elevation -500–2000.

**Connection flow (`tsc3-connection-manager.js`):**
1. User selects device via `device-picker-dialog.js` (filters for Trimble/TSC names)
2. Incoming point → parser extracts `{ pointName, easting, northing, elevation }`
3. If node with matching name exists → updates coordinates silently
4. If new point → opens `survey-node-type-dialog.js` for type selection (Manhole, Valve, etc.)
5. Points queue if dialog is open, processed sequentially

**Mock TSC3 server (`scripts/mock-tsc3/server.mjs`):** `npm run mock:tsc3` starts WS on port 8765 + HTTP control API on port 3001. HTTP endpoints: `GET /api/status`, `POST /api/send-point`, `POST /api/send-batch`, `GET /api/history`, `POST /api/clear-history`. Web UI at `http://localhost:3001`.

## GNSS Receiver Connection (`src/gnss/`)

The app connects to GNSS receivers for live RTK positioning. Three adapter types, one active at a time.

### Bluetooth SPP (`bluetooth-adapter.js`)
- Same plugin as TSC3: `@e-is/capacitor-bluetooth-serial`
- Targets: Trimble R780, Trimble R2 (via TMM)
- Data: NMEA sentences (GGA, RMC) parsed by `nmea-parser.js`

### WiFi TCP (`wifi-adapter.js`)
- Plugin: `capacitor-tcp-socket` (may need manual install)
- Default port: **5017** (Trimble receivers)
- Auto-reconnection with exponential backoff (max 5 attempts)

### Browser Location (`browser-location-adapter.js`)
- Bridges `navigator.geolocation.watchPosition()` → `gnssState`
- Primary workflow: TMM (Trimble Mobile Manager) feeds R2 RTK as Android mock location → Chrome geolocation API picks it up
- Infers fix quality from accuracy: <0.05m=RTK Fixed, <0.5m=RTK Float, <5m=DGPS, <15m=GPS

### Mock Adapter (`mock-adapter.js`)
- Testing without hardware. Default position: Tel Aviv (32.0853, 34.7818)
- Configurable fix quality: 0=Invalid, 1=GPS, 2=DGPS, 4=RTK Fixed, 5=RTK Float

**State machine (`gnss-state.js`):** Singleton `gnssState` tracks connection state (disconnected/connecting/connected/error), position (lat/lon/accuracy/fixQuality/satellites/hdop), and captured points. Events: `on('position', cb)`, `on('connection', cb)`.

**Marker rendering (`gnss-marker.js`):** Draws accuracy circle + position dot with fix-quality color coding on canvas. Uses `ctx.setTransform(1,0,0,1,0,0)` to draw in screen space (DPR-aware).

**Auto-centering:** On first valid GPS fix in empty sketch, calls `setMapReferencePoint()` + `centerOnGpsLocation()` (`_liveMeasureFirstFixDone` flag).

## Phone-Debug MCP Server (`service/cdp-mcp/`)

Custom MCP server for remote phone browser debugging via Chrome DevTools Protocol.

**Setup:**
```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote   # Forward Chrome CDP
adb reverse tcp:8765 tcp:8765                                # Forward mock TSC3 (optional)
```

**Tools (31 total):** CDP core (list tabs, connect, evaluate JS, console logs, screenshots, network log), GNSS (get state/position/connection, watch position, trigger mock, capture point), App control (get state, navigate hash routes, toast, get sketch info, trigger sync, set language, center map, toggle live measure, force redraw), ADB screenshot (no CDP required).

**Known issue:** Chrome 144+ has broken CDP WebSocket — `cdp_connect` always fails. Use `adb_screenshot` and `cdp_evaluate` (after manual tab detection) or ADB-only interaction.

## Phone Testing (Galaxy Note 10)

- Device: Samsung Galaxy Note 10, Android 12, 1080x2280px, density 420dpi
- Chrome 144+ has broken CDP WebSocket — use ADB-only testing
- ADB screenshot scale factor: ~1.45 (multiply visual coords by 1.45 for ADB tap)
- **NEVER** run `pm clear com.android.chrome` or `adb kill-server`
- Service worker must be bumped (`APP_VERSION` in `public/service-worker.js`) after deploying non-fingerprinted changes
- Deploy-test cycle: push to `dev` → wait 2 min → `npx vercel promote` → bump SW version
- Use `manholes-mapper-phone-user` or `mobile-phone-tester` skills for phone interaction

## Ports & Defaults

| Service | Protocol | Port | Notes |
|---------|----------|------|-------|
| Vite Dev | HTTP | 5173 | Frontend only (HMR) |
| Vercel Dev | HTTP | 3000 | Full stack (API routes) |
| Mock TSC3 WS | WebSocket | 8765 | Survey controller simulator |
| Mock TSC3 HTTP | HTTP | 3001 | Control API + Web UI |
| Chrome CDP | TCP | 9222 | Phone debugging (via ADB forward) |
| GNSS WiFi TCP | TCP | 5017 | Trimble receiver default |

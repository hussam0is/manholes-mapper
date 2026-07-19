# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

**Every code change must be committed and pushed immediately.** After any file edit (new feature, bug fix, refactor, config change, etc.), always `git add`, `git commit`, and `git push` to the `dev` branch before moving on. Use a concise commit message describing the change. Do not batch multiple unrelated changes into one commit — commit after each logical change. Only skip committing if the user explicitly says otherwise.

**Every push to `dev` auto-deploys to production — verify it.** Since 2026-07-15 the project lives on Vercel team `gis-6579s-projects` and **`dev` is the production branch**: pushing to `dev` triggers a production build directly (no promote step). After pushing, run the `vercel-promote` skill ([.claude/skills/vercel-promote/SKILL.md](./.claude/skills/vercel-promote/SKILL.md)) to wait for the build to be Ready and verify `https://manholes-mapper-three.vercel.app/api/health`. A PostToolUse hook (`.claude/hooks/promote-on-push-reminder.mjs`) reminds you after each `git push`. Only skip verifying if the user explicitly says otherwise.

## Build & Dev Commands

```bash
npm run dev          # Vite only (frontend, HMR; /api is PROXIED TO PRODUCTION — writes hit the real prod DB) → localhost:5173
npm start            # Full stack via vercel dev (API routes + Vite) → localhost:3000
npm run build        # Production build → frontend/dist/
npm run preview      # Serve production build locally
npm run format       # Prettier
npm run mock:tsc3    # Start mock TSC3 receiver server (WS:8765, HTTP:3001)
npm run dashboard    # Codebase dashboard (scripts/codebase-dashboard.mjs)
npm run soak         # Soak-testing suite (scripts/soak/run-soak.mjs, node --expose-gc); also soak:quick / soak:extended
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
npm run test:run                                   # Run all unit tests (Vitest, ~1790 tests)
npm run test:run -- tests/unit/gnss-state.test.ts  # Single test file (paths relative to frontend/, the vitest root)
npm test                                           # Watch mode
```

Config in `frontend/vitest.config.ts`: jsdom environment, setup in `frontend/tests/setup.ts` (loads `.env.local`), 30s test timeout, `pool: 'forks'` with `maxWorkers: 4` (prevents worker crashes on Windows). Path aliases rewrite `../api/_lib` imports to the repo-root `api/_lib/`.

**The default run excludes `tests/e2e/**` (Playwright) and `tests/api/**` (integration tests that hit real Neon Postgres and need `POSTGRES_URL` in `.env.local`).**

**Test layout (~70 files):**
- `frontend/tests/unit/` — the bulk of tests: auth, GNSS, i18n, canvas rendering, cockpit, field-commander, three-d, project canvas, admin panels, validators, etc.
- `frontend/tests/api/` — contracts, sketches, system, validators (real DB, excluded by default)
- `frontend/tests/` (root) — coordinates, edge-cases, map-coordinates, map-layer-integration, map-tile-visibility, security, sync-service
- `frontend/tests/state/` — app-state, event-bus (in the default run); shared fixtures in `frontend/tests/fixtures/`

A second Playwright config `frontend/playwright-headed.config.ts` exists for headed runs; the main config writes JUnit results to `frontend/qa-skill/reporting/e2e-junit.xml`.

**E2E (Playwright):**
```bash
npx playwright test                    # Run E2E tests (Desktop + Mobile Chrome)
npx playwright test --project=chromium # Desktop only
BASE_URL=http://localhost:5173 npx playwright test  # Custom base URL
```

E2E config in `frontend/playwright.config.ts`. ~17 specs in `frontend/tests/e2e/` (auth, canvas-drawing, cockpit, project-canvas, rtl-layout, tsc5-field-workflows, …). Runs `npm run dev` automatically via `webServer`. Projects: Desktop Chrome (Chromium) + Mobile Chrome (Pixel 5). Retries: 2 on CI, 0 locally. Screenshots/video on failure.

### QA Expert Workflow (`qa-skill/`)

Repo-root `qa-skill/` holds cross-platform QA runners: `./qa-skill/run_qa.ps1` (Windows) / `./qa-skill/run_qa.sh`, with results in `qa-skill/reporting/`. The QA-expert workflow (from `.cursor/rules/qa-expert.mdc`, scoped to tests/**, src/**, api/**): (1) discover stack/test tooling, (2) draft a plan across Unit/Integration/API/E2E/Security/Performance suites, (3) implement prioritizing auth + sketch/node/edge CRUD critical paths, data mutations, and security boundaries, (4) execute via the run_qa runner and summarize from qa-skill/reporting/. Standards: Vitest unit tests with mocked externals, Playwright E2E on critical journeys, API schema+auth validation, `npm audit` + exposed-secret checks.

## Linting

```bash
npm run lint         # ESLint on frontend/src/**/*.{js,ts}
npm run lint:fix     # Auto-fix
```

ESLint 9+ flat config in `frontend/eslint.config.mjs`. **`frontend/src/legacy/main.js` is excluded** from linting (legacy core). Import order enforced: builtin → external → internal → parent/sibling.

## Claude Code Configuration

### MCP Servers (`.mcp.json`)

| Server | Purpose | Connection |
|--------|---------|------------|
| **playwright** | Browser automation for E2E testing | `npx @playwright/mcp@latest` |
| **postgres** | Direct Neon Postgres queries | `npx @modelcontextprotocol/server-postgres` with `POSTGRES_URL` |
| **vercel** | Vercel deployment management | `npx @mistertk/vercel-mcp@latest` with `VERCEL_API_KEY` |
| **phone-debug** | Physical phone testing via ADB/CDP | `node service/cdp-mcp/src/index.js` (CDP_HOST=localhost, CDP_PORT=9222) |
| **clickup** | ClickUp task management (used by manholes-clickup skill + voice-notify hook) | `npx clickup-mcp-server` with `CLICKUP_API_TOKEN` |
| **figma** | Official Figma MCP | HTTP `https://mcp.figma.com/mcp` |

Phone-debug MCP provides: `cdp_*` tools (evaluate, screenshot, console, network), `gnss_*` tools (position, mock, capture), `app_*` tools (state, navigate, toast, sync, language, map, redraw), `adb_screenshot`.

### Agent Skills (`.claude/commands/`)

| Skill | File | Purpose |
|-------|------|---------|
| **manholes-mapper-god** | `manholes-mapper-god.md` | Senior full-stack engineer with complete app knowledge. DB schema, API reference, RBAC, GNSS, state globals, deployment, investigation playbooks. Delegates to other skills. |
| **mobile-phone-tester** | `mobile-phone-tester.md` | QA testing on physical Samsung Galaxy Note 10 via ADB. Screen coordinates, touch interaction, GNSS testing, service worker debugging. Chrome 144+ CDP broken — ADB-only. |
| **manholes-mapper-phone-user** | `manholes-mapper-phone-user.md` | Field worker using PWA on Android. ADB commands, screen layout (1080x2280), user workflows (login, draw, GPS, export). |
| **manholes-mapper-user-tester** | `manholes-mapper-user-tester.md` | QA via Playwright + Postgres. 5-phase testing workflow: observe, functional, security, data integrity, edge cases. |
| **mock-tsc3-controller** | `mock-tsc3-controller.md` | Control mock TSC3 WebSocket server. HTTP API at localhost:3001 for sending survey points in ITM coordinates. |
| **brutal-critic** | `brutal-critic.md` | Harsh design/UX critique pass over the app. |
| **init** | `init.md` | Session health check & auto-fix. Runs git status, lint, tests, build, SW version, dependency audit in parallel, then reports and auto-fixes critical issues. |
| **manholes-clickup** | `manholes-clickup.md` | Manage ClickUp tasks/subtasks for the project. Uses ClickUp MCP tools. List ID: `901815260471`. |
| **design-audit-loop** | `design-audit-loop.md` | Senior product designer running continuous design improvement loop. Captures screenshots, audits UX, delegates fixes to codesmith-engineer agents, verifies, iterates. Playwright MCP singleton — one browser agent at a time. |
| **vercel-promote** | `.claude/skills/vercel-promote/SKILL.md` | Verify the auto-deploy of dev → production on Vercel (dev IS the production branch since 2026-07-15). Run after **every** push to dev (enforced by the promote-on-push PostToolUse hook). |

### Spawnable Agent Types

Agents launched via the `Agent` tool with `subagent_type` parameter.

| Agent Type | Purpose |
|------------|---------|
| **general-purpose** | Multi-step research, code search, complex autonomous tasks. Has access to all tools. |
| **Explore** | Fast codebase exploration — find files by pattern, search code for keywords, answer structural questions. Read-only (no edits). |
| **Plan** | Software architect — designs implementation plans, identifies critical files, considers trade-offs. Read-only (no edits). |
| **code-reviewer** | Comprehensive code review for quality, structure, performance, maintainability. Use after writing/modifying code. |
| **codesmith-engineer** | Full-stack engineering — deep codebase understanding, multi-file implementations, performance optimization, CI/CD. Has all tools. |
| **design-audit-loop-agent** | Autonomous design audit: researches app via Playwright, captures screenshots, audits UX, delegates fixes, verifies, iterates. Has Playwright MCP tools. |

Only `design-audit-loop-agent` is defined in-repo (`.claude/agents/`); `code-reviewer`, `codesmith-engineer`, and `deep-code-reviewer` are user-level agents on this machine (`~/.claude/agents/`) and won't exist for other contributors.

### Settings

`.claude/settings.json` (committed): PostToolUse hook on `Bash|PowerShell` → `node .claude/hooks/promote-on-push-reminder.mjs` (the after-push deploy reminder).

`.claude/settings.local.json` (machine-local): PostToolUse hook — `mcp__clickup__.*` tools trigger `.claude/hooks/clickup-voice-notify.sh`. Permissions: `enableAllProjectMcpServers: true`; `enabledMcpjsonServers`: playwright, postgres, vercel, clickup; plus npm/git/node/curl/Vercel-CLI allows.

## Architecture Overview

**Manholes Mapper** is a PWA for field surveying — users draw manhole/pipe networks on an HTML5 Canvas with optional RTK GNSS positioning and cloud sync.

### Project Structure

The project is organized into two main areas:
- **`frontend/`** — Vite app (src, public, tests, config files)
- **`api/`** + **`lib/`** — Vercel serverless functions (kept at root for zero-config deployment)

### Entry Point Flow

`frontend/index.html` → `frontend/src/main-entry.js` (ES module) → initializes CSS imports, i18n, auth, GNSS, menu system → loads `frontend/src/legacy/main.js` (core canvas loop and event wiring).

**Critical load order:** `frontend/src/capacitor-api-proxy.js` must load before any `fetch()` calls (proxies API for Android native app), immediately followed by `frontend/src/auth/csrf.js` which also wraps `window.fetch()` (x-csrf-token double-submit header). `design-system-v2.css` is imported alongside `styles.css`.

CSS is imported via JS (`import '../styles.css'`) for Vite dev/build compatibility — there is no `<link>` tag in HTML.

### Key Directories (`frontend/src/`)

- **`legacy/`** — The original monolith, now mostly modularized into ~24 files. `main.js` (~2100 lines, still ESLint-excluded) holds the canvas render loop and top-level wiring. Extracted modules include: `shared-state.js` (window-globals bridge for legacy ↔ ES module communication), `canvas-draw.js`, `pointer-handlers.js`, `graph-crud.js`, `details-panel.js`, `storage-manager.js`, `undo-redo.js`, `gnss-handlers.js`, `tsc3-handlers.js`, `admin-handlers.js`, `library-manager.js`, `coordinate-handlers.js`, `finish-workday.js`, `field-history.js`, `wizard-helpers.js`, `home-renderer.js`, `auth-ui.js`, `i18n-ui.js`, `mobile-menu.js`, `toolbar-events.js`, `project-ui.js`, `view-utils.js`, `app-utils.js`, `legacy-import-loader.js`
- **`auth/`** — Better Auth client (`auth-client.js`), session guards (`auth-guard.js` with 15-min polling), React auth UI (`auth-provider.jsx`), sync-service (`sync-service.js` with 2s debounce, AbortController cleanup), permissions/RBAC (`permissions.js`)
- **`gnss/`** — Live Measure: GNSS state machine (`gnss-state.js` singleton), NMEA parsing (`nmea-parser.js` — GGA/RMC), browser-location-adapter (bridges `navigator.geolocation` → `gnssState`, infers fix quality from accuracy), Bluetooth/WiFi/TMM/mock adapters, connection manager, canvas marker rendering (`gnss-marker.js`), point capture dialog, precision-gated measurement (`precision-measure.js`)
- **`survey/`** — TSC3 survey controller integration: device picker dialog, TSC3 Bluetooth/WebSocket adapters (Trimble TSC3 receivers), TSC3 NMEA parser, survey node-type dialog, connection manager
- **`admin/`** — Admin tab modules lazy-imported by the hub `legacy/admin-handlers.js`: `admin-users.js`, `admin-organizations.js`, `admin-features.js`, `admin-fixes.js` (cross-sketch issues & fix suggestions), `admin-statistics.js` (KPI dashboard), `admin-settings.js`, `input-flow-settings.js` (conditional field logic), `projects-settings.js`
- **`features/`** — Canvas drawing primitives (`drawing-primitives.js`), graph rendering engine (`rendering.js`), node icons (`node-icons.js`: manhole, drainage, house connection icons), measurement rail (`measurement-rail.js`)
- **`project/`** — Project canvas mode: `project-canvas-state.js` (multi-sketch Map, active/visibility tracking, sketch switching), `sketch-side-panel.js` (collapsible list UI with per-sketch stats, issues sub-panel, issue navigation via `window.__setViewState` + `startIssueHighlight`), `sketch-issues.js` (issue detection: missing coords, missing measurements, total km computation), `issue-highlight.js` (pulsing red ring animation), `issue-nav-state.js`, `fix-suggestions.js`, `merge-mode.js` (duplicate node merging), `last-edit-tracker.js`, `project-canvas-renderer.js` (background sketch rendering), `project-loading-overlay.js`
- **`menu/`** — Responsive menu system: `menu-events.js` (EventEmitter singleton with delegation), `menu-config.js`, `command-menu.js` (command palette), `action-bar.js`, `header.js`
- **`map/`** — `projections.js` (ITM/WGS84 via proj4, EPSG:2039), `govmap-layer.js` (Israeli map tiles), `tile-manager.js` (LRU cache), `reference-layers.js`, `annotation-layer.js` (Leaflet Geoman zones/polygons, autosaved to IndexedDB), `layers-config.js`, `street-view.js`, `user-location.js` (geolocation permissions)
- **`cockpit/`** — Gamification/mission-control dashboard: `cockpit.js` (landscape-first layout, health card, stats), `action-rail.js`, `completion-engine.js` (sketch completeness scoring), `intel-strip.js` (smart suggestions), `quick-wins.js`, `session-tracker.js`
- **`field-commander/`** — Mobile UI shell: `fc-shell.js`, `fc-gestures.js`, `fc-panels.js`, `fc-territory.js` (zone-based work assignment), `fc-xp.js` / `fc-achievements.js` (gamification)
- **`layout/`** — `layout-manager.js`, `unified-sidebar.js`, `unified-toolbar.js`, `micro-status-bar.js` (GPS accuracy HUD badge, offline chip)
- **`three-d/`** — 3D sketch visualization (Three.js, dynamically imported): `three-d-view.js` (main overlay with OrbitControls, CSS2D labels), `three-d-scene.js` (nodes as spheres, edges as tubes), materials, camera framing, FPS controls (WASD + mouse), virtual joystick (mobile), miniature/diorama mode, 3D issue highlighting
- **`pages/`** — Hash-routed full-page views: `profile-page.js`, `leaderboard-page.js`, `project-stats-page.js`, `metadata-dashboard.js`
- **`utils/`** — `coordinates.js` (CSV parsing/import, BFS coordinate propagation), `csv.js` (export with formula injection prevention), `sketch-io.js` (JSON import/export, schema v1.1), `legacy-import.js` (legacy sketch + ITM CSV conversion), `floating-keyboard.js` (draggable numeric keyboard), `input-flow-engine.js` (conditional field evaluation), `spatial-grid.js` (fast hit-testing), `progressive-renderer.js`, `render-cache.js`, `render-perf.js`, `resizable-drawer.js`, `backup-manager.js` (hourly/daily), `label-collision.js`, `geometry.js`, `toast.js`, `encoding.js`, `custom-select.js`, `device-perf.js`
- **`state/`** — `constants.js` (NODE_RADIUS=20, COLORS_LIGHT/DARK palettes, node/edge material/type/diameter catalogs, `isDarkMode()`), `persistence.js` (IndexedDB ↔ localStorage bridging, STORAGE_KEYS), `app-state.js`, `app-store.js`, `event-bus.js`, `skill-level.js`
- **`notifications/`** — `notification-bell.js` (notification center UI)
- **`workers/`** — `data-processor.worker.js` + `worker-manager.js` (Web Worker offloading)
- **`dom/`** — `dom-utils.js` (CSS variable sync: `--app-height`, `--header-h`, visualViewport API for mobile)
- **`graph/`** — `id-utils.js` (numeric ID detection, home internal ID generation)
- **`serviceWorker/`** — `register-sw.js` (SW registration, 15-min update checks, offline refresh guards)
- **`db.js`** — IndexedDB wrapper: stores `sketches`, `currentSketch`, `syncQueue`, `backups`, `annotations` (DB_VERSION 3)
- **`i18n.js`** — Full translation dictionary (~2600 lines) for Hebrew/English
- **`main-entry.js`** — App entry: auth, i18n, GNSS, menu init, mobile menu, floating keyboard, drawer, FAB toolbar
- **`capacitor-api-proxy.js`** — API proxy for Capacitor native (redirects `/api/*` to production)
- **`canvas-fab-toolbar.js`** — Floating action button speed dial

### API Routes (`api/`)

Every resource is a **single `index.js` handler** — there are no `[id].js` dynamic files. `vercel.json` rewrites path params to query params (e.g. `/api/sketches/:id` → `/api/sketches?id=:id`), so URLs look RESTful but handlers branch on `req.query.id` / method / `action`.

All routes except `/api/health` (public, Edge runtime — also the one non-index.js handler, `api/health.js`, kept on Edge so it doesn't count toward the Vercel Hobby 12-serverless-function limit) and `/api/auth/*` require a Better Auth session. Rate limited: 100 req/min per IP (20 for `/api/auth`); /api/health is unlimited. CSRF (`verifyCsrf`) applies to sketches/projects/organizations/users/features/layers/issue-comments but NOT stats, user-role, health, or auth. CORS configured. Responses use camelCase (DB uses snake_case).

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/*` | ALL | Better Auth handler (signIn, signUp, signOut, session) |
| `/api/sketches`, `/api/sketches/:id` | GET, POST, PUT, DELETE | Sketch list (role-filtered, paginated), CRUD + lock operations (lock/unlock/refresh/forceUnlock, 30-min expiry) |
| `/api/projects`, `/api/projects/:id` | GET, POST, PUT, DELETE | Project CRUD + duplicate. GET supports `?fullSketches=true` for project-canvas |
| `/api/organizations`, `/api/organizations/:id` | GET, POST, PUT, DELETE | Org CRUD (admin/super_admin) |
| `/api/users`, `/api/users/:id` | GET, PUT | List users (admin sees org, super_admin sees all), update role/org |
| `/api/user-role` | GET | Current user's role, permissions, features. Auto-creates user record. |
| `/api/features/*` | GET, PUT | Feature flags per user/org |
| `/api/layers/*` | GET, POST, PUT, DELETE | Project GeoJSON layers (admin) |
| `/api/issue-comments` | GET, POST | Issue node comments, close/reopen, notifications |
| `/api/notifications/*` | GET, POST | Rewritten to `/api/issue-comments?action=notifications` |
| `/api/stats/*` | GET | Statistics, e.g. accuracy leaderboard per project |
| `/api/health` | GET | Health check (public, Edge runtime, never touches the DB) |

Route behaviors worth knowing: `GET /api/sketches` returns metadata-only rows (node_count/edge_count) unless `?full=true`; `limit` clamped 1–200, default 50. `POST /api/sketches` with `body.action='assign-orphans'` + projectId bulk-assigns project-less org sketches (admin+). `/api/stats` subpaths: `leaderboard`, `workload` (admin+), `metadata`. `/api/organizations?action=members` is the merged org-members route; listing all orgs is super_admin-only.

**API library (`api/_lib/`):**
- `auth.js` — `verifyAuth()`, `parseBody()` (15MB limit), header/cookie helpers
- `db.js` — All DB operations: sketch/project/org/user/feature/layer/lock/notification CRUD, `ensureDb()` table creation
- `validators.js` — MAX_NODES=10000, MAX_EDGES=50000, UUID validation, sketch/user/org/feature input validation
- `rate-limit.js` — Sliding window per-IP, 60s window, in-memory per serverless instance
- `cors.js` — Origin resolution, Capacitor `https://localhost` always allowed
- `csrf.js` — CSRF protection helpers
- `error-handler.js` — Shared error responses
- `schema.sql` — STALE reference schema (wrong user_id type, missing lock/version columns and issue tables); the runtime `initializeDatabase()` in `db.js` is authoritative

**Server library (`lib/auth.js`):** Better Auth config — Neon Postgres, email/password auth, 7-day sessions, 5-min cookie cache, cross-origin for Capacitor.

### Database Schema

**Application tables:** `organizations`, `projects` (input_flow_config, target_km), `sketches` (nodes/edges JSON, admin_config, project_id FK, `version` counter for optimistic locking, and lock columns `locked_by`/`locked_at`/`lock_expires_at` with 30-min expiry — there is **no** separate `sketch_locks` table), `users` (role, organization_id FK), `user_features`, `project_layers` (GeoJSON, style), `issue_comments`, `issue_notifications`

**Better Auth tables:** `user`, `session`, `account`, `verification`

**Roles:** `user` (own sketches), `admin` (org resources), `super_admin` (everything)

**Feature flags:** `export_csv`, `export_sketch`, `admin_settings`, `finish_workday`, `node_types`, `edge_types`

### Node Type Categories

Defined in `frontend/src/state/constants.js` as `NODE_TYPE_CATEGORIES`: **Manhole**, **Home**, **Drainage**, **Covered**, **ForLater**, **Issue**. Each type has a distinct icon drawn by `frontend/src/features/node-icons.js`. The **Issue** node type (red circle with exclamation mark) represents a reported field issue that needs attention — it is excluded from heatmap coloring (completeness scoring in `cockpit/completion-engine.js` excludes only Home and ForLater nodes; Issue nodes ARE counted).

### Heat Map Mode

Toggle via `body.classList.toggle('heatmap-active')`. When active, nodes are color-coded by data completeness: **green** = all fields complete, **orange** = missing optional fields, **red** = issues or missing coordinates. Home, ForLater, and Issue nodes are excluded from heatmap coloring. The heatmap state is cached once per draw frame (`_isHeatmapFrame`) to avoid repeated DOM reads. Edges are colored too: blue `#3b82f6` when both tail_measurement and head_measurement are present, gray `#9ca3af` otherwise.

### Data Flow

1. **Canvas** — Users draw nodes/edges on HTML5 Canvas. Coordinates go through: WGS84 → ITM (proj4) → Canvas World → Screen pixels (via `viewScale`, `stretchX/Y`, `viewTranslate`)
2. **Persistence** — localStorage (primary, synchronous) + IndexedDB (backup, async) + cloud Postgres (source of truth via sync-service)
3. **Sync** — Online: debounced (2s) PUT to `/api/sketches/:id` (POST to `/api/sketches` only on create; PUT returns 409 with `{_conflict: true, currentSketch}` on version conflict). Offline: queued in IndexedDB `syncQueue`, drained on reconnect. `syncService.onSyncStateChange` notifies UI.
4. **Auth** — Better Auth with Neon Postgres. Session cookies (7-day expiry). `auth-guard.js` redirects unauthenticated users to login panel. 15-min session polling (the 5-min figure is the separate Better Auth cookie-cache maxAge).

### Internationalization

`frontend/src/i18n.js` exports translations for `he` (Hebrew, RTL, default) and `en` (English). Access via `t('dotted.key')` in JS or `data-i18n="key"` attribute on HTML elements. Both languages must always be kept in sync — every key added to `he` must also be added to `en`.

### CSS Architecture

`frontend/styles.css` uses CSS custom properties (design tokens) with dark mode via `@media (prefers-color-scheme: dark)`. Dark mode tokens defined in `:root` override: `--color-surface-alt`, `--color-accent`, `--color-text-bright`, etc. — use these tokens rather than hardcoding hex values in dark mode blocks. `frontend/src/menu/menu.css` has menu-specific styles; other component-scoped CSS: `cockpit/cockpit.css`, `field-commander/fc-shell.css`, `layout/unified-sidebar.css`, `layout/unified-toolbar.css`, `layout/micro-status-bar.css`, plus root-level `frontend/design-system-v2.css` (v2 tokens, imported by main-entry.js right after styles.css). Dark mode: `applyDarkMode()` (state/constants.js) stamps `data-theme="dark|light"` on `<html>` from localStorage `dark_mode_preference` ('system' | 'light' | 'dark' | 'auto' = time-based, dark 19:00–06:00), with `@media (prefers-color-scheme: dark)` fallbacks; canvas colors switch via `isDarkMode()` → COLORS_DARK. NOTE: `tailwindcss` is in package.json but is NOT wired up (no directive, no PostCSS/Vite plugin) — do not write Tailwind utility classes.

### Service Worker & Caching

`frontend/public/service-worker.js` uses versioned caches keyed by `APP_VERSION` (check the current value at the top of the file). **Bump `APP_VERSION`** whenever service-worker.js, index.html, or `main.js` content changes — effectively after any frontend change phones must pick up immediately. `main.js` has a stable filename and is stale-while-revalidate cached, so without a bump users get the OLD main.js (pointing at old hashed chunks) on first load after deploy. Vite-built JS/CSS under `/assets/` are fingerprinted and cached automatically.

**Caching strategies:** Navigation → network-first (fallback `offline.html`). `/assets/*` → cache-first (fingerprinted). Google Fonts → cache-first. Other same-origin GET → stale-while-revalidate. `/api/*` → skip SW entirely.

**Precache list:** `index.html`, `offline.html`, `manifest.json`, `fonts/material-icons.woff2`, `app_icon.png`, `health/index.html`. (`main.js` is NOT precached — it is served via stale-while-revalidate.)

**Registration:** `frontend/src/serviceWorker/register-sw.js` — HTTPS/localhost only, 15-min update checks, offline refresh guards (blocks F5, beforeunload, swipe-refresh).

### Vite Build

Stable output filename: `main.js` (dist root, referenced by index.html); CSS is fingerprinted into `assets/[name]-[hash:8].css`. Target es2022, modulePreload polyfill disabled. Chunk size warning: 1000KB. Code splitting:
- `better-auth` → `auth`; `react`/`scheduler` → `react-vendor`; `three` → `three-vendor`; `proj4`/`mgrs`/`wkt-parser` → `proj4-vendor`; other `node_modules` → `vendor`
- Lazy app chunks: `admin` (admin/ settings modules), `cockpit`, `field-commander`, `survey` (survey/ + tsc3-handlers)

HTTPS dev via mkcert cert files (`manholes-mapper.local+5.pem` / `-key.pem`) auto-detected in `frontend/`; `@vitejs/plugin-basic-ssl` is installed but unused. HMR disabled under `vercel dev` (manual refresh required). Port from `PORT` env var or 5173.

### Cross-Module Integration (Window Globals)

ES modules communicate with `frontend/src/legacy/main.js` via window globals since the monolith can't use ES imports:

**Canvas state (set by main.js / legacy modules):**
- `window.__getActiveSketchData()` / `window.__setActiveSketchData(data)` — Snapshot/restore sketch state for project canvas switching
- `window.__scheduleDraw()` — Trigger canvas redraw from any module
- `window.__setViewState(scale, tx, ty)` — Set `viewScale`/`viewTranslate` programmatically (e.g., issue navigation)
- `window.__getStretch()` → `{ x, y }` — Read current stretch factors
- `window.__setLastEditPosition(x, y)` — Track last edited element position
- `window.__projectCanvas` — Object with `isProjectCanvasMode()`, `getBackgroundSketches()`, `findNodeInBackground()`, `findEdgeInBackground()`, `switchActiveSketch()`
- `window.__sketchReadOnly` — Read-only mode flag
- `window.__issueHighlight` — `{ start(worldX, worldY, durationMs), draw(ctx, ...) }`
- `window.__markInternalNavigation()` — **must be called before any in-app hash change**, otherwise the exit guard reverts navigation to `#/`

**App-level (set by main-entry.js):**
- `window.t(key, ...args)` / `window.isRTL()` — i18n translator and RTL check
- `window.showToast(msg)` — Toast notification
- `window.escapeHtml(str)` — XSS prevention
- `window.authGuard` — Auth guard API (`getAuthState`, `onAuthStateChange`, `guardRoute`, etc.)
- `window.menuEvents` — Menu system event bus
- `window.CONSTS` — State constants

### Keyboard Shortcuts

`N` = Node mode, `E` = Edge mode, `Ctrl+Z` = Undo, `Ctrl+Shift+Z`/`Ctrl+Y` = Redo, `S` = Save, hold `Space` = pan canvas, `Tab`/`Shift+Tab` = cycle node/edge selection, `Enter` = open details drawer for selection, `+`/`=` = Zoom In, `-` = Zoom Out, `0` = Reset Zoom, `Esc` = Cancel/clear selection, `Delete`/`Backspace` = Delete selected item.

## Scripts (`scripts/`)

Main reusable scripts (the many `_`-prefixed and `capture-*` scripts are one-off data-fix/screenshot utilities):

| Script | Command | Purpose |
|--------|---------|---------|
| `mock-tsc3/server.mjs` | `npm run mock:tsc3` | Mock TSC3 WebSocket (WS:8765) + HTTP control (3001). Broadcasts ITM survey points. |
| `migrate-auth-tables.js` | `npm run db:migrate` | Create Better Auth tables (user, session, account, verification) |
| `codebase-dashboard.mjs` | `npm run dashboard` | Codebase metrics dashboard |
| `import-sketches.mjs` | `node scripts/import-sketches.mjs [dataDir]` | Import sketch JSON + merge coordinates from CSV |
| `query-all-data.js` | `node scripts/query-all-data.js` | Database audit: orgs, users, projects, sketches, features summary |
| `delete-empty-sketches.js` | `node scripts/delete-empty-sketches.js` | Remove sketches with no nodes/edges |
| `test-db-connection.js` | `node scripts/test-db-connection.js` | Verify Postgres connection, init schema, count records |
| `slim_geojson.js` | `node scripts/slim_geojson.js` | Reduce GeoJSON file size (strip verbose properties) |

## Deployment

- **`dev` branch** → Vercel **Production** deployment (auto — dev is the production branch on team `gis-6579s-projects` since 2026-07-15; repo owned by `geopoint-ltd` on GitHub)
- **After every push** → run the `vercel-promote` skill ([.claude/skills/vercel-promote/SKILL.md](./.claude/skills/vercel-promote/SKILL.md)) to verify the production build went Ready and `/api/health` returns 200
- Production URL: `https://manholes-mapper-three.vercel.app`
- Old account production (`https://manholes-mapper.vercel.app`, team `hussam0is-projects`) still serves the pre-transfer build + OLD database — field devices keep using it until migrated to the new URL
- **2026-07-19:** a second new-account Vercel project exists — team `dev-geopoint` (login `hussam-3537`), production `https://manholes-mapper-ten.vercel.app`, env vars configured but pointing at the **OLD** database, not git-connected. It is **NOT canonical**; created during credential recovery before the `gis-6579s-projects` setup was rediscovered. Pending user decision: retire it, or move the canonical deployment there (would need the NEW Neon DB creds + git connection).
- After promoting, wait ~1 min for CDN cache invalidation
- **Bump `APP_VERSION`** in `frontend/public/service-worker.js` after promoting if non-fingerprinted files changed — phones serve stale-while-revalidate cached JS indefinitely without this
- Vercel auth: token in Windows User env var `VERCEL_API_KEY` (scoped to `gis-6579s-projects`); the CLI's cookie login is still the old `hussam0is` account, so always pass `--token` + `--scope gis-6579s-projects`

### Vercel Route Configuration

`vercel.json` rewrites all `/:id` API paths to query-param handlers (see API Routes above) and `/api/auth/*`, `/api/layers/*`, `/api/features/*`, `/api/stats/*`, `/api/issue-comments/*`, `/api/notifications/*` to single handlers. CSP and security headers (HSTS, X-Frame-Options, Referrer-Policy) are configured there. API responses have `Cache-Control: no-store, max-age=0`. Geolocation permission enabled, microphone/camera disabled.

## Environment Variables

Required on Vercel: `BETTER_AUTH_SECRET`, `POSTGRES_URL`. Optional: `BETTER_AUTH_URL`, `ALLOWED_ORIGINS`.

For local API tests: set `POSTGRES_URL` in `.env.local`.

`.env.local` (regenerated 2026-07-15, points at the NEW Neon DB — team `gis-6579s-projects`, Frankfurt) also contains: `DATABASE_URL`/`_UNPOOLED`, `POSTGRES_URL_NON_POOLING`/`_NO_SSL`/`_PRISMA_URL`, `PG*` keys, `NEON_PROJECT_ID`, `BETTER_AUTH_SECRET`, and `OLD_POSTGRES_URL` (pre-move DB; full old creds in `.env.local.backup-old-account-2026-07-15`). `VERCEL_API_KEY` is NOT here — it lives only in the Windows User env var. **Back up `.env.local` before running `vercel link` or `vercel env pull` — they overwrite it, and local-only keys exist nowhere else.**

Also read by the API: `INITIAL_SUPER_ADMIN_EMAIL` (`api/_lib/db.js` — a newly created user with this email gets role super_admin; set on the Vercel project), `ALLOWED_ORIGINS` (comma-separated exact origins, used by `api/_lib/cors.js` and `lib/auth.js`; set in production). `POSTGRES_URL` falls back to `DATABASE_URL` in both `db.js` and `lib/auth.js`.

## Tech Stack

**Frontend:** Vite 7.x, vanilla JS (ES modules), HTML5 Canvas, React 19 (auth UI only), Three.js (3D view, dynamic import), Leaflet + Geoman (map annotations), proj4 (coordinate transforms), papaparse, wicket

**Backend:** Vercel serverless functions (Node.js), Better Auth 1.4.x, Neon Postgres (`@neondatabase/serverless`), `@vercel/postgres`

**Mobile:** Capacitor 8.x (Android), Bluetooth SPP plugin, WiFi TCP plugin

**Testing:** Vitest 4.x (unit, ~1790 tests), Playwright 1.5x (E2E), jsdom

**Tooling:** ESLint 9.x (flat config), Prettier 3.x, TypeScript 5.9.x (`strict: false`)

## Conventions

- **ES Modules** throughout (`"type": "module"` in package.json)
- TypeScript config with `"strict": false` (gradual migration). Path alias: `@/*` → `frontend/src/*`.
- Mobile-first: test all UI changes at 360px width **and at 640×360 landscape (Trimble TSC5, the primary field device)**. Canvas toolbar and panels must work on touch devices.
- RTL: all panels must work correctly in Hebrew (RTL). Use `margin-inline-*` / `padding-inline-*` over `margin-left`/`margin-right`.
- Material Icons self-hosted at `frontend/public/fonts/material-icons.woff2` (CSP blocks CDN loading).
- Health monitoring page at `/health/`.
- `index.html` defaults to `<html lang="he" dir="rtl">` (Hebrew RTL).
- Hash-based SPA routing: `#/`, `#/login`, `#/signup`, `#/admin`, `#/projects`. Always call `window.__markInternalNavigation()` before programmatic hash changes (exit guard).
- State management: singleton pattern with listener callbacks (gnssState, menuEvents, projectSketches).
- Legacy ↔ modern communication via window globals (documented above).

## Capacitor (Android)

App ID: `com.geopoint.manholemapper`. Config: repo-root `capacitor.config.ts` (moved from frontend/ 2026-07-15 so root-run `cap sync` finds it next to `android/`); web dir: `frontend/dist`. Cleartext enabled for dev. Android scheme: `https`. **`capacitor.config.ts` sets `server.url`, which makes the native WebView load that remote URL directly (bundled assets and the fetch proxy are bypassed) — keep it pointed at `https://manholes-mapper-three.vercel.app` and re-run `npx cap sync android` after changing it.** The `capacitor-api-proxy.js` interception only matters when `server.url` is removed.

**Installed plugins:** `@capacitor/core` 8.x, `@capacitor/android` 8.x, `@e-is/capacitor-bluetooth-serial` 6.x (Bluetooth SPP for TSC3 & GNSS receivers). WiFi TCP (`capacitor-tcp-socket`) referenced in code but may need manual install.

**API Proxy (`frontend/src/capacitor-api-proxy.js`):** On native Android, the WebView runs on `https://localhost` with no backend. This module wraps `window.fetch()` to intercept `/api/*` calls and route them to `https://manholes-mapper-three.vercel.app` with `credentials: 'include'`. **Must load before any fetch() calls** in `frontend/src/main-entry.js`.

**Build flow:**
1. `npm run build` → produces `dist/`
2. `npm run build:android` → syncs `dist/` to `android/app/src/main/assets/www/`
3. `npm run open:android` → opens Android Studio
4. Build & run from Android Studio (signing config optional for dev)

## TSC3 Survey Controller Connection (`frontend/src/survey/`)

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

**Parser (`tsc3-parser.js`):** Auto-detects delimiter (tab/comma/space) and column order (NEN vs NNE) using ITM heuristics. Validates ITM ranges: easting 100k–300k, northing 350k–800k (lower bound deliberately includes Eilat/southern Negev). Elevation is NOT range-validated (NaN becomes 0).

**Connection flow (`tsc3-connection-manager.js`):**
1. User selects device via `device-picker-dialog.js` (filters for Trimble/TSC names)
2. Incoming point → parser extracts `{ pointName, easting, northing, elevation }`
3. If node with matching name exists → updates coordinates silently
4. If new point → opens `survey-node-type-dialog.js` for type selection (Manhole, Home, Drainage; if no dialog opener is registered, defaults to Manhole)
5. Points queue if dialog is open, processed sequentially

**Mock TSC3 server (`scripts/mock-tsc3/server.mjs`):** `npm run mock:tsc3` starts WS on port 8765 + HTTP control API on port 3001. HTTP endpoints: `GET /api/status`, `POST /api/send-point`, `POST /api/send-batch`, `GET /api/history`, `POST /api/clear-history`. Web UI at `http://localhost:3001`.

## GNSS Receiver Connection (`frontend/src/gnss/`)

The app connects to GNSS receivers for live RTK positioning. Adapters (one active at a time): Bluetooth SPP, WiFi TCP, TMM, browser location, mock.

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

**State machine (`gnss-state.js`):** Singleton `gnssState` tracks connection state (disconnected/connecting/connected/error), position (lat/lon/accuracy/fixQuality/satellites/hdop), and captured points. Events: `on('position', cb)`, `on('connection', cb)`, `on('capture', cb)`. The NMEA parser also handles GST sentences (precision estimates) alongside GGA/RMC.

**Marker rendering (`gnss-marker.js`):** Draws accuracy circle + position dot with fix-quality color coding on canvas. Uses `ctx.setTransform(1,0,0,1,0,0)` to draw in screen space (DPR-aware).

**Auto-centering:** On first valid GPS fix in empty sketch, calls `setMapReferencePoint()` + `centerOnGpsLocation()` (`_liveMeasureFirstFixDone` flag).

## Phone-Debug MCP Server (`service/cdp-mcp/`)

Custom MCP server for remote phone browser debugging via Chrome DevTools Protocol.

**Setup:**
```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote   # Forward Chrome CDP
adb reverse tcp:8765 tcp:8765                                # Forward mock TSC3 (optional)
```

**Tools (22 total):** CDP core (list tabs, connect, evaluate JS, console logs, screenshots, network log), GNSS (get state/position/connection, watch position, trigger mock, capture point), App control (get state, navigate hash routes, toast, get sketch info, trigger sync, set language, center map, toggle live measure, force redraw), ADB screenshot (no CDP required).

**Known issue:** Chrome 144+ has broken CDP WebSocket — `cdp_connect` always fails. Use `adb_screenshot` and `cdp_evaluate` (after manual tab detection) or ADB-only interaction.

## Phone Testing (Galaxy Note 10)

- Device: Samsung Galaxy Note 10, Android 12, 1080x2280px, density 420dpi
- Chrome 144+ has broken CDP WebSocket — use ADB-only testing
- ADB screenshot scale factor: ~1.45 (multiply visual coords by 1.45 for ADB tap)
- **NEVER** run `pm clear com.android.chrome` or `adb kill-server`
- Service worker must be bumped (`APP_VERSION` in `frontend/public/service-worker.js`) after deploying non-fingerprinted changes
- Deploy-test cycle: push to `dev` → wait ~2 min for the auto production build → bump SW version if non-fingerprinted files changed
- Use `manholes-mapper-phone-user` or `mobile-phone-tester` skills for phone interaction

## Ports & Defaults

| Service | Protocol | Port | Notes |
|---------|----------|------|-------|
| Vite Dev | HTTP | 5173 | Frontend (HMR); /api proxied to production; binds 127.0.0.1 (not LAN-reachable) |
| Vercel Dev | HTTP | 3000 | Full stack (API routes) |
| Mock TSC3 WS | WebSocket | 8765 | Survey controller simulator |
| Mock TSC3 HTTP | HTTP | 3001 | Control API + Web UI |
| Chrome CDP | TCP | 9222 | Phone debugging (via ADB forward) |
| GNSS WiFi TCP | TCP | 5017 | Trimble receiver default |

## Knowledge Base

For a complete catalog of objects, functions, buttons, layouts, and DOM elements in the app, see [`docs/my_knowledge.md`](./docs/my_knowledge.md). Additional docs in `docs/`: `ARCHITECTURE.md`, `API.md`, `ERD.md`, `LEGACY_IMPORT_GUIDE.md`, `MAP_COORDINATES.md`, `TMM_TESTING_GUIDE.md`, security audits, and more.

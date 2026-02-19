# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev          # Vite only (frontend, HMR, no API routes) → localhost:5173
npm start            # Full stack via vercel dev (API routes + Vite) → localhost:3000
npm run build        # Production build → dist/
npm run preview      # Serve production build locally
```

## Testing

```bash
npm run test:run                              # Run all tests (Vitest, ~415 tests)
npm run test:run tests/unit/gnss-state.test.ts  # Single test file
npm test                                      # Watch mode
```

Tests use jsdom environment. Setup in `tests/setup.ts`. API tests hit real Neon Postgres (need `POSTGRES_URL`).

## Linting

```bash
npm run lint         # ESLint on src/**/*.{js,ts}
npm run lint:fix     # Auto-fix
npm run format       # Prettier
```

## Architecture Overview

**Manholes Mapper** is a PWA for field surveying — users draw manhole/pipe networks on an HTML5 Canvas with optional RTK GNSS positioning and cloud sync.

### Entry Point Flow

`index.html` → `src/main-entry.js` (ES module) → initializes CSS imports, i18n, auth, GNSS, menu system → loads `src/legacy/main.js` (core app logic, ~8300 lines).

CSS is imported via JS (`import '../styles.css'`) for Vite dev/build compatibility — there is no `<link>` tag in HTML.

### Key Directories

- **`src/legacy/main.js`** — Monolithic core: canvas rendering loop, event handlers, sketch CRUD, all panel logic. This is being modularized incrementally.
- **`src/auth/`** — Better Auth client, session guards, sync-service (cloud ↔ local sketch sync), permissions/RBAC
- **`src/gnss/`** — Live Measure: GNSS state machine, NMEA parsing, browser-location-adapter (bridges `navigator.geolocation` → `gnssState`), Bluetooth/WiFi adapters for Trimble R780, canvas marker rendering
- **`src/admin/`** — Admin panel: CSV field config, input flow rules (conditional field logic), project management
- **`src/features/`** — Canvas drawing primitives, graph rendering engine, node icons
- **`src/menu/`** — Responsive menu system with event delegation (`menu-events.js`)
- **`src/utils/`** — CSV export, ITM/WGS84 coordinate transforms (proj4), floating keyboard, sketch import/export, backup manager
- **`api/`** — Vercel serverless functions: sketches CRUD, projects, organizations, users, auth handler. All verify session via Better Auth.
- **`lib/auth.js`** — Better Auth server config (Neon Postgres)
- **`public/service-worker.js`** — Cache strategy for offline-first PWA

### Data Flow

1. **Canvas** — Users draw nodes/edges on HTML5 Canvas. Coordinates go through: WGS84 → ITM (proj4) → Canvas World → Screen pixels (via `viewScale`, `stretchX/Y`, `viewTranslate`)
2. **Persistence** — localStorage (primary, synchronous) + IndexedDB (backup, async) + cloud Postgres (source of truth via sync-service)
3. **Sync** — Online: immediate POST to `/api/sketches/{id}`. Offline: queued in IndexedDB `syncQueue`, drained on reconnect. `syncService.onSyncStateChange` notifies UI.
4. **Auth** — Better Auth with Neon Postgres. Session cookies. `auth-guard.js` redirects unauthenticated users to login panel.

### Internationalization

`src/i18n.js` exports translations for `he` (Hebrew, RTL, default) and `en` (English). Access via `t('dotted.key')` in JS or `data-i18n="key"` attribute on HTML elements. Both languages must always be kept in sync — every key added to `he` must also be added to `en`.

### CSS Architecture

`styles.css` uses CSS custom properties (design tokens) with dark mode via `@media (prefers-color-scheme: dark)`. Dark mode tokens defined in `:root` override: `--color-surface-alt`, `--color-accent`, `--color-text-bright`, etc. — use these tokens rather than hardcoding hex values in dark mode blocks. `src/menu/menu.css` has menu-specific styles.

### Service Worker & Caching

`public/service-worker.js` uses versioned caches (`APP_VERSION`). **Bump `APP_VERSION`** whenever non-fingerprinted files (service-worker.js, styles.css) change — this forces browsers to pick up updates. Vite-built JS/CSS under `/assets/` are fingerprinted and cached automatically.

## Deployment

- **`dev` branch** → Vercel Preview deployment (auto)
- **Production** → `npx vercel promote <preview-url>` (promotes preview to production)
- Production URL: `https://manholes-mapper.vercel.app`
- After promoting, wait ~1 min for CDN cache invalidation

## Environment Variables

Required on Vercel: `BETTER_AUTH_SECRET`, `POSTGRES_URL`. Optional: `BETTER_AUTH_URL`, `ALLOWED_ORIGINS`.

## Conventions

- **ES Modules** throughout (`"type": "module"` in package.json)
- Vite build outputs stable filenames: `main.js`, `styles.css` (for service worker compatibility)
- `vercel.json` rewrites `/api/auth/*` to single handler; has CSP and security headers
- Mobile-first: test all UI changes at 360px width. Canvas toolbar and panels must work on touch devices.
- RTL: all panels must work correctly in Hebrew (RTL). Use `margin-inline-*` / `padding-inline-*` over `margin-left`/`margin-right`.

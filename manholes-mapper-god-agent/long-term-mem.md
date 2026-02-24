# Manholes Mapper — Long-Term Memory

This file stores persistent project knowledge that survives across sessions.
It is read by Claude Code's `/manholes-mapper-god` skill for deep context.

---

## Project Identity
- **Name**: Manholes Mapper
- **Purpose**: PWA for field surveying — draw manhole/pipe networks on HTML5 Canvas with RTK GNSS and cloud sync
- **Production URL**: https://manholes-mapper.vercel.app
- **Preview URL**: https://manholes-mapper-git-dev-hussam0is-projects.vercel.app
- **ClickUp Board**: List ID `901815260471` — [Version 3 Development](https://app.clickup.com/90182222916/v/li/901815260471)

## Architecture Summary
- **Frontend**: Vite 7.x, vanilla JS (ES modules), HTML5 Canvas, React 19 (auth UI only), Tailwind CSS 4.x
- **Backend**: Vercel serverless (Node.js), Better Auth 1.4.x, Neon Postgres
- **Mobile**: Capacitor 8.x (Android), Bluetooth SPP for TSC3/GNSS
- **Testing**: Vitest (~490 tests), Playwright (E2E)
- **Entry**: index.html -> src/main-entry.js -> src/legacy/main.js (~8300 lines monolith)

## Key Directories
| Directory | Purpose |
|-----------|---------|
| `src/legacy/main.js` | Monolithic core: canvas, events, CRUD, panels |
| `src/auth/` | Better Auth client, session guards, sync-service, RBAC |
| `src/gnss/` | GNSS state machine, browser-location-adapter, markers |
| `src/survey/` | TSC3 Bluetooth/WebSocket survey device integration |
| `src/project/` | Multi-sketch project canvas mode |
| `src/admin/` | Admin panel, CSV config, input flow settings |
| `src/map/` | Tile manager, projections (ITM/WGS84), reference layers |
| `src/menu/` | Responsive menu system, event delegation |
| `api/` | Vercel serverless: sketches, projects, orgs, users, auth |
| `manholes-mapper-god-agent/` | God mode daemon, memory, ClickUp integration |

## Database
- **Provider**: Neon PostgreSQL
- **Tables**: organizations, projects, sketches (nodes/edges JSONB), users (role RBAC), user_features, project_layers, sketch_locks
- **Auth Tables**: user, session, account, verification (Better Auth)
- **Roles**: user < admin < super_admin

## ClickUp Integration
- **List ID**: `901815260471`
- **MCP Server**: `clickup` in `.mcp.json` — use `mcp__clickup__clickup_search`, `mcp__clickup__clickup_update_task`, `mcp__clickup__clickup_create_task`
- **REST API Fallback**: `manholes-mapper-god-agent/clickup-poller.mjs` — direct API calls with `CLICKUP_API_TOKEN`
- **Statuses**: backlog, Open, in progress, success in dev, Testing, Closed
- **Task Prefixes**: FEATURE:, BUG:, UPGRADE:

## Auth Credentials
- Admin: admin@geopoint.me / Geopoint2026! (super_admin role)

## Deployment
- `dev` branch -> Vercel Preview (auto)
- Production: `npx vercel promote <preview-url>`
- Bump `APP_VERSION` in `public/service-worker.js` after non-fingerprinted file changes

## Coordinate Systems
- WGS84 (GPS) -> ITM EPSG:2039 (proj4) -> Canvas World -> Screen pixels
- Draw pipeline: `screen = world * stretch * viewScale + viewTranslate`

## GNSS Fix Quality
| Accuracy | Fix Type | Color |
|----------|----------|-------|
| < 0.05m | RTK Fixed | Green |
| < 0.5m | RTK Float | Blue |
| < 5m | DGPS | Amber |
| < 15m | GPS | Amber |
| >= 15m | No fix | Red |

## Learned Insights

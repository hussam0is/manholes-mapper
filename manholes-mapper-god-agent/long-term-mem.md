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

## Field Workflow (decided 2026-02-24)
- **TSC3 + GNSS receiver**: Trimble Access does NOT support real-time Bluetooth/WiFi serial output for GNSS — "Data output" is total-station only
- **Decided workflow**: Phone + GNSS receiver directly (no TSC3 middleman for coordinates)
- **Connection method**: TMM (Trimble Mobile Manager) feeds GNSS RTK as Android mock location → browser geolocation → app's browser-location-adapter
- **Point capture**: User taps "capture" button on phone → app records current GNSS position onto the node
- **Node survey fields to display**: survey_x (ITM easting), survey_y (ITM northing), TL (elevation), measurement precision (accuracy), fix type (RTK Fixed / RTK Float / Manual Float)
- **Capacitor app**: Now loads from production URL (no bundled assets) — `server.url` in capacitor.config.ts points to `https://manholes-mapper.vercel.app` (commit ee9bc0c)

## ArcMap GDB Schema (me_rakat project)
- **GDB path**: `W:\GIS\תאגידי מים\מי רקת\code\automate_app_files_\Tveria_Kfarkama.gdb`
- **ArcGIS Pro Python**: `"C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe"` (arcpy available)
- **Feature classes**: SW_Manholes_final, SW_Pipe_final, SW_Manholes_new, SW_Pipe_new, nodes_Layer, edges_Layer
- **Tables**: edges_table, nodes_table, cords_table

### SW_Manholes_final columns (key fields)
| Column | Type | Domain | App mapping |
|--------|------|--------|-------------|
| ManholeNum | String(11) | — | node.id |
| X | Double | — | node.surveyX (ITM easting) |
| Y | Double | — | node.surveyY (ITM northing) |
| TL | Double | — | node.surveyZ (elevation) |
| CoverMater | Integer | Material (0-13) | node.material |
| CoverDiame | Double | — | node.coverDiameter |
| Access | Integer | AccessType (0-5) | node.access |
| AccuracyLe | Integer | AccuracyLevel (0,1,3,5) | node.accuracyLevel |
| Maintenanc | Integer | MaintenanceStatus (0-14) | node.maintenanceStatus |
| Status | Integer | StatusType (0-4) | node.nodeEngineeringStatus |
| Comment | String(100) | — | node.note |
| Depth | Double | — | ? |
| ButtomDept | Double | — | ? |
| out_measure | Double | — | edge tail_measurement (from this node) |
| CoverType | Integer | CoverType (0-6 by tonnage) | — |
| CoverForm | Integer | CoverForm (0-5) | — |
| Source | Integer | Source_2 (0-7) | — |
| Location | Integer | Location_2 (0-15) | — |

### SW_Pipe_final columns (key fields)
| Column | Type | Domain | App mapping |
|--------|------|--------|-------------|
| LineSubtyp | Integer | LineSubType_1_1 (4801-4803) | edge.edge_type |
| LineDiamet | Integer | sLineDiameter | edge.line_diameter |
| LineMateri | Integer | Material (0-13) | edge.material |
| in_measure | Double | — | edge.head_measurement |
| out_measure | Double | — | edge.tail_measurement |
| Start_TL | Double | — | tail node TL |
| End_TL | Double | — | head node TL |
| fall_depth | Double | — | edge.fall_depth |
| AccuracyLe | Integer | AccuracyLevel | — |
| Status | Integer | StatusType | edge.engineeringStatus |
| Maitenance | Integer | MaintenanceStatus | edge.maintenanceStatus |
| Comment | String(100) | — | edge.note |
| Source | Integer | Source_2 | — |
| Length | Double | — | computed from coords |
| Gradient | Double | — | computed slope |

### Domains (code → Hebrew label)
- **Material**: 0-13 (פלדה, PVC, בטון, etc.) — matches NODE_MATERIAL_OPTIONS
- **AccessType**: 0-5 — matches NODE_ACCESS_OPTIONS
- **MaintenanceStatus**: 0-14 — matches NODE_MAINTENANCE_OPTIONS
- **AccuracyLevel**: 0=לא ידוע, 1=הנדסית, 3=סכימטית, 5=סכימטית+ — NOTE: codes differ from app (app uses 0,1)
- **StatusType**: 0-4 — matches NODE_ENGINEERING_STATUS
- **LineSubType_1_1**: 4801=קו ראשי, 4802=קו סניקה, 4803=קו משני — matches EDGE_TYPE_OPTIONS
- **CoverType**: tonnage-based (3-40 ton)
- **CoverForm**: 0-5 (עגול, מרובע, etc.)
- **Source_2**: 0-7 (data source tracking)
- **Location_2**: 0-15 (location type)

### Notes for integration
- Schemas differ per project (me_rakat is the template)
- User has a batch loader tool that loads sketches → GDB
- Need unified way to map app fields → project-specific GDB tables
- Some GDB fields not yet in the app (CoverType tonnage, CoverForm, Location, Source, etc.)

## Learned Insights
- **TSC3 WebSocket on HTTPS**: `tsc3-websocket-adapter.js` forces `ws://` for localhost/127.0.0.1. For non-localhost HTTPS, uses `wss://`. CDN may cache old CSP headers — use `page.route()` to strip CSP during Playwright tests.
- **homePanel overlay**: After login, `#homePanel` blocks canvas and menu clicks. Hide via `document.getElementById('homePanel').style.display = 'none'`.
- **Sketch localStorage key**: Production builds store data in `graphSketch` localStorage key (not `currentSketch`). `window.nodes`/`window.edges` globals are NOT exposed in prod builds.
- **Mock TSC3 scenarios API**: `POST /api/run-scenario` sends predefined point sets with delays. Available scenarios: `basic` (3 pts), `chain-5` (5 pts), `update-coords` (2 pts). Check progress via `GET /api/status` → `runningScenario`.
- **Playwright dialog handling**: `window.prompt()` (used by WebSocket connect) appears as modal dialog — handled via `browser_handle_dialog({ accept: true, promptText: 'localhost:8765' })`.
- **Skill optimization**: God-mode §18 has reusable Playwright browser test setup boilerplate. Mock-tsc3-controller has full Browser Integration Test Playbook. User-tester has Phase 5 (survey device testing).

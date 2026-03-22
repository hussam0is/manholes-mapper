# Design Audit Workflow Log — 2026-03-04

## Phase 0: Research & Capture

### Setup
- Output folder: `app_state_2026-03-04/`
- App URL: https://manholes-mapper.vercel.app (production)
- Credentials: admin@geopoint.me / Geopoint2026!
- Read `.claude/app-ui-reference.md` for element IDs and UI structure

### Capture Method
- Standalone Playwright script (`scripts/design-audit-capture.mjs`)
- Headless Chromium browser
- Multiple runs captured 66+ screenshots

### Viewports Tested
1. **Desktop 1280x800** — Light mode, Hebrew RTL
2. **Desktop 1440x900** — Light mode, Hebrew RTL
3. **Desktop 1280x800** — Dark mode, Hebrew RTL
4. **Mobile 360x740** — Light mode, Hebrew RTL, touch/mobile UA
5. **Mobile 360x740** — Dark mode, Hebrew RTL, touch/mobile UA

### Workflows Captured
- **A (Login)**: Pre-login page, login form, filled form, post-login redirect
- **B (Canvas)**: Empty canvas, toolbar, canvas with sketch data, desktop header/menu
- **C (Projects)**: Projects page, project canvas view (me_rakat), sketch side panel
- **D (Admin)**: Admin panel, users tab, orgs tab, features tab
- **E (Mobile)**: Login, home, canvas, hamburger menu (all scroll positions), admin, projects, dark mode variants
- **F (Settings)**: Dark mode login, dark mode canvas, dark mode admin, dark mode home, language toggle

### Key Observations

1. **Critical JS error**: `_contrastMul is not defined` on project canvas pages — variable scoping bug blocks canvas rendering
2. **i18n bug**: Greeting text shows raw key `home.goodEvening` — keys should be `homeScreen.goodEvening`
3. **Missing header at 1280px**: The landscape cockpit layout hides the header at typical laptop widths
4. **Dark mode generally well-implemented**: Login, canvas, admin all have dark variants
5. **RTL layout correct**: Hebrew text, menu direction, layout mirroring all work properly
6. **Mobile toolbar too tall**: 10 buttons stacked vertically consume too much screen real estate
7. **Cockpit gamification UI**: Health %, streak, shift stats are nice motivational elements

### Console Errors Captured
- `_contrastMul is not defined` (4 occurrences on project canvas page)
- No other JS errors observed

## Phase 1: Audit Complete

16 issues identified (1 CRITICAL, 3 HIGH, 5 MEDIUM, 6 LOW).
See ISSUES.md for full details.

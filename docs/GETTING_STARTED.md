# Getting Started - Developer Guide

This guide will help you set up and run the **Manholes Mapper PWA** locally to test changes on a development branch.

## Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| **Node.js** | 24.x or higher | `node --version` |
| **npm** | 10.x or higher | `npm --version` |
| **Git** | 2.x or higher | `git --version` |

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/hussam0is/manholes-mapper.git
cd manholes-mapper

# 2. Fetch and switch to the dev branch you want to test
git fetch origin
git checkout <dev-branch-name>

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev
```

Open **http://localhost:5173** in your browser to test the app.

---

## Environment Variables

Create a `.env.local` file in the project root with the following variables:

```bash
# Better Auth Configuration
# Generate a secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000

# Initial Super Admin (optional)
# Set this to the email of the first user who should be super admin
INITIAL_SUPER_ADMIN_EMAIL=admin@example.com

# Database (provided by Vercel's Neon integration)
# These are automatically set when you link Neon to Vercel
# For local development, use your Neon connection string:
# POSTGRES_URL=postgresql://neondb_owner:password@host/neondb?sslmode=require
```

For local development with the full backend (API routes), run:
```bash
npm run start  # Uses Vercel CLI to run API routes locally
```

---

## Testing a Dev Branch

### Option 1: Test an Existing Dev Branch

```bash
# List all remote branches
git branch -r

# Fetch latest changes
git fetch origin

# Checkout the dev branch
git checkout origin/<branch-name> -b <branch-name>

# Install dependencies (in case they changed)
npm install

# Run the dev server
npm run dev
```

### Option 2: Test a Pull Request Branch

```bash
# Fetch the PR branch (replace PR_NUMBER with actual number)
git fetch origin pull/<PR_NUMBER>/head:pr-<PR_NUMBER>

# Switch to the PR branch
git checkout pr-<PR_NUMBER>

# Install and run
npm install
npm run dev
```

### Option 3: Create Your Own Dev Branch

```bash
# Create a new branch from main
git checkout -b dev/your-feature-name

# Make your changes, then test
npm run dev
```

---

## Running the App Locally

### Development Mode (Recommended for Testing)

```bash
npm run dev
```

This starts Vite's dev server with:
- **Hot Module Replacement** - See changes instantly without refresh
- **Source Maps** - Debug original source code in DevTools
- **Fast Refresh** - State preserved during edits
- **URL**: http://localhost:5173

### Preview Mode (Test Production Build Locally)

```bash
# Build the app
npm run build

# Preview the production build
npm run preview
```

This lets you test the production build locally at http://localhost:4173

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (http://localhost:5173) |
| `npm run start` | Start with Vercel CLI (API routes + frontend) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run unit tests in watch mode (Vitest) |
| `npm run test:run` | Run unit tests once |
| `npm run lint` | Check code for errors |
| `npm run lint:fix` | Auto-fix linting errors |
| `npm run format` | Format code with Prettier |
| `npm run build:android` | Build and sync Capacitor Android |
| `npm run open:android` | Open Android project in Android Studio |

---

## Testing Your Changes

### 1. Run Code Quality Checks

```bash
# Check for errors
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format
```

### 2. Test in Browser

Open http://localhost:5173 and verify:
- [ ] App loads without console errors
- [ ] Your changes work as expected
- [ ] Existing features still work (no regressions)
- [ ] Mobile view works (use DevTools device emulation)

### 3. Test Offline Mode (PWA)

```bash
# Build and preview production version
npm run build && npm run preview
```

Then in Chrome DevTools:
1. Go to **Application** → **Service Workers**
2. Check **Offline**
3. Verify the app still works

### 4. Clear Local Data (If Needed)

If you need to reset the app state:
1. Open DevTools → **Application** → **IndexedDB**
2. Expand **graphSketchDB**
3. Right-click and delete to clear data

---

## Project Structure

```
manholes-mapper/
├── frontend/
│   ├── src/
│   │   ├── admin/              # Admin panel, settings, projects, input flow
│   │   ├── auth/               # Better Auth client, provider, guard, permissions
│   │   ├── cockpit/            # Gamification (XP, skill levels, session tracker)
│   │   ├── db.js               # IndexedDB wrapper
│   │   ├── dom/                # DOM manipulation utilities
│   │   ├── features/           # Canvas rendering and drawing primitives
│   │   ├── field-commander/    # Mobile UI shell, gestures, territory, XP/achievements
│   │   ├── gnss/               # GNSS/GPS live measure module
│   │   ├── graph/              # Graph data structures and ID utilities
│   │   ├── layout/             # Layout manager, sidebar, toolbar
│   │   ├── legacy/             # Core app logic (being modularized)
│   │   ├── map/                # Map tiles, projections, reference layers, Street View
│   │   ├── menu/               # Responsive menu system and command palette
│   │   ├── notifications/      # Notification bell and center
│   │   ├── pages/              # Profile, stats, leaderboard page components
│   │   ├── project/            # Project canvas, issue system, merge mode
│   │   ├── serviceWorker/      # SW registration
│   │   ├── state/              # Global state & constants
│   │   ├── survey/             # TSC3 survey device integration
│   │   ├── three-d/            # 3D underground visualization
│   │   ├── types/              # TypeScript type definitions
│   │   ├── utils/              # Utility functions (CSV, coordinates, geometry, UI)
│   │   ├── workers/            # Web Workers (GNSS parsing)
│   │   ├── i18n.js             # Hebrew/English translations
│   │   └── main-entry.js       # Entry point
│   ├── tests/                  # Vitest unit tests + Playwright E2E tests
│   │   ├── unit/               # Unit test files (.test.ts)
│   │   └── e2e/                # E2E Playwright specs
│   ├── index.html              # Main HTML
│   └── styles.css              # Global styles + Tailwind directives
├── api/                    # Vercel serverless API routes
│   ├── auth/               # Better Auth endpoints
│   ├── sketches/           # Sketch CRUD and locking
│   ├── projects/           # Project management
│   ├── organizations/      # Organization management
│   ├── layers/             # GIS reference layer data
│   ├── users/              # User management
│   └── _lib/               # Shared backend (db, auth, validators, rate-limit)
├── public/                 # Static assets, PWA manifest, offline.html
└── package.json            # Root package with all npm scripts
```

---

## Troubleshooting

**Port 5173 in use:**
```bash
npm run dev -- --port 3000
```

**Dependencies out of sync:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Service Worker caching old version:**
1. DevTools → Application → Service Workers
2. Click "Unregister"
3. Hard refresh (Ctrl+Shift+R)

**Branch not found:**
```bash
git fetch origin
git branch -r  # List all remote branches
```

---

## Committing Changes

After testing, commit your changes:

```bash
git add .
git commit -m "feat: description of your changes"
git push -u origin <your-branch-name>
```

Then open a Pull Request on GitHub for review.

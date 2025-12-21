# Getting Started - Developer Guide

This guide will help you set up and run the **Manholes Mapper PWA** locally to test changes on a development branch.

## Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| **Node.js** | 16.x or higher (18+ recommended) | `node --version` |
| **npm** | 7.x or higher | `npm --version` |
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
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Check code for errors |
| `npm run lint:fix` | Auto-fix linting errors |
| `npm run format` | Format code with Prettier |

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
├── src/
│   ├── admin/              # Admin settings UI
│   ├── db.js               # IndexedDB wrapper
│   ├── features/           # Canvas rendering
│   ├── legacy/main.js      # Core app logic
│   ├── state/              # State & constants
│   ├── utils/              # Utility functions
│   ├── i18n.js             # Hebrew/English translations
│   └── main-entry.js       # Entry point
├── public/
│   ├── service-worker.js   # Offline support
│   └── manifest.json       # PWA config
├── index.html              # Main HTML
├── styles.css              # Styles
└── package.json            # Dependencies
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

# Getting Started - Developer Guide

This guide will help you set up and run the **Manholes Mapper PWA** for local development using the GitHub dev branch.

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

# 2. Navigate to project directory
cd manholes-mapper

# 3. Switch to development branch (if applicable)
git checkout <your-dev-branch>

# 4. Install dependencies
npm install

# 5. Start development server
npm run dev
```

The app will be available at **http://localhost:5173**

---

## Detailed Setup Instructions

### Step 1: Clone the Repository

```bash
git clone https://github.com/hussam0is/manholes-mapper.git
cd manholes-mapper
```

### Step 2: Working with Development Branches

List all available branches:
```bash
git branch -a
```

Switch to an existing development branch:
```bash
git fetch origin <branch-name>
git checkout <branch-name>
```

Create a new feature branch:
```bash
git checkout -b feature/your-feature-name
```

### Step 3: Install Dependencies

```bash
npm install
```

This will install all development dependencies (the app has zero runtime dependencies).

### Step 4: Start Development Server

```bash
npm run dev
```

The development server includes:
- **Hot Module Replacement (HMR)** - Changes reflect instantly
- **Source maps** - Easy debugging
- **Fast refresh** - Preserves component state

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at localhost:5173 |
| `npm run build` | Create production build in `dist/` folder |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint to check code quality |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |

---

## Project Structure

```
manholes-mapper/
├── src/
│   ├── admin/              # Admin settings UI components
│   ├── db.js               # IndexedDB database wrapper
│   ├── dom/                # DOM manipulation utilities
│   ├── features/           # Canvas rendering & drawing
│   │   ├── drawing-primitives.js
│   │   ├── node-icons.js
│   │   └── rendering.js
│   ├── graph/              # Graph data structures
│   ├── legacy/             # Legacy code (being refactored)
│   │   └── main.js         # Core application logic
│   ├── serviceWorker/      # Service worker registration
│   ├── state/              # State management & constants
│   ├── utils/              # Utility functions
│   ├── i18n.js             # Internationalization (Hebrew/English)
│   └── main-entry.js       # Application entry point
├── public/
│   ├── service-worker.js   # PWA offline support
│   ├── manifest.json       # PWA manifest
│   └── offline.html        # Offline fallback page
├── index.html              # Main HTML template
├── styles.css              # Application styles
├── vite.config.ts          # Vite configuration
└── package.json            # Project dependencies
```

---

## Environment Configuration

**No environment variables required!**

This is a fully client-side PWA with:
- No backend API integration
- Local data storage via IndexedDB
- Offline-first architecture

---

## Development Workflow

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make your changes and test locally:
   ```bash
   npm run dev
   ```

3. Check code quality:
   ```bash
   npm run lint
   npm run format
   ```

4. Build and verify production:
   ```bash
   npm run build
   npm run preview
   ```

5. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: describe your changes"
   ```

6. Push to remote:
   ```bash
   git push -u origin feature/your-feature
   ```

### Code Quality Checks

Before committing, always run:
```bash
# Check for linting errors
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format
```

---

## Testing the PWA Features

### Service Worker (Offline Mode)

1. Build the production version:
   ```bash
   npm run build
   npm run preview
   ```

2. Open Chrome DevTools → Application → Service Workers
3. Check "Offline" to simulate offline mode
4. The app should continue working with cached data

### Installing as PWA

1. Run the production preview: `npm run preview`
2. Open in Chrome/Edge
3. Click the install icon in the address bar
4. The app will install as a standalone application

---

## Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome/Edge | 90+ |
| Safari | 14+ |
| Firefox | 88+ |

**Note:** Service Workers require HTTPS in production (localhost is exempt for development).

---

## Data Storage

The app uses **IndexedDB** for local data persistence:

| Store | Purpose |
|-------|---------|
| `sketches` | Saved sketch records |
| `currentSketch` | Current unsaved work |
| `syncQueue` | Reserved for future sync |

**Clearing Data:**
- Open DevTools → Application → IndexedDB → graphSketchDB
- Right-click to clear stores

---

## Deployment

### Build for Production

```bash
npm run build
```

The `dist/` folder contains the production-ready files.

### Deploy to GitHub Pages

The project includes automated deployment via GitHub Actions (`.github/workflows/deploy.yml`):

1. Push to `master` branch
2. GitHub Actions will automatically build and deploy

### Manual Deployment

Deploy the `dist/` folder to any static hosting:
- **Netlify**: Drag and drop `dist/` folder
- **Vercel**: Connect repo and set build command to `npm run build`
- **AWS S3**: Upload `dist/` contents to S3 bucket

---

## Troubleshooting

### Common Issues

**Port 5173 already in use:**
```bash
# Kill the process using the port
lsof -ti:5173 | xargs kill -9

# Or use a different port
npm run dev -- --port 3000
```

**Node modules issues:**
```bash
# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Service Worker not updating:**
1. Open DevTools → Application → Service Workers
2. Click "Unregister" on the old service worker
3. Refresh the page

**IndexedDB data corrupted:**
1. Open DevTools → Application → IndexedDB
2. Right-click on `graphSketchDB` and delete
3. Refresh the page

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

---

## Need Help?

- Check the main [README.md](./README.md) for feature overview
- Open an issue on GitHub for bugs or feature requests
- Review existing issues before creating new ones

---

Happy coding! 🚀

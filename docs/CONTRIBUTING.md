# Contributing to Manholes Mapper

Thank you for your interest in contributing to Manholes Mapper! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 24.x or higher
- npm 10.x or higher
- Git
- A code editor (VS Code recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/hussam0is/manholes-mapper
cd manholes-mapper

# Install dependencies
npm install
```

### Development Server

```bash
# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

```bash
# Create optimized production build
npm run build

# Preview production build locally
npm run preview
```

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm run test

# Run tests once (no watch mode)
npm run test:run

# Run specific test file
cd frontend && npx vitest tests/unit/nmea-parser.test.ts
```

### E2E Tests

```bash
# Run all E2E tests
cd frontend && npx playwright test

# Run tests in specific file
cd frontend && npx playwright test tests/issue-nav.spec.js

# Run with UI mode
cd frontend && npx playwright test --ui

# Generate coverage report
cd frontend && npx playwright test --coverage
```

### Test Results

- Playwright HTML report: `frontend/playwright-report/index.html`
- Test results: `frontend/test-results/`

## Code Style

### JavaScript

- Use ES Modules (`import`/`export`)
- Follow existing naming conventions (camelCase for files, PascalCase for classes)
- Add JSDoc comments for public APIs
- Keep functions focused and reusable

### TypeScript (When Used)

- Enable strict mode where possible
- Use TypeScript interfaces for complex data structures
- Avoid `any` types; use `unknown` if type is unknown

### CSS/Tailwind

- Use Tailwind utility classes for styling
- Add custom styles in `styles.css` or component-specific files
- Keep CSS scoped to the component when possible

### Git Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(gnss): add WiFi TCP connection support

Add new adapter for connecting to Trimble R780 via WiFi hotspot.
Includes connection manager, state management, and error handling.

Closes #123
```

## Project Structure

```
manholes-mapper/
├── frontend/              # React + Vite frontend
│   └── src/
│       ├── admin/         # Admin panel, settings
│       ├── auth/          # Better Auth integration
│       ├── cockpit/       # Gamification UI (NEW)
│       ├── dom/           # DOM utilities
│       ├── features/      # Canvas rendering engine
│       ├── field-commander/ # Field operations (NEW)
│       ├── gnss/          # GNSS/Live Measure module
│       ├── graph/         # Graph data structures
│       ├── i18n.js        # Internationalization
│       ├── legacy/        # Legacy code (being modularized)
│       ├── main-entry.js  # App bootstrap
│       ├── map/           # Map layer system
│       ├── menu/          # Responsive UI
│       ├── notifications/ # Notification system
│       ├── pages/         # Page components
│       ├── project/       # Project canvas & issues (NEW)
│       ├── serviceWorker/ # PWA service worker
│       ├── state/         # Global state management
│       ├── survey/        # Survey mode modules (NEW)
│       ├── three-d/       # 3D underground visualization
│       ├── types/         # TypeScript types (NEW)
│       ├── utils/         # Shared utilities
│       └── workers/       # Web Workers
├── api/                   # Vercel serverless API
├── lib/                   # Better Auth server config
├── android/               # Capacitor Android project
├── docs/                  # Documentation
├── public/                # Static assets
└── package.json           # Dependencies
```

## Common Workflows

### Adding a New Feature

1. Create a new module file in the appropriate directory
2. Register the module in `main-entry.js`
3. Add routes/page if needed in `pages/`
4. Update state if global changes are required
5. Add internationalization keys in `i18n.js`
6. Write tests for the new functionality
7. Update documentation

### Fixing a Bug

1. Identify the issue (check console, user reports, tests)
2. Locate the relevant code
3. Make the fix
4. Add tests to prevent regression
5. Update documentation if needed
6. Commit with appropriate type and description

### Running in Production Mode

1. Build the application: `npm run build`
2. Test the production build locally: `npm run preview`
3. Deploy to Vercel: Push to `master` branch
4. Deploy to preview: Push to `dev` branch

## API Development

The backend uses Vercel serverless functions. Create new API routes in `api/`:

```
api/
├── auth/          # Authentication endpoints
├── features/      # Feature flags
├── layers/        # GIS layers
├── organizations/ # Organization management
├── projects/      # Project CRUD
├── sketches/      # Sketch CRUD & locking
├── users/         # User management
├── user-role/     # Role & permissions
└── issue-comments/ # Issue comments (NEW)
```

### Adding a New API Route

1. Create the route file in `api/your-module/`
2. Export a function `export default async function handler(req, res)`
3. Add middleware if needed (auth, validation)
4. Add route to API documentation

## Internationalization (i18n)

Manholes Mapper supports Hebrew and English.

### Adding Translations

1. Update keys in `frontend/src/i18n.js`
2. Add Hebrew translation in the `he` object
3. Keep English as the default

### Example

```javascript
// In i18n.js
{
  en: {
    nodes: {
      add: "Add Node",
      edit: "Edit Node"
    }
  },
  he: {
    nodes: {
      add: "הוסף צומת",
      edit: "ערוך צומת"
    }
  }
}
```

## Code Review Guidelines

1. Ensure code follows the project's style
2. Add tests for new functionality
3. Update documentation if needed
4. Check for security issues (input validation, XSS, etc.)
5. Run tests locally before submitting
6. Keep commits focused and atomic

## Getting Help

- Read existing documentation in `docs/`
- Check test files for usage examples
- Review other developers' commits for patterns
- Ask questions in the project discussions

## Reporting Issues

When reporting issues, please include:

1. Description of the problem
2. Steps to reproduce
3. Expected vs. actual behavior
4. Environment (OS, browser, device)
5. Screenshots or videos if applicable
6. Relevant error messages from console

## License

This project is proprietary. See LICENSE file for details.

---

*Last updated: 2026-04-04*
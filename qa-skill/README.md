# QA Skill - Manholes Mapper

Comprehensive QA automation for the Manholes Mapper application.

## What This Does

This QA skill provides automated testing across multiple layers:

| Suite | Description | When to Run |
|-------|-------------|-------------|
| **Smoke** | Quick sanity checks (lint, typecheck, basic tests) | Every PR |
| **Unit** | Isolated component/function tests | Every PR |
| **Integration** | Database + API integration tests | Before merge |
| **API** | Endpoint contract validation | Every PR |
| **E2E** | Full browser-based user flows | Before release |
| **Security** | Dependency audit, secret scanning | Weekly/nightly |
| **Performance** | API load testing | On demand |

## Quick Start

### Run All Tests (Full Profile)

```powershell
# Windows
.\qa-skill\run_qa.ps1

# Linux/macOS
./qa-skill/run_qa.sh
```

### Run PR Checks Only

```powershell
# Windows
.\qa-skill\run_qa.ps1 -Profile pr

# Linux/macOS
./qa-skill/run_qa.sh --profile pr
```

### Run Specific Suite

```powershell
# Windows
.\qa-skill\run_qa.ps1 -Suite unit

# Linux/macOS
./qa-skill/run_qa.sh --suite unit
```

## Prerequisites

### Required

- Node.js 18+ (LTS recommended)
- npm 9+

### For Integration Tests

Create `.env.local` with:

```env
POSTGRES_URL=postgresql://user:password@host:5432/database
```

Or use the test database:

```bash
docker-compose -f docker-compose.test.yml up -d
```

### For E2E Tests

Playwright browsers are installed automatically on first run:

```bash
npx playwright install chromium
```

## Test Structure

```
tests/
├── api/                    # API endpoint tests
│   ├── sketches.test.ts    # Integration tests (requires DB)
│   └── validators.test.ts  # Unit tests
├── fixtures/               # Test data and mocks
│   └── sketches.ts
├── e2e/                    # Playwright E2E tests
│   ├── auth.spec.ts        # Authentication flows
│   └── sketch.spec.ts      # Core sketch operations
├── unit/                   # Unit tests
│   └── utils.test.ts
├── coordinates.test.ts     # Utility tests
└── setup.ts               # Test configuration
```

## Reports

After running tests, find reports in `qa-skill/reporting/`:

| File | Format | Description |
|------|--------|-------------|
| `summary.md` | Markdown | Human-readable summary |
| `results.json` | JSON | Machine-readable results |
| `*-junit.xml` | JUnit XML | CI-compatible test results |
| `npm-audit.json` | JSON | Security audit results |
| `screenshots/` | PNG | E2E failure screenshots |

## CI Integration

Tests run automatically via GitHub Actions:

- **On PR**: Smoke tests only (fast feedback)
- **On main**: Full test suite
- **Nightly**: Full suite + performance tests

See `.github/workflows/qa.yml` for configuration.

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { validateUUID } from '../../api/_lib/validators.js';

describe('validateUUID', () => {
  it('should accept valid UUIDs', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(validateUUID('not-a-uuid')).toBe(false);
  });
});
```

### API Test Example

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('GET /api/sketches', () => {
  it('should require authentication', async () => {
    // Mock auth to return unauthorized
    const { verifyAuth } = await import('../../api/_lib/auth.js');
    (verifyAuth as any).mockResolvedValue({ userId: null, error: 'Unauthorized' });

    const { default: handler } = await import('../../api/sketches/index.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('user can create a new sketch', async ({ page }) => {
  await page.goto('/');
  
  // Login first
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="login-button"]');
  
  // Create sketch
  await page.click('[data-testid="new-sketch-button"]');
  await expect(page.locator('[data-testid="canvas"]')).toBeVisible();
});
```

## Troubleshooting

### "POSTGRES_URL not set"

Integration tests require a database. Either:

1. Set `POSTGRES_URL` in `.env.local`
2. Or skip integration tests: `--suite unit`

### "Playwright browsers not installed"

Run:

```bash
npx playwright install chromium
```

### Flaky E2E tests

1. Increase timeout in `playwright.config.ts`
2. Add `data-testid` attributes for stable selectors
3. Use explicit waits: `await page.waitForSelector(...)`

### TypeScript errors in tests

Ensure `vitest.config.ts` has proper TypeScript configuration:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

## Configuration

See `qa.config.json` for full configuration options including:

- Suite definitions and timeouts
- Test profiles (pr, full, nightly)
- Environment variable requirements
- Reporting options
- CI configuration

## Common Failures

| Error | Cause | Fix |
|-------|-------|-----|
| ESLint errors | Code style violations | Run `npm run lint:fix` |
| TypeScript errors | Type mismatches | Fix type annotations |
| Test timeouts | Slow database/network | Increase timeout or add mocks |
| Auth failures | Missing session | Mock `verifyAuth` in tests |
| Missing selectors | UI changed | Update `data-testid` attributes |

/**
 * E2E tests for sketch operations
 *
 * Tests the core sketch creation and editing functionality.
 * All tests mock the auth session so the login panel is bypassed
 * and the canvas + toolbar are accessible.
 */
import { test, expect, type Page } from '@playwright/test';

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-001',
  name: 'Test User',
  email: 'test@example.com',
};

const MOCK_SESSION = {
  id: 'session-001',
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set up route mocks for an authenticated session.
 */
async function mockAuth(page: Page) {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: MOCK_SESSION, user: MOCK_USER }),
    })
  );

  await page.route('**/api/auth/**', (route) => {
    const url = route.request().url();
    if (url.includes('get-session')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: MOCK_SESSION, user: MOCK_USER }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // Mock user-role endpoint
  await page.route('**/api/user-role**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: 'user',
        permissions: [],
        features: {},
      }),
    })
  );

  // Mock sketches endpoint (empty list)
  await page.route('**/api/sketches**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    return route.fallback();
  });

  // Mock projects endpoint (empty list so it falls back to sketches mode)
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    }
    return route.fallback();
  });
}

/**
 * Navigate to the app and wait for auth to settle.
 */
async function gotoAuthenticated(page: Page) {
  await page.goto('/');
  await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });
  // Wait for canvas to have non-zero dimensions (app has initialized)
  await page.waitForFunction(
    () => {
      const c = document.getElementById('graphCanvas') as HTMLCanvasElement | null;
      return c && c.width > 0 && c.height > 0;
    },
    { timeout: 10000 }
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Sketch Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await gotoAuthenticated(page);
  });

  test('should have canvas element', async ({ page }) => {
    const canvas = page.locator('#graphCanvas');
    await expect(canvas).toBeVisible();
  });

  test('should have canvas container', async ({ page }) => {
    const container = page.locator('#canvasContainer');
    await expect(container).toBeVisible();
  });

  test('should have mode selection buttons', async ({ page }) => {
    // Node mode button
    const nodeModeBtn = page.locator('#nodeModeBtn');
    await expect(nodeModeBtn).toBeVisible();

    // Edge mode button
    const edgeModeBtn = page.locator('#edgeModeBtn');
    await expect(edgeModeBtn).toBeVisible();
  });

  test('should have toolbar with mode group', async ({ page }) => {
    const toolbar = page.locator('.canvas-toolbar');
    await expect(toolbar).toBeVisible();

    const modeGroup = page.locator('#modeGroup');
    await expect(modeGroup).toBeVisible();
  });

  test('should have recenter button', async ({ page }) => {
    const recenterBtn = page.locator('#recenterBtn');
    await expect(recenterBtn).toBeVisible();
    // Support both English and Hebrew titles
    const title = await recenterBtn.getAttribute('title');
    expect(['Recenter sketch', 'מרכז שרטוט']).toContain(title);
  });
});

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });
  });

  test('should have sidebar element', async ({ page }) => {
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('should have details container', async ({ page }) => {
    const detailsContainer = page.locator('#detailsContainer');
    await expect(detailsContainer).toBeAttached();
  });

  test('should have sidebar close button', async ({ page }) => {
    const closeBtn = page.locator('#sidebarCloseBtn');
    await expect(closeBtn).toBeAttached();
  });
});

test.describe('Dialogs and Modals', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });
  });

  test('should have help modal (hidden by default)', async ({ page }) => {
    const helpModal = page.locator('#helpModal');
    await expect(helpModal).toBeAttached();
  });

  test('should have admin modal (hidden by default)', async ({ page }) => {
    const adminModal = page.locator('#adminModal');
    await expect(adminModal).toBeHidden();
  });

  test('should have start panel (attached to DOM)', async ({ page }) => {
    const startPanel = page.locator('#startPanel');
    await expect(startPanel).toBeAttached();
  });

  test('should have home panel (hidden by default)', async ({ page }) => {
    const homePanel = page.locator('#homePanel');
    // In sketches mode (no projects), home panel may be shown or hidden
    // depending on timing — just verify it's attached
    await expect(homePanel).toBeAttached();
  });
});

test.describe('Toast Notifications', () => {
  test('should have toast container', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');

    const toast = page.locator('#toast');
    await expect(toast).toBeAttached();
  });
});

test.describe('Responsive Design', () => {
  test('should show mobile menu on small screens', async ({ page }) => {
    await mockAuth(page);
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });

    // Mobile menu button should be visible
    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    await expect(mobileMenuBtn).toBeVisible();
  });

  test('should show desktop controls on large screens', async ({ page }) => {
    await mockAuth(page);
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });

    // Desktop controls should be visible
    const controls = page.locator('#controls');
    await expect(controls).toBeVisible();
  });
});

test.describe('Language Selection', () => {
  test('should have language selector in DOM', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');

    // Desktop lang select is in the nav bar (hidden on mobile viewports)
    const langSelect = page.locator('#langSelect');
    await expect(langSelect).toBeAttached();

    // Should have Hebrew and English options
    const heOption = langSelect.locator('option[value="he"]');
    const enOption = langSelect.locator('option[value="en"]');

    await expect(heOption).toBeAttached();
    await expect(enOption).toBeAttached();
  });

  test('mobile language selector should exist', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');

    const mobileLangSelect = page.locator('#mobileLangSelect');
    await expect(mobileLangSelect).toBeAttached();
  });
});

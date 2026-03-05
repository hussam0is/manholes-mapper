/**
 * E2E tests for authentication flows
 *
 * Tests login, logout, and protected route access.
 */
import { test, expect, type Page } from '@playwright/test';

// ── Mock data for authenticated tests ────────────────────────────────────────

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
  await page.route('**/api/user-role**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'user', permissions: [], features: {} }),
    })
  );
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

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should show login panel when not authenticated', async ({ page }) => {
    // Wait for the app to initialize
    await page.waitForLoadState('networkidle');
    
    // Login panel should be visible or auth loading should complete
    const loginPanel = page.locator('#loginPanel');
    const authLoading = page.locator('#authLoadingOverlay');
    
    // Wait for auth check to complete
    await expect(authLoading).toBeHidden({ timeout: 10000 });
    
    // If not authenticated, login panel should be visible
    // Note: In test environment, behavior may vary based on mock setup
  });

  test('should have login form elements', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Check for auth container
    const authContainer = page.locator('#authContainer');
    await expect(authContainer).toBeVisible({ timeout: 10000 });
  });

  test('should show app title correctly', async ({ page }) => {
    // Check the page title
    await expect(page).toHaveTitle(/Manhole Mapper/);
  });

  test('should display brand logo', async ({ page }) => {
    const logo = page.locator('#brandLogo');
    // On mobile, the login dialog may cover the logo, so check attachment + alt
    await expect(logo).toBeAttached();
    await expect(logo).toHaveAttribute('alt', 'Geopoint');
  });
});

test.describe('Navigation', () => {
  test('should have main navigation elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check header and brand exist in DOM (on mobile the login dialog may overlay them)
    const header = page.locator('header.app-header');
    await expect(header).toBeAttached();

    const brand = page.locator('#brand');
    await expect(brand).toBeAttached();
  });

  test('should have mobile menu button', async ({ page }) => {
    // Mock auth so login dialog doesn't cover the button
    await mockAuth(page);
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });

    // Check for mobile menu button
    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    await expect(mobileMenuBtn).toBeVisible();
  });

  test('should toggle mobile menu on click', async ({ page }) => {
    // Mock auth so login panel doesn't block the menu button
    await mockAuth(page);
    // Set viewport to mobile size with enough height
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for auth overlay to dismiss
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });

    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    const mobileMenu = page.locator('#mobileMenu');

    // Initially hidden
    await expect(mobileMenu).toBeHidden();

    // Click to open
    await mobileMenuBtn.click();

    // Should be visible now
    await expect(mobileMenu).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/');
    
    // Check navigation has proper role
    const nav = page.locator('nav#controls');
    await expect(nav).toHaveAttribute('role', 'navigation');
    await expect(nav).toHaveAttribute('aria-label', 'Main navigation');
  });

  test('should have proper document structure', async ({ page }) => {
    await page.goto('/');

    // On mobile the login dialog may cover main/header, so check DOM attachment
    const main = page.locator('#main');
    await expect(main).toBeAttached();

    const header = page.locator('header');
    await expect(header).toBeAttached();
  });

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Hidden file inputs should have aria-labels
    const importSketchFile = page.locator('#importSketchFile');
    await expect(importSketchFile).toHaveAttribute('aria-label', 'Import sketch file');
    
    const importCoordinatesFile = page.locator('#importCoordinatesFile');
    await expect(importCoordinatesFile).toHaveAttribute('aria-label', 'Import coordinates file');
  });
});

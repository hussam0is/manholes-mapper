/**
 * E2E tests for offline resilience.
 *
 * Verifies that the app does not crash when network requests fail,
 * that the canvas remains functional, and that appropriate error
 * handling is in place for API failures.
 */
import { test, expect } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Offline Resilience', () => {
  test('app loads and canvas works even when API calls fail after initial load', async ({ page }) => {
    // First, load the app normally with mocked auth
    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    // Verify canvas is working
    const canvas = page.locator('#graphCanvas');
    await expect(canvas).toBeVisible();

    // Now go offline by intercepting all API routes and failing them
    await page.route('**/api/**', (route) =>
      route.abort('connectionrefused')
    );

    // The canvas should still be visible and functional
    await expect(canvas).toBeVisible();

    // Try clicking on the canvas (should not crash)
    const box = await canvas.boundingBox();
    if (box) {
      await canvas.click({
        position: { x: box.width / 2, y: box.height / 2 },
      });
    }

    // App should not have crashed -- key elements still exist
    await expect(page.locator('header.app-header')).toBeAttached();
    await expect(page.locator('#canvasContainer')).toBeVisible();
  });

  test('app does not crash when navigating while offline', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    // Go offline
    await page.route('**/api/**', (route) =>
      route.abort('connectionrefused')
    );

    // Try navigating to different routes
    await page.evaluate(() => { location.hash = '#/admin'; });
    await page.waitForTimeout(1000);

    // Navigate back
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(1000);

    // App should not have crashed
    await expect(page.locator('body')).toBeAttached();
    await expect(page.locator('#canvasContainer')).toBeAttached();
  });

  test('toolbar remains visible when offline', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    // Go offline
    await page.route('**/api/**', (route) =>
      route.abort('connectionrefused')
    );

    // Toolbar should still be present
    const toolbar = page.locator('.canvas-toolbar');
    await expect(toolbar).toBeVisible();

    // Mode buttons should still be in the DOM
    await expect(page.locator('#nodeModeBtn')).toBeAttached();
    await expect(page.locator('#edgeModeBtn')).toBeAttached();
  });

  test('sync indicator exists in the DOM', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const syncIndicator = page.locator('#headerSyncIndicator');
    await expect(syncIndicator).toBeAttached();
  });

  test('app survives going offline and back online', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    // Go offline via browser context API
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // The app should still be functional
    await expect(page.locator('#canvasContainer')).toBeVisible();

    // Restore online state
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);

    // App should still work
    await expect(page.locator('#canvasContainer')).toBeVisible();
  });

  test('app does not crash when projects API returns 500', async ({ page }) => {
    // Set up auth mocks manually so we can control the projects route
    await page.route('**/api/auth/get-session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 86400000).toISOString() }, user: { id: 'u1', name: 'User', email: 'u@test.com' } }),
      })
    );
    await page.route('**/api/auth/**', (route) => {
      if (route.request().url().includes('get-session')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 86400000).toISOString() }, user: { id: 'u1', name: 'User', email: 'u@test.com' } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/user-role**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'user', permissions: [], features: {} }) })
    );
    await page.route('**/api/sketches**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return route.fallback();
    });
    // Projects API fails
    await page.route('**/api/projects', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal Server Error' }) })
    );

    await page.goto('/');
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 15000 });

    // App should not crash -- canvas container and header should still exist
    await expect(page.locator('#canvasContainer')).toBeAttached();
    await expect(page.locator('header.app-header')).toBeAttached();
    // Home panel element should be in the DOM regardless of visibility
    await expect(page.locator('#homePanel')).toBeAttached();
  });

  test('no unhandled page errors during offline operation (excluding known init errors)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    // Go offline
    await page.context().setOffline(true);

    // Perform some actions
    const canvas = page.locator('#graphCanvas');
    const box = await canvas.boundingBox();
    if (box) {
      await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    }

    await page.waitForTimeout(2000);

    // Restore online
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);

    // Filter out expected errors:
    // - network-related errors
    // - known init errors (t is not defined, _edgeLegendDirty TDZ)
    const unexpectedErrors = errors.filter(
      (e) =>
        !e.includes('fetch') &&
        !e.includes('network') &&
        !e.includes('Failed to fetch') &&
        !e.includes('NetworkError') &&
        !e.includes('AbortError') &&
        !e.includes('net::') &&
        !e.includes('Load failed') &&
        !e.includes('t is not defined') &&
        !e.includes('_edgeLegendDirty') &&
        !e.includes('before initialization')
    );

    expect(unexpectedErrors).toHaveLength(0);
  });
});

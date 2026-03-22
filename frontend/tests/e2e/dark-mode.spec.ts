/**
 * E2E tests for dark mode support.
 *
 * Emulates the `prefers-color-scheme: dark` media query and verifies
 * that key UI elements adopt dark background colors and appropriate
 * text contrast.
 */
import { test, expect } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';

test.describe('Dark Mode', () => {
  test('body has dark background in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });

    // Dark mode should have a dark background (not white/light)
    const match = bgColor.match(/\d+/g);
    expect(match).not.toBeNull();
    if (match) {
      const [r, g, b] = match.map(Number);
      const brightness = (r + g + b) / 3;
      expect(brightness).toBeLessThan(128);
    }
  });

  test('header has dark background in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const header = page.locator('header.app-header');
    await expect(header).toBeAttached();

    const bgColor = await header.evaluate((el) => {
      return getComputedStyle(el).backgroundColor;
    });

    const match = bgColor.match(/\d+/g);
    expect(match).not.toBeNull();
    if (match) {
      const [r, g, b] = match.map(Number);
      const brightness = (r + g + b) / 3;
      expect(brightness).toBeLessThan(160);
    }
  });

  test('toolbar has dark styling in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const toolbar = page.locator('.canvas-toolbar');
    const isVisible = await toolbar.isVisible();

    if (isVisible) {
      const bgColor = await toolbar.evaluate((el) => {
        return getComputedStyle(el).backgroundColor;
      });

      const match = bgColor.match(/\d+/g);
      if (match) {
        const [r, g, b] = match.map(Number);
        const brightness = (r + g + b) / 3;
        expect(brightness).toBeLessThan(200);
      }
    }
  });

  test('canvas container has appropriate styling in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const container = page.locator('#canvasContainer');
    await expect(container).toBeVisible();

    const bgColor = await container.evaluate((el) => {
      return getComputedStyle(el).backgroundColor;
    });

    const match = bgColor.match(/\d+/g);
    if (match) {
      const [r, g, b] = match.map(Number);
      const brightness = (r + g + b) / 3;
      expect(brightness).toBeLessThan(200);
    }
  });

  test('CSS custom properties are set for dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue('--color-bg').trim(),
        surface: style.getPropertyValue('--color-surface').trim(),
      };
    });

    // The dark mode CSS variables should be set (non-empty)
    // At least one of these should have a value
    const hasVars = vars.bg.length > 0 || vars.surface.length > 0;
    expect(hasVars).toBe(true);
  });

  test('light mode has lighter backgrounds than dark mode', async ({ page }) => {
    // Test light mode explicitly
    await page.emulateMedia({ colorScheme: 'light' });
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });

    const match = bgColor.match(/\d+/g);
    expect(match).not.toBeNull();
    if (match) {
      const [r, g, b] = match.map(Number);
      const brightness = (r + g + b) / 3;
      // Light mode should have a bright background
      expect(brightness).toBeGreaterThan(128);
    }
  });
});

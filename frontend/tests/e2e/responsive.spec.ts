/**
 * E2E tests for responsive design.
 *
 * Tests the app at mobile portrait (375x812), mobile landscape (812x375),
 * and desktop (1280x800) viewports to verify no layout overflow and that
 * the correct UI elements are shown/hidden at each breakpoint.
 */
import { test, expect } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, gotoAuthenticated, dismissHomePanel } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Responsive -- Mobile Portrait (375x812)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAuthUser(page);
  });

  test('no horizontal overflow at 375px width', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasOverflow).toBe(false);
  });

  test('mobile menu button is visible at 375px', async ({ page }) => {
    await gotoAuthenticated(page);

    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    await expect(mobileMenuBtn).toBeVisible({ timeout: 10000 });
  });

  test('desktop navigation is hidden at 375px', async ({ page }) => {
    await gotoAuthenticated(page);

    const controls = page.locator('#controls');
    await expect(controls).toBeHidden();
  });

  test('canvas fills available space at 375px', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const canvas = page.locator('#graphCanvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(300);
  });

  test('toolbar buttons are accessible at 375px', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const toolbar = page.locator('.canvas-toolbar');
    await expect(toolbar).toBeVisible();

    // Toolbar should not overflow the viewport
    const box = await toolbar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(380); // small tolerance
  });

  test('sidebar does not overflow at 375px', async ({ page }) => {
    await gotoCanvasReady(page);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();

    // When sidebar is open, it should not exceed viewport width
    const isOpen = await sidebar.evaluate((el) => el.classList.contains('open'));
    if (isOpen) {
      const box = await sidebar.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(375);
      }
    }
  });
});

test.describe('Responsive -- Mobile Landscape (812x375)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await mockAuthUser(page);
  });

  test('no horizontal overflow at 812x375 landscape', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasOverflow).toBe(false);
  });

  test('canvas container is visible in landscape', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const container = page.locator('#canvasContainer');
    await expect(container).toBeVisible();

    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    // Container should use most of the viewport width
    expect(box!.width).toBeGreaterThan(600);
  });

  test('header is present in landscape', async ({ page }) => {
    await gotoCanvasReady(page);

    const header = page.locator('header.app-header');
    await expect(header).toBeAttached();
  });

  test('toolbar is within viewport bounds in landscape', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const toolbar = page.locator('.canvas-toolbar');
    const isVisible = await toolbar.isVisible();

    if (isVisible) {
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      // Toolbar should be within viewport bounds
      expect(box!.x + box!.width).toBeLessThanOrEqual(820);
    }
  });

  test('app does not crash at landscape viewport', async ({ page }) => {
    await gotoCanvasReady(page);

    // Key elements should still be in the DOM
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#graphCanvas')).toBeVisible();
    await expect(page.locator('header.app-header')).toBeAttached();
  });
});

test.describe('Responsive -- Desktop (1280x800)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAuthUser(page);
  });

  test('desktop navigation is visible at 1280px', async ({ page }) => {
    await gotoAuthenticated(page);

    const controls = page.locator('#controls');
    await expect(controls).toBeVisible();
  });

  test('mobile menu button is hidden at 1280px', async ({ page }) => {
    await gotoAuthenticated(page);

    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    await expect(mobileMenuBtn).toBeHidden();
  });

  test('no horizontal overflow at 1280px', async ({ page }) => {
    await gotoCanvasReady(page);

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasOverflow).toBe(false);
  });

  test('canvas container takes most of desktop width', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const container = page.locator('#canvasContainer');
    await expect(container).toBeVisible();

    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(800);
  });

  test('brand logo is visible at desktop', async ({ page }) => {
    await gotoAuthenticated(page);

    const logo = page.locator('#brandLogo');
    await expect(logo).toBeVisible();
  });

  test('language selector is visible on desktop', async ({ page }) => {
    await gotoCanvasReady(page);

    const langSelect = page.locator('#langSelect');
    await expect(langSelect).toBeVisible();
  });
});

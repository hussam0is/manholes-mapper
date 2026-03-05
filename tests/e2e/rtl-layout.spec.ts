/**
 * E2E tests for RTL (right-to-left) layout.
 *
 * The app defaults to Hebrew (RTL). These tests verify the document
 * direction, element positioning, and that language selection elements
 * are correctly set up.
 */
import { test, expect } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, gotoAuthenticated, dismissHomePanel } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('RTL Layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthUser(page);
  });

  test('document has dir="rtl" by default (Hebrew)', async ({ page }) => {
    await gotoAuthenticated(page);

    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  });

  test('document has lang="he" by default', async ({ page }) => {
    await gotoAuthenticated(page);

    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBe('he');
  });

  test('header brand is aligned to the right in RTL', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoCanvasReady(page);

    const brand = page.locator('#brand');
    const header = page.locator('header.app-header');

    const brandBox = await brand.boundingBox();
    const headerBox = await header.boundingBox();

    expect(brandBox).not.toBeNull();
    expect(headerBox).not.toBeNull();

    if (brandBox && headerBox) {
      const brandRight = brandBox.x + brandBox.width;
      const headerRight = headerBox.x + headerBox.width;
      // In RTL, the brand should be near the right side of the header
      expect(headerRight - brandRight).toBeLessThan(200);
    }
  });

  test('sidebar has RTL direction', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();

    const direction = await sidebar.evaluate((el) => {
      return getComputedStyle(el).direction;
    });

    expect(direction).toBe('rtl');
  });

  test('canvas toolbar respects RTL direction', async ({ page }) => {
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const toolbar = page.locator('.canvas-toolbar');
    const isVisible = await toolbar.isVisible();

    if (isVisible) {
      const direction = await toolbar.evaluate((el) => {
        return getComputedStyle(el).direction;
      });

      expect(direction).toBe('rtl');
    }
  });

  test('language selector has Hebrew option selected by default', async ({ page }) => {
    await gotoCanvasReady(page);

    const langSelect = page.locator('#langSelect');
    await expect(langSelect).toBeAttached();

    const value = await langSelect.inputValue();
    expect(value).toBe('he');
  });

  test('language selector has both Hebrew and English options', async ({ page }) => {
    await gotoCanvasReady(page);

    const options = await page.evaluate(() => {
      const select = document.getElementById('langSelect') as HTMLSelectElement;
      if (!select) return [];
      return Array.from(select.options).map(o => o.value);
    });

    expect(options).toContain('he');
    expect(options).toContain('en');
  });

  test('material icons render with correct font-family', async ({ page }) => {
    await gotoCanvasReady(page);

    const iconFont = await page.evaluate(() => {
      const icon = document.querySelector('.material-icons');
      if (!icon) return '';
      return getComputedStyle(icon).fontFamily;
    });

    expect(iconFont.toLowerCase()).toContain('material');
  });
});

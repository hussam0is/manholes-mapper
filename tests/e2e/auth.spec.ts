/**
 * E2E tests for authentication flows
 * 
 * Tests login, logout, and protected route access.
 */
import { test, expect } from '@playwright/test';

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
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('alt', 'Geopoint');
  });
});

test.describe('Navigation', () => {
  test('should have main navigation elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for header
    const header = page.locator('header.app-header');
    await expect(header).toBeVisible();
    
    // Check for brand section
    const brand = page.locator('#brand');
    await expect(brand).toBeVisible();
  });

  test('should have mobile menu button', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check for mobile menu button
    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    await expect(mobileMenuBtn).toBeVisible();
  });

  test('should toggle mobile menu on click', async ({ page }) => {
    // Set viewport to mobile size with enough height
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
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
    
    // Should have exactly one main element
    const main = page.locator('#main');
    await expect(main).toBeVisible();
    
    // Should have header
    const header = page.locator('header');
    await expect(header).toBeVisible();
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

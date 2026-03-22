/**
 * Design Audit Screenshot Capture Script
 * Captures all key screens of the Manholes Mapper app for design audit.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('app_state_2026-03-04');
mkdirSync(OUTPUT_DIR, { recursive: true });

const APP_URL = 'https://manholes-mapper.vercel.app';
const CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || (() => { throw new Error('ADMIN_EMAIL env var is required'); })(),
  password: process.env.ADMIN_PASSWORD || (() => { throw new Error('ADMIN_PASSWORD env var is required'); })(),
};

let counter = 1;
function screenshotPath(workflow, description) {
  const num = String(counter++).padStart(2, '0');
  return path.join(OUTPUT_DIR, `${num}_${workflow}_${description}.png`);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ===== DESKTOP VIEWPORT =====
  console.log('--- DESKTOP VIEWPORT (1280x800) ---');
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL',
    colorScheme: 'light'
  });
  const page = await desktopCtx.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ text: err.message, url: page.url() });
  });

  // === WORKFLOW A: Login ===
  console.log('A: Login flow');
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await delay(2000);
  await page.screenshot({ path: screenshotPath('A', 'pre_login_page'), fullPage: false });

  // Navigate to login
  await page.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await delay(2000);
  await page.screenshot({ path: screenshotPath('A', 'login_form'), fullPage: false });

  // Fill login form
  try {
    // Wait for React auth form to render
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[name="email"]', CREDENTIALS.email);
    await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.password);
    await page.screenshot({ path: screenshotPath('A', 'login_form_filled'), fullPage: false });

    // Submit
    await page.click('button[type="submit"]');
    await delay(5000);
    await page.screenshot({ path: screenshotPath('A', 'after_login'), fullPage: false });
  } catch (e) {
    console.log('Login form interaction error:', e.message);
    await page.screenshot({ path: screenshotPath('A', 'login_error'), fullPage: false });
  }

  // === WORKFLOW A: Home Panel ===
  console.log('A: Home panel');
  try {
    await page.goto(`${APP_URL}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await page.screenshot({ path: screenshotPath('A', 'home_panel'), fullPage: false });
  } catch (e) {
    console.log('Home panel error:', e.message);
  }

  // === WORKFLOW B: Canvas View ===
  console.log('B: Canvas view');
  try {
    // Close any overlay and go to canvas
    await page.evaluate(() => {
      const homePanel = document.getElementById('homePanel');
      if (homePanel) homePanel.style.display = 'none';
      const startPanel = document.getElementById('startPanel');
      if (startPanel) startPanel.style.display = 'none';
    });
    await delay(1000);
    await page.screenshot({ path: screenshotPath('B', 'canvas_view'), fullPage: false });
  } catch (e) {
    console.log('Canvas error:', e.message);
  }

  // === WORKFLOW B: Canvas toolbar ===
  console.log('B: Canvas toolbar');
  try {
    await page.screenshot({ path: screenshotPath('B', 'canvas_toolbar_area'), fullPage: false });
  } catch (e) {
    console.log('Toolbar error:', e.message);
  }

  // === WORKFLOW B: Header / Desktop Menu ===
  console.log('B: Header and desktop menu');
  try {
    // Click "More" menu button if exists
    const exportMenuBtn = await page.$('#exportMenuBtn');
    if (exportMenuBtn) {
      await exportMenuBtn.click();
      await delay(500);
      await page.screenshot({ path: screenshotPath('B', 'desktop_more_menu'), fullPage: false });
      // Close it
      await exportMenuBtn.click();
      await delay(300);
    }
  } catch (e) {
    console.log('Menu error:', e.message);
  }

  // === WORKFLOW C: Projects Page ===
  console.log('C: Projects page');
  try {
    await page.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await page.screenshot({ path: screenshotPath('C', 'projects_page'), fullPage: false });
  } catch (e) {
    console.log('Projects error:', e.message);
  }

  // === WORKFLOW C: Open me_rakat project ===
  console.log('C: Open project');
  try {
    // Find and click me_rakat project
    const projectCards = await page.$$('.project-card, [data-project-id], .card');
    console.log(`Found ${projectCards.length} project cards`);

    // Try clicking the first project's "Open Canvas" or similar button
    const openBtn = await page.$('text=פתח >> nth=0');
    if (openBtn) {
      await openBtn.click();
      await delay(4000);
      await page.screenshot({ path: screenshotPath('C', 'project_canvas_view'), fullPage: false });
    } else {
      // Try other selectors for opening a project
      const anyOpenBtn = await page.$('[data-action="open-canvas"], .btn-open-canvas, text=Open');
      if (anyOpenBtn) {
        await anyOpenBtn.click();
        await delay(4000);
        await page.screenshot({ path: screenshotPath('C', 'project_canvas_view'), fullPage: false });
      }
    }
  } catch (e) {
    console.log('Open project error:', e.message);
  }

  // === WORKFLOW C: Sketch Side Panel ===
  console.log('C: Sketch side panel');
  try {
    const sidePanelToggle = await page.$('#sketchSidePanelToggle');
    if (sidePanelToggle) {
      await sidePanelToggle.click();
      await delay(1000);
      await page.screenshot({ path: screenshotPath('C', 'sketch_side_panel'), fullPage: false });
    }
  } catch (e) {
    console.log('Side panel error:', e.message);
  }

  // === WORKFLOW D: Admin Panel ===
  console.log('D: Admin panel');
  try {
    await page.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await page.screenshot({ path: screenshotPath('D', 'admin_panel'), fullPage: false });

    // Click Users tab if visible
    const usersTab = await page.$('text=משתמשים, text=Users, [data-tab="users"]');
    if (usersTab) {
      await usersTab.click();
      await delay(1000);
      await page.screenshot({ path: screenshotPath('D', 'admin_users_tab'), fullPage: false });
    }

    // Click Organizations tab
    const orgsTab = await page.$('text=ארגונים, text=Organizations, [data-tab="organizations"]');
    if (orgsTab) {
      await orgsTab.click();
      await delay(1000);
      await page.screenshot({ path: screenshotPath('D', 'admin_orgs_tab'), fullPage: false });
    }

    // Click Features tab
    const featuresTab = await page.$('text=תכונות, text=Features, [data-tab="features"]');
    if (featuresTab) {
      await featuresTab.click();
      await delay(1000);
      await page.screenshot({ path: screenshotPath('D', 'admin_features_tab'), fullPage: false });
    }
  } catch (e) {
    console.log('Admin error:', e.message);
  }

  // === WORKFLOW F: Settings ===
  console.log('F: Language toggle (English)');
  try {
    // Go back to canvas
    await page.goto(`${APP_URL}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(2000);

    // Try to switch to English
    const langSelect = await page.$('#langSelect');
    if (langSelect) {
      await langSelect.selectOption('en');
      await delay(1000);
      await page.screenshot({ path: screenshotPath('F', 'english_mode'), fullPage: false });
      // Switch back to Hebrew
      await langSelect.selectOption('he');
      await delay(500);
    }
  } catch (e) {
    console.log('Language toggle error:', e.message);
  }

  // === WORKFLOW F: Help Modal ===
  console.log('F: Help modal');
  try {
    const helpBtn = await page.$('#helpBtn');
    if (helpBtn) {
      await helpBtn.click();
      await delay(500);
      await page.screenshot({ path: screenshotPath('F', 'help_modal'), fullPage: false });
      // Close
      const closeHelp = await page.$('#closeHelpBtn');
      if (closeHelp) await closeHelp.click();
      await delay(300);
    }
  } catch (e) {
    console.log('Help modal error:', e.message);
  }

  // === WORKFLOW F: User Menu ===
  console.log('F: User menu');
  try {
    const userTrigger = await page.$('.user-menu-trigger');
    if (userTrigger) {
      await userTrigger.click();
      await delay(500);
      await page.screenshot({ path: screenshotPath('F', 'user_menu_dropdown'), fullPage: false });
      // Close by clicking elsewhere
      await page.click('body', { position: { x: 100, y: 100 } });
      await delay(300);
    }
  } catch (e) {
    console.log('User menu error:', e.message);
  }

  // Close desktop context
  await desktopCtx.close();

  // ===== DARK MODE DESKTOP =====
  console.log('\n--- DARK MODE (1280x800) ---');
  const darkCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL',
    colorScheme: 'dark'
  });
  const darkPage = await darkCtx.newPage();

  try {
    await darkPage.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    await darkPage.screenshot({ path: screenshotPath('F', 'dark_mode_login'), fullPage: false });

    // Login in dark mode
    await darkPage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await darkPage.fill('input[type="email"]', CREDENTIALS.email);
    await darkPage.fill('input[type="password"]', CREDENTIALS.password);
    await darkPage.click('button[type="submit"]');
    await delay(5000);
    await darkPage.screenshot({ path: screenshotPath('F', 'dark_mode_after_login'), fullPage: false });

    // Home panel dark
    await darkPage.goto(`${APP_URL}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await darkPage.screenshot({ path: screenshotPath('F', 'dark_mode_home'), fullPage: false });

    // Canvas dark
    await darkPage.evaluate(() => {
      const homePanel = document.getElementById('homePanel');
      if (homePanel) homePanel.style.display = 'none';
    });
    await delay(1000);
    await darkPage.screenshot({ path: screenshotPath('F', 'dark_mode_canvas'), fullPage: false });

    // Admin dark
    await darkPage.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await darkPage.screenshot({ path: screenshotPath('F', 'dark_mode_admin'), fullPage: false });
  } catch (e) {
    console.log('Dark mode error:', e.message);
  }

  await darkCtx.close();

  // ===== MOBILE VIEWPORT =====
  console.log('\n--- MOBILE VIEWPORT (360x740) ---');
  const mobileCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    colorScheme: 'light',
    userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-N970F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileCtx.newPage();

  // Mobile console errors
  mobilePage.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: `[MOBILE] ${msg.text()}`, url: mobilePage.url() });
    }
  });

  console.log('E: Mobile login');
  try {
    await mobilePage.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_login'), fullPage: false });

    // Login on mobile
    await mobilePage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await mobilePage.fill('input[type="email"]', CREDENTIALS.email);
    await mobilePage.fill('input[type="password"]', CREDENTIALS.password);
    await mobilePage.click('button[type="submit"]');
    await delay(5000);
    await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_after_login'), fullPage: false });
  } catch (e) {
    console.log('Mobile login error:', e.message);
  }

  // Mobile home panel
  console.log('E: Mobile home');
  try {
    await mobilePage.goto(`${APP_URL}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_home_panel'), fullPage: false });
  } catch (e) {
    console.log('Mobile home error:', e.message);
  }

  // Mobile canvas
  console.log('E: Mobile canvas');
  try {
    await mobilePage.evaluate(() => {
      const homePanel = document.getElementById('homePanel');
      if (homePanel) homePanel.style.display = 'none';
      const startPanel = document.getElementById('startPanel');
      if (startPanel) startPanel.style.display = 'none';
    });
    await delay(1000);
    await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_canvas'), fullPage: false });
  } catch (e) {
    console.log('Mobile canvas error:', e.message);
  }

  // Mobile hamburger menu
  console.log('E: Mobile hamburger menu');
  try {
    const hamburger = await mobilePage.$('#mobileMenuBtn');
    if (hamburger) {
      await hamburger.click();
      await delay(1000);
      await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_hamburger_menu'), fullPage: false });

      // Scroll down in menu to see all items
      const mobileMenu = await mobilePage.$('#mobileMenu');
      if (mobileMenu) {
        await mobilePage.evaluate(el => el.scrollTop = 300, mobileMenu);
        await delay(500);
        await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_menu_scrolled'), fullPage: false });

        await mobilePage.evaluate(el => el.scrollTop = 600, mobileMenu);
        await delay(500);
        await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_menu_scrolled_more'), fullPage: false });
      }

      // Close menu
      const closeBtn = await mobilePage.$('#mobileMenuCloseBtn');
      if (closeBtn) await closeBtn.click();
      await delay(500);
    }
  } catch (e) {
    console.log('Mobile hamburger error:', e.message);
  }

  // Mobile admin
  console.log('E: Mobile admin');
  try {
    await mobilePage.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_admin'), fullPage: false });
  } catch (e) {
    console.log('Mobile admin error:', e.message);
  }

  // Mobile projects
  console.log('E: Mobile projects');
  try {
    await mobilePage.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await mobilePage.screenshot({ path: screenshotPath('E', 'mobile_projects'), fullPage: false });
  } catch (e) {
    console.log('Mobile projects error:', e.message);
  }

  // Mobile dark mode
  console.log('E: Mobile dark mode');
  const mobileDarkCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-N970F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true
  });
  const mobileDarkPage = await mobileDarkCtx.newPage();

  try {
    await mobileDarkPage.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    await mobileDarkPage.screenshot({ path: screenshotPath('E', 'mobile_dark_login'), fullPage: false });

    // Login
    await mobileDarkPage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await mobileDarkPage.fill('input[type="email"]', CREDENTIALS.email);
    await mobileDarkPage.fill('input[type="password"]', CREDENTIALS.password);
    await mobileDarkPage.click('button[type="submit"]');
    await delay(5000);

    await mobileDarkPage.goto(`${APP_URL}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);
    await mobileDarkPage.screenshot({ path: screenshotPath('E', 'mobile_dark_home'), fullPage: false });

    await mobileDarkPage.evaluate(() => {
      const homePanel = document.getElementById('homePanel');
      if (homePanel) homePanel.style.display = 'none';
    });
    await delay(1000);
    await mobileDarkPage.screenshot({ path: screenshotPath('E', 'mobile_dark_canvas'), fullPage: false });
  } catch (e) {
    console.log('Mobile dark mode error:', e.message);
  }

  await mobileDarkCtx.close();
  await mobileCtx.close();

  // ===== EXTRA: Wide desktop for admin panels =====
  console.log('\n--- WIDE DESKTOP (1440x900) ---');
  const wideCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'he-IL',
    colorScheme: 'light'
  });
  const widePage = await wideCtx.newPage();

  try {
    // Login
    await widePage.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    await widePage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await widePage.fill('input[type="email"]', CREDENTIALS.email);
    await widePage.fill('input[type="password"]', CREDENTIALS.password);
    await widePage.click('button[type="submit"]');
    await delay(5000);

    // Open a sketch from home to see canvas with data
    await widePage.goto(`${APP_URL}/#/`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);

    // Click first sketch in the list
    const sketchCards = await widePage.$$('#sketchList .sketch-card, #sketchList .card, #sketchList li');
    console.log(`Found ${sketchCards.length} sketch cards in home panel`);
    if (sketchCards.length > 0) {
      await sketchCards[0].click();
      await delay(3000);
      await widePage.screenshot({ path: screenshotPath('B', 'canvas_with_sketch_data'), fullPage: false });
    }

    // Try selecting a node by clicking canvas
    const canvas = await widePage.$('#canvas, canvas');
    if (canvas) {
      // Click somewhere on the canvas
      const box = await canvas.boundingBox();
      if (box) {
        await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
        await delay(1000);
        await widePage.screenshot({ path: screenshotPath('B', 'canvas_interaction'), fullPage: false });
      }
    }

    // Check sidebar/drawer state
    const sidebar = await widePage.$('#sidebar');
    if (sidebar) {
      const visible = await sidebar.isVisible();
      if (visible) {
        await widePage.screenshot({ path: screenshotPath('B', 'sidebar_details_panel'), fullPage: false });
      }
    }

    // Open admin settings
    await widePage.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 });
    await delay(3000);

    // Try clicking Settings gear
    const settingsBtn = await widePage.$('#adminBtn, text=הגדרות, text=Settings');
    if (settingsBtn) {
      await settingsBtn.click();
      await delay(2000);
    }
    await widePage.screenshot({ path: screenshotPath('D', 'admin_settings_wide'), fullPage: false });

  } catch (e) {
    console.log('Wide desktop error:', e.message);
  }

  await wideCtx.close();

  // Print console errors
  console.log('\n=== CONSOLE ERRORS ===');
  if (consoleErrors.length === 0) {
    console.log('No console errors captured');
  } else {
    consoleErrors.forEach((err, i) => {
      console.log(`${i + 1}. [${err.url}] ${err.text}`);
    });
  }

  console.log(`\nTotal screenshots captured: ${counter - 1}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Capture screenshots of the Manholes Mapper app for design audit.
 * Uses Vercel preview URL where auth API routes are available.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'app_state_2026-03-04');
const BASE_URL = 'https://manholes-mapper-git-dev-hussam0is-projects.vercel.app';
const CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || (() => { throw new Error('ADMIN_EMAIL env var is required'); })(),
  password: process.env.ADMIN_PASSWORD || (() => { throw new Error('ADMIN_PASSWORD env var is required'); })(),
};

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

let screenshotNum = 15; // Continue numbering from previous captures
async function screenshot(page, name) {
  const path = join(OUTPUT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`  [OK] ${name}`);
}

async function main() {
  console.log('Launching browser (targeting Vercel preview)...');
  const browser = await chromium.launch({ headless: true });

  // Desktop context
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
    ignoreHTTPSErrors: true,
  });

  const page = await desktopContext.newPage();

  // Collect console errors
  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`PAGE_ERROR: ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  // ===== STEP 1: Navigate to login =====
  console.log('\n=== Step 1: Navigate to Vercel Preview ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('  (networkidle timeout, continuing)');
  }
  await page.waitForTimeout(3000);

  const hash = await page.evaluate(() => window.location.hash);
  console.log(`  Hash: ${hash}`);
  await screenshot(page, '15_vercel_initial.png');

  // ===== STEP 2: Login =====
  console.log('\n=== Step 2: Login ===');
  // Wait for React auth form
  await page.waitForTimeout(2000);
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  const passwordInput = await page.$('input[type="password"], input[name="password"]');

  if (emailInput && passwordInput) {
    await emailInput.fill(CREDENTIALS.email);
    await passwordInput.fill(CREDENTIALS.password);
    await screenshot(page, '16_A_login_filled.png');

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('  Login submitted...');

      // Wait for either successful navigation or error
      try {
        await page.waitForFunction(
          () => window.location.hash !== '#/login' && window.location.hash !== '#/signup',
          { timeout: 15000 }
        );
        console.log('  Login succeeded!');
      } catch (e) {
        console.log('  Login may have failed or timed out');
      }
      await page.waitForTimeout(3000);
      await screenshot(page, '17_A_post_login.png');

      const postLoginHash = await page.evaluate(() => window.location.hash);
      console.log(`  Post-login hash: ${postLoginHash}`);
    }
  } else {
    console.log('  No login form found, checking current state...');
    await screenshot(page, '16_A_no_login_form.png');
  }

  // ===== STEP 3: Home Panel (sketch list) =====
  console.log('\n=== Step 3: Home Panel ===');
  await page.evaluate(() => { window.location.hash = '#/'; });
  await page.waitForTimeout(3000);
  await screenshot(page, '18_A_home_panel.png');

  // Check home panel content
  const homeState = await page.evaluate(() => {
    const homePanel = document.getElementById('homePanel');
    const sketchList = document.getElementById('sketchList');
    return {
      homePanelDisplay: homePanel ? window.getComputedStyle(homePanel).display : 'missing',
      sketchCount: sketchList ? sketchList.children.length : 0,
      syncText: document.getElementById('syncStatusText')?.textContent,
    };
  });
  console.log(`  Home panel: ${homeState.homePanelDisplay}, Sketches: ${homeState.sketchCount}, Sync: ${homeState.syncText}`);

  // ===== STEP 4: Canvas View =====
  console.log('\n=== Step 4: Canvas View ===');
  // Close home panel and go to canvas
  const homePanelCloseBtn = await page.$('#homePanelCloseBtn');
  if (homePanelCloseBtn) {
    await homePanelCloseBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  await screenshot(page, '19_B_canvas_desktop.png');

  // Check canvas toolbar
  const toolbarInfo = await page.evaluate(() => {
    const modeGroup = document.getElementById('modeGroup');
    const header = document.getElementById('appHeader');
    const sidebar = document.getElementById('sidebar');
    return {
      modeGroupVisible: modeGroup ? window.getComputedStyle(modeGroup).display !== 'none' : false,
      headerHeight: header ? window.getComputedStyle(header).height : 'missing',
      sidebarDisplay: sidebar ? window.getComputedStyle(sidebar).display : 'missing',
      headerDisplay: header ? window.getComputedStyle(header).display : 'missing',
    };
  });
  console.log(`  Toolbar: ${JSON.stringify(toolbarInfo)}`);

  // ===== STEP 5: Open hamburger menu on desktop =====
  console.log('\n=== Step 5: Desktop Menu ===');
  const exportMenuBtn = await page.$('#exportMenuBtn');
  if (exportMenuBtn) {
    await exportMenuBtn.click();
    await page.waitForTimeout(500);
    await screenshot(page, '20_B_desktop_menu.png');
    // Close it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ===== STEP 6: Projects Page =====
  console.log('\n=== Step 6: Projects ===');
  await page.evaluate(() => { window.location.hash = '#/projects'; });
  await page.waitForTimeout(3000);
  await screenshot(page, '21_C_projects_desktop.png');

  // ===== STEP 7: Admin Page =====
  console.log('\n=== Step 7: Admin ===');
  await page.evaluate(() => { window.location.hash = '#/admin'; });
  await page.waitForTimeout(3000);
  await screenshot(page, '22_D_admin_desktop.png');

  // ===== STEP 8: Language toggle to English =====
  console.log('\n=== Step 8: English Mode ===');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  const langSelect = await page.$('#langSelect');
  if (langSelect) {
    await langSelect.selectOption('en');
    await page.waitForTimeout(1500);
    await screenshot(page, '23_F_english_canvas.png');
    // Switch back to Hebrew
    await langSelect.selectOption('he');
    await page.waitForTimeout(1000);
  }

  // ===== STEP 9: Dark Mode Check =====
  console.log('\n=== Step 9: Dark Mode ===');
  const darkContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
    colorScheme: 'dark',
    ignoreHTTPSErrors: true,
    storageState: await desktopContext.storageState(),
  });
  const darkPage = await darkContext.newPage();
  try {
    await darkPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('  (dark mode networkidle timeout)');
  }
  await darkPage.waitForTimeout(5000);
  await screenshot(darkPage, '24_F_dark_mode.png');
  await darkContext.close();

  // ===== STEP 10: Mobile viewport =====
  console.log('\n=== Step 10: Mobile Viewport ===');
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  });
  const mobilePage = await mobileContext.newPage();

  try {
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('  (mobile networkidle timeout)');
  }
  await mobilePage.waitForTimeout(3000);
  await screenshot(mobilePage, '25_E_mobile_login.png');

  // Login on mobile
  const mEmailInput = await mobilePage.$('input[type="email"]');
  const mPassInput = await mobilePage.$('input[type="password"]');
  if (mEmailInput && mPassInput) {
    await mEmailInput.fill(CREDENTIALS.email);
    await mPassInput.fill(CREDENTIALS.password);
    const mSubmit = await mobilePage.$('button[type="submit"]');
    if (mSubmit) {
      await mSubmit.click();
      try {
        await mobilePage.waitForFunction(
          () => window.location.hash !== '#/login' && window.location.hash !== '#/signup',
          { timeout: 15000 }
        );
      } catch (e) {
        console.log('  Mobile login timed out');
      }
      await mobilePage.waitForTimeout(3000);
      await screenshot(mobilePage, '26_E_mobile_post_login.png');
    }
  }

  // Mobile canvas
  await mobilePage.evaluate(() => { window.location.hash = ''; });
  await mobilePage.waitForTimeout(2000);
  await screenshot(mobilePage, '27_E_mobile_canvas.png');

  // Mobile hamburger menu
  const mobileMenuBtn = await mobilePage.$('#mobileMenuBtn');
  if (mobileMenuBtn) {
    const menuVisible = await mobilePage.evaluate(() => {
      const btn = document.getElementById('mobileMenuBtn');
      return btn && window.getComputedStyle(btn).display !== 'none';
    });
    if (menuVisible) {
      await mobileMenuBtn.click();
      await mobilePage.waitForTimeout(1000);
      await screenshot(mobilePage, '28_E_mobile_menu.png');

      // Close menu
      const mCloseBtn = await mobilePage.$('#mobileMenuCloseBtn');
      if (mCloseBtn) await mCloseBtn.click();
      await mobilePage.waitForTimeout(500);
    }
  }

  // Mobile home panel
  await mobilePage.evaluate(() => { window.location.hash = '#/'; });
  await mobilePage.waitForTimeout(2000);
  await screenshot(mobilePage, '29_E_mobile_home.png');

  // ===== Write report =====
  console.log('\n=== Console Errors ===');
  console.log(`  Total errors: ${consoleErrors.length}`);
  consoleErrors.forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 200)}`));
  console.log(`\n  Total network errors: ${networkErrors.length}`);
  networkErrors.forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 200)}`));

  // Write summary report
  const report = {
    url: BASE_URL,
    timestamp: new Date().toISOString(),
    consoleErrors: consoleErrors.slice(0, 30),
    networkErrors: networkErrors.slice(0, 30),
    screenshots: [
      '15_vercel_initial.png',
      '16_A_login_filled.png',
      '17_A_post_login.png',
      '18_A_home_panel.png',
      '19_B_canvas_desktop.png',
      '20_B_desktop_menu.png',
      '21_C_projects_desktop.png',
      '22_D_admin_desktop.png',
      '23_F_english_canvas.png',
      '24_F_dark_mode.png',
      '25_E_mobile_login.png',
      '26_E_mobile_post_login.png',
      '27_E_mobile_canvas.png',
      '28_E_mobile_menu.png',
      '29_E_mobile_home.png',
    ],
  };
  writeFileSync(join(OUTPUT_DIR, 'capture_report.json'), JSON.stringify(report, null, 2));

  await mobileContext.close();
  await browser.close();
  console.log('\n=== DONE ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

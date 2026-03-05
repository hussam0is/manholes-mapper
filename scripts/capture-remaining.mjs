/**
 * Capture remaining screenshots (projects, admin, mobile, dark mode).
 * Reuses session cookies from production login.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'app_state_2026-03-04');
const BASE_URL = 'https://manholes-mapper.vercel.app';
const CREDENTIALS = { email: 'admin@geopoint.me', password: 'Geopoint2026!' };

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function ss(page, name) {
  await page.screenshot({ path: join(OUTPUT_DIR, name), fullPage: false });
  console.log(`  [OK] ${name}`);
}

async function login(page) {
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) { /* ok */ }
  await page.waitForTimeout(3000);

  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await emailInput.fill(CREDENTIALS.email);
    const passInput = await page.$('input[type="password"]');
    if (passInput) await passInput.fill(CREDENTIALS.password);
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      try {
        await page.waitForFunction(
          () => {
            const lp = document.getElementById('loginPanel');
            return !lp || window.getComputedStyle(lp).display === 'none' || lp.hidden;
          },
          { timeout: 15000 }
        );
      } catch (e) { /* ok */ }
      await page.waitForTimeout(3000);
    }
    return true;
  }
  return false;
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });

  // ============================================
  // DESKTOP
  // ============================================
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await login(page);

  // Canvas
  console.log('\n=== Canvas ===');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  await ss(page, '34_B_canvas.png');

  // Desktop Command Menu (apps/more button)
  console.log('\n=== Desktop Command Menu ===');
  const exportBtn = await page.evaluate(() => {
    const btn = document.getElementById('exportMenuBtn');
    if (!btn) return false;
    const s = window.getComputedStyle(btn);
    return s.display !== 'none' && s.visibility !== 'hidden';
  });
  if (exportBtn) {
    await page.click('#exportMenuBtn');
    await page.waitForTimeout(800);
    await ss(page, '35_B_command_menu.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('  Command menu button not visible');
  }

  // Home panel via home button
  console.log('\n=== Home Panel ===');
  const homeBtn = await page.evaluate(() => {
    const btn = document.getElementById('homeBtn');
    if (!btn) return false;
    return window.getComputedStyle(btn).display !== 'none';
  });
  if (homeBtn) {
    await page.click('#homeBtn');
    await page.waitForTimeout(2000);
    await ss(page, '33b_A_home_via_button.png');
    // Close via keyboard
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Projects
  console.log('\n=== Projects ===');
  await page.evaluate(() => { window.location.hash = '#/projects'; });
  await page.waitForTimeout(3000);
  await ss(page, '36_C_projects.png');

  // Admin
  console.log('\n=== Admin ===');
  await page.evaluate(() => { window.location.hash = '#/admin'; });
  await page.waitForTimeout(3000);
  await ss(page, '37_D_admin.png');

  // English
  console.log('\n=== English ===');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  const langSel = await page.$('#langSelect');
  if (langSel) {
    await langSel.selectOption('en');
    await page.waitForTimeout(1500);
    await ss(page, '38_F_english.png');
    await langSel.selectOption('he');
    await page.waitForTimeout(800);
  } else {
    console.log('  No lang select found');
  }

  // Store cookies for dark mode
  const storage = await ctx.storageState();
  await ctx.close();

  // ============================================
  // DARK MODE
  // ============================================
  console.log('\n=== Dark Mode ===');
  const darkCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
    colorScheme: 'dark',
    storageState: storage,
  });
  const dp = await darkCtx.newPage();
  try {
    await dp.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) { /* ok */ }
  await dp.waitForTimeout(4000);

  // Check if we need to re-login in dark mode
  const darkHash = await dp.evaluate(() => window.location.hash);
  console.log(`  Dark hash: ${darkHash}`);
  if (darkHash === '#/login') {
    await login(dp);
  }
  await ss(dp, '39_F_dark_initial.png');

  await dp.evaluate(() => { window.location.hash = ''; });
  await dp.waitForTimeout(2000);
  await ss(dp, '40_F_dark_canvas.png');

  await darkCtx.close();

  // ============================================
  // MOBILE
  // ============================================
  console.log('\n=== Mobile ===');
  const mCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mCtx.newPage();

  const mobileErrors = [];
  mp.on('console', (msg) => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });

  await login(mp);
  await ss(mp, '41_E_mobile_post_login.png');

  // Mobile canvas
  await mp.evaluate(() => { window.location.hash = ''; });
  await mp.waitForTimeout(2000);
  await ss(mp, '42_E_mobile_canvas.png');

  // Mobile hamburger
  const mmVis = await mp.evaluate(() => {
    const b = document.getElementById('mobileMenuBtn');
    return b ? window.getComputedStyle(b).display !== 'none' : false;
  });
  if (mmVis) {
    await mp.click('#mobileMenuBtn');
    await mp.waitForTimeout(1000);
    await ss(mp, '43_E_mobile_menu.png');

    // Scroll menu
    await mp.evaluate(() => {
      const c = document.querySelector('.mobile-menu-content');
      if (c) c.scrollTop = c.scrollHeight;
    });
    await mp.waitForTimeout(500);
    await ss(mp, '44_E_mobile_menu_bottom.png');

    // Close
    const mClose = await mp.$('#mobileMenuCloseBtn');
    if (mClose) {
      try { await mClose.click({ timeout: 3000 }); } catch (e) { /* ok */ }
    }
    await mp.waitForTimeout(500);
  }

  // Mobile home
  await mp.evaluate(() => { window.location.hash = '#/'; });
  await mp.waitForTimeout(2000);
  await ss(mp, '45_E_mobile_home.png');

  // Mobile projects
  await mp.evaluate(() => { window.location.hash = '#/projects'; });
  await mp.waitForTimeout(3000);
  await ss(mp, '46_E_mobile_projects.png');

  // Mobile admin
  await mp.evaluate(() => { window.location.hash = '#/admin'; });
  await mp.waitForTimeout(3000);
  await ss(mp, '47_E_mobile_admin.png');

  // ============================================
  // SIGNUP PAGE
  // ============================================
  console.log('\n=== Signup Page ===');
  await mp.evaluate(() => { window.location.hash = '#/signup'; });
  await mp.waitForTimeout(3000);
  await ss(mp, '48_A_mobile_signup.png');

  await mCtx.close();

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n=== Console Errors ===');
  console.log(`  Desktop: ${errors.length}`);
  errors.slice(0, 10).forEach((e, i) => console.log(`    [${i}] ${e.substring(0, 200)}`));
  console.log(`  Mobile: ${mobileErrors.length}`);
  mobileErrors.slice(0, 10).forEach((e, i) => console.log(`    [${i}] ${e.substring(0, 200)}`));

  await browser.close();
  console.log('\n=== COMPLETE ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

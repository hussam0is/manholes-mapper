/**
 * Capture screenshots of Manholes Mapper production for design audit.
 * Uses production URL where auth API routes are available.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'app_state_2026-03-04');
const BASE_URL = 'https://manholes-mapper.vercel.app';
const CREDENTIALS = { email: 'admin@geopoint.me', password: 'Geopoint2026!' };

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function ss(page, name) {
  await page.screenshot({ path: join(OUTPUT_DIR, name), fullPage: false });
  console.log(`  [OK] ${name}`);
}

async function main() {
  console.log('Launching browser (production URL)...');
  const browser = await chromium.launch({ headless: true });

  // ============================================
  // DESKTOP CONTEXT
  // ============================================
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
  });
  const page = await desktopCtx.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

  // --- Navigate ---
  console.log('\n=== 1. Navigate to Production ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('  (timeout, continuing)');
  }
  await page.waitForTimeout(3000);
  const hash1 = await page.evaluate(() => window.location.hash);
  console.log(`  Hash: ${hash1}`);
  await ss(page, '30_prod_initial.png');

  // --- Login ---
  console.log('\n=== 2. Login ===');
  await page.waitForTimeout(2000);
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (emailInput) {
    await emailInput.fill(CREDENTIALS.email);
    const passInput = await page.$('input[type="password"], input[name="password"]');
    if (passInput) await passInput.fill(CREDENTIALS.password);
    await ss(page, '31_A_login_filled.png');

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('  Submitted login...');
      try {
        await page.waitForFunction(
          () => !document.querySelector('#loginPanel') ||
                window.getComputedStyle(document.querySelector('#loginPanel')).display === 'none' ||
                document.querySelector('#loginPanel').hidden,
          { timeout: 15000 }
        );
        console.log('  Login success (login panel hidden)');
      } catch (e) {
        console.log('  Login panel still visible after 15s');
        // Check for error message
        const errorMsg = await page.evaluate(() => {
          const errEl = document.querySelector('.auth-error, [class*="error"]');
          return errEl ? errEl.textContent : null;
        });
        if (errorMsg) console.log(`  Error: ${errorMsg}`);
      }
      await page.waitForTimeout(3000);
      const hash2 = await page.evaluate(() => window.location.hash);
      console.log(`  Post-login hash: ${hash2}`);
      await ss(page, '32_A_post_login.png');
    }
  } else {
    // Maybe we're already past login
    console.log('  No email input found. Checking state...');
    const currentState = await page.evaluate(() => ({
      hash: window.location.hash,
      loginVisible: (() => {
        const lp = document.getElementById('loginPanel');
        return lp ? window.getComputedStyle(lp).display !== 'none' : false;
      })(),
      canvasVisible: (() => {
        const c = document.getElementById('graphCanvas');
        return c ? window.getComputedStyle(c).display !== 'none' : false;
      })(),
      headerVisible: (() => {
        const h = document.getElementById('appHeader');
        return h ? window.getComputedStyle(h).display !== 'none' : false;
      })(),
    }));
    console.log(`  State: ${JSON.stringify(currentState)}`);
    await ss(page, '31_A_current_state.png');
  }

  // --- Home Panel ---
  console.log('\n=== 3. Home Panel ===');
  await page.evaluate(() => { window.location.hash = '#/'; });
  await page.waitForTimeout(3000);
  await ss(page, '33_A_home_panel.png');

  const homeState = await page.evaluate(() => {
    const hp = document.getElementById('homePanel');
    const sl = document.getElementById('sketchList');
    const syncText = document.getElementById('syncStatusText');
    return {
      visible: hp ? (window.getComputedStyle(hp).display !== 'none' && !hp.hidden) : false,
      sketchCards: sl ? sl.children.length : 0,
      syncStatus: syncText?.textContent || 'N/A',
    };
  });
  console.log(`  Home visible: ${homeState.visible}, Sketches: ${homeState.sketchCards}, Sync: ${homeState.syncStatus}`);

  // --- Canvas ---
  console.log('\n=== 4. Canvas View ===');
  // Close home panel
  const closeBtn = await page.$('#homePanelCloseBtn');
  if (closeBtn) {
    await closeBtn.click();
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  await ss(page, '34_B_canvas.png');

  // Canvas info
  const canvasInfo = await page.evaluate(() => {
    const c = document.getElementById('graphCanvas');
    const h = document.getElementById('appHeader');
    const mg = document.getElementById('modeGroup');
    const fab = document.getElementById('canvasFabToggle');
    const sidebar = document.getElementById('sidebar');
    return {
      canvas: c ? { w: c.width, h: c.height, display: window.getComputedStyle(c).display } : 'missing',
      header: h ? { display: window.getComputedStyle(h).display, height: window.getComputedStyle(h).height } : 'missing',
      modeGroup: mg ? { display: window.getComputedStyle(mg).display } : 'missing',
      fab: fab ? { display: window.getComputedStyle(fab).display } : 'missing',
      sidebar: sidebar ? { display: window.getComputedStyle(sidebar).display } : 'missing',
    };
  });
  console.log(`  Canvas info: ${JSON.stringify(canvasInfo)}`);

  // --- Sketch Name & Header ---
  console.log('\n=== 5. Header & Sketch Info ===');
  const headerInfo = await page.evaluate(() => {
    return {
      sketchName: document.getElementById('sketchNameDisplay')?.textContent || 'empty',
      appTitle: document.getElementById('appTitle')?.textContent || 'empty',
      syncIcon: document.getElementById('headerSyncIndicator')?.textContent || 'empty',
      userBtn: !!document.querySelector('.user-menu-trigger, .user-login-btn'),
    };
  });
  console.log(`  Header: ${JSON.stringify(headerInfo)}`);

  // --- Desktop Command Menu ---
  console.log('\n=== 6. Desktop Command Menu ===');
  const menuBtn = await page.$('#exportMenuBtn');
  if (menuBtn) {
    const mbVis = await page.evaluate(() => {
      const b = document.getElementById('exportMenuBtn');
      return b ? window.getComputedStyle(b).display !== 'none' : false;
    });
    if (mbVis) {
      await menuBtn.click();
      await page.waitForTimeout(800);
      await ss(page, '35_B_command_menu.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }

  // --- Projects ---
  console.log('\n=== 7. Projects Page ===');
  await page.evaluate(() => { window.location.hash = '#/projects'; });
  await page.waitForTimeout(3000);
  await ss(page, '36_C_projects.png');

  const projectsInfo = await page.evaluate(() => {
    const ps = document.getElementById('projectsScreen');
    const pl = document.getElementById('projectsList');
    return {
      visible: ps ? window.getComputedStyle(ps).display !== 'none' : false,
      count: pl ? pl.children.length : 0,
    };
  });
  console.log(`  Projects: ${JSON.stringify(projectsInfo)}`);

  // --- Admin ---
  console.log('\n=== 8. Admin Page ===');
  await page.evaluate(() => { window.location.hash = '#/admin'; });
  await page.waitForTimeout(3000);
  await ss(page, '37_D_admin.png');

  // --- English Mode ---
  console.log('\n=== 9. English Toggle ===');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  const langSel = await page.$('#langSelect');
  if (langSel) {
    await langSel.selectOption('en');
    await page.waitForTimeout(1500);
    await ss(page, '38_F_english.png');
    // Switch back
    await langSel.selectOption('he');
    await page.waitForTimeout(800);
  }

  // --- Dark Mode ---
  console.log('\n=== 10. Dark Mode ===');
  const storage = await desktopCtx.storageState();
  const darkCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
    colorScheme: 'dark',
    storageState: storage,
  });
  const darkPage = await darkCtx.newPage();
  try {
    await darkPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) { /* ok */ }
  await darkPage.waitForTimeout(5000);
  await ss(darkPage, '39_F_dark_mode.png');

  // Check if login panel shows in dark mode too
  const darkHash = await darkPage.evaluate(() => window.location.hash);
  console.log(`  Dark mode hash: ${darkHash}`);

  // If we got past login, show canvas in dark mode
  if (darkHash === '' || darkHash === '#/') {
    // Close home panel if open
    const dhClose = await darkPage.$('#homePanelCloseBtn');
    if (dhClose) {
      await dhClose.click();
      await darkPage.waitForTimeout(800);
    }
    await darkPage.evaluate(() => { window.location.hash = ''; });
    await darkPage.waitForTimeout(1500);
    await ss(darkPage, '40_F_dark_canvas.png');
  }
  await darkCtx.close();

  // ============================================
  // MOBILE CONTEXT
  // ============================================
  console.log('\n=== 11. Mobile (360x740) ===');
  await desktopCtx.close();

  const mobileCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mobileCtx.newPage();

  const mobileErrors = [];
  mp.on('console', (msg) => {
    if (msg.type() === 'error') mobileErrors.push(msg.text());
  });

  try {
    await mp.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) { /* ok */ }
  await mp.waitForTimeout(3000);
  const mHash = await mp.evaluate(() => window.location.hash);
  console.log(`  Mobile hash: ${mHash}`);
  await ss(mp, '41_E_mobile_initial.png');

  // Mobile login
  const mEmail = await mp.$('input[type="email"]');
  if (mEmail) {
    await mEmail.fill(CREDENTIALS.email);
    const mPass = await mp.$('input[type="password"]');
    if (mPass) await mPass.fill(CREDENTIALS.password);
    await ss(mp, '42_E_mobile_login_filled.png');

    const mSubmit = await mp.$('button[type="submit"]');
    if (mSubmit) {
      await mSubmit.click();
      try {
        await mp.waitForFunction(
          () => !document.querySelector('#loginPanel') ||
                window.getComputedStyle(document.querySelector('#loginPanel')).display === 'none',
          { timeout: 15000 }
        );
      } catch (e) { /* ok */ }
      await mp.waitForTimeout(3000);
      await ss(mp, '43_E_mobile_post_login.png');
    }
  }

  // Mobile canvas
  await mp.evaluate(() => { window.location.hash = ''; });
  await mp.waitForTimeout(2000);
  await ss(mp, '44_E_mobile_canvas.png');

  // Mobile hamburger menu
  const mmBtn = await mp.$('#mobileMenuBtn');
  if (mmBtn) {
    const mmVis = await mp.evaluate(() => {
      const b = document.getElementById('mobileMenuBtn');
      return b ? window.getComputedStyle(b).display !== 'none' : false;
    });
    if (mmVis) {
      await mmBtn.click();
      await mp.waitForTimeout(1000);
      await ss(mp, '45_E_mobile_menu.png');

      // Scroll down the menu to see all items
      await mp.evaluate(() => {
        const menuContent = document.querySelector('.mobile-menu-content');
        if (menuContent) menuContent.scrollTop = menuContent.scrollHeight;
      });
      await mp.waitForTimeout(500);
      await ss(mp, '46_E_mobile_menu_scrolled.png');

      // Close menu
      const mClose = await mp.$('#mobileMenuCloseBtn');
      if (mClose) await mClose.click();
      await mp.waitForTimeout(500);
    }
  }

  // Mobile home panel
  await mp.evaluate(() => { window.location.hash = '#/'; });
  await mp.waitForTimeout(2000);
  await ss(mp, '47_E_mobile_home.png');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n=== Console Errors Summary ===');
  console.log(`  Desktop errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 15).forEach((e, i) => console.log(`    [${i}] ${e.substring(0, 200)}`));
  console.log(`  Mobile errors: ${mobileErrors.length}`);
  mobileErrors.slice(0, 10).forEach((e, i) => console.log(`    [${i}] ${e.substring(0, 200)}`));

  const report = {
    url: BASE_URL,
    timestamp: new Date().toISOString(),
    consoleErrors,
    mobileErrors,
  };
  writeFileSync(join(OUTPUT_DIR, 'capture_report_prod.json'), JSON.stringify(report, null, 2));

  await mobileCtx.close();
  await browser.close();
  console.log('\n=== COMPLETE ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

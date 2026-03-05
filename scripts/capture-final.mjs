/**
 * Final screenshot capture script with proper home panel dismissal.
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
  if (!emailInput) return false;

  await emailInput.fill(CREDENTIALS.email);
  const passInput = await page.$('input[type="password"]');
  if (passInput) await passInput.fill(CREDENTIALS.password);

  const submitBtn = await page.$('button[type="submit"]');
  if (!submitBtn) return false;

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
  return true;
}

async function closeHomePanel(page) {
  await page.evaluate(() => {
    const hp = document.getElementById('homePanel');
    if (hp) {
      hp.style.display = 'none';
      hp.hidden = true;
    }
  });
  await page.waitForTimeout(500);
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });

  // ============================================
  // DESKTOP (1280x720)
  // ============================================
  console.log('\n========== DESKTOP ==========');
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('PAGE_ERROR: ' + err.message));

  // Login
  console.log('\n--- Login ---');
  await login(page);

  // Screenshot home panel (it appears after login)
  console.log('\n--- Home Panel ---');
  await ss(page, '50_A_home_panel.png');

  // Close home panel
  await closeHomePanel(page);

  // Canvas view
  console.log('\n--- Canvas (empty) ---');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(1500);
  await ss(page, '51_B_canvas_empty.png');

  // Header details
  const headerInfo = await page.evaluate(() => {
    return {
      appTitle: document.getElementById('appTitle')?.textContent,
      sketchName: document.getElementById('sketchNameDisplay')?.textContent,
      syncIcon: document.getElementById('headerSyncIndicator')?.querySelector('.material-icons')?.textContent,
      userAvatar: !!document.querySelector('.user-menu-trigger'),
      langValue: document.getElementById('langSelect')?.value,
    };
  });
  console.log(`  Header: ${JSON.stringify(headerInfo)}`);

  // Command menu
  console.log('\n--- Command Menu ---');
  await page.click('#exportMenuBtn', { force: true });
  await page.waitForTimeout(800);
  await ss(page, '52_B_command_menu.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Canvas toolbar info
  const toolbarInfo = await page.evaluate(() => {
    const buttons = document.querySelectorAll('#modeGroup button');
    return Array.from(buttons).map(b => ({
      id: b.id,
      icon: b.querySelector('.material-icons')?.textContent,
      title: b.title,
      active: b.classList.contains('active'),
    }));
  });
  console.log(`  Toolbar buttons: ${JSON.stringify(toolbarInfo)}`);

  // Projects page
  console.log('\n--- Projects ---');
  await page.evaluate(() => { window.location.hash = '#/projects'; });
  await page.waitForTimeout(3000);
  await closeHomePanel(page);
  await ss(page, '53_C_projects.png');

  // Project details
  const projInfo = await page.evaluate(() => {
    const ps = document.getElementById('projectsScreen');
    const pl = document.getElementById('projectsList');
    return {
      screenVisible: ps ? window.getComputedStyle(ps).display !== 'none' : false,
      projectCount: pl ? pl.children.length : 0,
      title: document.getElementById('projectsScreenTitle')?.textContent,
    };
  });
  console.log(`  Projects: ${JSON.stringify(projInfo)}`);

  // Admin page
  console.log('\n--- Admin ---');
  await page.evaluate(() => { window.location.hash = '#/admin'; });
  await page.waitForTimeout(3000);
  await closeHomePanel(page);
  await ss(page, '54_D_admin.png');

  // Admin details
  const adminInfo = await page.evaluate(() => {
    const as = document.getElementById('adminScreen');
    return {
      screenVisible: as ? window.getComputedStyle(as).display !== 'none' : false,
      title: document.getElementById('adminScreenTitle')?.textContent,
    };
  });
  console.log(`  Admin: ${JSON.stringify(adminInfo)}`);

  // English toggle
  console.log('\n--- English Mode ---');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(1500);
  await closeHomePanel(page);
  try {
    await page.evaluate(() => {
      const sel = document.getElementById('langSelect');
      if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change')); }
    });
    await page.waitForTimeout(1500);
    await ss(page, '55_F_english.png');

    // Switch back
    await page.evaluate(() => {
      const sel = document.getElementById('langSelect');
      if (sel) { sel.value = 'he'; sel.dispatchEvent(new Event('change')); }
    });
    await page.waitForTimeout(800);
  } catch (e) {
    console.log('  Lang toggle error:', e.message);
  }

  // Signup page
  console.log('\n--- Signup Page ---');
  await page.evaluate(() => { window.location.hash = '#/signup'; });
  await page.waitForTimeout(3000);
  await ss(page, '56_A_signup.png');

  // Save cookies for dark mode
  const storage = await ctx.storageState();
  await ctx.close();

  // ============================================
  // DARK MODE
  // ============================================
  console.log('\n========== DARK MODE ==========');
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

  const dHash = await dp.evaluate(() => window.location.hash);
  if (dHash === '#/login') {
    console.log('  Re-logging in for dark mode...');
    await login(dp);
  }

  await ss(dp, '57_F_dark_initial.png');
  await closeHomePanel(dp);
  await dp.evaluate(() => { window.location.hash = ''; });
  await dp.waitForTimeout(1500);
  await ss(dp, '58_F_dark_canvas.png');

  // Dark login page
  await dp.evaluate(() => {
    // Force show login panel for screenshot
    const lp = document.getElementById('loginPanel');
    if (lp) { lp.style.display = 'flex'; lp.hidden = false; }
  });
  await dp.waitForTimeout(500);
  await ss(dp, '59_F_dark_login.png');
  await dp.evaluate(() => {
    const lp = document.getElementById('loginPanel');
    if (lp) { lp.style.display = 'none'; lp.hidden = true; }
  });

  await darkCtx.close();

  // ============================================
  // MOBILE (360x740)
  // ============================================
  console.log('\n========== MOBILE ==========');
  const mCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mCtx.newPage();

  const mobileErrors = [];
  mp.on('console', (msg) => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });

  // Login
  console.log('\n--- Mobile Login ---');
  await login(mp);
  await ss(mp, '60_E_mobile_home.png');

  // Mobile canvas
  console.log('\n--- Mobile Canvas ---');
  await closeHomePanel(mp);
  await mp.evaluate(() => { window.location.hash = ''; });
  await mp.waitForTimeout(1500);
  await ss(mp, '61_E_mobile_canvas.png');

  // Check what mobile shows
  const mobileState = await mp.evaluate(() => {
    return {
      mobileMenuBtnVis: (() => {
        const b = document.getElementById('mobileMenuBtn');
        return b ? window.getComputedStyle(b).display !== 'none' : false;
      })(),
      headerVis: (() => {
        const h = document.getElementById('appHeader');
        return h ? window.getComputedStyle(h).display !== 'none' : false;
      })(),
      canvasVis: (() => {
        const c = document.getElementById('graphCanvas');
        return c ? window.getComputedStyle(c).display !== 'none' : false;
      })(),
      modeGroupVis: (() => {
        const m = document.getElementById('modeGroup');
        return m ? window.getComputedStyle(m).display !== 'none' : false;
      })(),
      fabVis: (() => {
        const f = document.getElementById('canvasFabToggle');
        return f ? window.getComputedStyle(f).display !== 'none' : false;
      })(),
    };
  });
  console.log(`  Mobile state: ${JSON.stringify(mobileState)}`);

  // Hamburger menu
  console.log('\n--- Mobile Menu ---');
  if (mobileState.mobileMenuBtnVis) {
    await mp.click('#mobileMenuBtn', { force: true });
    await mp.waitForTimeout(1000);
    await ss(mp, '62_E_mobile_menu_top.png');

    // Scroll to bottom
    await mp.evaluate(() => {
      const c = document.querySelector('.mobile-menu-content');
      if (c) c.scrollTop = c.scrollHeight;
    });
    await mp.waitForTimeout(500);
    await ss(mp, '63_E_mobile_menu_bottom.png');

    // Close
    await mp.evaluate(() => {
      const mm = document.getElementById('mobileMenu');
      if (mm) mm.style.display = 'none';
      const bd = document.getElementById('mobileMenuBackdrop');
      if (bd) bd.style.display = 'none';
    });
    await mp.waitForTimeout(300);
  }

  // Mobile projects
  console.log('\n--- Mobile Projects ---');
  await mp.evaluate(() => { window.location.hash = '#/projects'; });
  await mp.waitForTimeout(3000);
  await closeHomePanel(mp);
  await ss(mp, '64_E_mobile_projects.png');

  // Mobile admin
  console.log('\n--- Mobile Admin ---');
  await mp.evaluate(() => { window.location.hash = '#/admin'; });
  await mp.waitForTimeout(3000);
  await closeHomePanel(mp);
  await ss(mp, '65_E_mobile_admin.png');

  // Mobile dark mode
  console.log('\n--- Mobile Dark ---');
  await mCtx.close();
  const mdCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const mdp = await mdCtx.newPage();
  await login(mdp);
  await closeHomePanel(mdp);
  await mdp.evaluate(() => { window.location.hash = ''; });
  await mdp.waitForTimeout(1500);
  await ss(mdp, '66_E_mobile_dark.png');
  await mdCtx.close();

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n========== SUMMARY ==========');
  console.log(`Desktop errors: ${errors.length}`);
  errors.slice(0, 15).forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 200)}`));
  console.log(`Mobile errors: ${mobileErrors.length}`);
  mobileErrors.slice(0, 10).forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 200)}`));

  await browser.close();
  console.log('\n=== ALL CAPTURES COMPLETE ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

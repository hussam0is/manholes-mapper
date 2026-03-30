const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  
  // Enable exception tracking
  await Runtime.enable();
  const errors = [];
  client.on('Runtime.exceptionThrown', (p) => {
    errors.push(p.exceptionDetails?.text + ' ' + (p.exceptionDetails?.exception?.description || '').substring(0, 150));
  });

  // Navigate to production
  await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/' });
  await new Promise(r => setTimeout(r, 6000));

  // Check if logged in
  const { result: authCheck } = await Runtime.evaluate({
    expression: `document.body.innerText.includes('התחברות') ? 'login-screen' : 'logged-in'`,
    returnByValue: true
  });
  console.log('Auth:', authCheck.value);

  if (authCheck.value === 'login-screen') {
    // Need to login first
    await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/login' });
    await new Promise(r => setTimeout(r, 3000));
    
    await Runtime.evaluate({
      expression: `
        (function() {
          const emailInput = document.getElementById('email');
          const passInput = document.getElementById('password');
          if (!emailInput || !passInput) return 'no inputs';
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(emailInput, 'admin@geopoint.me');
          emailInput.dispatchEvent(new Event('input', {bubbles:true}));
          setter.call(passInput, 'Geopoint2026!');
          passInput.dispatchEvent(new Event('input', {bubbles:true}));
          setTimeout(() => {
            const btns = [...document.querySelectorAll('form button')];
            const loginBtn = btns.find(b => b.textContent.trim() === 'התחבר');
            if (loginBtn) loginBtn.click();
          }, 500);
          return 'logging in...';
        })()
      `,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 6000));
  }

  // Now test: click "My Sketches" tab
  console.log('\n--- Testing My Sketches button ---');
  
  // First open home panel by clicking the home/folder icon
  await Runtime.evaluate({
    expression: `
      (function() {
        // Try clicking apps icon first to see menu
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent.trim() === 'apps') { b.click(); return 'clicked apps'; }
        }
        return 'no apps';
      })()
    `,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Screenshot the menu
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-test-1.png'), Buffer.from(data, 'base64'));

  // Close menu and try "My Sketches" via home panel
  // The home panel should appear if the library has sketches
  await Runtime.evaluate({
    expression: `
      (function() {
        // Click anywhere to close the apps menu
        document.body.click();
      })()
    `,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  // Check if home panel is visible or needs to be opened
  const { result: homeState } = await Runtime.evaluate({
    expression: `
      (function() {
        const hp = document.getElementById('homePanel');
        const visible = hp && hp.style.display !== 'none' && hp.offsetParent !== null;
        // Check for mode tabs
        const tabs = document.querySelectorAll('.home-mode-tab, [data-home-mode]');
        return JSON.stringify({ homePanelVisible: visible, tabs: tabs.length });
      })()
    `,
    returnByValue: true
  });
  console.log('Home state:', homeState.value);

  // Try to show home panel - click the person/folder icon or navigate
  const { result: showHome } = await Runtime.evaluate({
    expression: `
      (function() {
        // Check if renderHome exists on window
        if (typeof window.renderHome === 'function') {
          window.renderHome();
          return 'called renderHome()';
        }
        // Try finding the home button
        for (const btn of document.querySelectorAll('button')) {
          const txt = btn.textContent.trim();
          if (txt === 'home' || txt === 'folder_open') {
            btn.click();
            return 'clicked: ' + txt;
          }
        }
        return 'no home button found';
      })()
    `,
    returnByValue: true
  });
  console.log('Show home:', showHome.value);
  await new Promise(r => setTimeout(r, 2000));

  // Now look for mode tabs and click "My Sketches"
  const { result: tabResult } = await Runtime.evaluate({
    expression: `
      (function() {
        const tabs = document.querySelectorAll('.home-mode-tab, [data-home-mode]');
        if (tabs.length === 0) {
          // Try renderHome first
          if (typeof window.renderHome === 'function') window.renderHome();
          return 'No tabs found, tried renderHome. Body: ' + document.body.innerText.substring(0, 300);
        }
        const sketchTab = [...tabs].find(t => t.getAttribute('data-home-mode') === 'sketches');
        if (sketchTab) {
          sketchTab.click();
          return 'Clicked sketches tab!';
        }
        return 'Tabs found but no sketches tab: ' + [...tabs].map(t => t.getAttribute('data-home-mode')).join(',');
      })()
    `,
    returnByValue: true
  });
  console.log('Tab click:', tabResult.value);
  await new Promise(r => setTimeout(r, 2000));

  // Check for errors
  console.log('\nErrors after tab click:', errors.length);
  errors.forEach(e => console.log('  ERROR:', e));

  // Screenshot
  ({ data } = await Page.captureScreenshot({ format: 'png' }));
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-test-2.png'), Buffer.from(data, 'base64'));

  // Check what's visible now
  const { result: bodyResult } = await Runtime.evaluate({
    expression: `
      (function() {
        const hp = document.getElementById('homePanel');
        const visible = hp && hp.style.display !== 'none';
        const hasLegacy = document.body.innerText.includes('Legacy');
        return JSON.stringify({
          homePanelVisible: visible,
          hasLegacyImport: hasLegacy,
          bodySnippet: document.body.innerText.substring(0, 800)
        });
      })()
    `,
    returnByValue: true
  });
  const state = JSON.parse(bodyResult.value);
  console.log('\nHome panel visible:', state.homePanelVisible);
  console.log('Has Legacy Import:', state.hasLegacyImport);
  console.log('Body:', state.bodySnippet.substring(0, 500));

  await client.close();
})().catch(e => console.log('err:', e.message));

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  
  // Enable console logging
  await Runtime.enable();
  const consoleLogs = [];
  client.on('Runtime.consoleAPICalled', (params) => {
    const msg = params.args.map(a => a.value || a.description || '').join(' ');
    if (msg.includes('Error') || msg.includes('error') || msg.includes('fail') || msg.includes('render')) {
      consoleLogs.push(`[${params.type}] ${msg.substring(0, 200)}`);
    }
  });
  client.on('Runtime.exceptionThrown', (params) => {
    consoleLogs.push(`[EXCEPTION] ${params.exceptionDetails?.text} ${params.exceptionDetails?.exception?.description?.substring(0, 200)}`);
  });

  // Navigate fresh
  await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/' });
  await new Promise(r => setTimeout(r, 5000));

  // Find and click "My Sketches" / "שרטוטים שלי" tab
  const { result: clickResult } = await Runtime.evaluate({
    expression: `
      (function() {
        // Try finding the tab button
        const tabs = [...document.querySelectorAll('.home-mode-tab, [data-home-mode]')];
        const sketchTab = tabs.find(t => t.getAttribute('data-home-mode') === 'sketches' || t.textContent.includes('שרטוטים'));
        if (sketchTab) {
          sketchTab.click();
          return 'Clicked data-home-mode=sketches tab: ' + sketchTab.textContent.trim().substring(0, 40);
        }
        
        // Try looking for the button with folder_open icon and "homeTitle" text
        const btns = [...document.querySelectorAll('button')];
        for (const btn of btns) {
          const txt = btn.textContent.trim();
          if (txt.includes('שרטוטים שלי') || (txt.includes('folder_open') && txt.includes('שרטוטים'))) {
            btn.click();
            return 'Clicked button: ' + txt.substring(0, 50);
          }
        }
        
        // Check if home panel is even visible
        const homePanel = document.getElementById('homePanel') || document.querySelector('[class*=home-panel]');
        const visible = homePanel ? (homePanel.style.display !== 'none' && homePanel.offsetParent !== null) : false;
        
        return 'Tab not found. Home panel visible: ' + visible + '. Tabs found: ' + tabs.length + '. All buttons: ' + btns.slice(0, 15).map(b => b.textContent.trim().substring(0, 20)).join(' | ');
      })()
    `,
    returnByValue: true
  });
  console.log('Click result:', clickResult.value);
  await new Promise(r => setTimeout(r, 2000));

  // Check console errors
  console.log('Console errors:', consoleLogs.length);
  consoleLogs.forEach(l => console.log(' ', l));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-debug.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  // Check home panel state
  const { result: panelState } = await Runtime.evaluate({
    expression: `
      (function() {
        const hp = document.getElementById('homePanel') || document.querySelector('[class*=home-panel]');
        if (!hp) return 'No home panel element found';
        return JSON.stringify({
          display: hp.style.display,
          visible: hp.offsetParent !== null,
          classes: hp.className,
          childCount: hp.children.length,
          content: hp.innerText.substring(0, 300)
        });
      })()
    `,
    returnByValue: true
  });
  console.log('Panel state:', panelState.value);

  await client.close();
})().catch(e => console.log('err:', e.message));

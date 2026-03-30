const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Click "fit screen" button or trigger the fit-to-content action
  const { result: fitResult } = await Runtime.evaluate({
    expression: `
      (function() {
        // Look for the fit_screen button
        const btns = [...document.querySelectorAll('button')];
        for (const btn of btns) {
          if (btn.textContent.includes('fit_screen') || btn.title?.includes('fit') || btn.getAttribute('aria-label')?.includes('fit')) {
            btn.click();
            return 'Clicked fit_screen button';
          }
        }
        // Try icon with fit_screen text (Material Icons)
        const icons = document.querySelectorAll('.material-icons, .material-icons-outlined, [class*=icon]');
        for (const icon of icons) {
          if (icon.textContent.trim() === 'fit_screen') {
            const parent = icon.closest('button') || icon.parentElement;
            if (parent) { parent.click(); return 'Clicked fit_screen icon parent'; }
          }
        }
        return 'fit_screen button not found. Buttons: ' + btns.slice(0,15).map(b => b.textContent.trim().substring(0,20)).join(' | ');
      })()
    `,
    returnByValue: true
  });
  console.log('Fit result:', fitResult.value);

  await new Promise(r => setTimeout(r, 1500));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-fitted.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  // Also check node positions
  const { result: nodeInfo } = await Runtime.evaluate({
    expression: `
      (async function() {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('graphSketchDB', 2);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const current = await new Promise((resolve, reject) => {
          const tx = db.transaction('currentSketch', 'readonly');
          const req = tx.objectStore('currentSketch').get('current');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (!current) return 'No current sketch';
        const nodes = current.nodes || [];
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        return JSON.stringify({
          nodeCount: nodes.length,
          xRange: [Math.min(...xs).toFixed(0), Math.max(...xs).toFixed(0)],
          yRange: [Math.min(...ys).toFixed(0), Math.max(...ys).toFixed(0)],
        });
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
    timeout: 5000
  });
  console.log('Node info:', nodeInfo.value);

  await client.close();
})().catch(e => console.log('err:', e.message));

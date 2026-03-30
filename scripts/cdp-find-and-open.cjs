const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // First close any open drawer
  await Runtime.evaluate({
    expression: `(function(){ const close = [...document.querySelectorAll('button')].find(b => b.textContent.includes('סגור')); if(close) close.click(); })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  // Navigate to homepage which should show all sketches
  // Or use the description (file) icon to open sketch directly
  const { result: navResult } = await Runtime.evaluate({
    expression: `
      (function() {
        // Click the file/document icon to see sketch list
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent.includes('description')) {
            btn.click();
            return 'Clicked description btn';
          }
        }
        return 'no description btn';
      })()
    `,
    returnByValue: true
  });
  console.log('Nav:', navResult.value);
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot to see what opened
  const { data: ss1 } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-desc.png'), Buffer.from(ss1, 'base64'));
  
  const { result: bodyResult } = await Runtime.evaluate({
    expression: `document.body.innerText.substring(0, 800)`,
    returnByValue: true
  });
  console.log('Body:', bodyResult.value.substring(0, 400));

  // Try navigating to the sketch URL directly
  console.log('\nNavigating to sketch URL...');
  await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/' });
  await new Promise(r => setTimeout(r, 3000));

  // Use the app's internal navigation: go to home, then load the specific sketch from library
  const { result: loadResult } = await Runtime.evaluate({
    expression: `
      (async function() {
        // Try to use the app's internal sketch loading mechanism
        // The app likely has a function to load a sketch from the server
        const token = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('csrf_token=')).split('=')[1];
        
        const resp = await fetch('/api/sketches?id=5c062a8b-b9e1-4fff-9877-330819c6cd79', {
          credentials: 'include',
          headers: { 'x-csrf-token': token }
        });
        if (!resp.ok) return 'fetch err: ' + resp.status;
        const sketch = await resp.json();
        
        const nodes = sketch.nodes || [];
        const edges = sketch.edges || [];
        
        // Write to both localStorage AND IndexedDB
        const lsData = {
          nodes, edges,
          nextNodeId: 85,
          creationDate: sketch.creationDate || '2026-03-24',
          sketchId: sketch.id || '5c062a8b-b9e1-4fff-9877-330819c6cd79',
          sketchName: sketch.name || 'Legacy Import',
          projectId: null,
          inputFlowConfig: null,
          cloudSynced: true,
        };
        localStorage.setItem('graphSketch', JSON.stringify(lsData));
        
        // Also write to IDB
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('graphSketchDB', 2);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        await new Promise((res, rej) => {
          const tx = db.transaction('currentSketch', 'readwrite');
          tx.objectStore('currentSketch').put({ key: 'current', ...lsData, lastSaved: new Date().toISOString() });
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
        
        return 'Loaded: ' + nodes.length + ' nodes, ' + edges.length + ' edges';
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log('Load result:', loadResult.value);

  // Now reload - but disable sync briefly by setting cloudSynced  
  await Page.reload();
  await new Promise(r => setTimeout(r, 5000));
  
  // Check what's loaded
  const { result: checkResult } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
    returnByValue: true
  });
  console.log('After reload:', checkResult.value);

  // Fit to content
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1500));
  
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
  console.log('Final screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));

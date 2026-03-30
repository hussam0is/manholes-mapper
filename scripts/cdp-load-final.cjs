const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Fetch full sketch data and load it using the app's own mechanisms
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        // Fetch the full sketch from API
        const resp = await fetch('/api/sketches?id=${SKETCH_ID}&full=true', { credentials: 'include' });
        if (!resp.ok) return 'fetch err: ' + resp.status;
        const data = await resp.json();
        
        const sketch = data.sketch || data;
        const nodes = sketch.nodes || [];
        const edges = sketch.edges || [];
        const sketchName = sketch.name || data.name || 'Legacy Import';
        const creationDate = sketch.creationDate || data.creationDate || '2026-03-24';
        
        if (nodes.length === 0) return 'ERROR: 0 nodes. Keys: ' + Object.keys(data).join(',') + ' sketch keys: ' + Object.keys(sketch).join(',');
        
        // Set as current sketch in localStorage (app loads from here)
        localStorage.setItem('graphSketch', JSON.stringify({
          nodes, edges,
          nextNodeId: 85,
          creationDate,
          sketchId: '${SKETCH_ID}',
          sketchName: sketchName,
          projectId: null,
          inputFlowConfig: null,
        }));
        
        // Also write to IDB current
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('graphSketchDB', 2);
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        await new Promise((res, rej) => {
          const tx = db.transaction('currentSketch', 'readwrite');
          tx.objectStore('currentSketch').put({
            key: 'current',
            sketchId: '${SKETCH_ID}',
            sketchName: sketchName,
            creationDate: creationDate,
            nextNodeId: 85,
            nodes, edges,
            adminConfig: {},
            lastSaved: new Date().toISOString()
          });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        
        return 'OK: ' + nodes.length + ' nodes, ' + edges.length + ' edges loaded';
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log('Load:', result.value);

  if (!result.value.startsWith('OK')) {
    await client.close();
    return;
  }

  // Reload - but intercept the sync service to prevent it from overwriting
  await Page.reload();
  await new Promise(r => setTimeout(r, 3000));

  // Immediately re-check
  const { result: check1 } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes' })()`,
    returnByValue: true
  });
  console.log('After reload:', check1.value);

  // Wait a bit more
  await new Promise(r => setTimeout(r, 3000));
  
  const { result: check2 } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
    returnByValue: true
  });
  console.log('After 6s:', check2.value);

  // Fit to content
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1500));

  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));

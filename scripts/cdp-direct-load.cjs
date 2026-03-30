const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  const sketchData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'imported-sketch.json'), 'utf8'));
  const sketch = sketchData.sketch;

  // Inject nodes/edges into the page
  await Runtime.evaluate({
    expression: `window.__nodes = ${JSON.stringify(sketch.nodes)}; window.__edges = ${JSON.stringify(sketch.edges)};`
  });

  // Add sketch to library in localStorage and then load it using app internals
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          const nodes = window.__nodes;
          const edges = window.__edges;
          
          // 1. Add to library in localStorage
          const libRaw = localStorage.getItem('graphSketch.library') || '[]';
          const lib = JSON.parse(libRaw);
          
          // Remove existing legacy import entries to avoid duplicates
          const filtered = lib.filter(s => s.id !== '${SKETCH_ID}');
          
          filtered.unshift({
            id: '${SKETCH_ID}',
            name: 'Legacy Import — 2026-03-24',
            creationDate: '2026-03-24',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cloudSynced: true,
            version: 0,
            nodes: nodes,
            edges: edges,
            nextNodeId: 85,
            projectId: null,
            admin_config: {},
            node_count: nodes.length,
            edge_count: edges.length,
          });
          
          localStorage.setItem('graphSketch.library', JSON.stringify(filtered));
          
          // 2. Also set it as current sketch in the main storage key
          localStorage.setItem('graphSketch', JSON.stringify({
            nodes: nodes,
            edges: edges,
            nextNodeId: 85,
            creationDate: '2026-03-24',
            sketchId: '${SKETCH_ID}',
            sketchName: 'Legacy Import — 2026-03-24',
            projectId: null,
            inputFlowConfig: null,
          }));
          
          // 3. Invalidate library cache if function exists
          if (window.invalidateLibraryCache) window.invalidateLibraryCache();
          
          delete window.__nodes;
          delete window.__edges;
          
          return 'Library: ' + filtered.length + ' sketches. Current set with ' + nodes.length + ' nodes';
        } catch(e) {
          return 'ERROR: ' + e.message;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log('Setup:', result.value);

  // Now try to trigger the app's internal load mechanism
  // The simplest way: reload, and the localStorage data should be picked up BEFORE sync replaces it
  // OR: directly manipulate the app's shared state
  const { result: loadResult } = await Runtime.evaluate({
    expression: `
      (function() {
        try {
          // Try accessing the app's internal state through the window/global
          // The shared-state module exports S and F via legacy main.js
          // Check if we can access the draw function or state
          if (window.menuEvents) {
            // Try emitting a sketch-loaded event
            window.menuEvents.emit('sketch:loaded');
            return 'Emitted sketch:loaded event';
          }
          
          // Try direct DOM approach - look for the library dropdown
          // and trigger opening the specific sketch
          return 'No direct access to app state. Need page reload.';
        } catch(e) {
          return 'Load error: ' + e.message;
        }
      })()
    `,
    returnByValue: true
  });
  console.log('Load attempt:', loadResult.value);

  // Reload and immediately check
  console.log('Reloading page...');
  await Page.reload();
  
  // Check rapidly to catch the moment before sync overwrites
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const { result: check } = await Runtime.evaluate({
      expression: `(function(){ try { const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return i + ': ' + (d.nodes||[]).length + ' nodes, id=' + d.sketchId; } catch(e) { return 'err: ' + e.message; } })()`.replace('i + ', `'${i}s' + `),
      returnByValue: true
    });
    console.log('Check', check.value);
  }

  // Fit
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

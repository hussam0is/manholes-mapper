const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Wait for app to fully load
  await new Promise(r => setTimeout(r, 2000));

  // Use the app's own sync service to fetch and load the sketch
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          // The app's syncService should be on window
          const sync = window.syncService;
          if (!sync) return 'No syncService on window';
          
          // List available methods
          const methods = Object.keys(sync).filter(k => typeof sync[k] === 'function');
          return 'syncService methods: ' + methods.join(', ');
        } catch(e) {
          return 'Error: ' + e.message;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 10000
  });
  console.log(result.value);

  // Try using fetchSketchFromCloud and then loading it
  const { result: r2 } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          const sync = window.syncService;
          if (sync && sync.fetchSketchFromCloud) {
            const sketch = await sync.fetchSketchFromCloud('${SKETCH_ID}');
            if (sketch) {
              return 'Fetched from cloud: ' + (sketch.nodes||[]).length + ' nodes, keys: ' + Object.keys(sketch).join(',');
            }
            return 'fetchSketchFromCloud returned null';
          }
          
          // Alternative: try the app's internal loadFromLibrary
          // Or we can directly set S.nodes and S.edges and call F.draw()
          // Check if shared state is accessible
          return 'No fetchSketchFromCloud method. Methods: ' + (sync ? Object.keys(sync).join(',') : 'no sync');
        } catch(e) {
          return 'Error: ' + e.message;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log(r2.value);

  // Alternative: use the app's module system to load the sketch
  // Try importing modules directly
  const { result: r3 } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          // Try dynamic import of the shared state module
          const { S, F } = await import('/src/legacy/shared-state.js');
          return 'Got S and F. S.nodes: ' + (S.nodes||[]).length + ', F keys: ' + Object.keys(F).slice(0, 10).join(',');
        } catch(e) {
          return 'Import error: ' + e.message;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 10000
  });
  console.log(r3.value);

  await client.close();
})().catch(e => console.log('err:', e.message));

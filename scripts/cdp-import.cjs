/**
 * CDP-based sketch import — loads the imported sketch directly into the app's
 * live session via Chrome DevTools Protocol.
 */

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_FILE = process.argv[2] || path.join(__dirname, '..', 'data', 'imported-sketch.json');

async function main() {
  const sketchJson = fs.readFileSync(SKETCH_FILE, 'utf8');
  console.log('Sketch file loaded:', (sketchJson.length / 1024).toFixed(1), 'KB');
  
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Runtime } = client;
  
  try {
    // Inject the sketch JSON as a global variable first (avoids escaping issues)
    await Runtime.evaluate({
      expression: `window.__importSketchData = ${sketchJson};`,
      returnByValue: true
    });
    console.log('Sketch data injected into page context');

    // Now run the import using the app's own shared state
    const { result } = await Runtime.evaluate({
      expression: `
        (async function() {
          try {
            const data = window.__importSketchData;
            const sketch = data.sketch;
            
            // ── Strategy 1: Write directly to IndexedDB + localStorage (works even without auth) ──
            
            // 1. Open IndexedDB
            const db = await new Promise((resolve, reject) => {
              const req = indexedDB.open('graphSketchDB', 2);
              req.onupgradeneeded = (event) => {
                const d = event.target.result;
                if (!d.objectStoreNames.contains('sketches')) d.createObjectStore('sketches', { keyPath: 'id' });
                if (!d.objectStoreNames.contains('currentSketch')) d.createObjectStore('currentSketch', { keyPath: 'key' });
                if (!d.objectStoreNames.contains('syncQueue')) d.createObjectStore('syncQueue', { autoIncrement: true });
                if (!d.objectStoreNames.contains('backups')) {
                  const bs = d.createObjectStore('backups', { keyPath: 'id' });
                  bs.createIndex('type', 'type', { unique: false });
                  bs.createIndex('timestamp', 'timestamp', { unique: false });
                }
              };
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            
            const sketchId = 'sk_' + Math.random().toString(36).substr(2, 14);
            
            // 2. Write to currentSketch store (this is what the app loads on startup)
            await new Promise((resolve, reject) => {
              const tx = db.transaction('currentSketch', 'readwrite');
              tx.objectStore('currentSketch').put({
                key: 'current',
                sketchId: sketchId,
                sketchName: sketch.name || 'Legacy Import',
                creationDate: sketch.creationDate || new Date().toISOString().slice(0, 10),
                nextNodeId: sketch.nextNodeId || 85,
                projectId: sketch.projectId || null,
                inputFlowConfig: sketch.inputFlowConfig || null,
                nodes: sketch.nodes,
                edges: sketch.edges,
                adminConfig: {},
                lastSaved: new Date().toISOString()
              });
              tx.oncomplete = resolve;
              tx.onerror = () => reject(tx.error);
            });
            
            // 3. Write to sketches (library) store
            await new Promise((resolve, reject) => {
              const tx = db.transaction('sketches', 'readwrite');
              tx.objectStore('sketches').put({
                id: sketchId,
                name: sketch.name || 'Legacy Import',
                creation_date: sketch.creationDate || new Date().toISOString().slice(0, 10),
                nodes: sketch.nodes,
                edges: sketch.edges,
                admin_config: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                version: 0,
                node_count: sketch.nodes.length,
                edge_count: sketch.edges.length
              });
              tx.oncomplete = resolve;
              tx.onerror = () => reject(tx.error);
            });
            
            // 4. Also set localStorage keys the app expects
            localStorage.setItem('graphSketch.lastSketchId', sketchId);
            
            // 5. Clean up
            delete window.__importSketchData;
            
            return 'OK: ' + sketchId + ' | ' + sketch.nodes.length + ' nodes, ' + sketch.edges.length + ' edges';
          } catch(e) {
            return 'ERROR: ' + e.message + ' | ' + e.stack;
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
      timeout: 15000
    });
    
    console.log('Import result:', result.value);
    
    if (result.value && result.value.startsWith('OK:')) {
      console.log('\nReloading page to load the imported sketch...');
      
      const { Page } = client;
      await Page.enable();
      await Page.reload();
      
      // Wait for page load
      await new Promise(r => setTimeout(r, 4000));
      
      // Verify the sketch loaded
      const { result: verifyResult } = await Runtime.evaluate({
        expression: `
          (function() {
            const canvas = document.querySelector('canvas');
            if (!canvas) return 'No canvas found';
            return 'Canvas: ' + canvas.width + 'x' + canvas.height;
          })()
        `,
        returnByValue: true
      });
      console.log('After reload:', verifyResult.value);
      
      // Check node count via app state
      const { result: stateResult } = await Runtime.evaluate({
        expression: `
          (async function() {
            try {
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
              if (current) {
                return 'Current sketch: ' + current.sketchName + ' | ' + 
                       (current.nodes || []).length + ' nodes, ' + 
                       (current.edges || []).length + ' edges';
              }
              return 'No current sketch in IDB';
            } catch(e) {
              return 'Check error: ' + e.message;
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
        timeout: 5000
      });
      console.log('Verify:', stateResult.value);
      
      console.log('\n✅ Import complete! The sketch should now be visible in the app.');
    }
  } finally {
    await client.close();
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});

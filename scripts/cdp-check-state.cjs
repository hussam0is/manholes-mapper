const CDP = require('chrome-remote-interface');
(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Runtime } = client;
  
  // Check what the app's actual state looks like
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        const info = {};
        
        // Check localStorage keys
        const lsKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.includes('graph') || key.includes('sketch') || key.includes('Sketch')) {
            const val = localStorage.getItem(key);
            lsKeys.push({ key, size: val ? val.length : 0, preview: val ? val.substring(0, 100) : '' });
          }
        }
        info.localStorageKeys = lsKeys;
        
        // Check IDB currentSketch
        try {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open('graphSketchDB', 2);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          
          const current = await new Promise((res, rej) => {
            const tx = db.transaction('currentSketch', 'readonly');
            const req = tx.objectStore('currentSketch').get('current');
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          
          if (current) {
            info.idbCurrent = {
              sketchId: current.sketchId,
              sketchName: current.sketchName,
              nodeCount: (current.nodes || []).length,
              edgeCount: (current.edges || []).length,
              keys: Object.keys(current)
            };
          } else {
            info.idbCurrent = 'empty';
          }
        } catch(e) {
          info.idbError = e.message;
        }
        
        return JSON.stringify(info, null, 2);
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 5000
  });
  console.log(result.value);
  await client.close();
})().catch(e => console.log('err:', e.message));

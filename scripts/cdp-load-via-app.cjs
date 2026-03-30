const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  await new Promise(r => setTimeout(r, 2000));

  // Step 1: Add sketch to library, then use menuEvents to trigger load
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          // Fetch full sketch from cloud
          const sketch = await window.syncService.fetchSketchFromCloud('${SKETCH_ID}');
          if (!sketch || !sketch.nodes?.length) return 'ERROR: fetch returned no nodes';
          
          // Add to library in localStorage
          const libRaw = localStorage.getItem('graphSketch.library') || '[]';
          const lib = JSON.parse(libRaw);
          const exists = lib.findIndex(s => s.id === '${SKETCH_ID}');
          
          const entry = {
            id: sketch.id,
            name: sketch.name,
            creationDate: sketch.creationDate,
            createdAt: sketch.createdAt,
            updatedAt: sketch.updatedAt,
            cloudSynced: true,
            version: sketch.version || 0,
            nodes: sketch.nodes,
            edges: sketch.edges,
            nextNodeId: 85,
            projectId: sketch.projectId || null,
            adminConfig: sketch.adminConfig || {},
          };
          
          if (exists >= 0) lib[exists] = entry;
          else lib.unshift(entry);
          
          localStorage.setItem('graphSketch.library', JSON.stringify(lib));
          if (window.invalidateLibraryCache) window.invalidateLibraryCache();
          
          // Now emit load event through menuEvents
          if (window.menuEvents) {
            window.menuEvents.emit('sketch:load', '${SKETCH_ID}');
            return 'Emitted sketch:load with id. Lib has ' + lib.length + ' sketches, this one has ' + sketch.nodes.length + ' nodes';
          }
          
          return 'Library updated but no menuEvents to trigger load. Nodes: ' + sketch.nodes.length;
        } catch(e) {
          return 'ERROR: ' + e.message;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log('Step 1:', result.value);
  await new Promise(r => setTimeout(r, 2000));

  // Check if nodes loaded
  const { result: check1 } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
    returnByValue: true
  });
  console.log('After emit:', check1.value);

  // If not loaded yet, try directly using the library manager via the menuEvents system
  if (check1.value.startsWith('0 ')) {
    // Check what events menuEvents supports
    const { result: evts } = await Runtime.evaluate({
      expression: `
        (function() {
          if (!window.menuEvents) return 'no menuEvents';
          // Check for _events or listeners
          const me = window.menuEvents;
          const keys = Object.keys(me);
          return 'menuEvents keys: ' + keys.join(', ');
        })()
      `,
      returnByValue: true
    });
    console.log(evts.value);

    // Try emitting different event names
    const { result: tryLoad } = await Runtime.evaluate({
      expression: `
        (async function() {
          // Just manually trigger what loadFromLibrary does
          const sync = window.syncService;
          const sketch = await sync.fetchSketchFromCloud('${SKETCH_ID}');
          
          // Write to localStorage directly with the full data
          const lsData = {
            nodes: sketch.nodes,
            edges: sketch.edges,
            nextNodeId: 85,
            creationDate: sketch.creationDate,
            sketchId: sketch.id,
            sketchName: sketch.name,
            projectId: sketch.projectId,
            inputFlowConfig: null,
          };
          localStorage.setItem('graphSketch', JSON.stringify(lsData));
          
          // Now tell the sync service this is our current sketch
          // by saving to cloud
          try {
            await sync.syncSketchToCloud();
          } catch(e) {}
          
          return 'Set ' + sketch.nodes.length + ' nodes as current and synced';
        })()
      `,
      awaitPromise: true, returnByValue: true, timeout: 15000
    });
    console.log('Manual set + sync:', tryLoad.value);
    
    // Reload
    await Page.reload();
    await new Promise(r => setTimeout(r, 5000));
    
    const { result: check2 } = await Runtime.evaluate({
      expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
      returnByValue: true
    });
    console.log('After sync + reload:', check2.value);
  }

  // Fit to screen
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

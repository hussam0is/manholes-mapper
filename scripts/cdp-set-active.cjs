const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  await new Promise(r => setTimeout(r, 2000));

  // Use the app's sync service to set this sketch as the active one
  // The sync service's syncSketchToCloud should save the current state to cloud
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          const sync = window.syncService;
          
          // 1. Fetch the sketch from cloud 
          const sketch = await sync.fetchSketchFromCloud('${SKETCH_ID}');
          if (!sketch?.nodes?.length) return 'ERROR: no nodes';
          
          // 2. Forcefully set it as current in localStorage
          localStorage.setItem('graphSketch', JSON.stringify({
            nodes: sketch.nodes,
            edges: sketch.edges,
            nextNodeId: 85,
            creationDate: sketch.creationDate,
            sketchId: sketch.id,
            sketchName: sketch.name,
            projectId: sketch.projectId,
            inputFlowConfig: null,
          }));
          
          // 3. Force sync TO cloud (this should register it as the active sketch)
          await sync.syncSketchToCloud();
          
          // 4. Verify it stuck
          await new Promise(r => setTimeout(r, 1000));
          const d = JSON.parse(localStorage.getItem('graphSketch') || '{}');
          
          return 'Synced. Current: ' + (d.nodes||[]).length + ' nodes, id=' + d.sketchId;
        } catch(e) {
          return 'ERROR: ' + e.message;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 20000
  });
  console.log('Result:', result.value);

  // Wait a bit then check again
  await new Promise(r => setTimeout(r, 3000));
  const { result: check } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
    returnByValue: true
  });
  console.log('After 3s:', check.value);

  // Now reload and see if it persists
  await Page.reload();
  await new Promise(r => setTimeout(r, 6000));
  
  const { result: afterReload } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
    returnByValue: true
  });
  console.log('After reload:', afterReload.value);

  // Fit
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 2000));

  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));

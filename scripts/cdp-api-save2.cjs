const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  const sketchData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'imported-sketch.json'), 'utf8'));
  const sketch = sketchData.sketch;

  await Runtime.evaluate({ expression: `window.__importData = ${JSON.stringify(sketch)};` });

  // POST and get full response
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        const sketch = window.__importData;
        const token = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('csrf_token=')).split('=')[1];
        
        const resp = await fetch('/api/sketches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
          credentials: 'include',
          body: JSON.stringify({
            name: sketch.name || 'Legacy Import',
            creationDate: sketch.creationDate || '2026-03-24',
            nodes: sketch.nodes,
            edges: sketch.edges,
            adminConfig: {},
          })
        });
        
        const text = await resp.text();
        delete window.__importData;
        return resp.status + '|' + text.substring(0, 1000);
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 30000
  });
  
  const [status, body] = result.value.split('|');
  console.log('Status:', status);
  console.log('Body:', body.substring(0, 500));
  
  if (status === '201' || status === '200') {
    const json = JSON.parse(body);
    const sketchId = json.id || json.sketch?.id || json.data?.id;
    console.log('Sketch ID:', sketchId);
    console.log('Keys:', Object.keys(json));
    
    if (sketchId) {
      // Now open this sketch in the app's library view
      const { result: r2 } = await Runtime.evaluate({
        expression: `
          (function() {
            // Set it as current sketch and reload
            const data = ${body};
            localStorage.setItem('graphSketch', JSON.stringify({
              nodes: data.nodes || [], edges: data.edges || [],
              nextNodeId: ${sketch.nextNodeId || 85},
              creationDate: data.creationDate || '2026-03-24',
              sketchId: '${sketchId}',
              sketchName: data.name || 'Legacy Import',
              projectId: data.projectId || null,
              inputFlowConfig: null,
            }));
            return 'Set current: ' + (data.nodes||[]).length + ' nodes';
          })()
        `,
        returnByValue: true
      });
      console.log(r2.value);
      
      await Page.reload();
      await new Promise(r => setTimeout(r, 5000));
      
      // Fit
      await Runtime.evaluate({
        expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 1500));
      
      const { data } = await Page.captureScreenshot({ format: 'png' });
      fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
      console.log('Screenshot saved');
    }
  }

  await client.close();
})().catch(e => console.log('err:', e.message));

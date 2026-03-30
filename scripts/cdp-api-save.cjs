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

  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        try {
          const sketch = window.__importData;
          
          // Get CSRF from cookie
          const csrfToken = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('csrf_token='));
          const token = csrfToken ? csrfToken.split('=')[1] : '';
          if (!token) return 'ERROR: No CSRF token in cookies';
          
          const body = {
            name: sketch.name || 'Legacy Import — 2026-03-24',
            creationDate: sketch.creationDate || '2026-03-24',
            nodes: sketch.nodes,
            edges: sketch.edges,
            adminConfig: {},
          };
          
          const resp = await fetch('/api/sketches', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': token
            },
            credentials: 'include',
            body: JSON.stringify(body)
          });
          
          const text = await resp.text();
          delete window.__importData;
          
          if (resp.ok) {
            const json = JSON.parse(text);
            return 'OK:' + json.id;
          }
          return 'FAIL ' + resp.status + ': ' + text.substring(0, 500);
        } catch(e) {
          return 'ERROR: ' + e.message + ' ' + e.stack;
        }
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 30000
  });
  console.log('API result:', result.value);

  if (result.value.startsWith('OK:')) {
    const newId = result.value.split(':')[1];
    console.log('Sketch saved! ID:', newId);

    // Load in the app  
    const { result: loadResult } = await Runtime.evaluate({
      expression: `
        (async function() {
          const token = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('csrf_token=')).split('=')[1];
          const resp = await fetch('/api/sketches/${newId}', { credentials: 'include' });
          if (!resp.ok) return 'fetch err ' + resp.status;
          const data = await resp.json();
          
          localStorage.setItem('graphSketch', JSON.stringify({
            nodes: data.nodes || [], edges: data.edges || [],
            nextNodeId: 85, creationDate: data.creationDate,
            sketchId: data.id, sketchName: data.name,
            projectId: data.projectId || null, inputFlowConfig: null,
          }));
          return 'Loaded: ' + (data.nodes||[]).length + ' nodes';
        })()
      `,
      awaitPromise: true, returnByValue: true, timeout: 15000
    });
    console.log('Load:', loadResult.value);

    await Page.reload();
    await new Promise(r => setTimeout(r, 5000));

    // Fit
    await Runtime.evaluate({
      expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 1500));

    const { data } = await Page.captureScreenshot({ format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-api.png'), Buffer.from(data, 'base64'));
    console.log('Screenshot saved');
  }

  await client.close();
})().catch(e => console.log('err:', e.message));

const CDP = require('chrome-remote-interface');
(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Runtime } = client;

  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        // List sketches first
        const listResp = await fetch('/api/sketches?full=true', { credentials: 'include' });
        const listData = await listResp.json();
        
        const sketches = listData.sketches || [];
        const summary = sketches.map(s => ({
          id: s.id,
          name: s.name,
          nodeCount: s.nodeCount || (s.nodes||[]).length,
          edgeCount: s.edgeCount || (s.edges||[]).length,
        }));
        
        return JSON.stringify(summary, null, 2);
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log(result.value);
  await client.close();
})().catch(e => console.log('err:', e.message));

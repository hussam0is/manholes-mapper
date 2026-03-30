const CDP = require('chrome-remote-interface');
(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Runtime } = client;
  
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        // Find all inputs and describe them
        const inputs = [...document.querySelectorAll('input')];
        const desc = inputs.map((inp, i) => ({
          i,
          type: inp.type,
          name: inp.name,
          id: inp.id,
          placeholder: inp.placeholder,
          className: inp.className.substring(0, 50),
          visible: inp.offsetParent !== null,
          value: inp.value.substring(0, 20)
        }));
        
        // Also check for shadow DOM or custom elements
        const forms = document.querySelectorAll('form');
        const formInfo = [...forms].map(f => ({
          action: f.action,
          method: f.method,
          inputs: f.querySelectorAll('input').length,
          buttons: [...f.querySelectorAll('button')].map(b => b.textContent.trim().substring(0, 30))
        }));
        
        return JSON.stringify({ inputCount: inputs.length, inputs: desc.filter(d => d.visible), forms: formInfo }, null, 2);
      })()
    `,
    returnByValue: true
  });
  console.log(result.value);
  await client.close();
})().catch(e => console.log('err:', e.message));

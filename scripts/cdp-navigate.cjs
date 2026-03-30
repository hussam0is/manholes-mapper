const CDP = require('chrome-remote-interface');
(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page } = client;
  await Page.enable();
  await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/login' });
  await new Promise(r => setTimeout(r, 4000));
  const { result } = await client.Runtime.evaluate({
    expression: "document.title + ' | ' + window.location.href + ' | body: ' + document.body.innerText.substring(0, 500)",
    returnByValue: true
  });
  console.log(result.value);
  await client.close();
})().catch(e => console.log('err:', e.message));

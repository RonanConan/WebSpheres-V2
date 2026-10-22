const fs = require('fs');
const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('KIN BROWSER');
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  console.log('KINEMATICS (Chromium, index.html)');
  await p.goto('https://test.local/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('a-scene').hasLoaded, null, { timeout: 20000 });
  const order = await p.evaluate(() => {
    const sc = document.querySelector('a-scene'); const B = sc.behaviors;
    const t = sc.componentOrder.filter(k => B[k] && B[k].tick.array.length);
    return { k: t.indexOf('kinematics-manager'), h: t.indexOf('hand-tracking-controls'), s: t.indexOf('spectator-manager'), list: t };
  });
  ok(order.h >= 0 && order.k > order.h && order.s > order.k, 'tick order hand-tracking-controls → kinematics → spectator: hands are this frame, recentre applies after the row is written  [' + order.list.join(' > ') + ']');
  await p.keyboard.press('KeyP'); await p.waitForTimeout(800);
  const dls = []; p.on('download', d => dls.push(d));
  await p.evaluate(() => document.querySelector('#kinematics-manager').components['kinematics-manager'].exportCSV());
  await p.waitForTimeout(1500);
  ok(dls.length === 2, 'two kinematics downloads (' + dls.map(d => d.suggestedFilename()).join(', ') + ')');
  for (const d of dls) {
    const txt = fs.readFileSync(await d.path(), 'utf8').trim().split('\n'); const hdr = txt[0].split(',');
    ok(hdr.length === 26 && txt.slice(1).every(l => l.split(',').length === 26), d.suggestedFilename() + ': ' + (txt.length - 1) + ' rows, all 26 columns');
    ok(txt.slice(1).every(l => l.split(',')[10] === '0'), 'outside XR every row Valid=0 (no fake tracking)');
  }
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

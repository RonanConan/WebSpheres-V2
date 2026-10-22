const fs = require('fs'), path = require('path');
const { launch, counter, ROOT } = require('./harness.cjs');
const { ok, done } = counter('REAL CDN CHECK');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], loaded = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('response', r => { if (/jsdelivr|peerjs/.test(r.url())) loaded.push(r.status() + ' ' + r.url()); });
  await p.route('https://test.local/**', r => {
    const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'text/html' }) : r.fulfill({ status: 404, body: '' });
  });
  console.log('REAL CDN (internet required)');
  await p.goto('https://test.local/observer.html');
  await p.waitForTimeout(8000);
  const r = await p.evaluate(() => ({ peer: typeof Peer, frames: window.__obs ? window.__obs.frames : 0, state: document.getElementById('conn-state').textContent, detail: document.getElementById('conn-detail').textContent }));
  loaded.forEach(l => console.log('    ' + l));
  ok(loaded.some(l => l.startsWith('200') && l.includes('three@0.173.0/build/three.module.js')), 'three.js 0.173.0 loads from jsDelivr');
  ok(loaded.some(l => l.startsWith('200') && l.includes('three.core.js')), 'three.core.js (imported by three.module.js) loads');
  ok(loaded.some(l => l.startsWith('200') && l.includes('three@0.173.0/examples/jsm/controls/OrbitControls.js')), 'OrbitControls loads via the import map');
  ok(loaded.some(l => l.startsWith('200') && l.includes('peerjs@1.5.4')) && r.peer === 'function', 'PeerJS 1.5.4 loads');
  ok(r.frames > 0, 'scene renders with the real libraries (' + r.frames + ' frames)');
  console.log(`  status with no headset online: ${r.state} — ${r.detail}`);
  ok(['Not found', 'Connecting', 'Reconnecting'].includes(r.state), 'reaches the PeerJS server and looks for the headset');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

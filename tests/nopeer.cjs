const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('NO PEERJS');
(async () => {
  const b = await launch();
  console.log('NO PEERJS (CDN blocked)');
  for (const file of ['index.html', 'observer.html']) {
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await serve(p, { peer: 'none' });
    await p.goto('https://test.local/' + file, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000);
    const r = await p.evaluate((f) => {
      if (f === 'index.html') {
        const sc = document.querySelector('a-scene');
        const sm = document.querySelector('#sphere-manager').components['sphere-manager'];
        const km = document.querySelector('#kinematics-manager').components['kinematics-manager'];
        const o = { loaded: !!sc.hasLoaded, rendering: !!sc.renderStarted, sphereMgr: !!sm, spect: !!document.querySelector('#spectator-manager').components['spectator-manager'] };
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
        o.afterP = { paused: sm && sm.isPaused, tracking: km && km.isTracking };
        return o;
      }
      return { canvas: !!document.querySelector('canvas'), frames: window.__obs ? window.__obs.frames : 0, state: document.getElementById('conn-state').textContent, status: document.getElementById('conn-detail').textContent, recentreDisabled: document.getElementById('recentre').disabled };
    }, file);
    console.log(' ' + file + ' ' + JSON.stringify(r));
    if (file === 'index.html') {
      ok(r.loaded && r.rendering && r.sphereMgr && r.spect, 'index.html loads and renders without PeerJS');
      ok(r.afterP.paused === false && r.afterP.tracking === true, 'P still starts the session without PeerJS');
    } else {
      ok(r.canvas && r.frames > 0, 'observer renders without PeerJS');
      ok(r.state === 'Error' && r.status.startsWith('PeerJS failed to load'), 'observer shows Error + PeerJS-failed message');
      ok(r.recentreDisabled, 'recentre disabled');
    }
    ok(errs.length === 0, file + ': no page errors (' + errs.slice(0, 2).join(' | ') + ')');
    await p.close();
  }
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

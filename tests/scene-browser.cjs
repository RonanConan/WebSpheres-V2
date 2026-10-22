const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('SCENE BROWSER');
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-4);
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs.frames > 2);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const yaw = 30 * Math.PI / 180;
  const HEAD = { px: 0.1, py: 1.25, pz: 0.05, qx: 0, qy: Math.sin(yaw / 2), qz: 0, qw: Math.cos(yaw / 2) };
  const frame = (x) => E((f) => window.__peers.at(-1).conns.at(-1).emit('data', JSON.stringify(f)), Object.assign({ head: HEAD, left: null, right: null, leftValid: false, rightValid: false, activeSphere: 5, radius: 0.5, height: 1.1, score: 1, condition: 1, dominantHand: 'LEFT', fireMode: false, isPaused: false, trialCount: 1, totalTrials: 352, homePos: { x: 0.02, y: 0.88, z: -0.38 } }, x || {}));
  const settle = () => p.waitForTimeout(150);
  const view = (v) => p.click(`[data-view="${v}"]`).then(settle);

  console.log('SCENE (Chromium)');
  ok(await E(() => window.__obs.view === 'orbit' && !window.__obs.head.visible), 'starts in Orbit, head hidden until head data arrives');
  await E(() => { const P = window.__peers[0]; P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); });
  await frame(); await settle();

  const hs = await E(() => { const h = window.__obs.head; h.updateMatrixWorld(true); const e = h.matrixWorld.elements; return { vis: h.visible, p: h.position.toArray(), fwd: [-e[8], -e[9], -e[10]] }; });
  ok(hs.vis, 'head visible in Orbit');
  ok(near(hs.p[0], 0.1) && near(hs.p[1], 1.25) && near(hs.p[2], 0.05), 'head drawn at streamed position');
  ok(near(hs.fwd[0], -Math.sin(yaw)) && near(hs.fwd[1], 0) && near(hs.fwd[2], -Math.cos(yaw)), 'head −Z follows streamed yaw (30°)');
  const gz = await E(() => { const g = window.__obs.gaze; g.geometry.computeBoundingBox(); const bb = g.geometry.boundingBox; const c = bb.getCenter(bb.min.clone()); const s = bb.getSize(bb.min.clone()); return { c: c.toArray(), s: s.toArray(), parentIsHead: g.parent === window.__obs.head }; });
  ok(gz.parentIsHead && near(gz.c[2], -0.3) && near(gz.s[2], 0.6) && near(gz.c[0], 0) && near(gz.c[1], 0), 'gaze cone 0.6 m along the head −Z');

  const tg = await E(() => window.__obs.targets.map(m => ({ p: m.position.toArray(), s: m.scale.x, o: m.material.opacity })));
  ok(tg.length === 11 && tg.every((t, i) => { const a = (-40 + i * 8) * Math.PI / 180; return near(t.p[0], 0.5 * Math.sin(a)) && near(t.p[1], 1.1) && near(t.p[2], -0.5 * Math.cos(a)); }), 'target arc follows radius/height (11 targets, −40°…+40°)');
  ok(tg[5].s === 1.15 && tg[5].o === 0.95 && tg.every((t, i) => i === 5 || (t.s === 1 && t.o === 0.35)), 'active target bright and larger, others dim');
  await frame({ activeSphere: -1 }); await settle();
  ok(await E(() => window.__obs.targets.every(m => m.scale.x === 1)), 'activeSphere −1 → all dim');
  ok(await E(() => { const p = window.__obs.homeBox.position; return Math.abs(p.x - 0.02) < 1e-9 && Math.abs(p.y - 0.88) < 1e-9 && Math.abs(p.z + 0.38) < 1e-9; }), 'home box at homePos');

  const VIEWS = { orbit: [0.95, 1.55, 0.6], top: [0, 3, -0.2499], side: [3, 0.85, -0.25], front: [0, 0.9, -3] };
  for (const v of ['top', 'side', 'front', 'orbit']) {
    await view(v);
    const c = await E(() => { const c = window.__obs.camera; const s = document.getElementById('stage'); return { ortho: !!c.isOrthographicCamera, p: c.position.toArray(), h: (c.top - c.bottom) / (c.zoom || 1), w: c.right - c.left, a: s.clientWidth / s.clientHeight, fov: c.fov, enabled: window.__obs.controls.enabled }; });
    const o = v !== 'orbit';
    ok(c.ortho === o && c.p.every((x, i) => near(x, VIEWS[v][i], 0.01)) && c.enabled, `${v}: ${o ? 'orthographic' : 'perspective'} at the viewer position, drag enabled`);
    if (o) ok(near(c.h, 1.3) && near(c.w, 1.3 * c.a), `${v}: 1.3 m visible height, aspect-correct width`);
    else ok(c.fov === 45, 'orbit: 45° FOV');
  }

  await view('pov');
  const pv = await E(() => { const c = window.__obs.camera; const h = window.__obs.head; return { persp: !!c.isPerspectiveCamera, fov: c.fov, p: c.position.toArray(), q: c.quaternion.toArray(), hq: h.quaternion.toArray(), headVis: h.visible, enabled: window.__obs.controls.enabled }; });
  ok(pv.persp && pv.fov === 75, 'Head POV: perspective, 75° FOV');
  ok(near(pv.p[0], 0.1) && near(pv.p[1], 1.25) && near(pv.p[2], 0.05) && pv.q.every((x, i) => near(x, pv.hq[i])), 'Head POV camera follows the head pose');
  ok(!pv.headVis && !pv.enabled, 'head hidden and orbit drag disabled in Head POV');
  await frame({ head: { px: -0.2, py: 1.3, pz: 0.1, qx: 0, qy: 0, qz: 0, qw: 1 } }); await settle();
  ok(await E(() => Math.abs(window.__obs.camera.position.x + 0.2) < 1e-6), 'Head POV tracks new head frames');

  await frame({ head: 'bad' }); await frame({ head: { px: NaN, py: 1, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 } }); await frame({ head: null, radius: 'x', homePos: { x: 'a', y: 1, z: 0 } }); await settle();
  ok(await E(() => { const o = window.__obs; return Math.abs(o.head.position.x + 0.2) < 1e-6 && Math.abs(o.homeBox.position.x - 0.02) < 1e-9 && Math.abs(o.targets[0].position.y - 1.1) < 1e-9; }), 'malformed head / radius / homePos ignored, last pose kept');

  await view('top');
  await p.setViewportSize({ width: 1280, height: 720 }); await settle();
  ok(await E(() => { const c = window.__obs.camera; const s = document.getElementById('stage'); return s.clientWidth === 1280 && Math.abs((c.right - c.left) - 1.3 * s.clientWidth / s.clientHeight) < 1e-6; }), 'resize updates orthographic width');
  await view('orbit');
  ok(await E(() => { const s = document.getElementById('stage'); return Math.abs(window.__obs.camera.aspect - s.clientWidth / s.clientHeight) < 1e-6; }), 'resize updates perspective aspect');

  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

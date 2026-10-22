const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('SEQ BROWSER');
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  await p.clock.install();
  await p.goto('https://test.local/observer.html');
  await p.clock.runFor(500);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const open = () => E(() => { const P = window.__peers.at(-1); if (!P.open) P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); });
  const send = (x) => E((f) => window.__peers.at(-1).conns.at(-1).emit('data', JSON.stringify(f)), Object.assign({ head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, left: null, right: null, leftValid: false, rightValid: false, activeSphere: 1, radius: 0.45, height: 1.2, score: 0, condition: 1, dominantHand: 'LEFT', fireMode: false, isPaused: false, trialCount: 1, totalTrials: 352, homePos: { x: 0, y: 0.9, z: -0.4 } }, x));
  const at = (seq, x, trial) => send({ seq, head: { px: x, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, trialCount: trial || 1 });
  const headX = () => E(() => window.__obs.head.position.x);
  const dropped = () => E(() => window.__obs.stats.staleDropped);

  console.log('STALE FRAMES (Chromium)');
  await open();
  await at(1, 0.1); await at(2, 0.2);
  ok(Math.abs(await headX() - 0.2) < 1e-9 && await dropped() === 0, 'in-order frames drawn');
  await at(1, 0.9, 99);
  ok(Math.abs(await headX() - 0.2) < 1e-9 && await dropped() === 1, 'older frame (seq 1 after 2) not drawn, counted');
  ok(await E(() => document.getElementById('v-trial').textContent) === '1 / 352', 'stale frame does not touch the top bar');
  await at(2, 0.8);
  ok(Math.abs(await headX() - 0.2) < 1e-9 && await dropped() === 2, 'duplicate seq dropped');
  await at(5, 0.5); await at(4, 0.4); await at(3, 0.3); await at(6, 0.6);
  ok(Math.abs(await headX() - 0.6) < 1e-9 && await dropped() === 4, 'gap allowed (2 → 5), late 4 and 3 dropped, 6 drawn');
  const age0 = await E(() => window.__obs.stats.arrivals.length);
  ok(age0 >= 8, 'stale frames still count as signs of life (no false watchdog reconnect)');
  await E(() => window.__peers.at(-1).conns.at(-1).emit('data', JSON.stringify({ type: 'recentre', ok: true, reason: '' })));
  ok((await E(() => document.getElementById('recentre-note').textContent)).startsWith('Recentred'), 'recentre acks unaffected by seq');
  await send({ head: { px: 0.33, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 } });
  ok(Math.abs(await headX() - 0.33) < 1e-9, 'frames without seq (older headset) still drawn');

  await E(() => document.getElementById('btn-readouts').click()); await p.clock.runFor(300);
  ok(await E(() => document.getElementById('r-stale').textContent) === '4', 'Readouts shows stale frames dropped');

  await E(() => window.__peers.at(-1).conns.at(-1).close());
  await p.clock.runFor(3200);
  await open();
  await at(1, 0.11);
  ok(Math.abs(await headX() - 0.11) < 1e-9 && await dropped() === 4, 'new connection resets seq: seq 1 drawn again');
  await at(2, 0.12); await at(1, 0.99);
  ok(Math.abs(await headX() - 0.12) < 1e-9 && await dropped() === 5, 'dropping resumes on the new connection');

  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

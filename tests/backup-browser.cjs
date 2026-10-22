const fs = require('fs'), os = require('os'), path = require('path');
const { launch, serve, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { ok, done } = counter('BACKUP BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rng = (() => { let a = 42; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();

async function openObserver(b) {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
  const o = await ctx.newPage();
  o.dl = []; o.errs = [];
  o.on('download', d => o.dl.push(d));
  o.on('pageerror', e => o.errs.push(e.message));
  await serve(o);
  return { ctx, o };
}
const connectObserver = async (o) => {
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await o.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); });
};
const read = async (d, dir) => { const f = path.join(dir, d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8') }; };

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-backup-'));
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const { p: host } = await openHost(b);
  const H = (fn, arg) => host.evaluate(fn, arg);
  await H(() => {
    const sp = document.querySelector('#spectator-manager').components['spectator-manager'];
    sp.SYNC_BATCH = 200;
    const orig = sp.replySync.bind(sp);
    window.__syncAt = []; window.__syncMs = [];
    sp.replySync = function () { const t = performance.now(); window.__syncAt.push(Date.now()); orig(); window.__syncMs.push(performance.now() - t); };
    window.__frameGaps = []; let last = 0;
    const f = (t) => { if (last) window.__frameGaps.push(t - last); last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const run = (n, v) => H(([a, c]) => window.__sm.runCommand(a, c), [n, v]);
  for (const [n, v] of [['setParticipant', 'B12'], ['setDominant', 'RIGHT'], ['setCondition', 2], ['setMode', 'fmode']]) await run(n, v);
  await run('start');
  await H(() => window.__home(true));
  const gapStats = async () => { const g = await H(() => window.__frameGaps.splice(0)); g.sort((a, c) => a - c); return { n: g.length, mean: g.reduce((s, x) => s + x, 0) / g.length, p95: g[Math.floor(g.length * 0.95)] }; };
  await gapStats(); await sleep(3000);
  const baseline = await gapStats();

  const { o } = await openObserver(b);
  let hIdx = 0, oIdx = 0, held = [], paused = false, running = true;
  const chaos = { rows: 0, dropped: 0, dup: 0, reordered: 0 };
  const newHostConn = () => H(() => { const c = window.__peers[0].incoming(); c.open = true; c.emit('open'); window.__relay = c; });
  async function pump() {
    const hNew = await H((i) => window.__relay.sent.slice(i), hIdx); hIdx += hNew.length;
    const oNew = await o.evaluate((i) => { const c = window.__peers.at(-1).conns.at(-1); return c ? c.sent.slice(i) : []; }, oIdx); oIdx += oNew.length;
    const toObs = held; held = [];
    for (const m of hNew) {
      if (m.startsWith('{"type":"rows"')) {
        chaos.rows++;
        const r = rng();
        if (r < 0.15) { chaos.dropped++; continue; }
        if (r < 0.3) { chaos.dup++; toObs.push(m, m); continue; }
        if (r < 0.45) { chaos.reordered++; held.push(m); continue; }
      }
      toObs.push(m);
    }
    if (toObs.length) await o.evaluate((ms) => { const c = window.__peers.at(-1).conns.at(-1); ms.forEach(m => c.emit('data', m)); }, toObs);
    if (oNew.length) await H((ms) => ms.forEach(m => window.__relay.emit('data', m)), oNew);
  }
  const relay = (async () => { while (running) { if (!paused) { try { await pump(); } catch (e) {} } await sleep(20); } })();
  await newHostConn();
  await connectObserver(o);

  console.log('LIVE BACKUP (headset ⇄ observer relay with dropped, duplicated and reordered batches)');
  const trialsFor = async (ms) => {
    const end = Date.now() + ms;
    let i = 0;
    while (Date.now() < end) {
      await H(() => window.__home(true));
      try { await host.waitForFunction(() => window.__sm.currentState === 'visible' || window.__sm.phase === 'complete', null, { timeout: 3000, polling: 20 }); } catch (e) { continue; }
      if (await H(() => window.__sm.phase === 'complete')) return;
      if (i++ % 2) await H(() => window.__hitLeft()); else await run('skip');
      await sleep(350);
    }
  };
  await trialsFor(6000);
  const during = await gapStats();
  const mid = await o.evaluate(() => ({ t: window.__obs.backup.trials.length, l: window.__obs.backup.kinL.length, r: window.__obs.backup.kinR.length }));
  const hostMid = await H(() => ({ t: window.__dm.trialData.length, l: window.__km.leftHandData.length, r: window.__km.rightHandData.length }));
  ok(mid.l > 400 && hostMid.l - mid.l < 400 && mid.t > 0, `backup keeps up during the session (laptop ${mid.t} trials / ${mid.l} KL rows, headset ${hostMid.t} / ${hostMid.l})`);

  console.log(' observer reload mid-session');
  paused = true;
  await connectObserver(o);
  oIdx = 0; held = [];
  await newHostConn(); hIdx = 0;
  const afterReload = await o.evaluate(() => window.__obs.backup.kinL.length);
  paused = false;
  ok(afterReload === 0, 'after a reload the laptop copy starts empty');
  await host.waitForFunction(() => true);
  await trialsFor(5000);
  const hostRe = await H(() => ({ l: window.__km.leftHandData.length, t: window.__dm.trialData.length }));
  await o.waitForFunction((h) => window.__obs.backup.trials.length >= h.t && window.__obs.backup.kinL.length >= h.l, hostRe, { timeout: 4000, polling: 50 }).catch(() => {});
  const re = await o.evaluate(() => ({ l: window.__obs.backup.kinL.length, t: window.__obs.backup.trials.length }));
  ok(re.t >= hostRe.t && re.l >= hostRe.l,`re-synced from 0 automatically (laptop ${re.t} trials / ${re.l} KL rows, headset ${hostRe.t} / ${hostRe.l})`);
  const catchUp = await gapStats();

  const partialFrom = o.dl.length;
  await o.evaluate(() => document.getElementById('save-backup').click());
  await sleep(800);
  const partial = await Promise.all(o.dl.slice(partialFrom).map(d => read(d, OUT)));
  ok(partial.length === 4 && partial.every(f => f.name.startsWith('B12_')), 'Save files to laptop mid-session: 4 partial files (' + partial.map(f => f.name).join(', ') + ')');

  console.log(' finish');
  await trialsFor(30000);
  ok(await H(() => window.__sm.phase === 'complete' && window.__sm.endReason === 'finished'), 'session finished (44 trials)');
  const hostFrom = await H(() => 0);
  await host.waitForFunction(() => window.__km.isTracking === false, null, { timeout: 5000 });
  const fs0 = Date.now();
  while (Date.now() - fs0 < 20000) {
    const n = o.dl.filter(d => !partial.some(p => p.name === d.suggestedFilename())).length;
    if (n - partialFrom >= 0 && o.dl.length >= partialFrom + 8) break;
    await sleep(200);
  }
  await sleep(1500);
  const obsFinal = await Promise.all(o.dl.slice(partialFrom + 4).map(d => read(d, OUT)));
  const exportTs = await H(() => window.__dm.lastExportTimestamp);
  const hostFiles = await Promise.all(host.dl.filter(d => d.suggestedFilename().includes(exportTs)).map(d => read(d, OUT)));
  ok(hostFiles.length === 4, 'headset saved its own 4 files (' + hostFiles.map(f => f.name).join(', ') + ')');
  ok(obsFinal.length === 4, 'laptop auto-saved exactly once on completion (' + obsFinal.map(f => f.name).join(', ') + ')');
  const byName = Object.fromEntries(obsFinal.map(f => [f.name, f.text]));
  ok(hostFiles.every(f => f.name in byName), 'laptop filenames match the headset\'s exactly');
  for (const f of hostFiles) {
    const same = byName[f.name] === f.text;
    ok(same, `${f.name}: byte-identical (${f.text.length} bytes${same ? '' : ', laptop ' + (byName[f.name] || '').length})`);
  }
  const kin = hostFiles.find(f => f.name.includes('LEFT')).text.trimEnd().split('\n').length - 1;
  ok(kin > 1000, `kinematics file spans many 200-row batches (${kin} rows)`);
  ok(partial.every(pf => { const full = hostFiles.find(h => h.name.replace(/-\d{4}-\d\d-\d\dT[\d-]+\.csv$/, '') === pf.name.replace(/-\d{4}-\d\d-\d\dT[\d-]+\.csv$/, '')); return pf.name.includes('session-info') || (full && full.text.startsWith(pf.text)); }), 'mid-session partial files are exact prefixes of the final files');
  ok(chaos.dropped > 3 && chaos.dup > 3 && chaos.reordered > 3, `chaos actually applied: ${chaos.rows} batches, ${chaos.dropped} dropped, ${chaos.dup} duplicated, ${chaos.reordered} reordered`);
  await sleep(2500);
  ok(o.dl.length === partialFrom + 8, 'no second auto-save');

  console.log(' headset cost');
  const at = await H(() => window.__syncAt);
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  ok(gaps.length > 20 && Math.min(...gaps) >= 249, `replies paced at least 250 ms apart (${at.length} replies, min gap ${Math.min(...gaps)} ms)`);
  const ms = await H(() => window.__syncMs.slice().sort((a, c) => a - c));
  const pct = (q) => ms[Math.floor(ms.length * q)];
  console.log(`  reply build+send (slice + JSON, ≤200 kin rows here, up to 1500 live): median ${pct(0.5).toFixed(2)} ms, 95th ${pct(0.95).toFixed(2)} ms, max ${ms.at(-1).toFixed(2)} ms`);
  console.log(`  headset frame interval (headless, this PC): no observer mean ${baseline.mean.toFixed(1)} ms (p95 ${baseline.p95.toFixed(1)}) · live backup ${during.mean.toFixed(1)} ms (p95 ${during.p95.toFixed(1)}) · catch-up after reload ${catchUp.mean.toFixed(1)} ms (p95 ${catchUp.p95.toFixed(1)})`);
  ok(pct(0.95) < 10, 'reply cost small (95th percentile < 10 ms, only on sync replies, never per frame)');
  ok(o.errs.length === 0 && host.errs.length === 0, 'no page errors (' + o.errs.concat(host.errs).join(' | ') + ')');

  running = false; await relay;
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

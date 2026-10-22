const fs = require('fs'), os = require('os'), path = require('path');
const { launch, serve, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { ok, done } = counter('GUIDED E2E BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-guided-'));
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const { p: host } = await openHost(b);
  const H = (fn, arg) => host.evaluate(fn, arg);
  const octx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const o = await octx.newPage();
  const oerrs = [], odl = [];
  o.on('pageerror', e => oerrs.push(e.message));
  o.on('download', d => odl.push(d));
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await H(() => { const c = window.__peers[0].incoming(); c.open = true; c.emit('open'); window.__relay = c; });
  await o.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); });
  let hIdx = 0, oIdx = 0, running = true;
  const relay = (async () => {
    while (running) {
      try {
        const hNew = await H((i) => window.__relay.sent.slice(i), hIdx); hIdx += hNew.length;
        const oNew = await o.evaluate((i) => window.__peers.at(-1).conns.at(-1).sent.slice(i), oIdx); oIdx += oNew.length;
        if (hNew.length) await o.evaluate((ms) => { const c = window.__peers.at(-1).conns.at(-1); ms.forEach(m => c.emit('data', m)); }, hNew);
        if (oNew.length) await H((ms) => ms.forEach(m => window.__relay.emit('data', m)), oNew);
      } catch (e) {}
      await sleep(20);
    }
  })();
  const openStep = () => o.evaluate(() => +(document.querySelector('#guide .step.open')?.dataset.step || 0));
  const waitStep = (n, t) => o.waitForFunction((k) => +(document.querySelector('#guide .step.open')?.dataset.step || 0) === k, n, { timeout: t || 6000, polling: 50 });
  const cue = () => H(() => document.querySelector('#participant-cue').getAttribute('visible') ? document.querySelector('#participant-cue-text').getAttribute('value') : '');
  const waitCue = (v) => host.waitForFunction((x) => (document.querySelector('#participant-cue').getAttribute('visible') ? document.querySelector('#participant-cue-text').getAttribute('value') : '') === x, v, { timeout: 4000, polling: 50 });
  const hs = () => H(() => ({ phase: window.__sm.phase, id: window.__dm.participantId, dom: window.__sc.dominantHand, cond: window.__sc.currentCondition, mode: window.__sm.mode }));

  console.log('GUIDED SESSION, BUTTONS ONLY (real headset page ⇄ real observer)');
  await waitStep(2);
  ok(true, 'connects and moves to step 2 by itself');
  await o.fill('#g-id', 'G05');
  await o.click('[data-g="dom"][data-v="RIGHT"]'); await o.click('[data-g="cond"][data-v="2"]'); await o.click('[data-g="mode"][data-v="fmode"]');
  await o.click('#g-confirm');
  await waitStep(3);
  const h1 = await hs();
  ok(h1.id === 'G05' && h1.dom === 'RIGHT' && h1.cond === 2 && h1.mode === 'fmode', 'Confirm set ID, hand, condition and mode on the headset, step 3 opens');
  await o.click('#g-recentre');
  await o.waitForFunction(() => document.getElementById('recentre-note').textContent.startsWith('Recentre failed'), null, { timeout: 4000 });
  ok((await o.evaluate(() => document.getElementById('recentre-note').textContent)) === 'Recentre failed: Not in VR', 'Recentre button reaches the headset (outside VR it answers "Not in VR")');
  await o.click('[data-next="3"]');
  await waitStep(4);
  await waitCue('Stretch one arm straight out');
  ok(true, 'step 4: headset shows "Stretch one arm straight out"');
  await H(() => { const c = document.querySelector('a-scene').camera.el.getAttribute('position'); window.__track('L', [c.x - 0.1, c.y - 0.1, c.z - 0.45]); window.__track('R', [c.x + 0.1, c.y, c.z - 0.6]); });
  await o.click('[data-calib="reach"]');
  await o.waitForFunction(() => document.getElementById('g4-reach').textContent.includes('Right hand'), null, { timeout: 4000 });
  ok((await o.evaluate(() => document.getElementById('g4-reach').textContent)).startsWith('✓Right hand · distance 0.61 m'), 'reach: headset picked the extended right hand, shown on the laptop');
  await waitCue('');
  await o.click('[data-calib="height"]');
  await waitCue('Rest both hands in the green box');
  ok(true, 'height done → lap: headset shows "Rest both hands in the green box"');
  await H(() => window.__home(true));
  await o.click('[data-calib="lap"]');
  await o.waitForFunction(() => document.getElementById('g4-lap').textContent.includes('Home box at'), null, { timeout: 4000 });
  ok(await openStep() === 4, 'all calibrated, but the guide stays on step 4 while step 3 (recentre) is unfinished');
  await o.click('[data-next="4"]');
  await waitStep(5);
  await waitCue('Get ready...');
  ok(true, 'step 5: headset shows "Get ready..."');
  const req = await o.evaluate(() => [...document.querySelectorAll('#g5-required li')].map(li => li.textContent));
  ok(req.every(t => t.startsWith('✓')), 'all required checks pass');
  await o.waitForFunction(() => !document.getElementById('g-start').disabled);
  await o.click('#g-start');
  await waitStep(6);
  ok((await hs()).phase === 'running' && (await cue()) === '', 'Start → headset running, cue cleared, step 6');

  await H(() => window.__home(true));
  await host.waitForFunction(() => window.__sm.currentState === 'visible', null, { timeout: 5000, polling: 20 });
  await o.click('#g-pause');
  await host.waitForFunction(() => window.__sm.phase === 'pausing', null, { timeout: 3000, polling: 20 });
  await o.waitForFunction(() => document.getElementById('g6-phase').textContent === 'Pausing after this trial…', null, { timeout: 3000 });
  ok(true, 'Pause with a target up → "Pausing after this trial…"');
  const t0 = await H(() => window.__dm.trialNumber);
  await H(() => window.__hitLeft());
  await host.waitForFunction((n) => window.__dm.trialNumber === n + 1, t0, { timeout: 3000, polling: 10 });
  await H(() => window.__home(true));
  await host.waitForFunction(() => window.__sm.phase === 'paused', null, { timeout: 3000, polling: 20 });
  await waitCue('Short break');
  ok(true, 'after the hit: paused, headset shows "Short break"');
  await o.waitForFunction(() => document.getElementById('g-pause').textContent === 'Resume', null, { timeout: 3000 });
  await o.click('#g-pause');
  await host.waitForFunction(() => window.__sm.phase === 'running', null, { timeout: 3000 });
  await waitCue('');
  ok(true, 'Resume → running, cue cleared');
  await host.waitForFunction(() => window.__sm.currentState === 'visible', null, { timeout: 5000, polling: 20 });
  const n0 = await H(() => window.__dm.trialNumber);
  await o.click('#g-skip');
  await host.waitForFunction((n) => window.__dm.trialNumber === n + 1 && window.__dm.trialData.at(-1).hitType === 'SKIP', n0, { timeout: 3000 });
  ok(true, 'Skip target button skips on the headset');
  for (let g = 0; g < 200 && (await hs()).phase !== 'complete'; g++) {
    await H(() => window.__home(true));
    try { await host.waitForFunction(() => window.__sm.currentState === 'visible' || window.__sm.phase === 'complete', null, { timeout: 3000, polling: 20 }); } catch (e) { continue; }
    await H(() => { if (window.__sm.phase !== 'complete') window.__sm.runCommand('skip'); });
  }
  await waitStep(7, 10000);
  await waitCue('All done - thank you!');
  ok((await o.evaluate(() => document.getElementById('g7-title').textContent)) === 'Session complete', 'finish: step 7 "Session complete", headset shows "All done - thank you!"');
  await o.waitForFunction(() => document.getElementById('g7-files').textContent.includes('Saved to laptop: 4 files'), null, { timeout: 15000 });
  const exportTs = await H(() => window.__dm.lastExportTimestamp);
  const lap = odl.map(d => d.suggestedFilename());
  ok(lap.length === 4 && lap.every(n => n.startsWith('G05_') && n.includes(exportTs)), 'laptop auto-saved 4 files with the headset\'s names (' + lap.join(', ') + ')');
  const hostFiles = host.dl.filter(d => d.suggestedFilename().includes(exportTs));
  let same = hostFiles.length === 4;
  for (const d of hostFiles) {
    const hf = path.join(OUT, 'h-' + d.suggestedFilename()); await d.saveAs(hf);
    const od = odl.find(x => x.suggestedFilename() === d.suggestedFilename());
    const of = path.join(OUT, 'o-' + d.suggestedFilename()); await od.saveAs(of);
    if (fs.readFileSync(hf, 'utf8') !== fs.readFileSync(of, 'utf8')) same = false;
  }
  ok(same, 'laptop files byte-identical to the headset\'s');
  const sum = await o.evaluate(() => { const s = [...document.querySelectorAll('#g7-summary span')].map(x => x.textContent); const r = {}; for (let i = 0; i < s.length; i += 2) r[s[i]] = s[i + 1]; return r; });
  ok(sum['Trials completed'] === '44 / 44' && sum['Pauses'] === '1' && +sum['Skips'] >= 1, `summary: ${sum['Trials completed']} trials, ${sum['Skips']} skips, ${sum['Pauses']} pause`);
  ok(oerrs.length === 0 && host.errs.length === 0, 'no page errors (' + oerrs.concat(host.errs).join(' | ') + ')');
  running = false; await relay;
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

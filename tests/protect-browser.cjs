const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('PROTECT BROWSER');
const VERSION = '2.6.0';
const BASE = { type: 'state', version: VERSION, sessionId: 'A', phase: 'setup', endReason: '', participantId: '', filePrefix: 'P9_', sessionPrefix: 'P9_', experimenter: '', homeMode: 'one-box', dominantHand: 'RIGHT', condition: 1, mode: 'fmode', totalTrials: 44, plannedRuns: 1, run: 1, setupLocked: false, calib: { reach: { done: true, hand: 'RIGHT', distance: 0.6, radius: 0.48 }, height: { done: true, height: 1 }, lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 } } }, recentred: true, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' };
const FAKE_WAKE = `
  window.__wake = { requests: 0, released: 0, fail: false, locks: [] };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
    window.__wake.requests++;
    if (window.__wake.fail) throw new Error('refused');
    const handlers = [];
    const lock = { addEventListener: (n, f) => handlers.push(f), release: async () => { window.__wake.released++; handlers.forEach(f => f()); } };
    window.__wake.locks.push(lock);
    return lock;
  } } });`;

async function open(b, init) {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  if (init) await p.addInitScript(init);
  await p.clock.install();
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => window.__peers && window.__peers.length > 0);
  await p.evaluate(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
    c.open = true; c.emit('open');
  });
  let S = JSON.parse(JSON.stringify(BASE));
  const st = (o) => { S = Object.assign(JSON.parse(JSON.stringify(S)), o); return p.evaluate((x) => window.__c.emit('data', JSON.stringify(x)), S); };
  const frame = (o) => p.evaluate((x) => window.__c.emit('data', JSON.stringify(x)), Object.assign({ head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, left: null, right: null, leftValid: false, rightValid: false, activeSphere: 0, radius: 0.5, height: 1, score: 0, condition: 1, dominantHand: 'RIGHT', fireMode: false, isPaused: false, trialCount: 0, totalTrials: 44, homePos: { x: 0, y: 0.9, z: -0.4 } }, o || {}));
  const tick = (ms) => p.clock.runFor(ms || 300);
  return { ctx, p, errs, st, frame, tick };
}

(async () => {
  const b = await launch();

  console.log('LEAVE WARNING');
  {
    const { ctx, p, errs, st, frame, tick } = await open(b, FAKE_WAKE);
    const warns = () => p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    ok(await warns() === false, 'no headset yet: no warning');
    await st({}); await frame(); await tick();
    ok(await warns() === false, 'setup with nothing recorded: no warning');
    for (const phase of ['running', 'pausing', 'paused', 'between']) {
      await st({ phase }); await tick();
      ok(await warns() === true, `${phase}: warns`);
    }
    await st({ phase: 'complete', endReason: 'finished', backup: { trials: 5, kinL: 0, kinR: 0, final: false, exportTs: '' } }); await tick();
    ok(await warns() === true, 'complete, laptop zip not saved: warns');
    await st({ phase: 'running', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' } }); await tick();
    await p.evaluate(() => window.__c.close()); await tick(300);
    ok(await warns() === true, 'link lost mid-run: still warns');
    let shown = 0;
    p.on('dialog', d => { shown += d.type() === 'beforeunload' ? 1 : 0; d.accept(); });
    await p.click('#btn-guide'); await p.click('#btn-guide');
    await p.reload();
    ok(shown === 1, 'real reload mid-run: browser asks once');
    ok(errs.length === 0, 'no page errors');
    await ctx.close();
  }

  console.log('SCREEN AWAKE');
  {
    const { ctx, p, errs, st, frame, tick } = await open(b, FAKE_WAKE);
    const w = () => p.evaluate(() => ({ requests: window.__wake.requests, released: window.__wake.released }));
    await tick();
    ok((await w()).requests === 0, 'no headset yet: no lock');
    await st({}); await frame(); await tick();
    ok((await w()).requests === 1, 'headset connected: lock requested');
    await tick(2000);
    ok((await w()).requests === 1, 'held lock not requested again');
    await p.evaluate(() => window.__wake.locks[0].release()); await tick();
    ok((await w()).requests === 2, 'lock released by browser: taken again');
    await st({ phase: 'running' }); await tick();
    ok((await w()).requests === 2, 'running: same lock kept');
    ok(errs.length === 0, 'no page errors');
    await ctx.close();
  }
  for (const [name, init] of [['refused', FAKE_WAKE + 'window.__wake.fail = true;'], ['unsupported', `Object.defineProperty(navigator, 'wakeLock', { value: undefined });`]]) {
    const { ctx, p, errs, st, frame, tick } = await open(b, init);
    await st({ participantId: 'P9', experimenter: 'Jo' }); await frame(); await tick(600);
    const row = await p.evaluate(() => document.getElementById('g6-wake').textContent);
    ok(row.includes('The laptop may go to sleep. Check its power settings.'), `${name}: Check step warns`);
    const adv = await p.evaluate(() => document.getElementById('g6-advisory').textContent);
    ok(!adv.includes('Laptop may sleep'), `${name}: warning kept out of the recommended list`);
    ok(errs.length === 0, `${name}: no page errors`);
    await ctx.close();
  }
  {
    const { ctx, p, st, frame, tick } = await open(b, FAKE_WAKE + 'window.__wake.fail = true;');
    await st({}); await frame(); await tick();
    const before = await p.evaluate(() => window.__wake.requests);
    await tick(5000); await frame();
    ok(await p.evaluate(() => window.__wake.requests) === before, 'refused: no retry within 30 s');
    await p.evaluate(() => { window.__wake.fail = false; });
    await tick(31000); await tick();
    ok(await p.evaluate(() => document.getElementById('g6-wake').textContent === ''), 'refused then allowed: warning clears');
    await ctx.close();
  }
  {
    const { ctx, p, st, frame, tick } = await open(b, FAKE_WAKE);
    await st({}); await frame(); await tick();
    await p.evaluate(() => { const c = window.__c; c.emit('data', JSON.stringify({ type: 'rows', file: 'trials', from: 0, header: 'Trial,Timestamp\n', lines: ['1,100\n'] })); ['kinL', 'kinR'].forEach(f => c.emit('data', JSON.stringify({ type: 'rows', file: f, from: 0, header: 'Timestamp\n', lines: ['5\n'] }))); });
    await st({ phase: 'complete', endReason: 'finished', backup: { trials: 1, kinL: 1, kinR: 1, final: true, exportTs: 'T1' } });
    let saved = '';
    for (let i = 0; i < 40 && !saved.includes('Download started'); i++) { await tick(300); await new Promise(r => setTimeout(r, 50)); saved = await p.evaluate(() => document.getElementById('g8-files').textContent); }
    await tick(600);
    ok(saved.includes('Download started'), 'session saved on the laptop');
    ok(await p.evaluate(() => window.__wake.released) === 1, 'session saved: lock released');
    const warned = await p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    ok(warned === false, 'session saved: no leave warning');
    await ctx.close();
  }

  console.log('SKIP TARGET');
  {
    const { ctx, p, st, frame, tick } = await open(b, FAKE_WAKE);
    await st({ phase: 'running', participantId: 'P9', experimenter: 'Jo', setupLocked: true }); await frame(); await tick();
    const g = await p.evaluate(() => { const r = (i) => { const x = document.getElementById(i).getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom }; }; return { pause: r('g-pause'), skip: r('g-skip'), end: r('g-end'), save: r('g-save-headset'), spoke: r('g-note-spoke') }; });
    ok(g.skip.t >= g.pause.b, 'Skip target on a lower row than Pause');
    ok(g.spoke.t >= g.pause.b && g.save.t >= g.spoke.b && g.skip.t >= g.save.b && g.skip.t - g.pause.b >= 120, 'Skip target at least two rows below Pause');
    await st({ setupLocked: false }); await tick();
    const unlocked = await p.evaluate(() => [document.getElementById('g-skip').getBoundingClientRect().top, document.getElementById('g-pause').getBoundingClientRect().bottom]);
    ok(unlocked[0] - unlocked[1] >= 120, 'Skip target stays clear of Pause with Unlock setup hidden');
    await st({ setupLocked: true }); await tick();
    ok(g.end.t === g.skip.t && g.skip.l > g.end.r, 'Skip target and End run at opposite ends of a row');
    ok(g.save.t > g.pause.b && g.save.b <= g.end.t, 'Save headset copy on a lower row than Pause, above End run');
    await p.click('#g-skip'); await tick(100);
    const cmds = await p.evaluate(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'cmd').map(m => m.name));
    ok(cmds.includes('skip'), 'Skip target still sends skip');
    await ctx.close();
  }

  console.log('ALERT WITH GUIDE HIDDEN');
  {
    const { ctx, p, errs, st, frame, tick } = await open(b, FAKE_WAKE);
    const shown = () => p.evaluate(() => { const e = document.getElementById('stage-alert'); return e.hidden ? null : e.textContent; });
    await st({ phase: 'running', participantId: 'P9', experimenter: 'Jo' }); await frame(); await tick(4000); await frame(); await tick();
    const guideText = await p.evaluate(() => document.getElementById('g-alert').textContent);
    ok(guideText.includes('hand not tracked'), 'alert raised');
    ok(await shown() === null, 'guide open: alert in the guide only');
    await p.click('#g-hide'); await frame(); await tick();
    ok((await shown() || '').includes('hand not tracked'), 'guide hidden: alert over the 3D view');
    const inside = await p.evaluate(() => { const a = document.getElementById('stage-alert').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return a.top === s.top && a.left === s.left && a.right === s.right; });
    ok(inside, 'alert spans the top of the 3D view');
    const top = await p.evaluate(() => { const r = document.getElementById('stage-alert').getBoundingClientRect(); return document.elementFromPoint(r.left + 10, r.top + 5).id; });
    ok(top !== 'stage-alert', 'clicks pass through the alert');
    await p.click('[data-panel="drawer-readouts"]'); await tick(300); await frame(); await tick();
    const clear = await p.evaluate(() => { const a = document.getElementById('stage-alert').getBoundingClientRect(), d = document.getElementById('drawer-readouts').getBoundingClientRect(); return a.right <= d.left + 0.5; });
    ok(clear, 'Status panel open: alert stays clear of the panel');
    await p.evaluate(() => document.querySelector('#drawer-readouts [data-close]').click());
    await p.click('#btn-guide'); await frame(); await tick();
    ok(await shown() === null, 'guide reopened: alert back in the guide only');
    ok(errs.length === 0, 'no page errors');
    await ctx.close();
  }

  console.log('PARTICIPANT ID');
  {
    const { ctx, p, errs, st, frame, tick } = await open(b, FAKE_WAKE);
    const item = () => p.evaluate(() => ({ hidden: document.getElementById('v-id-item').hidden, display: getComputedStyle(document.getElementById('v-id-item')).display, text: document.getElementById('v-id').textContent }));
    await st({}); await frame(); await tick();
    let i = await item();
    ok(i.hidden && i.display === 'none', 'no ID on headset: hidden');
    await p.fill('#g-id', 'TYPED');
    await tick();
    ok((await item()).hidden, 'typed but not sent: still hidden');
    await st({ participantId: 'P9' }); await tick();
    i = await item();
    ok(!i.hidden && i.text === 'P9', 'sent: shows the ID from the headset');
    await st({ participantId: 'P10', phase: 'running', setupLocked: true }); await frame(); await tick();
    ok((await item()).text === 'P10', 'changed while running: top bar follows');
    await st({ participantId: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' }); await tick();
    const long = await p.evaluate(() => { const e = document.getElementById('v-id'), bar = document.getElementById('topbar').getBoundingClientRect(), r = e.getBoundingClientRect(); return { title: e.title, fits: r.right <= bar.right + 0.5 }; });
    ok(long.title === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' && long.fits, 'longest ID cut to fit, full ID on hover');
    await p.hover('#topbar [data-info="pid"]'); await tick(50);
    ok(await p.evaluate(() => document.getElementById('info-pop').textContent) === 'The participant ID set on the headset. Also used in file names.', 'explanation shown');
    for (const [w, h] of [[1280, 720], [1440, 900]]) {
      await p.setViewportSize({ width: w, height: h });
      await st({ participantId: 'P10', plannedRuns: 3, run: 2 }); await frame({ fireMode: true }); await tick();
      const fit = await p.evaluate(() => { const bar = document.getElementById('topbar').getBoundingClientRect(); return { clipped: [...document.getElementById('topbar').children].filter(c => !c.hidden && c.getBoundingClientRect().bottom > bar.bottom + 0.5).length, height: bar.height }; });
      ok(fit.clipped === 0, `${w}x${h}: nothing clipped, bar ${Math.round(fit.height)} px`);
    }
    ok(errs.length === 0, 'no page errors');
    await ctx.close();
  }

  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

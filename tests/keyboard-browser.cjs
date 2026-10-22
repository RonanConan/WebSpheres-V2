const fs = require('fs'), os = require('os'), path = require('path');
const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('KEYBOARD-ONLY BROWSER');

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-kb-'));
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], dl = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('download', d => dl.push(d));
  await serve(p, { peer: 'none' });
  await p.goto('https://test.local/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('a-scene').hasLoaded, null, { timeout: 20000 });
  const E = (fn, arg) => p.evaluate(fn, arg);
  const key = (code) => p.keyboard.press(code);

  console.log('KEYBOARD-ONLY SESSION (Bluetooth keyboard, no observer, PeerJS blocked)');
  ok(await E(() => typeof Peer === 'undefined'), 'PeerJS not available');
  await E(() => {
    const names = ['Wrist', 'T_Tip', 'T_Distal', 'T_Proximal', 'T_Metacarpal', 'I_Tip', 'I_Distal', 'I_Intermediate', 'I_Proximal', 'I_Metacarpal', 'M_Tip', 'M_Distal', 'M_Intermediate', 'M_Proximal', 'M_Metacarpal', 'R_Tip', 'R_Distal', 'R_Intermediate', 'R_Proximal', 'R_Metacarpal', 'L_Tip', 'L_Distal', 'L_Intermediate', 'L_Proximal', 'L_Metacarpal'];
    const sm = document.querySelector('#sphere-manager').components['sphere-manager'];
    const at = (x) => Object.fromEntries(names.map(n => [n, { isValid: () => true, getPosition: v => { const h = sm.homeRectangle.getAttribute('position'); v.set(h.x + x, h.y, h.z); } }]));
    sm.leftJoints = at(-0.1); sm.rightJoints = at(0.1);
    const c = document.querySelector('a-scene').camera.el.getAttribute('position');
    const el = document.querySelector('[hand-tracking-controls="hand: right"]');
    el.components['tracked-controls'] = { controller: { hand: {} } };
    el.components['hand-tracking-controls'].hasPoses = true;
    el.components['hand-tracking-controls'].indexTipPosition.set(c.x, c.y, c.z - 0.6);
    window.__sm = sm;
    window.__dm = document.querySelector('#data-manager').components['data-manager'];
    window.__km = document.querySelector('#kinematics-manager').components['kinematics-manager'];
    window.__sc = document.querySelector('#score-display').components['score-manager'];
  });
  for (const k of ['Digit2', 'KeyC', 'KeyF', 'Space', 'KeyH']) await key(k);
  const setup = await E(() => ({ d: window.__sc.dominantHand, c: window.__sc.currentCondition, m: window.__sm.mode, t: window.__sm.totalTrials, reach: window.__sm.calib.reach.done, h: window.__sm.calib.height.done }));
  ok(setup.d === 'RIGHT' && setup.c === 2 && setup.m === 'fmode' && setup.t === 44 && setup.reach && setup.h, 'setup keys 2, C, F, Space, H work as before');
  await E(() => window.__sm.homeRectangle.setAttribute('position', '0 0.9 -0.4'));
  await key('KeyP');
  ok(await E(() => window.__sm.phase === 'running' && window.__km.isTracking), 'P starts the session');
  const t0 = await E(() => window.__dm.sessionStartTime);
  await key('KeyN');
  ok(await E(() => window.__sm.mode === 'fmode'), 'setup keys locked after P (N ignored)');
  await p.waitForFunction(() => window.__sm.currentState === 'visible', null, { timeout: 5000, polling: 10 });
  await key('KeyP');
  await key('KeyZ');
  await p.waitForFunction(() => window.__sm.phase === 'paused', null, { timeout: 3000, polling: 10 });
  ok(true, 'P with a target up waits; Z skips it; then paused');
  await key('KeyP');
  ok(await E((t) => window.__sm.phase === 'running' && window.__dm.sessionStartTime === t, t0), 'P resumes without resetting the clock');
  for (let g = 0; g < 200 && await E(() => window.__sm.phase !== 'complete'); g++) {
    try { await p.waitForFunction(() => window.__sm.currentState === 'visible' || window.__sm.phase === 'complete', null, { timeout: 3000, polling: 10 }); } catch (e) { continue; }
    if (await E(() => window.__sm.phase !== 'complete')) await key('KeyZ');
  }
  ok(await E(() => window.__sm.phase === 'complete' && window.__sm.endReason === 'finished' && window.__dm.trialNumber === 44), 'session runs to the end (44 trials) on the keyboard alone');
  await p.waitForTimeout(1600);
  const names = dl.map(d => d.suggestedFilename());
  ok(names.length === 4 && ['vr-session-data-', 'kinematics-LEFT-', 'kinematics-RIGHT-', 'session-info-'].every(pre => names.some(n => n.startsWith(pre))), 'automatic export: 4 files, current names (no ID) (' + names.join(', ') + ')');
  const trial = dl.find(d => d.suggestedFilename().startsWith('vr-session-data-'));
  const f = path.join(OUT, trial.suggestedFilename()); await trial.saveAs(f);
  const lines = fs.readFileSync(f, 'utf8').trimEnd().split('\n');
  ok(lines.length === 45 && lines.slice(1).every(l => l.split(',').length === 10 && l.endsWith(',')), 'trial file: 44 rows, ParticipantID column empty');
  ok(await E(() => !window.__km.isTracking), 'kinematics stopped at the export');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

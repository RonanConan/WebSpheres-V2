const { launch, serve, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { ok, done } = counter('SESSION BROWSER');

(async () => {
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  let { ctx, p } = await openHost(b);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const cmd = (name, value) => E(([n, v]) => window.__cmd(n, v), [name, value]);
  const state = () => E(() => window.__state());
  const key = (code, repeat) => E(([c, r]) => window.__key(c, r), [code, repeat]);
  const until = (fn, arg, t) => p.waitForFunction(fn, arg, { timeout: t || 5000, polling: 10 });

  console.log('SETUP PHASE');
  let s = await state();
  ok(s && s.version === '2.0.0' && s.phase === 'setup' && s.setupLocked === false && s.mode === 'standard' && s.totalTrials === 352 && s.endReason === '', 'state sent on connect: version, phase setup, standard 352, unlocked');
  ok(s.calib && !s.calib.reach.done && !s.calib.height.done && !s.calib.lap.done && s.backup && s.backup.trials === 0, 'state carries calibration and backup counts');
  let r = await cmd('setParticipant', 'P01');
  ok(r.result.ok && r.next && r.next.type === 'state' && r.next.participantId === 'P01', 'setParticipant → cmdResult ok, then a fresh state with the ID');
  r = await cmd('setParticipant', 'bad id!');
  ok(!r.result.ok && r.result.reason === 'Participant ID must be 1-32 letters, digits, _ or -', 'invalid participant ID refused with reason');
  r = await cmd('setParticipant', 'x'.repeat(33));
  ok(!r.result.ok, '33-character ID refused');
  for (const id of ['CLEFT01', 'Wright', 'p_RiGhT', 'left']) {
    r = await cmd('setParticipant', id);
    ok(!r.result.ok && /cannot contain "left" or "right"/.test(r.result.reason), `ID "${id}" refused (left/right, any case)`);
  }
  ok((await state()).participantId === 'P01', 'refused IDs leave the previous ID in place');
  r = await cmd('setDominant', 'RIGHT');
  ok(r.result.ok && r.next.dominantHand === 'RIGHT', 'setDominant RIGHT');
  ok(!(await cmd('setDominant', 'UP')).result.ok, 'invalid dominant hand refused');
  r = await cmd('setCondition', 2);
  ok(r.result.ok && r.next.condition === 2 && await E(() => window.__sc.leftHandCriticalChance === 0.55 && window.__sc.rightHandCriticalChance === 0.05), 'setCondition 2 sets condition and probabilities directly');
  r = await cmd('setCondition', 1);
  ok(r.result.ok && r.next.condition === 1 && await E(() => window.__sc.leftHandCriticalChance === 0.3), 'setCondition 1 (direct, not a toggle)');
  ok(!(await cmd('setCondition', 3)).result.ok, 'invalid condition refused');
  for (const [m, n, f, bm] of [['short', 110, false, false], ['fmode', 44, true, false], ['block', 110, false, true], ['standard', 352, false, false], ['fmode', 44, true, false]]) {
    r = await cmd('setMode', m);
    const ms = await E(() => ({ t: window.__sm.totalTrials, dt: window.__dm.totalTrials, f: window.__sm.fModeActive, b: window.__sm.bModeActive, per: window.__sm.appearancesPerSphere }));
    ok(r.result.ok && r.next.mode === m && r.next.totalTrials === n && ms.t === n && ms.dt === n && ms.f === f && ms.b === bm, `setMode ${m} → ${n} trials (reversible in setup)`);
  }
  await key('KeyN');
  ok(await E(() => window.__sm.mode === 'short' && window.__sm.totalTrials === 110), 'key N switches mode in setup (after F: one-way guard removed)');
  ok(!(await cmd('setMode', 'turbo')).result.ok, 'unknown mode refused');
  await key('Digit1', true);
  ok(await E(() => window.__sc.dominantHand === 'RIGHT'), 'auto-repeated keydown ignored');
  await key('Digit1');
  ok(await E(() => window.__sc.dominantHand === 'LEFT'), 'normal keydown applied');
  r = await cmd('calibrate', 'height');
  ok(r.result.ok && r.next.calib.height.done && r.next.calib.height.height >= 0.5, 'calibrate height → reported back');
  await E(() => window.__home(true));
  r = await cmd('calibrate', 'lap');
  ok(r.result.ok && r.next.calib.lap.done && await E((h) => { const p = window.__sm.homeRectangle.getAttribute('position'); return Math.abs(p.y - h.y) < 1e-9 && Math.abs(p.z - h.z) < 1e-9 && p.x === 0; }, r.next.calib.lap.home), 'calibrate lap → reported home matches the home box');
  await E(() => window.__sm.homeRectangle.setAttribute('position', '0 0.9 -0.4'));
  console.log('EITHER-HAND REACH (Plan B §5.1)');
  const cam = await E(() => { const p = document.querySelector('a-scene').camera.el.getAttribute('position'); return [p.x, p.y, p.z]; });
  const at = (dx, dy, dz) => [cam[0] + dx, cam[1] + dy, cam[2] + dz];
  const track = (L, R) => E(([l, rr]) => { window.__track('L', l); window.__track('R', rr); }, [L, R]);
  const radius0 = await E(() => window.__sm.radius);
  await track(null, null);
  r = await cmd('calibrate', 'reach');
  ok(!r.result.ok && r.result.reason === 'No hand tracked' && await E((x) => window.__sm.radius === x && !window.__sm.calib.reach.done, radius0), 'no hand tracked → fails cleanly, radius unchanged');
  await track(at(0, 0, -0.6), null);
  r = await cmd('calibrate', 'reach');
  ok(r.result.ok && r.next.calib.reach.hand === 'LEFT' && Math.abs(r.next.calib.reach.distance - 0.6) < 1e-9 && Math.abs(r.next.calib.reach.radius - 0.48) < 1e-9, 'left hand only → LEFT, 0.6 m, radius 0.8 × 0.6 = 0.48');
  await track(null, at(0.1, 0, -0.5));
  r = await cmd('calibrate', 'reach');
  ok(r.result.ok && r.next.calib.reach.hand === 'RIGHT' && Math.abs(r.next.calib.reach.distance - Math.hypot(0.1, 0.5)) < 1e-9, 'right hand only → RIGHT');
  await track(at(0, -0.1, -0.7), at(0, 0, -0.5));
  r = await cmd('calibrate', 'reach');
  ok(r.result.ok && r.next.calib.reach.hand === 'LEFT' && Math.abs(r.next.calib.reach.distance - Math.hypot(0.1, 0.7)) < 1e-9, 'both tracked, left further out → LEFT');
  await track(at(0, 0, -0.4), at(0.05, 0, -0.65));
  r = await cmd('calibrate', 'reach');
  ok(r.result.ok && r.next.calib.reach.hand === 'RIGHT' && Math.abs(r.next.calib.reach.radius - 0.8 * Math.hypot(0.05, 0.65)) < 1e-9, 'both tracked, right further out → RIGHT');
  await E(() => { const el = document.querySelector('[hand-tracking-controls="hand: right"]'); el.components['hand-tracking-controls'].hasPoses = false; });
  r = await cmd('calibrate', 'reach');
  ok(r.result.ok && r.next.calib.reach.hand === 'LEFT', 'a hand with stale poses (hasPoses false) is not used');
  await track(at(0, 0, -0.2), null);
  r = await cmd('calibrate', 'reach');
  ok(r.result.ok && r.next.calib.reach.radius === 0.3, 'formula unchanged: radius = max(0.3, 0.8 × distance)');
  await track(at(0, 0, -0.4), at(0, 0, -0.62));
  await key('Space');
  ok(await E(() => window.__sm.calib.reach.hand === 'RIGHT' && Math.abs(window.__sm.calib.reach.distance - 0.62) < 1e-9), 'Space key uses the same either-hand logic');
  console.log('SETUP PHASE (continued)');
  for (const [n, re] of [['pause', /running/], ['resume', /Not paused/], ['endEarly', /No session/], ['unlockSetup', /only locked/], ['skip', /No trial/]]) {
    r = await cmd(n);
    ok(!r.result.ok && re.test(r.result.reason), `${n} refused in setup ("${r.result.reason}")`);
  }
  r = await cmd('launchRockets');
  ok(!r.result.ok && r.result.reason === 'Unknown command', 'unknown command refused');
  r = await cmd('saveOnHeadset');
  ok(r.result.ok, 'saveOnHeadset accepted at any time');

  console.log('START, LOCK');
  await E(() => window.__home(false));
  r = await cmd('start');
  const t0 = await E(() => ({ dm: window.__dm.sessionStartTime, km: window.__km.sessionStartTime, tr: window.__km.isTracking, paused: window.__sm.isPaused }));
  ok(r.result.ok && r.next.phase === 'running' && r.next.setupLocked === true && t0.dm > 0 && t0.dm === t0.km && t0.tr && !t0.paused, 'start → running, locked, clocks started once');
  r = await cmd('start');
  ok(!r.result.ok && /already started/.test(r.result.reason), 'second start impossible');
  ok(await E((t) => window.__dm.sessionStartTime === t, t0.dm), 'clocks untouched by the refused start');
  const before = await E(() => ({ c: window.__sc.currentCondition, d: window.__sc.dominantHand, m: window.__sm.mode, rad: window.__sm.radius, h: window.__sm.height, home: JSON.stringify(window.__sm.homeRectangle.getAttribute('position')) }));
  for (const k of ['KeyC', 'Digit1', 'Digit2', 'KeyN', 'KeyF', 'KeyB', 'Space', 'KeyH', 'KeyL']) await key(k);
  const after = await E(() => ({ c: window.__sc.currentCondition, d: window.__sc.dominantHand, m: window.__sm.mode, rad: window.__sm.radius, h: window.__sm.height, home: JSON.stringify(window.__sm.homeRectangle.getAttribute('position')) }));
  ok(JSON.stringify(before) === JSON.stringify(after), 'locked keys C 1 2 N F B Space H L ignored after start');
  for (const [n, v] of [['setCondition', 2], ['setDominant', 'RIGHT'], ['setMode', 'block'], ['calibrate', 'height'], ['setParticipant', 'P02']]) {
    r = await cmd(n, v);
    ok(!r.result.ok && /locked/.test(r.result.reason), `${n} refused while locked`);
  }

  console.log('PAUSE / RESUME');
  await E(() => window.__home(true));
  await until(() => window.__sm.currentState === 'waiting-to-appear');
  const app0 = await E(() => window.__sm.totalAppearances);
  r = await cmd('pause');
  const pw = await E(() => ({ ph: window.__sm.phase, st: window.__sm.currentState, a: window.__sm.activeSphere, n: window.__sm.totalAppearances, p: window.__sm.isPaused }));
  ok(r.result.ok && r.next.phase === 'paused' && pw.st === 'invisible' && pw.a === null && pw.n === app0 && pw.p, 'pause during waiting-to-appear: cancelled, paused at once, no appearance counted');
  await p.waitForTimeout(800);
  ok(await E((n) => window.__sm.totalAppearances === n && window.__sm.allSpheres.every(s => !s.getAttribute('visible')), app0), 'no target appears while paused (hands at home)');
  const kinA = await E(() => window.__km.leftHandData.length);
  await p.waitForTimeout(300);
  ok(await E((n) => window.__km.leftHandData.length > n, kinA), 'kinematics keep recording during the pause');
  r = await cmd('resume');
  ok(r.result.ok && r.next.phase === 'running' && r.next.pauses === 1, 'resume → running, one pause logged');
  ok(await E((t) => window.__dm.sessionStartTime === t.dm && window.__km.sessionStartTime === t.km, t0), 'resume does not reset the session or kinematics clocks');
  ok(await E(() => { const pz = window.__dm.pauses[0]; return pz.start >= 0 && pz.end > pz.start; }), 'pause start and end logged (session-relative ms)');

  await until(() => window.__sm.currentState === 'visible');
  const trialsA = await E(() => window.__dm.trialNumber);
  r = await cmd('pause');
  ok(r.result.ok && r.next.phase === 'pausing', 'pause while a target is visible → "pausing" (trial not interrupted)');
  await p.waitForTimeout(400);
  ok(await E(() => window.__sm.phase === 'pausing' && window.__sm.currentState === 'visible' && !window.__sm.isPaused), 'target stays up and hits are still detected while pausing');
  await E(() => window.__hitLeft());
  await until((n) => window.__dm.trialNumber === n + 1, trialsA);
  ok(await E(() => window.__dm.trialData.at(-1).hand === 'LEFT'), 'hit while pausing recorded normally');
  await E(() => window.__home(true));
  await until(() => window.__sm.phase === 'paused');
  ok(await E(() => window.__sm.activeSphere === null && window.__sm.isPaused), 'paused after the hit, before any new target');
  await p.waitForTimeout(700);
  ok(await E((n) => window.__dm.trialNumber === n + 1 && window.__sm.activeSphere === null, trialsA), 'no new target selected while paused');

  await key('KeyP');
  ok(await E(() => window.__sm.phase === 'running'), 'P resumes from paused');
  await until(() => window.__sm.currentState === 'visible');
  await key('KeyP');
  ok(await E(() => window.__sm.phase === 'pausing'), 'P while a target is up → pausing');
  await key('KeyP');
  ok(await E(() => window.__sm.phase === 'running' && window.__dm.pauses.length === 2), 'P again cancels the pending pause (nothing logged)');
  const ts = await E(() => window.__km.leftHandData.map(l => +l.split(',')[0]));
  const gaps = ts.slice(1).map((t, i) => t - ts[i]);
  ok(ts.length > 30 && gaps.every(g => g >= 0 && g < 250), `kinematics timestamps continuous across pauses (${ts.length} rows, max step ${Math.max(...gaps)} ms)`);

  console.log('SKIP, UNLOCK');
  r = await cmd('skip');
  ok(r.result.ok && await E(() => window.__dm.trialData.at(-1).hitType === 'SKIP'), 'skip command records a SKIP trial');
  r = await cmd('unlockSetup');
  ok(r.result.ok && r.next.setupLocked === false && await E(() => window.__dm.setupUnlocks.length === 1 && window.__dm.setupUnlocks[0] > 0), 'unlockSetup → unlocked, timestamp logged');
  await key('KeyC');
  ok(await E(() => window.__sc.currentCondition === 2), 'locked keys work again after unlock');
  r = await cmd('setMode', 'fmode');
  ok(r.result.ok && r.next.totalTrials === 44, 'mode change allowed while unlocked (Ronan: unlock re-enables everything)');
  await until(() => window.__sm.currentState === 'invisible' || window.__sm.currentState === 'visible' || window.__sm.currentState === 'waiting-to-appear');
  await cmd('pause');
  await E(() => window.__home(false));
  if (await E(() => window.__sm.phase === 'pausing')) { await E(() => window.__sm.activeSphere && window.__hitLeft()); await until(() => window.__sm.phase === 'paused'); }
  r = await cmd('resume');
  ok(r.result.ok && r.next.setupLocked === true, 'setup relocks on the next resume');
  r = await cmd('unlockSetup'); r = await cmd('unlockSetup');
  ok(r.result.ok && await E(() => window.__dm.setupUnlocks.length === 2), 'repeat unlock while unlocked is harmless (logged once)');

  console.log('NATURAL COMPLETION');
  await E(() => window.__home(true));
  for (let guard = 0; guard < 200 && await E(() => window.__sm.phase !== 'complete'); guard++) {
    await until(() => window.__sm.phase === 'complete' || window.__sm.currentState === 'waiting-to-appear' || window.__sm.currentState === 'visible');
    await E(() => { if (window.__sm.phase !== 'complete') window.__cmd('skip'); });
  }
  s = await state();
  ok(s.phase === 'complete' && s.endReason === 'finished' && s.trialCount === 44, 'session ends at totalTrials (44 in F-mode) with "finished"');
  await p.waitForTimeout(1400);
  ok(p.downloads.length === 4 && ['vr-session-data-', 'kinematics-LEFT-', 'kinematics-RIGHT-', 'session-info-'].every(pre => p.downloads.some(f => f.startsWith('P01_' + pre))), 'automatic export ran: trial, KL, KR and session info (' + p.downloads.join(', ') + ')');
  const kinN = await E(() => window.__km.leftHandData.length);
  await p.waitForTimeout(300);
  ok(await E((n) => !window.__km.isTracking && window.__km.leftHandData.length === n, kinN), 'kinematics stop recording at the export');
  for (const [n, v] of [['start'], ['pause'], ['resume'], ['endEarly'], ['setCondition', 1], ['skip']]) {
    r = await cmd(n, v);
    ok(!r.result.ok, `${n} refused after completion ("${r.result.reason}")`);
  }
  await key('KeyP');
  ok(await E(() => window.__sm.phase === 'complete'), 'P does nothing after completion');
  const nd = p.downloads.length;
  r = await cmd('saveOnHeadset');
  await p.waitForTimeout(500);
  ok(r.result.ok && p.downloads.length === nd + 4, 'S / saveOnHeadset still exports after completion (4 files)');
  ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
  await ctx.close();

  console.log('END EARLY');
  ({ ctx, p } = await openHost(b));
  const E2 = (fn, arg) => p.evaluate(fn, arg);
  const cmd2 = (name, value) => E2(([n, v]) => window.__cmd(n, v), [name, value]);
  const until2 = (fn, arg, t) => p.waitForFunction(fn, arg, { timeout: t || 5000, polling: 10 });
  await cmd2('start');
  await E2(() => window.__home(true));
  await until2(() => window.__sm.currentState === 'visible');
  await cmd2('skip');
  await until2(() => window.__sm.currentState === 'visible');
  r = await cmd2('pause');
  ok(r.next.phase === 'pausing', 'pausing with a target up');
  const n0 = await E2(() => window.__dm.trialNumber);
  r = await cmd2('endEarly');
  ok(r.result.ok && r.next.phase === 'complete' && r.next.endReason === 'ended-early', 'endEarly works while pausing → complete, "ended-early"');
  ok(await E2((n) => window.__dm.trialNumber === n && window.__sm.allSpheres.every(s => !s.getAttribute('visible')) && window.__sm.activeSphere === null, n0), 'visible target hidden, unfinished trial not recorded');
  await p.waitForTimeout(1400);
  ok(p.downloads.length === 4 && await E2(() => !window.__km.isTracking), 'normal headset export ran (4 files incl. session info), kinematics stopped');
  await ctx.close();

  ({ ctx, p } = await openHost(b));
  await p.evaluate(() => { window.__cmd('start'); window.__cmd('pause'); });
  await p.waitForTimeout(200);
  const r3 = await p.evaluate(() => window.__cmd('endEarly'));
  ok(r3.result.ok && await p.evaluate(() => window.__dm.pauses.length === 1 && window.__dm.pauses[0].end !== null), 'endEarly from paused closes the open pause');
  await ctx.close();

  console.log('KEYBOARD ONLY (no observer, no PeerJS)');
  const ctx3 = await b.newContext();
  const q = await ctx3.newPage();
  const qerrs = []; q.on('pageerror', e => qerrs.push(e.message));
  await serve(q, { peer: 'none' });
  await q.goto('https://test.local/index.html', { waitUntil: 'domcontentloaded' });
  await q.waitForFunction(() => document.querySelector('a-scene').hasLoaded, null, { timeout: 20000 });
  const kb = await q.evaluate(() => {
    const k = (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    const sm = document.querySelector('#sphere-manager').components['sphere-manager'];
    const sc = document.querySelector('#score-display').components['score-manager'];
    k('Digit2'); k('KeyC'); k('KeyN');
    const setup = { d: sc.dominantHand, c: sc.currentCondition, t: sm.totalTrials };
    k('KeyP'); const ph1 = sm.phase;
    k('KeyP'); const ph2 = sm.phase;
    k('KeyP'); const ph3 = sm.phase;
    return { setup, ph1, ph2, ph3 };
  });
  ok(kb.setup.d === 'RIGHT' && kb.setup.c === 2 && kb.setup.t === 110, 'keyboard setup (2, C, N) works with no observer');
  ok(kb.ph1 === 'running' && kb.ph2 === 'paused' && kb.ph3 === 'running', 'P starts, pauses, resumes');
  ok(qerrs.length === 0, 'no page errors without PeerJS (' + qerrs.join(' | ') + ')');
  await ctx3.close();

  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

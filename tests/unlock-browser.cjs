const { launch, serve, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { ok, done } = counter('UNLOCK BROWSER');

(async () => {
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  const { p } = await openHost(b);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const cmd = (name, value) => E(([n, v]) => window.__cmd(n, v), [name, value]);
  const key = (code) => E((c) => window.__key(c), code);
  const changes = () => E(() => window.__dm.setupChanges.map(c => c.split('|')));
  const info = () => E(() => window.__dm.buildSessionInfo());

  console.log('HEADSET: BEFORE START');
  await cmd('setParticipant', 'P01');
  await cmd('setExperimenter', 'Jo Smith');
  await cmd('setCondition', 1);
  ok((await changes()).length === 0, 'setup changes before start are not logged as changes');
  ok(!(await cmd('relockSetup')).result.ok, 'relock refused outside a session');
  await E(() => window.__home(false));
  await cmd('start');

  console.log('HEADSET: UNLOCKED');
  let r = await cmd('setCondition', 2);
  ok(!r.result.ok && /locked/.test(r.result.reason), 'locked: condition refused');
  r = await cmd('unlockSetup');
  ok(r.result.ok && r.next.setupLocked === false, 'unlock accepted');
  let c = await changes();
  ok(c.length === 1 && c[0][2] === 'Setup' && c[0][3] === 'locked' && c[0][4] === 'unlocked', 'unlock logged');
  r = await cmd('setCondition', 2);
  ok(r.result.ok && r.next.condition === 2, 'condition changes while running');
  r = await cmd('setDominant', 'LEFT');
  ok(r.result.ok && r.next.dominantHand === 'LEFT', 'dominant hand changes while running');
  r = await cmd('setExperimenter', 'Sam Lee');
  ok(r.result.ok && r.next.experimenter === 'Sam Lee', 'experimenter changes');
  r = await cmd('setParticipant', 'P02');
  ok(r.result.ok && r.next.participantId === 'P02', 'participant ID changes');
  const h0 = await E(() => window.__sm.height);
  await E(() => { document.querySelector('a-scene').camera.el.setAttribute('position', '0 1.5 0'); });
  r = await cmd('calibrate', 'height');
  ok(r.result.ok && await E((h) => window.__sm.height !== h, h0), 'height recalibrates while running');
  await E(() => { window.__track('L', [-0.1, 0.8, -0.4]); window.__track('R', [0.1, 0.8, -0.4]); });
  r = await cmd('calibrate', 'lap');
  ok(r.result.ok, 'home recalibrates while running');

  console.log('HEADSET: MODE AND HOME STAY LOCKED');
  const m0 = await E(() => ({ mode: window.__sm.mode, total: window.__sm.totalTrials }));
  r = await cmd('setMode', 'short');
  ok(!r.result.ok && r.result.reason === 'Set the run length before starting the session.', 'mode refused after start, with reason');
  for (const k of ['KeyN', 'KeyF', 'KeyB']) await key(k);
  ok(await E((m) => window.__sm.mode === m.mode && window.__sm.totalTrials === m.total, m0), 'mode keys N F B change nothing');
  ok(!(await cmd('setHomeMode', 'per-hand')).result.ok, 'home position refused after start');

  console.log('HEADSET: CHANGE LOG');
  c = await changes();
  const fields = c.map(x => x[2]);
  ok(['Condition', 'DominantHand', 'Experimenter', 'ParticipantID', 'Height', 'Home'].every(f => fields.includes(f)), `every change logged (${fields.join(', ')})`);
  const row = (f) => c.find(x => x[2] === f);
  ok(row('Condition')[3] === '1' && row('Condition')[4] === '2', 'condition: old and new value');
  ok(row('Experimenter')[3] === 'Jo Smith' && row('Experimenter')[4] === 'Sam Lee', 'experimenter: old and new value');
  ok(row('ParticipantID')[3] === 'P01' && row('ParticipantID')[4] === 'P02', 'participant ID: old and new value');
  ok(c.every(x => x.length === 5 && /^\d+$/.test(x[0]) && /^\d+$/.test(x[1])), 'each entry: time, trial, field, old, new');
  const t = await E(() => window.__dm.sessionTime());
  ok(c.every(x => +x[0] <= t), 'times use the session clock');
  const logged = c.length;
  await cmd('calibrate', 'lap');
  ok((await changes()).length === logged, 'a redo with the same result logs nothing');

  console.log('HEADSET: RELOCK');
  r = await cmd('relockSetup');
  ok(r.result.ok && r.next.setupLocked === true, 'relock accepted');
  ok(!(await cmd('setCondition', 1)).result.ok, 'condition refused again');
  c = await changes();
  ok(c.at(-1)[2] === 'Setup' && c.at(-1)[4] === 'locked', 'relock logged');
  await cmd('unlockSetup');
  await key('KeyC');
  c = await changes();
  ok(c.at(-1)[2] === 'Condition', 'a change by key is logged too');
  await cmd('pause');
  await p.waitForFunction(() => window.__sm.phase === 'paused', null, { timeout: 3000 });
  await cmd('resume');
  ok(await E(() => window.__sm.setupLocked === true), 'resume relocks');
  c = await changes();
  ok(c.at(-1)[2] === 'Setup' && c.at(-1)[4] === 'locked', 'relock on resume logged');

  console.log('HEADSET: SESSION INFO');
  const text = await info();
  ok(text.trim().split('\n').every(l => l.split(',').length === 2), 'every session info row still has two columns');
  ok(text.trim().split('\n').some(l => l.startsWith('SetupChanges,') && l.includes('|Condition|')), 'SetupChanges row holds the log');
  ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');

  console.log('OBSERVER: PANEL');
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const o = await ctx.newPage();
  const errs = [];
  o.on('pageerror', e => errs.push(e.message));
  await serve(o);
  await o.clock.install();
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await o.evaluate(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const conn = P.conns.at(-1); window.__c = conn; window.__refuse = {};
    const send = conn.send.bind(conn);
    conn.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => conn.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: !window.__refuse[m.name], reason: window.__refuse[m.name] || '' }))); };
    conn.open = true; conn.emit('open');
  });
  const O = (fn, arg) => o.evaluate(fn, arg);
  const tick = (ms) => o.clock.runFor(ms || 300);
  const STATE = { type: 'state', version: '2.5.4', phase: 'running', endReason: '', participantId: 'P01', experimenter: 'Jo Smith', homeMode: 'one-box', dominantHand: 'LEFT', condition: 1, mode: 'standard', totalTrials: 352, setupLocked: true, calib: { reach: { done: true, hand: 'LEFT', distance: 0.6, radius: 0.48 }, height: { done: true, height: 1 }, lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 } } }, recentred: true, cue: null, sessionMs: 1000, trialCount: 5, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' };
  const state = async (over) => { await O((s) => window.__c.emit('data', JSON.stringify(s)), Object.assign({}, STATE, over)); await tick(); };
  const shown = (id) => O((i) => document.getElementById(i).checkVisibility(), id);
  const sent = () => O(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'cmd' && m.name !== 'cue').map(m => m.value === undefined ? m.name : `${m.name}:${m.value}`));
  const msg = () => O(() => document.getElementById('g7-msg').textContent);

  await state({});
  ok(!(await shown('g-unlocked')) && await shown('g-unlock'), 'locked: panel hidden, Unlock setup shown');
  await state({ setupLocked: false });
  ok(await shown('g-unlocked') && !(await shown('g-unlock')), 'unlocked: panel shown, Unlock setup hidden');
  ok(await O(() => document.querySelector('[data-u="setDominant"][data-v="LEFT"]').classList.contains('on') && document.querySelector('[data-u="setCondition"][data-v="1"]').classList.contains('on')), 'current hand and condition highlighted');
  ok(await O(() => document.getElementById('u-exp').value === 'Jo Smith' && document.getElementById('u-id').value === 'P01'), 'current experimenter and ID filled in');
  ok(await O(() => !document.querySelector('#g-unlocked [data-g="mode"]') && !document.querySelector('#g-unlocked').textContent.includes('352')), 'no mode buttons in the panel');
  const calib = await O(() => [...document.querySelectorAll('#g7-calib li')].map(li => li.children[1].textContent));
  ok(calib.join('|') === 'Reach radius 0.48 m|Height 1.00 m|Home box at x 0.00, y 0.90, z -0.40 m', 'calibration values listed');

  await o.click('[data-u="setDominant"][data-v="RIGHT"]'); await tick(50);
  ok((await sent()).at(-1) === 'setDominant:RIGHT' && (await msg()) === 'Dominant hand changed', 'Right button sends and confirms');
  await o.click('[data-u="setCondition"][data-v="2"]'); await tick(50);
  ok((await sent()).at(-1) === 'setCondition:2' && (await msg()) === 'Condition changed', 'Boost button sends a number and confirms');
  for (const [k, label] of [['reach', 'Reach'], ['height', 'Height'], ['lap', 'Home']]) {
    await o.click(`[data-ucalib="${k}"]`); await tick(50);
    ok((await sent()).at(-1) === `calibrate:${k}` && (await msg()) === `${label} calibrated`, `Redo ${k} sends and confirms`);
  }
  await o.fill('#u-exp', 'Sam Lee'); await o.click('#u-exp-go'); await tick(50);
  ok((await sent()).at(-1) === 'setExperimenter:Sam Lee' && (await msg()) === 'Experimenter changed', 'Change sends the experimenter');
  await O(() => { window.__refuse = { setParticipant: 'Participant ID must contain 1–32 letters, numbers, underscores or hyphens.' }; });
  await o.fill('#u-id', 'bad id'); await o.press('#u-id', 'Enter'); await tick(50);
  ok((await sent()).at(-1) === 'setParticipant:bad id' && (await msg()) === 'Headset refused: Participant ID must contain 1–32 letters, numbers, underscores or hyphens.', 'Enter sends the ID, refusal shown');
  await O(() => { window.__refuse = {}; });
  await tick();
  ok(await O(() => document.getElementById('u-id').value === 'P01'), 'refused ID: field returns to the headset value');
  await o.click('#g-relock'); await tick(50);
  ok((await sent()).at(-1) === 'relockSetup' && (await msg()) === 'Setup relocked', 'Relock setup sends and confirms');
  await state({ setupLocked: true });
  ok(!(await shown('g-unlocked')) && await shown('g-unlock'), 'relocked: panel hidden again');

  await state({ setupLocked: false, homeMode: 'per-hand', calib: Object.assign({}, STATE.calib, { lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 }, left: { x: -0.2, y: 0.9, z: -0.4 }, right: { x: 0.2, y: 0.9, z: -0.4 } } }) });
  const calib2 = await O(() => [...document.querySelectorAll('#g7-calib li')].map(li => li.children[1].textContent));
  ok(calib2.includes('Left box at x -0.20, y 0.90, z -0.40 m') && calib2.includes('Right box at x 0.20, y 0.90, z -0.40 m'), 'per-hand: both boxes listed');

  await state({ phase: 'complete', endReason: 'finished', setupLocked: true, backup: { trials: 0, kinL: 0, kinR: 0, final: true, exportTs: 'x' } });
  ok(!(await shown('g-unlocked')), 'session complete: panel gone');
  ok(errs.length === 0, 'no observer page errors (' + errs.join(' | ') + ')');

  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

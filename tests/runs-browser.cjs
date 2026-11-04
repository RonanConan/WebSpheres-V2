const fs = require('fs'), os = require('os'), path = require('path');
const { launch, serve, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { openDownload } = require('./unzip.cjs');
const { ok, done } = counter('RUNS BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PLAN2 = { runs: [{ condition: 1, off: false, recal: false }, { condition: 2, off: true, recal: true }] };
const finishRun = (E) => E(() => new Promise((resolve) => {
  const sm = window.__sm;
  const t = setInterval(() => {
    if (sm.phase !== 'running') { clearInterval(t); resolve(); return; }
    window.__home(true);
    sm.runCommand('skip');
  }, 5);
}));

async function headsetSuite(b) {
  const { p } = await openHost(b);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const cmd = (name, value) => E(([n, v]) => window.__cmd(n, v), [name, value]);
  const state = () => E(() => window.__state());
  const closed = () => p.waitForFunction(() => !window.__dm.runClosing, null, { timeout: 4000, polling: 20 });
  const info = () => E(() => Object.fromEntries(window.__dm.sessionInfo().trim().split('\n').slice(1).map(l => l.split(','))));

  console.log('HEADSET: PLAN');
  ok((await state()).plan === null && (await state()).run === 1 && (await state()).plannedRuns === 1, 'starts with no plan, run 1 of 1');
  for (const bad of [null, {}, { runs: [] }, { runs: [{ condition: 3 }] }]) ok(!(await cmd('setPlan', bad)).result.ok, `bad plan refused (${JSON.stringify(bad)})`);
  await cmd('setParticipant', 'P01');
  await cmd('setMode', 'fmode');
  let r = await cmd('setPlan', PLAN2);
  ok(r.result.ok && r.next.plannedRuns === 2 && r.next.plan.runs[1].off === true, 'plan stored and reported');
  await E(() => window.__home(false));
  await cmd('start');
  ok(!(await cmd('setPlan', PLAN2)).result.ok, 'plan refused during a run');

  console.log('HEADSET: RUN 1 ENDS');
  await E(() => { window.__sc.score = 40; window.__sc.currentStreak = 2; window.__sc.lastMilestoneReached = 3; window.__sc.isFireMode = true; });
  await finishRun(E);
  await sleep(60);
  let s = await state();
  ok(s.phase === 'between' && s.endReason === 'finished' && s.setupLocked === false, 'more runs planned: between runs, setup open');
  ok(!(await cmd('nextRun')).result.ok, 'next run refused while the run closes');
  await closed();
  ok(await E(() => !window.__km.isTracking), 'recording stopped between runs');
  ok(p.downloads.length === 0, 'nothing downloads between runs');
  r = await E(() => { window.__key('KeyP'); return window.__sm.phase; });
  ok(r === 'between', 'P key cannot start the next run');
  ok(await E(() => document.querySelector('#participant-cue-text').getAttribute('value')) === 'Short break', 'participant sees "Short break"');
  await E(() => window.__dm.logRecentre());
  ok(await E(() => window.__dm.betweenRecentres === 1 && window.__dm.recentreCount === 0), 'recentre between runs is not counted in the finished run');
  const row1 = await E(() => window.__dm.formatTrialRow(window.__dm.trialData[0]));
  ok(row1.trimEnd().endsWith(',P01,1'), 'trial row ends with participant ID and run');
  const info1 = await info();
  ok(info1.Run === '1' && info1.PlannedRuns === '2' && info1.Plan === '1:no-boost:headset-on|2:boost:headset-off:recalibrate' && info1.EndReason === 'finished', 'run 1 session info: run, plan, end reason');

  console.log('HEADSET: BETWEEN RUNS');
  await E(() => { const c = document.querySelector('a-scene').camera.el.getAttribute('position'); window.__track('L', [c.x - 0.1, c.y - 0.1, c.z - 0.45]); window.__track('R', [c.x + 0.1, c.y, c.z - 0.6]); });
  ok((await cmd('calibrate', 'height')).result.ok && (await cmd('calibrate', 'reach')).result.ok, 'recalibration allowed between runs');
  ok((await state()).recalibrated.join() === 'height,reach', 'recalibration reported');
  ok((await changesCount(E)) === 0, 'between-run changes are not mid-run changes');
  ok((await cmd('setCondition', 2)).result.ok, 'condition set for the next run');
  ok(!(await cmd('setMode', 'short')).result.ok, 'length stays the same');
  ok((await info()).Condition === '1', 'run 1 info keeps its own condition');

  console.log('HEADSET: RUN 2 STARTS');
  await E(() => window.__home(false));
  r = await cmd('nextRun');
  s = r.next;
  ok(r.result.ok && s.phase === 'running' && s.run === 2 && s.setupLocked === true, 'next run: running, run 2, locked');
  const reset = await E(() => ({ tn: window.__dm.trialNumber, tl: window.__dm.trialData.length, app: window.__sm.totalAppearances, counts: window.__sm.appearanceCounts.every(n => n === 0), score: window.__sc.score, streak: window.__sc.currentStreak, fire: window.__sc.isFireMode, mile: window.__sc.lastMilestoneReached, rec: window.__dm.recentreCount, between: window.__dm.betweenRecentres, tracking: window.__km.isTracking }));
  ok(reset.tn === 0 && reset.tl === 0 && reset.app === 0 && reset.counts, 'trials and target counts reset');
  ok(reset.score === 0 && reset.streak === 0 && !reset.fire && reset.mile === 0, 'score, streak, fire mode and milestones reset');
  ok(reset.rec === 0 && reset.between === 0 && reset.tracking, 'recentre count reset, recording restarted');
  ok(await E(() => window.__dm.sessionTime() < 1000), 'run clock restarted');
  ok(s.completedRuns.length === 1 && s.completedRuns[0].run === 1 && s.completedRuns[0].trials === 44, 'run 1 kept on the headset');
  ok(await E(() => window.__sm.radius > 0), 'calibration carried over');
  const info2 = await info();
  ok(info2.Run === '2' && info2.Condition === '2' && info2.BreakBefore === 'headset-on' && info2.RecalibratedBefore === 'height;reach', 'run 2 session info: run, condition, break, recalibration');

  console.log('HEADSET: FILES');
  await finishRun(E);
  await sleep(60);
  s = await state();
  ok(s.phase === 'complete', 'last planned run ends the session');
  await p.waitForFunction(() => window.__dm.lastExportTimestamp, null, { timeout: 4000, polling: 20 });
  for (let i = 0; i < 40 && p.downloads.length < 1; i++) await sleep(100);
  await sleep(300);
  const ts = await E(() => window.__dm.lastExportTimestamp);
  const want = [1, 2].flatMap(n => ['vr-session-data', 'kinematics-LEFT', 'kinematics-RIGHT', 'session-info'].map(f => `run${n}/P01_run${n}_${f}-${ts}.csv`));
  const finalZip = await openDownload(p.dl.at(-1), fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runs-h-')));
  ok(p.dl.length === 1 && want.every(n => finalZip.some(x => x.path === n)) && finalZip.length === 8, 'final export: one zip, 4 files per run in folders (' + finalZip.length + ')');
  const trial2 = finalZip.find(x => x.path.startsWith('run2/P01_run2_vr-session-data')).text.trim().split('\n');
  ok(trial2[0].endsWith(',ParticipantID,Run') && trial2.length === 45 && trial2[1].split(',')[0] === '1' && trial2.slice(1).every(l => l.endsWith(',P01,2')), 'run 2 trial file: numbering restarts, Run column is 2');
  const trial1 = finalZip.find(x => x.path.startsWith('run1/P01_run1_vr-session-data')).text.trim().split('\n');
  ok(trial1.length === 45 && trial1.slice(1).every(l => l.endsWith(',P01,1')), 'run 1 trial file: Run column is 1');

  console.log('HEADSET: ADD A RUN AFTER FINISHING');
  ok(!(await cmd('reopenSession')).result.ok, 'reopen refused with no more runs planned');
  ok(!(await cmd('setPlan', { runs: [PLAN2.runs[0]] })).result.ok, 'finished runs cannot be removed from the plan');
  await cmd('setPlan', { runs: PLAN2.runs.concat([{ condition: 1, off: false, recal: false }]) });
  r = await cmd('reopenSession');
  ok(r.result.ok && r.next.phase === 'between' && r.next.setupLocked === false, 'reopened to between runs');
  r = await cmd('finishSession');
  ok(r.result.ok && r.next.phase === 'complete', 'Finish session completes it');
  ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
  await p.context().close();
}

const changesCount = (E) => E(() => window.__dm.setupChanges.length);

async function earlyEndSuite(b) {
  const { p } = await openHost(b);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const cmd = (name, value) => E(([n, v]) => window.__cmd(n, v), [name, value]);
  console.log('HEADSET: ENDING A RUN EARLY');
  await cmd('setMode', 'fmode');
  await cmd('setPlan', PLAN2);
  await E(() => window.__home(false));
  await cmd('start');
  const r = await cmd('endEarly');
  ok(r.result.ok && r.next.phase === 'between' && r.next.endReason === 'ended-early', 'plan continues after a run ends early');
  await p.waitForFunction(() => !window.__dm.runClosing, null, { timeout: 4000 });
  const f = await cmd('finishSession');
  await sleep(800);
  ok(f.result.ok && p.downloads.length === 1 && p.downloads[0].endsWith('.zip'), 'Finish session saves what exists (' + p.downloads.join(', ') + ')');
  await p.context().close();
}

async function syncSuite(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const o = await ctx.newPage();
  const saved = [];
  o.on('download', d => saved.push(d));
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await o.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); });
  const O = (fn, arg) => o.evaluate(fn, arg);
  const emit = (m) => O((d) => window.__c.emit('data', JSON.stringify(d)), m);
  const BASE = { type: 'state', version: '2.5.3', sessionId: 'A', phase: 'between', participantId: 'P1', filePrefix: 'P1_run2_', experimenter: 'Jo', homeMode: 'one-box', dominantHand: 'LEFT', condition: 1, mode: 'fmode', totalTrials: 44, setupLocked: false, calib: null, recentred: true, cue: null, sessionMs: 0, trialCount: 1, recentreCount: 0, pauses: 0, plannedRuns: 3, plan: { runs: [{ condition: 1, off: false, recal: false }, { condition: 2, off: false, recal: false }, { condition: 1, off: false, recal: false }] }, betweenMs: 0, betweenRecentres: 0, recalibrated: [], info: 'Key,Value\n' };
  const stateRun2 = Object.assign({}, BASE, { run: 2, backup: { trials: 1, kinL: 1, kinR: 1, final: false, exportTs: '' }, completedRuns: [{ run: 1, prefix: 'P1_run1_', trials: 2, kinL: 1, kinR: 1, info: 'Key,Value\nRun,1\n', ms: 1000, recentres: 1, pauses: 0 }] });
  const rows = (run, file, from, lines) => emit({ type: 'rows', run, file, from, header: 'H\n', lines });
  const bk = () => O(() => { const k = window.__obs.backup; return { run: k.run, archived: k.archive.length, t: k.trials.length, l: k.kinL.length, r: k.kinR.length }; });
  const lastSync = () => O(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'sync').at(-1));

  console.log('LAPTOP COPY ACROSS RUNS');
  await emit(stateRun2);
  ok((await bk()).run === 1, 'observer opened after run 1: starts filling run 1');
  await O(() => window.__obs.receiver.sendSync());
  ok((await lastSync()).run === 1, 'sync asks for run 1');
  await rows(2, 'trials', 0, ['x\n']);
  ok((await bk()).t === 0, 'rows for another run ignored');
  await rows(1, 'trials', 0, ['1\n', '2\n']); await rows(1, 'kinL', 0, ['l\n']);
  ok((await bk()).run === 1, 'run 1 incomplete: stays on run 1');
  await rows(1, 'kinR', 0, ['r\n']);
  let k = await bk();
  ok(k.run === 2 && k.archived === 1 && k.t === 0 && k.l === 0, 'run 1 complete: archived, moves on to run 2');
  ok((await lastSync()).run === 2, 'next sync asks for run 2');
  await rows(2, 'trials', 0, ['3\n']); await rows(2, 'kinL', 0, ['l\n']); await rows(2, 'kinR', 0, ['r\n']);
  await emit(stateRun2);
  await sleep(300);
  const copy = await O(() => document.getElementById('g7-b-copy').textContent);
  ok(copy.includes('All data received for the completed run'), 'between runs: laptop copy complete across both runs');

  console.log('RECONNECTING');
  await O(() => { const P = window.__peers.at(-1); const c = P.conns.at(-1); c.close(); });
  await o.waitForFunction(() => window.__peers.at(-1).conns.length > 1 || window.__peers.length > 1, null, { timeout: 6000 }).catch(() => {});
  await O(() => { const P = window.__peers.at(-1); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); });
  await emit(stateRun2);
  k = await bk();
  ok(k.run === 2 && k.archived === 1 && k.t === 1, 'same headset session: nothing re-sent after a reconnect');
  await emit(Object.assign({}, BASE, { sessionId: 'B', phase: 'setup', run: 1, plan: null, plannedRuns: 1, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, completedRuns: [] }));
  k = await bk();
  ok(k.run === 3 && k.archived === 2 && k.t === 0, 'new headset session mid-plan: laptop keeps both runs and waits for run 3');
  await sleep(800);
  const zipped = saved.length ? await openDownload(saved.at(-1), fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runs-s-'))) : [];
  ok(['run1/P1_run1_vr-session-data-', 'run1/P1_run1_session-info-', 'run2/P1_run2_vr-session-data-'].every(pre => zipped.some(x => x.path.startsWith(pre))), 'headset page reloaded mid-session: earlier runs saved at once (' + zipped.length + ' files)');
  await ctx.close();
}

async function offlineSuite(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const o = await ctx.newPage();
  const errs = [];
  o.on('pageerror', e => errs.push(e.message));
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await o.evaluate(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; window.__refuse = {};
    const send = c.send.bind(c);
    c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: !window.__refuse[m.name], reason: window.__refuse[m.name] || '' }))); };
    c.open = true; c.emit('open');
  });
  const O = (fn, arg) => o.evaluate(fn, arg);
  const runs = [{ condition: 1, off: true, recal: false }, { condition: 2, off: false, recal: false }];
  const STATE = { type: 'state', version: '2.5.3', sessionId: 'A', phase: 'between', participantId: 'P1', filePrefix: 'P1_run1_', experimenter: 'Jo', homeMode: 'one-box', dominantHand: 'LEFT', condition: 1, mode: 'fmode', totalTrials: 44, setupLocked: false, calib: null, recentred: true, cue: null, sessionMs: 0, trialCount: 44, recentreCount: 0, pauses: 0, run: 1, plannedRuns: 2, plan: { mode: 'fmode', home: 'one-box', runs }, inVR: true, closing: false, betweenMs: 0, betweenRecentres: 1, recalibrated: [], completedRuns: [], backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' };
  const emit = (m) => O((d) => window.__c.emit('data', JSON.stringify(d)), m);
  const cmds = () => O(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'cmd' && m.name !== 'cue'));
  const dirty = () => O(() => window.__obs.guide.planDirty);
  const text = (id) => O((i) => document.getElementById(i).textContent, id);

  console.log('PLAN EDITS WHILE THE HEADSET IS ASLEEP');
  await emit(STATE); await sleep(350);
  await O(() => { window.__c.open = false; });
  await sleep(350);
  await o.click('#g7-b-add'); await sleep(350);
  ok(await dirty(), 'plan edit waits while the headset is away');
  ok((await cmds()).length === 0, 'nothing sent while away');
  await O(() => { window.__c.open = true; });
  await emit(STATE);
  await o.waitForFunction(() => window.__c.sent.map(x => JSON.parse(x)).some(m => m.name === 'setPlan'), null, { timeout: 3000 });
  await sleep(100);
  const sentPlan = (await cmds()).filter(m => m.name === 'setPlan').at(-1);
  ok(sentPlan.value.runs.length === 3 && !(await dirty()), 'plan sent by itself when the headset returns');
  await O(() => { window.__obs.guide.plan.runs.push({ condition: 1, off: false, recal: false }); window.__obs.guide.planDirty = true; window.__refuse = { setPlan: 'A plan can contain 1–20 runs.' }; });
  await sleep(350);
  ok(!(await dirty()) && (await text('g7-msg')) === 'Headset refused: A plan can contain 1–20 runs.', 'a refused plan is reported, not retried for ever');
  await O(() => { window.__refuse = {}; });
  await emit(Object.assign({}, STATE, { plan: { mode: 'fmode', home: 'one-box', runs: runs.concat([{ condition: 1, off: false, recal: false }]) }, plannedRuns: 3 }));
  await sleep(350);

  console.log('START NEXT RUN');
  await o.check('#g7-b-removed');
  await sleep(100);
  ok(await O(() => document.activeElement.id !== 'g7-b-removed'), 'headset-removed tick does not keep keyboard focus');
  await O(() => { window.__c.sent.length = 0; });
  await O(() => document.getElementById('g7-b-start').click());
  await sleep(150);
  ok((await cmds()).map(m => m.name).join() === 'setPlan,setCondition,nextRun', 'Start next run sends plan, reward, then starts');

  console.log('CONFIRMATIONS AND STATUS');
  await emit(Object.assign({}, STATE, { phase: 'running', run: 2, setupLocked: true, betweenRecentres: 0 })); await sleep(350);
  await o.click('#g-end'); await sleep(50);
  await emit(STATE); await sleep(350);
  await emit(Object.assign({}, STATE, { phase: 'running', run: 2, setupLocked: true })); await sleep(350);
  ok(await O(() => document.getElementById('g-end-confirm').hidden), 'End run confirmation does not carry into the next run');
  await emit(Object.assign({}, STATE, { phase: 'complete', endReason: 'finished', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' } })); await sleep(350);
  ok((await text('g8-files')).includes('Headset saving…'), 'Finish: says saving until the headset has saved');
  ok(await O(() => document.getElementById('g-add-run').disabled), 'Add run waits until the run has closed');
  await emit(Object.assign({}, STATE, { phase: 'complete', endReason: 'finished', saving: true, backup: { trials: 0, kinL: 0, kinR: 0, final: true, exportTs: 'T' } })); await sleep(350);
  ok((await text('g8-files')).includes('Headset saving…'), 'still saving while files are queued');
  await emit(Object.assign({}, STATE, { phase: 'complete', endReason: 'finished', backup: { trials: 0, kinL: 0, kinR: 0, final: true, exportTs: 'T' } })); await sleep(350);
  ok((await text('g8-files')).includes('Headset copy saved'), 'Finish: saved once final');
  await O(() => { window.__c.sent.length = 0; window.__refuse = { setPlan: 'A plan can contain 1–20 runs.' }; });
  const before = await O(() => window.__obs.guide.plan.runs.length);
  await o.click('#g-add-run'); await sleep(150);
  ok(await O((n) => window.__obs.guide.plan.runs.length === n, before) && !(await cmds()).some(m => m.name === 'reopenSession'), 'refused Add run leaves the plan unchanged');
  await O(() => { window.__refuse = {}; });

  await o.click('#btn-readouts'); await sleep(350);
  await emit(Object.assign({}, STATE, { run: 2, backup: { trials: 5, kinL: 5, kinR: 5, final: false, exportTs: '' }, completedRuns: [{ run: 1, prefix: 'P1_run1_', trials: 2, kinL: 7, kinR: 7, info: 'x', ms: 1, recentres: 0, pauses: 0 }] }));
  await sleep(350);
  const rowsText = await O(() => document.getElementById('r-bk-kinl').textContent);
  ok(rowsText.endsWith('/ 12'), 'Status rows count every run (' + rowsText + ')');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await ctx.close();
}

async function guidedSuite(b) {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runs-'));
  const hostOpen = await openHost(b);
  const host = hostOpen.p;
  const H = (fn, arg) => host.evaluate(fn, arg);
  await H(() => {
    const sc = document.querySelector('a-scene');
    const is = sc.is.bind(sc);
    window.__inVR = true;
    sc.is = (x) => x === 'vr-mode' ? window.__inVR : x === 'ar-mode' ? !!window.__inAR : is(x);
  });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const o = await ctx.newPage();
  const errs = [], odl = [];
  o.on('pageerror', e => errs.push(e.message));
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
  const O = (fn, arg) => o.evaluate(fn, arg);
  const waitStep = (n, t) => o.waitForFunction((k) => +(document.querySelector('#guide .step.open')?.dataset.step || 0) === k, n, { timeout: t || 6000, polling: 50 });
  const shown = (sel) => O((s) => { const el = document.querySelector(s); return !!el && el.checkVisibility(); }, sel);
  const text = (id) => O((i) => document.getElementById(i).textContent, id);
  const waitText = (id, want, t) => o.waitForFunction(([i, w]) => document.getElementById(i).textContent.includes(w), [id, want], { timeout: t || 6000, polling: 50 });
  const canStart = () => O(() => !document.getElementById('g7-b-start').disabled);
  const waitCan = (v) => o.waitForFunction((x) => !document.getElementById('g7-b-start').disabled === x, v, { timeout: 4000, polling: 50 });

  console.log('GUIDED: RUN PLAN STEP');
  await waitStep(2);
  ok(!(await shown('[data-g="cond"]')) && !(await shown('[data-g="mode"]')), 'Participant step no longer has condition or mode');
  await o.fill('#g-exp', 'Jo Smith'); await o.fill('#g-id', 'G06');
  await o.fill('#g-exp', 'Jo "JJ" Smith'); await o.click('#g-confirm');
  ok((await text('g2-msg')).includes('cannot contain commas or quotation marks'), 'experimenter with quotes caught on the laptop');
  await o.fill('#g-exp', 'Jo Smith');
  await o.click('[data-g="dom"][data-v="RIGHT"]');
  await o.click('#g-confirm');
  await waitStep(3);
  ok(await shown('#plan-builder'), 'Run plan step: builder fills the main area');
  ok(await O(() => document.querySelectorAll('[data-card]').length) === 1, 'new sessions start with one run');
  await o.click('[data-plan-mode="fmode"]');
  ok((await text('plan-builder')).includes('1 run · 44 trials'), 'length changes the totals');
  await o.click('#plan-add'); await o.click('#plan-add');
  ok(await O(() => document.querySelectorAll('[data-card]').length) === 3, 'Add run adds cards');
  ok(await O(() => [...document.querySelectorAll('[data-card]')].map(c => c.classList.contains('boost')).join()) === 'false,true,false', 'added runs alternate reward');
  ok((await text('plan-builder')).includes('3 runs · 132 trials'), 'totals follow');
  await o.click('#plan-add');
  await o.click('[data-plan-remove="3"]');
  ok(await O(() => document.querySelectorAll('[data-card]').length) === 3, 'remove takes a card away');
  await o.dragAndDrop('[data-card="1"]', '[data-card="2"]');
  ok(await O(() => [...document.querySelectorAll('[data-card]')].map(c => c.classList.contains('boost')).join()) === 'false,false,true', 'drag reorders runs');
  await o.dragAndDrop('[data-card="2"]', '[data-card="1"]');
  await o.click('[data-plan-link="1"]');
  ok((await O(() => document.querySelector('[data-plan-link="1"]').textContent)) === 'Headset off', 'link switches to headset off');
  await o.check('[data-plan-recal="1"]');
  ok(await O(() => !document.activeElement || document.activeElement.tagName !== 'INPUT'), 'tickbox does not keep keyboard focus');
  const links = () => O(() => [...document.querySelectorAll('[data-plan-link]')].map(b => b.textContent).join());
  await o.dragAndDrop('[data-card="1"]', '[data-card="2"]');
  ok(await links() === 'Headset on,Headset off' && await O(() => document.querySelector('[data-plan-recal="1"]').checked), 'dragging a run leaves breaks and recalibration in place');
  ok(await O(() => [...document.querySelectorAll('[data-card]')].map(c => c.classList.contains('boost')).join()) === 'false,false,true', 'rewards still reorder');
  await o.dragAndDrop('[data-card="2"]', '[data-card="1"]');
  await o.click('#plan-add');
  await o.click('[data-plan-link="2"]'); await o.check('[data-plan-recal="2"]');
  await o.click('[data-plan-remove="3"]');
  await o.click('#plan-add');
  ok(await O(() => document.querySelector('[data-plan-link="2"]').textContent === 'Headset on' && !document.querySelector('[data-plan-recal="2"]').checked), 'removing the last run clears the hidden break before it');
  await o.click('[data-plan-remove="3"]');
  ok(!(await O(() => window.__obs.guide.planDirty === false)) && (await text('g3-checks')).includes('3 runs'), 'plan waits for Send to headset');
  ok(await H(() => window.__dm.plan === null), 'headset unchanged until sent');
  await o.click('#g-plan-send');
  await waitStep(4);
  ok(!(await shown('#plan-builder')), 'builder gone, 3D view back at Position');
  const hp = await H(() => ({ plan: window.__dm.plan, mode: window.__sm.mode, cond: window.__sc.currentCondition }));
  ok(hp.mode === 'fmode' && hp.cond === 1 && hp.plan.runs.length === 3 && hp.plan.runs[1].off && hp.plan.runs[1].recal && hp.plan.runs[1].condition === 2, 'headset received length, first reward and plan');
  ok(await shown('#v-run-item') && (await text('v-run')) === '1 / 3', 'top bar shows Run');

  await H(() => { document.querySelector('#spectator-manager').components['spectator-manager'].activeSpace = {}; });
  await waitStep(5);
  await H(() => { const c = document.querySelector('a-scene').camera.el.getAttribute('position'); window.__track('L', [c.x - 0.1, c.y - 0.1, c.z - 0.45]); window.__track('R', [c.x + 0.1, c.y, c.z - 0.6]); });
  await o.click('[data-calib="reach"]'); await waitText('g5-reach', 'hand');
  await o.click('[data-calib="height"]'); await waitText('g5-height', 'Height');
  await H(() => window.__home(true));
  await o.click('[data-calib="lap"]'); await waitText('g5-lap', 'Home box at');
  await waitStep(6);
  await o.waitForFunction(() => !document.getElementById('g-start').disabled, null, { timeout: 4000 });
  ok((await text('g-start')).startsWith('Start run 1'), 'button reads Start run 1');
  await H(() => window.__home(false));
  await o.click('#g-start');
  await waitStep(7);
  ok((await text('g7-head')) === 'Running' && (await text('g-end')) === 'End run', 'Running step, End run button');

  console.log('GUIDED: BETWEEN RUNS, HEADSET ON');
  await finishRun(H);
  await waitText('g7-head', 'Between runs');
  ok(await shown('#plan-builder') && await shown('#g7-between') && !(await shown('#g-pause')), 'between runs: plan shown, run controls gone');
  ok(!(await O(() => [...document.querySelectorAll('[data-plan-remove]')].some(b => b.dataset.planRemove === '0'))), 'finished run is locked');
  ok(await O(() => document.querySelector('[data-card="1"]').classList.contains('next')), 'next run marked');
  ok((await text('g7-b-title')) === 'Run 1 of 3 complete' && (await text('g7-b-next')).startsWith('Next run: 2 · Boost'), 'title and next run');
  await waitText('g7-b-copy', 'All data received for the completed run', 10000);
  ok(!(await shown('#g7-b-off')) && !(await shown('#g7-b-break')), 'headset on: no break steps');
  ok((await text('conn-state')) !== 'Break: headset off', 'headset on: normal connection status');
  await waitCan(true);
  ok((await text('g7-b-start')) === 'Start run 2', 'button reads Start run 2');
  await o.click('#g7-b-start');
  await waitText('g7-head', 'Running');
  const r2 = await H(() => ({ run: window.__dm.runNumber, cond: window.__sc.currentCondition, phase: window.__sm.phase }));
  ok(r2.run === 2 && r2.cond === 2 && r2.phase === 'running', 'run 2 running with its own reward');
  ok((await text('v-run')) === '2 / 3', 'top bar follows');

  console.log('GUIDED: BETWEEN RUNS, HEADSET OFF');
  await finishRun(H);
  await waitText('g7-head', 'Between runs');
  await waitText('conn-state', 'Break: headset off');
  await waitText('g7-b-copy', 'Headset copy saved', 10000);
  ok(host.dl.length === 1 && host.dl[0].suggestedFilename().startsWith('G06_'), 'headset saved a zip when the headset-off break began');
  ok(await shown('#g7-b-off') && await shown('#g7-b-break') && await shown('#g7-b-recal'), 'break timer, headset steps and recalibration shown');
  ok(!(await O(() => document.querySelector('[data-plan-link="1"]').disabled)), 'current break still editable');
  ok(await O(() => document.querySelector('[data-plan-link="0"]').disabled), 'earlier break locked');
  await sleep(200);
  ok(!(await canStart()), 'start locked');
  const cueNow = (want) => host.waitForFunction((x) => document.querySelector('#participant-cue-text').getAttribute('value') === x, want, { timeout: 4000, polling: 20 });
  await cueNow('Stretch one arm straight out');
  ok((await text('g7-b-say')).includes('Stretch one arm'), 'recalibration: read-aloud line and headset cue for reach');
  await H(() => { window.__inVR = false; window.__smState = true; document.querySelector('#spectator-manager').components['spectator-manager'].stateDirty = true; });
  await waitText('g7-b-vr', 'The headset is not in VR or AR. Enter VR or AR on the headset.');
  ok(await O(() => document.getElementById('g7-b-recentre').disabled), 'recentre waits for VR');
  await H(() => { window.__inAR = true; document.querySelector('#spectator-manager').components['spectator-manager'].stateDirty = true; });
  await waitText('g7-b-vr', 'In AR');
  ok(true, 'headset entered with the AR button: shown as In AR');
  await H(() => { window.__inAR = false; window.__inVR = true; document.querySelector('#spectator-manager').components['spectator-manager'].stateDirty = true; });
  await waitText('g7-b-vr', 'In VR');
  await o.check('#g7-b-removed');
  await sleep(100);
  ok(!(await canStart()), 'still locked: recentre required');
  await waitText('g7-b-recentred', 'Recentre required');
  await H(() => { window.__dm.logRecentre(); document.querySelector('#spectator-manager').components['spectator-manager'].stateDirty = true; });
  await waitText('g7-b-recentred', 'Recentred');
  await H(() => { const sp = document.querySelector('#spectator-manager').components['spectator-manager']; sp.onExitVR(); sp.onEnterVR(); });
  await waitText('g7-b-recentred', 'Recentre required');
  ok(true, 'leaving and re-entering VR makes an earlier recentre count for nothing');
  await H(() => { window.__dm.logRecentre(); document.querySelector('#spectator-manager').components['spectator-manager'].stateDirty = true; });
  await waitText('g7-b-recentred', 'Recentred');
  await sleep(100);
  ok(!(await canStart()), 'still locked: recalibration ticked');
  await H(() => window.__home(true));
  await o.click('[data-bcalib="height"]');
  await waitText('g7-b-recal-status', 'Recalibrated: height');
  await o.click('#g7-b-skip');
  await cueNow('Short break');
  ok(!(await shown('#g7-b-say')), 'recalibration skipped: read-aloud line gone, cue back to "Short break"');
  await waitCan(true);
  ok(true, 'tick, VR, recentre and recalibration done or skipped: start unlocked');
  await H(() => window.__home(false));
  await o.click('#g7-b-start');
  await waitText('g7-head', 'Running');
  await o.waitForFunction(() => document.getElementById('conn-state').textContent === 'Connected', null, { timeout: 4000 });
  ok(true, 'status back to Connected after the break');

  console.log('GUIDED: FINISH');
  await finishRun(H);
  await waitStep(8, 10000);
  await waitText('g8-files', 'Download started:', 20000);
  for (let i = 0; i < 40 && (odl.length < 1 || host.dl.length < 2); i++) await sleep(100);
  await sleep(300);
  const ts = await H(() => window.__dm.lastExportTimestamp);
  ok(odl.length === 1 && odl[0].suggestedFilename() === `G06_${ts}.zip` && host.dl.at(-1).suggestedFilename() === `G06_${ts}.zip`, 'one final zip on each device, same name');
  const lapFiles = await openDownload(odl[0], OUT);
  const hostFiles = await openDownload(host.dl.at(-1), OUT);
  ok(lapFiles.filter(x => x.path.startsWith('run')).length === 12 && [1, 2, 3].every(n => lapFiles.some(x => x.path === `run${n}/G06_run${n}_vr-session-data-${ts}.csv`) && lapFiles.some(x => x.path === `run${n}/G06_run${n}_session-info-${ts}.csv`)), 'laptop zip: 4 files per run in folders');
  ok(hostFiles.length === lapFiles.length && hostFiles.every(f => lapFiles.some(x => x.path === f.path && x.text === f.text)), 'laptop files byte-identical to the headset files across all runs');
  const sum = await O(() => { const s = [...document.querySelectorAll('#g8-summary span')].map(x => x.textContent); const r = {}; for (let i = 0; i < s.length; i += 2) r[s[i]] = s[i + 1]; return r; });
  ok(sum['Trials completed'] === '132 / 132', `summary covers all runs (${sum['Trials completed']})`);

  console.log('GUIDED: ADD A RUN AFTER FINISHING');
  await o.waitForFunction(() => !document.getElementById('g-add-run').disabled, null, { timeout: 4000 });
  await o.click('#g-add-run');
  await waitText('g7-head', 'Between runs');
  ok((await text('g7-b-title')) === 'Run 3 of 4 complete', 'Add run reopens the session');
  await o.click('#g7-b-finish');
  await waitStep(8, 6000);
  ok(errs.length === 0, 'no observer page errors (' + errs.join(' | ') + ')');
  ok(host.errs.length === 0, 'no headset page errors (' + host.errs.join(' | ') + ')');
  running = false; await relay;
  await ctx.close();
}

(async () => {
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  await headsetSuite(b);
  await earlyEndSuite(b);
  await syncSuite(b);
  await offlineSuite(b);
  await guidedSuite(b);
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

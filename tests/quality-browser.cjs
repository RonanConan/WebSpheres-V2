const fs = require('fs'), os = require('os'), path = require('path');
const { launch, serve, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { openDownload } = require('./unzip.cjs');
const { ok, done } = counter('QUALITY BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-quality-'));
const VERSION = '2.5.0';
const row = (t, o) => {
  const a = Object.assign({ target: true, valid: 1, x: 0, y: 1.2, z: 0, rec: 0 }, o);
  return `${t},0.1,1,-0.3,0,0.9,-0.4,${a.target ? '0.1,1.2,-0.4' : ',,'},${a.valid},0,0,0,0,0,0,1,${a.x},${a.y},${a.z},0,0,0,1,${a.rec}\n`;
};
const STATE = { type: 'state', version: VERSION, sessionId: 'A', phase: 'running', endReason: '', participantId: 'P1', filePrefix: 'P1_run1_', sessionPrefix: 'P1_', experimenter: 'Jo', homeMode: 'one-box', dominantHand: 'RIGHT', condition: 1, mode: 'standard', totalTrials: 352, setupLocked: true, calib: null, recentred: true, cue: null, sessionMs: 1000, trialCount: 5, recentreCount: 0, pauses: 0, run: 1, plannedRuns: 2, plan: { mode: 'standard', home: 'one-box', runs: [{ condition: 1, off: false, recal: false }, { condition: 2, off: false, recal: false }] }, inVR: true, closing: false, saving: false, headsetCopyRun: 0, betweenMs: 0, betweenRecentres: 0, recalibrated: [], completedRuns: [], noteMarks: [], notesCsv: '', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: 'Key,Value\n' };

async function observerSuite(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const o = await ctx.newPage();
  const errs = [];
  o.on('pageerror', e => errs.push(e.message));
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await o.evaluate(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
    const send = c.send.bind(c);
    c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: true, reason: '' }))); };
    c.open = true; c.emit('open');
  });
  const O = (fn, arg) => o.evaluate(fn, arg);
  const emit = (m) => O((d) => window.__c.emit('data', JSON.stringify(d)), m);
  let t = 0, nL = 0, nR = 0, nT = 0;
  const trials = [];
  let extra = {};
  const state = (over) => emit(Object.assign({}, STATE, extra, over, { backup: { trials: nT, kinL: nL, kinR: nR, final: false, exportTs: '' } }));
  const feed = async (seconds, opts, fps) => {
    const rate = fps || 90;
    const rows = { L: [], R: [] };
    for (let i = 0; i < seconds * rate; i++) {
      const f = typeof opts === 'function' ? opts(i) : (opts || {});
      rows.L.push(row(t, f.L || f));
      rows.R.push(row(t, f.R || f));
      t += 1000 / rate;
    }
    await emit({ type: 'rows', run: 1, file: 'kinL', from: nL, header: 'H\n', lines: rows.L }); nL += rows.L.length;
    await emit({ type: 'rows', run: 1, file: 'kinR', from: nR, header: 'H\n', lines: rows.R }); nR += rows.R.length;
    await state();
    await sleep(320);
  };
  const addTrial = async (hit) => {
    trials.push(`${trials.length + 1},${Math.round(t)},3,${hit === 'SKIP' ? 'NA' : 'LEFT'},1,${hit},100,200,0,P1,1\n`);
    await emit({ type: 'rows', run: 1, file: 'trials', from: nT, header: 'H\n', lines: [trials.at(-1)] }); nT++;
    await state({ trialCount: nT });
    await sleep(320);
  };
  const light = (k) => O((key) => { const r = document.querySelector(`#g7-quality [data-q="${key}"]`); return { kind: r.dataset.kind, mark: r.querySelector('.ck').textContent, text: r.querySelector('.q-val').textContent }; }, k);
  const notes = () => O(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'cmd' && m.name === 'addNote').map(m => m.value));
  const alert = () => O(() => document.getElementById('g-alert').textContent);

  console.log('LIGHTS');
  await state();
  await sleep(320);
  ok((await light('trackL')).kind === 'off' && (await light('fps')).kind === 'off', 'no data yet: grey');
  await feed(40);
  let l = await light('trackL');
  ok(l.kind === 'ok' && l.text === '100%' && l.mark === '✓', 'tracking left: green, 100%, with a mark as well as colour');
  ok((await light('trackR')).text === '100%', 'tracking right: 100%');
  ok((await light('fps')).kind === 'ok' && Math.abs(+(await light('fps')).text - 90) <= 2, 'frame rate about 90 (' + (await light('fps')).text + ')');
  ok((await light('head')).kind === 'ok' && (await light('head')).text === '0.0 cm', 'head still: 0.0 cm');
  ok((await light('flow')).text === 'OK', 'trial flow OK');
  ok(await O(() => !document.getElementById('g7-left') && !document.getElementById('g7-run').textContent.includes('Right hand')), 'hand use hidden during the run');

  console.log('ROWS AHEAD OF THE LAST STATE');
  for (let i = 0; i < 7; i++) {
    const rows = Array.from({ length: 90 }, (_, k) => row(t + (k * 1000) / 90));
    t += 1000;
    await emit({ type: 'rows', run: 1, file: 'kinL', from: nL, header: 'H\n', lines: rows }); nL += 90;
    await emit({ type: 'rows', run: 1, file: 'kinR', from: nR, header: 'H\n', lines: rows }); nR += 90;
    await emit(Object.assign({}, STATE, { backup: { trials: nT, kinL: nL - 30, kinR: nR - 30, final: false, exportTs: '' } }));
    await sleep(800);
  }
  ok((await light('trackL')).kind === 'ok' && (await light('fps')).kind === 'ok', 'laptop ahead of the last reported counts: lights stay on');
  ok(!(await alert()).includes('behind'), 'no false "laptop copy behind" alert');

  console.log('TRACKING THRESHOLDS');
  await feed(30, (i) => ({ L: { valid: i % 10 === 0 ? 0 : 1 }, R: {} }));
  l = await light('trackL');
  ok(l.kind === 'warn' && l.text === '90%' && l.mark === '!', 'left at 90%: amber (' + l.text + ')');
  ok((await light('trackR')).kind === 'ok', 'right unaffected');
  ok((await notes()).length === 0, 'amber is not logged');
  await feed(30, (i) => ({ L: { valid: i % 5 === 0 ? 0 : 1 }, R: {} }));
  l = await light('trackL');
  ok(l.kind === 'bad' && l.text === '80%' && l.mark === '✗', 'left at 80%: red (' + l.text + ')');
  ok((await alert()).includes('Tracking left: 80%'), 'alert bar shows the red light');
  let n = await notes();
  ok(n.length === 1 && n[0].type === 'alert' && n[0].text === 'Tracking left red: 80%', 'red alert logged in notes (' + JSON.stringify(n.map(x => x.text)) + ')');
  await feed(5, (i) => ({ L: { valid: i % 5 === 0 ? 0 : 1 }, R: {} }));
  ok((await notes()).length === 1, 'staying red does not log again');
  await feed(30, (i) => ({ L: { target: false, valid: 0 }, R: { target: false } }));
  ok((await light('trackL')).kind === 'off', 'no target for 30 s: tracking grey, not judged on rest periods');
  await feed(32);
  ok((await light('trackL')).kind === 'ok', 'recovers to green');

  console.log('HEAD STILLNESS');
  await feed(1, { x: 0.07 });
  ok((await light('head')).kind === 'warn' && (await light('head')).text === '7.0 cm', 'head 7 cm away: amber');
  await feed(1, { x: 0.12 });
  ok((await light('head')).kind === 'bad' && (await light('head')).text === '12.0 cm', 'head 12 cm away: red');
  await feed(1, { x: 0.3, rec: 1 });
  ok((await light('head')).kind === 'ok' && (await light('head')).text === '0.0 cm', 'recentre: new baseline, green');
  await feed(1, { x: 0.3, y: 1.14, rec: 1 });
  ok((await light('head')).kind === 'warn', 'height change counts too (' + (await light('head')).text + ')');
  await feed(1, { x: 0.3, rec: 1 });

  console.log('FRAME RATE');
  await feed(31, {}, 75);
  ok((await light('fps')).kind === 'warn', 'frame rate 75: amber (' + (await light('fps')).text + ')');
  await feed(31, {}, 60);
  ok((await light('fps')).kind === 'bad', 'frame rate 60: red (' + (await light('fps')).text + ')');
  await feed(31);

  console.log('TRIAL FLOW');
  await addTrial('normal');
  ok((await light('flow')).text === 'OK', 'hits: OK');
  await addTrial('SKIP');
  ok((await light('flow')).kind === 'warn' && (await light('flow')).text === '1 skip', '1 skip in last 22: amber');
  await addTrial('SKIP'); await addTrial('SKIP');
  ok((await light('flow')).kind === 'bad' && (await light('flow')).text === '3 skips', '3 skips: red');
  ok((await alert()).includes('Trial flow: 3 skips'), 'alert bar shows it');
  for (let i = 0; i < 22; i++) { trials.push(`${trials.length + 1},${Math.round(t)},3,LEFT,1,normal,100,200,0,P1,1\n`); }
  await emit({ type: 'rows', run: 1, file: 'trials', from: nT, header: 'H\n', lines: trials.slice(nT) }); nT = trials.length;
  await state({ trialCount: nT }); await sleep(320);
  ok((await light('flow')).text === 'OK', 'skips older than 22 trials no longer count');
  await state({ phase: 'paused', trialCount: nT }); await sleep(320);
  ok((await light('flow')).kind === 'off', 'paused: trial flow grey');
  await state({ phase: 'running', trialCount: nT }); await sleep(320);

  console.log('LINK LOST');
  await O(() => { window.__c.open = false; });
  await sleep(350);
  ok((await light('trackL')).kind === 'off' && (await light('head')).kind === 'off' && (await light('flow')).kind === 'off' && (await light('trackL')).mark === '–', 'link lost: every light grey, never a stale green');
  await O(() => { window.__c.open = true; });
  await state({ trialCount: nT }); await sleep(350);

  console.log('NOTES');
  const stamped = await notes();
  const nBefore = stamped.length;
  const pressedAt = Date.now();
  await state({ sessionMs: 5000, trialCount: 18 });
  await o.click('#g-note-spoke');
  await sleep(100);
  n = await notes();
  const spoke = n.at(-1);
  ok(n.length === nBefore + 1 && spoke.text === 'Spoke to participant' && spoke.type === 'note' && spoke.trial === 18 && spoke.run === 1, 'Spoke to participant: one click, with run and trial');
  ok(spoke.time >= 5000 && spoke.time < 5400, 'run time follows the data clock (' + spoke.time + ' ms)');
  ok(Math.abs(new Date(spoke.dateTime).getTime() - pressedAt) < 2000 && !spoke.estimated, 'date and time recorded, not estimated');
  await state({ sessionMs: 6000, trialCount: 20 });
  await o.click('#g-note-add');
  ok(await O(() => !document.getElementById('g-note-box').hidden && document.activeElement.id === 'g-note-text'), 'Add note opens a box, ready to type');
  await sleep(700);
  await state({ sessionMs: 20000, trialCount: 30 });
  await o.keyboard.type('Told, to sit "still"');
  ok((await notes()).length === nBefore + 1, 'nothing sent while typing');
  await o.keyboard.press('Enter');
  await sleep(100);
  const typed = (await notes()).at(-1);
  ok(typed.text === 'Told, to sit "still"' && typed.trial === 20 && typed.time >= 6000 && typed.time < 6400, 'time and trial are from pressing Add note, not finishing typing (' + typed.time + ' ms, trial ' + typed.trial + ')');
  ok(await O(() => document.getElementById('g-note-box').hidden && document.getElementById('g-note-text').value === ''), 'box closes');
  await o.click('#g-note-add'); await o.click('#g-note-save'); await sleep(50);
  ok(!(await O(() => document.getElementById('g-note-box').hidden)) && (await notes()).length === nBefore + 2, 'empty note not saved');
  await o.click('#g-note-cancel');
  await O(() => { window.__c.open = false; });
  await sleep(50);
  await o.click('#g-note-spoke');
  await sleep(350);
  ok((await notes()).length === nBefore + 2 && (await O(() => document.getElementById('g-note-status').textContent)).includes('1 waiting to send') && (await O(() => document.getElementById('g-note-status').textContent)).includes('time estimated'), 'link lost: note waits and is marked estimated');
  await O(() => { window.__c.open = true; });
  await state({ sessionMs: 30000 });
  await sleep(400);
  const late = (await notes()).at(-1);
  ok((await notes()).length === nBefore + 3 && late.estimated === true, 'sent when the link returns, still marked estimated');

  console.log('NOTES AND THE FINAL SAVE');
  await O(() => { window.__obs.guide.noteQueue.push({ id: 'held', type: 'note', text: 'x' }); window.__obs.guide.noteSending = true; });
  const dlBefore = await O(() => window.__obs.backup.autoSavedTs);
  await emit(Object.assign({}, STATE, { phase: 'complete', endReason: 'finished', backup: { trials: nT, kinL: nL, kinR: nR, final: true, exportTs: 'HELD' } }));
  await sleep(100);
  ok((await O(() => window.__obs.backup.autoSavedTs)) === dlBefore, 'final save waits while a note is still queued');
  await O(() => { window.__obs.guide.noteQueue.length = 0; window.__obs.guide.noteSending = false; });
  await emit(Object.assign({}, STATE, { phase: 'complete', endReason: 'finished', backup: { trials: nT, kinL: nL, kinR: nR, final: true, exportTs: 'HELD' } }));
  await sleep(300);
  ok((await O(() => window.__obs.backup.autoSavedTs)) === 'HELD', 'saves once the queue is empty');

  console.log('BETWEEN-RUN REPORT');
  const marks = [{ run: 1, time: 5000, type: 'note' }, { run: 1, time: 60000, type: 'alert' }];
  extra = { noteMarks: marks };
  await state({ phase: 'between', sessionMs: Math.round(t), setupLocked: false, trialCount: nT, recentreCount: 1, pauses: 1 });
  await sleep(350);
  ok(await O(() => document.getElementById('run-report').checkVisibility() && !!document.querySelector('[data-report-run="1"]')), 'report shown between runs');
  const rep = await O(() => document.getElementById('run-report').textContent);
  ok(['Duration', 'Skips', 'Pauses', 'Recentres', 'Tracking left', 'Tracking right', 'Head stillness', 'Frame rate', 'Trial flow'].every(w => rep.includes(w)), 'facts and all five timelines listed');
  ok(!/verdict|pass|fail/i.test(rep), 'facts only, no pass or fail');
  ok(!/\bLEFT\b|hand use|Left hand/i.test(rep), 'no hand-choice data in the report');
  const strip = await O(() => {
    const line = [...document.querySelectorAll('[data-report-run="1"] .rep-line')].find(x => x.textContent.startsWith('Tracking left'));
    const cells = [...line.querySelectorAll('.rep-cell')];
    return { n: cells.length, kinds: cells.map(c => c.className.replace('rep-cell', '').trim()), title: cells[0].title };
  });
  ok(strip.n > 1 && strip.n <= 60, 'timeline has at most 60 cells (' + strip.n + ')');
  ok(strip.kinds.includes('ok') && (strip.kinds.includes('warn') || strip.kinds.includes('bad')), 'timeline shows when tracking dropped');
  ok(/^0:00–\d+:\d\d: \d+%$/.test(strip.title), 'hover gives time and value (' + strip.title + ')');
  ok(await O(() => document.querySelectorAll('[data-report-run="1"] .rep-mark').length >= 3), 'notes, alerts and recentres marked');
  ok(await O(() => !!document.getElementById('plan-add') && document.getElementById('plan-builder').scrollHeight > 0), 'Add run still on the same screen');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await ctx.close();
}

async function headsetSuite(b) {
  console.log('HEADSET NOTES');
  const { p, ctx } = await openHost(b);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const cmd = (name, value) => E(([n, v]) => window.__cmd(n, v), [name, value]);
  await E(() => {
    window.__sounds = 0;
    const a = document.querySelector('#audio-manager').components['audio-manager'];
    const play = a.playCalibrationSound.bind(a);
    a.playCalibrationSound = (x) => { window.__sounds++; return play(x); };
  });
  await cmd('setParticipant', 'P01');
  await E(() => window.__home(false));
  await cmd('start');
  await E(() => { window.__sounds = 0; });
  const note = { id: 'n1', type: 'note', text: 'Told, to sit "still"', run: 1, trial: 4, time: 1234, dateTime: '2026-11-02T10:00:00.000Z', estimated: false };
  let r = await cmd('addNote', note);
  ok(r.result.ok && r.next.noteMarks.length === 1, 'note stored, reported in state');
  ok(await E(() => window.__sounds === 0), 'adding a note makes no sound in the headset');
  ok((await cmd('addNote', note)).result.ok && (await E(() => window.__dm.notes.length)) === 1, 'a repeated send is stored once');
  for (const bad of [null, { id: 'x', type: 'note', text: '' }, { id: 'x', type: 'other', text: 'a' }, { type: 'note', text: 'a' }]) ok(!(await cmd('addNote', bad)).result.ok, 'bad note refused: ' + JSON.stringify(bad));
  await cmd('addNote', { id: 'n2', type: 'alert', text: 'Head stillness red: 12.0 cm', run: 1, trial: 5, time: 2000, dateTime: '2026-11-02T10:00:01.000Z', estimated: true });
  await cmd('unlockSetup');
  await cmd('setCondition', 2);
  const csv = (await E(() => window.__dm.notesCsv())).trimEnd().split('\n');
  ok(csv[0] === 'Run,Trial,RunTimeMs,ReceivedRunTimeMs,DateTime,Type,Text,Old,New,Estimated', 'notes header');
  ok(csv[1].startsWith('1,4,1234,') && csv[1].includes(',note,"Told, to sit ""still""",,,0'), 'note row, commas and quotes escaped');
  ok(csv[2].includes(',alert,Head stillness red: 12.0 cm,,,1'), 'alert row, estimate marked');
  ok(csv.some(l => l.includes(',setup,Setup,locked,unlocked,0')) && csv.some(l => l.includes(',setup,Condition,1,2,0')), 'setup changes in the same file, with old and new');
  await cmd('endEarly');
  await p.waitForFunction(() => window.__dm.lastExportTimestamp && !window.__dm.isSaving(), null, { timeout: 6000, polling: 20 });
  await sleep(200);
  const files = await openDownload(p.dl.at(-1), OUT);
  const ts = await E(() => window.__dm.lastExportTimestamp);
  const nf = files.find(f => f.path === `P01_notes-${ts}.csv`);
  ok(nf && nf.text === (await E(() => window.__dm.notesCsv())), 'notes file at the top of the zip');
  ok(files.filter(f => f.path.startsWith('run1/')).length === 3, 'run files in their folder (no trials yet, so 3)');
  await ctx.close();
}

async function liveSuite(b) {
  console.log('NOTE TIMING, REAL HEADSET AND OBSERVER PAGES');
  const { p: host } = await openHost(b);
  const H = (fn, arg) => host.evaluate(fn, arg);
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const o = await ctx.newPage();
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
      await sleep(10);
    }
  })();
  await H(() => { window.__home(false); window.__sm.runCommand('setParticipant', 'L1'); window.__sm.runCommand('start'); });
  await o.waitForFunction(() => document.getElementById('g7-head').textContent === 'Running' && !document.getElementById('g-note-spoke').closest('[hidden]'), null, { timeout: 6000 });
  await sleep(1500);
  const gaps = [];
  for (let i = 0; i < 5; i++) {
    await o.click('#g-note-spoke');
    await sleep(700);
    const last = await H(() => window.__dm.notes.at(-1));
    gaps.push(last.received - last.time);
  }
  console.log('   received minus stamped (ms):', gaps.join(', '));
  ok(gaps.every(g => Math.abs(g) < 400), 'note time matches the data clock to within 0.4 s, local mock link (' + gaps.join(', ') + ' ms)');
  const rowT = await H(() => window.__km.leftHandData.at(-1).split(',')[0]);
  ok(Math.abs(+rowT - await H(() => window.__dm.sessionTime())) < 200, 'same clock as the kinematics Timestamp column');
  await H(() => window.__sm.runCommand('endEarly'));
  running = false; await relay;
  await ctx.close();
}

(async () => {
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);
  await headsetSuite(b);
  await observerSuite(b);
  await liveSuite(b);
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

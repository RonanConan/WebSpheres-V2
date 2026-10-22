const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('GUIDE BROWSER');

const BASE = {
  type: 'state', version: '2.0.0', phase: 'setup', endReason: '', participantId: '', dominantHand: 'LEFT', condition: 1, mode: 'standard', totalTrials: 352, setupLocked: false,
  calib: { reach: { done: false, hand: '', distance: 0, radius: 0.45 }, height: { done: false, height: 1.2 }, lap: { done: false, home: { x: 0, y: 0.9, z: -0.4 } } },
  recentred: false, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: ''
};
const handAt = (x, y, z) => { const a = []; for (let i = 0; i < 25; i++) a.push(x + i * 0.002, y, z - i * 0.002); return a; };
const FRAME = { head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, left: handAt(-0.15, 0.9, -0.4), right: handAt(0.1, 0.9, -0.4), leftValid: true, rightValid: true, activeSphere: -1, radius: 0.45, height: 1.2, score: 0, condition: 1, dominantHand: 'LEFT', fireMode: false, isPaused: true, trialCount: 0, totalTrials: 352, homePos: { x: 0, y: 0.9, z: -0.4 } };
const TRIALS = ['1,1000,3,LEFT,4,normal,400,900,0,P21', '2,2000,5,RIGHT,8,critical,500,1100,0,P21', '3,3000,7,NA,0,SKIP,0,0,0,P21', '4,4000,2,LEFT,9,critical,300,700,1,P21', '5,5000,9,RIGHT,2,normal,600,1300,1,P21', '6,6000,4,LEFT,3,normal,200,800,1,P21'].map(l => l + '\n');
const kin = (t, v) => `${t},0.1,1,-0.3,0,0.9,-0.4,,,,${v},0,0,0,0,0,0,1,0,1.2,0,0,0,0,1,0\n`;
const KL = [1, 1, 0, 1].map((v, i) => kin(i * 11, v)), KR = [1, 1, 1, 1, 0].map((v, i) => kin(i * 11, v));
const TH = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID\n';
const KH = 'Timestamp,HandX\n';

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [], dialogs = [], dls = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => { dialogs.push(d.type()); d.dismiss(); });
  p.on('download', d => dls.push(d.suggestedFilename()));
  await serve(p);
  await p.clock.install();
  const E = (fn, arg) => p.evaluate(fn, arg);
  const tick = (ms) => p.clock.runFor(ms || 300);
  let S = JSON.parse(JSON.stringify(BASE));
  const setState = (over) => { S = Object.assign(JSON.parse(JSON.stringify(S)), over); return E((s) => window.__c.emit('data', JSON.stringify(s)), S); };
  const frame = (over) => E((f) => window.__c.emit('data', JSON.stringify(f)), Object.assign({}, FRAME, over || {}));
  const sent = () => E(() => window.__c.sent.map(x => JSON.parse(x)));
  const allCmds = async () => (await sent()).filter(m => m.type === 'cmd').map(m => m.value === undefined ? m.name : `${m.name}:${m.value}`);
  const cmds = async () => (await allCmds()).filter(c => !c.startsWith('cue'));
  const openStep = () => E(() => +(document.querySelector('#guide .step.open')?.dataset.step || 0));
  const isDone = (n) => E((k) => document.querySelector(`#guide .step[data-step="${k}"]`).classList.contains('done'), n);
  const text = (id) => E((i) => document.getElementById(i).textContent, id);
  const checks = (id) => E((i) => [...document.querySelectorAll('#' + i + ' li')].map(li => li.children[0].className.replace('ck ', '') + ':' + li.children[1].textContent), id);
  const click = (sel) => p.click(sel);
  const connect = async () => {
    await p.waitForFunction(() => window.__peers && window.__peers.length > 0);
    await E(() => {
      const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1);
      window.__c = c;
      window.__refuse = {};
      const send = c.send.bind(c);
      c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: !window.__refuse[m.name], reason: window.__refuse[m.name] || '' }))); };
      c.open = true; c.emit('open');
    });
  };

  await p.goto('https://test.local/observer.html');
  await tick(500);
  console.log('STEP 1 — CONNECT');
  ok(await E(() => document.getElementById('app').classList.contains('left-open') && document.getElementById('left-slot').offsetWidth === 380), 'guide panel open by default in the 380 px left slot');
  ok(await openStep() === 1 && (await checks('g1-checks'))[0].startsWith('warn:Looking for the headset'), 'before connecting: step 1 "Looking for the headset…"');
  await connect();
  await setState({ version: '1.9.0' }); await frame(); await tick();
  ok(await openStep() === 1 && (await checks('g1-checks'))[1] === 'bad:Observer version 2.0.0 ≠ headset version 1.9.0 — hard-refresh both pages.', 'version mismatch: red line in step 1, stays on step 1');
  await setState({ version: '2.0.0' }); await tick();
  ok(await openStep() === 2 && await isDone(1), 'connected and versions match → step 1 ✓, moves on to step 2 by itself');

  console.log('STEP 2 — PARTICIPANT');
  ok(await E(() => document.querySelector('[data-g="dom"][data-v="LEFT"]').classList.contains('on') && document.querySelector('[data-g="mode"][data-v="standard"]').classList.contains('on')), 'form prefilled from what the headset reports');
  await click('#g-id'); await p.keyboard.type('bad id'); await click('#g-confirm'); await tick();
  ok((await text('g2-msg')).startsWith('Participant ID must be') && (await cmds()).length === 0, 'invalid ID caught on the laptop, nothing sent');
  ok(!(await sent()).some(m => m.code), 'typing in the ID box relays no keys to the headset (incl. the space)');
  await p.fill('#g-id', 'Lefty'); await click('#g-confirm'); await tick();
  ok((await text('g2-msg')).includes('cannot contain "left" or "right"') && (await cmds()).length === 0, 'ID containing "left" caught on the laptop');
  await p.fill('#g-id', 'P21');
  await click('#g-id'); await p.keyboard.press('KeyR');
  ok(!(await sent()).some(m => m.code === 'KeyR') && await E(() => document.getElementById('recentre-note').textContent === '') && await E(() => document.getElementById('g-id').value === 'P21r'), 'R typed in the ID box goes into the box: no recentre, nothing relayed');
  await p.fill('#g-id', 'P21');
  await click('[data-g="dom"][data-v="RIGHT"]'); await click('[data-g="cond"][data-v="2"]'); await click('[data-g="mode"][data-v="fmode"]');
  await E(() => { window.__refuse = { setMode: 'Setup locked - unlock setup first' }; });
  await click('#g-confirm'); await tick();
  ok((await text('g2-msg')) === 'Headset refused: Setup locked - unlock setup first' && (await cmds()).join() === 'setDominant:RIGHT,setCondition:2,setMode:fmode', 'a refusal is shown and stops the sequence (ID not sent)');
  await E(() => { window.__refuse = {}; window.__c.sent.length = 0; });
  await click('#g-confirm'); await tick();
  ok((await cmds()).join() === 'setDominant:RIGHT,setCondition:2,setMode:fmode,setParticipant:P21' && (await text('g2-msg')) === 'Confirmed by the headset', `Confirm sends hand, condition, mode, then the ID; result shown (${(await cmds()).join()} / "${await text('g2-msg')}")`);
  ok(await openStep() === 2, 'stays on step 2 until the headset reports the values back');
  await setState({ participantId: 'P21', dominantHand: 'RIGHT', condition: 2, mode: 'fmode', totalTrials: 44 }); await tick();
  const c2 = await checks('g2-checks');
  ok(await isDone(2) && await openStep() === 3, 'headset reports the values → step 2 ✓, step 3 opens');
  ok(c2.join('|') === 'ok:Participant ID: P21|ok:Dominant hand: Right|ok:Condition: Boost-and-tax|ok:Mode: F-mode 44 (44 trials)', 'reported values listed with ✓');

  console.log('STEP 3 — POSITION');
  ok((await text('guide')).includes('“Please sit comfortably, face forward, and rest your hands on your lap.”'), 'read-aloud line shown');
  await E(() => { window.__c.sent.length = 0; });
  await click('#g-recentre'); await tick(100);
  ok((await sent()).some(m => m.code === 'KeyR') && (await text('recentre-note')) === 'Recentring in 1.5 s…', 'Recentre button uses the look-ahead recentre');
  await E(() => window.__c.emit('data', JSON.stringify({ type: 'recentre', ok: true, reason: '' })));
  await setState({ recentred: true }); await tick();
  ok(await isDone(3) && await openStep() === 4, 'recentre reported → step 3 ✓, step 4 opens');

  console.log('STEP 4 — CALIBRATE');
  ok((await allCmds()).includes('cue:reach'),'headset cue "reach" sent when the Reach sub-step is active');
  await E(() => { window.__c.sent.length = 0; });
  await click('[data-calib="reach"]'); await tick();
  ok((await cmds())[0] === 'calibrate:reach' && (await text('g4-msg')) === 'Reach calibrated', 'Calibrate reach → command, result shown');
  ok((await allCmds()).includes('cue:null'),'moves to Height: cue cleared (no cue for height)');
  await setState({ calib: Object.assign({}, S.calib, { reach: { done: true, hand: 'RIGHT', distance: 0.62, radius: 0.496 } }) }); await tick();
  ok((await checks('g4-reach'))[0] === 'ok:Right hand · distance 0.62 m · radius 0.50 m' && (await E(() => document.querySelector('[data-calib="reach"]').textContent)) === 'Redo', 'reach result: hand, distance, radius, with Redo');
  await E(() => { window.__c.sent.length = 0; });
  await click('[data-calib="height"]'); await tick();
  await setState({ calib: Object.assign({}, S.calib, { height: { done: true, height: 1.04 } }) }); await tick();
  ok((await allCmds()).join() === 'calibrate:height,cue:lap' && (await checks('g4-height'))[0] === 'ok:Height 1.04 m', 'height calibrated and shown; Lap active → cue "lap"');
  await click('[data-calib="lap"]'); await tick();
  await setState({ calib: Object.assign({}, S.calib, { lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 } } }) });
  await frame(); await tick();
  ok(await isDone(4) && await openStep() === 5, 'all three calibrated → step 4 ✓, step 5 opens');
  await E(() => { document.querySelector('[data-open="4"]').click(); });
  await frame(); await tick();
  ok((await checks('g4-lap')).join('|') === 'ok:Home box at x 0.00, y 0.90, z -0.40 m|ok:Both hands in the box (live)', 'lap: home box position and live "both hands in the box"');
  await frame({ left: handAt(-0.15, 1.2, -0.6) }); await tick();
  ok((await checks('g4-lap'))[1] === 'warn:Left hand outside the box (live)', 'live check updates when a hand leaves the box');
  ok(await openStep() === 4 && await E(() => !document.querySelector('[data-open="2"]').disabled), 'completed steps can be reopened during setup');
  await E(() => document.querySelector('[data-next="4"]').click()); await tick();

  console.log('STEP 5 — CHECK');
  ok(await openStep() === 5 && (await allCmds()).includes('cue:ready'), 'step 5: headset cue "ready"');
  await frame(); await tick();
  const req = await checks('g5-required');
  ok(req.length === 7 && req.every(r => r.startsWith('ok:')), 'all 7 required checks ✓ (' + req.map(r => r.split(':')[1]).join(', ') + ')');
  ok((await checks('g5-advisory')).every(r => r.startsWith('ok:')) && (await text('g-start')) === 'Start' && await E(() => !document.getElementById('g-start').disabled), 'advisory ✓ → "Start" enabled');
  await frame({ leftValid: false, left: null }); await tick();
  ok((await checks('g5-advisory'))[0] === 'warn:Both hands tracked' && (await text('g-start')) === 'Start anyway' && await E(() => document.getElementById('g-start').classList.contains('amber') && !document.getElementById('g-start').disabled), 'advisory amber → "Start anyway" still allowed');
  await setState({ version: '9.9.9' }); await tick();
  ok(await E(() => document.getElementById('g-start').disabled), 'version mismatch blocks Start');
  await setState({ version: '2.0.0', participantId: '' }); await tick();
  ok(await E(() => document.getElementById('g-start').disabled) && await openStep() === 2, 'required check failing (no ID) → Start disabled, guide goes back to that step');
  await setState({ participantId: 'P21' }); await frame(); await tick();
  await E(() => { window.__c.sent.length = 0; });
  await E(() => document.getElementById('g-start').click()); await tick();
  ok((await cmds()).join() === 'start', 'Start sends start');

  console.log('STEP 6 — RUNNING');
  await setState({ phase: 'running', setupLocked: true, trialCount: 5, sessionMs: 60000, backup: { trials: 6, kinL: 4, kinR: 5, final: false, exportTs: '' } });
  await E(([th, t, kh, kl, kr]) => { const c = window.__c; c.emit('data', JSON.stringify({ type: 'rows', file: 'trials', from: 0, header: th, lines: t })); c.emit('data', JSON.stringify({ type: 'rows', file: 'kinL', from: 0, header: kh, lines: kl })); c.emit('data', JSON.stringify({ type: 'rows', file: 'kinR', from: 0, header: kh, lines: kr })); }, [TH, TRIALS, KH, KL, KR]);
  await frame(); await tick(300);
  ok(await openStep() === 6 && await E(() => [1, 2, 3, 4, 5].every(n => document.querySelector(`[data-open="${n}"]`).disabled)), 'running → step 6; setup steps locked');
  ok((await text('g6-trial')) === 'Trial 5 / 44' && Math.abs(parseFloat(await E(() => document.getElementById('g6-bar').style.width)) - 100 * 5 / 44) < 0.01, 'trial n / N with progress bar');
  ok((await text('g6-elapsed')) === '1:00' && ['7:48', '7:49', '7:50'].includes(await text('g6-eta')), `elapsed and estimated remaining (mean trial time × trials left) (${await text('g6-elapsed')} / ${await text('g6-eta')})`);
  ok((await text('g6-left')) === '3 (60%)' && (await text('g6-right')) === '2 (40%)', 'live hand use from the backup (SKIP rows excluded)');
  await E(() => { window.__c.sent.length = 0; });
  await click('#g-pause'); await tick(100);
  ok((await cmds()).join() === 'pause', 'Pause sends pause');
  await setState({ phase: 'pausing' }); await tick();
  ok((await text('g-pause')) === 'Cancel pause' && (await text('g6-phase')) === 'Pausing after this trial…', 'pausing: shows it waits for the trial, button cancels');
  await setState({ phase: 'paused', pauses: 1 }); await tick();
  ok((await text('g-pause')) === 'Resume' && (await text('g6-phase')) === 'Paused', 'paused: Resume');
  await click('#g-pause'); await tick(100);
  ok((await cmds()).join() === 'pause,resume', 'Resume sends resume');
  await setState({ phase: 'running' }); await tick();
  await click('#g-skip'); await click('#g-save-headset'); await tick(100);
  ok((await cmds()).slice(-2).join() === 'skip,saveOnHeadset', 'Skip target and Save on headset buttons');
  await click('#g-end'); await tick(100);
  ok(await E(() => !document.getElementById('g-end-confirm').hidden) && !(await cmds()).includes('endEarly') && dialogs.length === 0, 'End session early asks first, in the page (no browser dialog)');
  await click('#g-end-no'); await tick(100);
  ok(await E(() => document.getElementById('g-end-confirm').hidden) && !(await cmds()).includes('endEarly'), 'Cancel: nothing sent');
  await click('#g-unlock'); await click('#g-unlock-yes'); await tick(100);
  ok((await cmds()).at(-1) === 'unlockSetup', 'Unlock setup (with confirmation) sends unlockSetup');
  ok(!(await allCmds()).slice((await allCmds()).indexOf('start')).some(c => c.startsWith('cue')), 'no cue commands once the session has started');

  console.log('ALERTS');
  const alert = () => E(() => document.getElementById('g-alert').hidden ? '' : document.getElementById('g-alert').textContent);
  await setState({ phase: 'running', trialCount: 6, backup: Object.assign({}, S.backup) });
  await frame(); await tick(50);
  for (let i = 0; i < 5; i++) { await frame({ leftValid: false, left: null }); await tick(500); }
  const before3 = await alert();
  await frame({ leftValid: false, left: null }); await tick(1000);
  ok(before3 === '' && (await alert()) === 'Left hand not tracked (3 s)', `nothing at 2.5 s, "Left hand not tracked (3 s)" at 3.5 s ("${await alert()}")`);
  await frame(); await tick(300);
  ok((await alert()) === '', 'alert clears when the hand is tracked again');
  for (let i = 0; i < 31; i++) { await frame(); await setState({}); await tick(1000); }
  ok((await alert()) === 'No new trial for 30 s', '"No new trial for 30 s"');
  await setState({ trialCount: 7 }); await frame(); await tick(300);
  ok((await alert()) === '', 'clears on the next trial');
  for (let i = 0; i < 11; i++) { await frame(); await setState({ trialCount: 7 + i, backup: Object.assign({}, S.backup, { kinL: 4 + i }) }); await tick(1000); }
  ok(/^Backup behind by 1[01] s$/.test(await alert()), `"Backup behind by N s" when more than 10 s behind ("${await alert()}")`);
  await E(([kh, n]) => window.__c.emit('data', JSON.stringify({ type: 'rows', file: 'kinL', from: 4, header: kh, lines: Array.from({ length: n }, (_, i) => `${100 + i},0.1,1,-0.3,0,0.9,-0.4,,,,1,0,0,0,0,0,0,1,0,1.2,0,0,0,0,1,0\n`) })), [KH, S.backup.kinL - 4]);
  await frame(); await setState({}); await tick(300);
  ok((await alert()) === '', 'clears once the backup catches up');
  await E(() => window.__c.close()); await tick(300);
  ok((await alert()) === 'Connection lost — the headset is still recording and saving', '"Connection lost — the headset is still recording and saving" while reconnecting');

  console.log('RELOAD MID-SESSION');
  await p.reload(); await tick(500);
  await connect();
  await setState({ phase: 'paused', trialCount: 12, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' } }); await frame(); await tick();
  ok(await openStep() === 6 && (await text('g6-trial')) === 'Trial 12 / 44' && (await text('g-pause')) === 'Resume', 'observer reload mid-session lands on step 6 with live progress');

  console.log('STEP 7 — FINISH');
  await E(([th, t, kh, kl, kr]) => { const c = window.__c; c.emit('data', JSON.stringify({ type: 'rows', file: 'trials', from: 0, header: th, lines: t })); c.emit('data', JSON.stringify({ type: 'rows', file: 'kinL', from: 0, header: kh, lines: kl })); c.emit('data', JSON.stringify({ type: 'rows', file: 'kinR', from: 0, header: kh, lines: kr })); }, [TH, TRIALS, KH, KL, KR]);
  await setState({ phase: 'complete', endReason: 'finished', trialCount: 6, recentreCount: 2, pauses: 1, sessionMs: 125000, backup: { trials: 6, kinL: 4, kinR: 5, final: true, exportTs: '2026-10-22T13-00-00' }, info: 'Key,Value\nParticipantID,P21\n' });
  await tick(500);
  ok(await openStep() === 7 && (await text('g7-title')) === 'Session complete', 'opens automatically on completion: "Session complete"');
  ok(dls.length === 4 && dls.every(n => n.startsWith('P21_') && n.includes('2026-10-22T13-00-00')), 'auto-saved the 4 files with the headset\'s names (' + dls.join(', ') + ')');
  const files = await checks('g7-files');
  ok(files[0].startsWith('ok:Saved to laptop: 4 files') && files[1] === 'ok:The headset also saved its own copy.' && (await text('guide')).includes('Chrome may ask once to allow this page to download multiple files'), 'file status, headset copy and the Chrome note');
  const sum = await E(() => { const s = [...document.querySelectorAll('#g7-summary span')].map(x => x.textContent); const o = {}; for (let i = 0; i < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const want = { 'Trials completed': '6 / 44', 'Left hand use': '3 (60%)', 'Right hand use': '2 (40%)', 'Critical hits, left': '1', 'Critical hits, right': '1', 'Decision time, mean': '400 ms', 'Decision time, median': '400 ms', 'Movement time, mean': '960 ms', 'Movement time, median': '900 ms', 'Skips': '1', 'Recentres': '2', 'Pauses': '1', 'Tracking valid, left': '75%', 'Tracking valid, right': '80%', 'Session duration': '2:05' };
  const bad = Object.entries(want).filter(([k, v]) => sum[k] !== v);
  ok(bad.length === 0, 'finish summary matches the hand-computed sample' + (bad.length ? ' — differs: ' + bad.map(([k, v]) => `${k} "${sum[k]}" ≠ "${v}"`).join('; ') : ''));
  await click('#g-save-again'); await tick(300);
  ok(dls.length === 8, 'Save again downloads the 4 files again');
  await setState({ endReason: 'ended-early' }); await tick();
  ok((await text('g7-title')) === 'Session ended early', '"Session ended early" title');
  await click('#g-new'); await tick(100);
  ok(await E(() => !document.getElementById('g-new-confirm').hidden && document.getElementById('g-new-confirm').textContent.includes('Reload the WebSpheres page on the headset')), 'New session tells the researcher to reload the headset page first');
  await Promise.all([p.waitForEvent('load'), click('#g-new-reload')]);
  ok(await E(() => document.getElementById('conn-state').textContent === 'Connecting'), 'Reload observer reloads the page');
  ok(dialogs.length === 0, 'no browser dialogs used anywhere');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

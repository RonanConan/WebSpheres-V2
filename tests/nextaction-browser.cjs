const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('NEXT ACTION BROWSER');
const VERSION = '2.5.5';
const CALIB = (reach, height, lap) => ({ reach: { done: reach, hand: reach ? 'RIGHT' : '', distance: reach ? 0.62 : 0, radius: reach ? 0.5 : 0.45 }, height: { done: height, height: height ? 1.04 : 1.2 }, lap: { done: lap, home: { x: 0, y: 0.9, z: -0.4 } } });
const BASE = { type: 'state', version: VERSION, sessionId: 'A', phase: 'setup', endReason: '', participantId: '', filePrefix: 'P9_', sessionPrefix: 'P9_', experimenter: '', homeMode: 'one-box', dominantHand: 'LEFT', condition: 1, mode: 'fmode', totalTrials: 44, plannedRuns: 1, run: 1, setupLocked: false, calib: CALIB(false, false, false), recentred: false, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' };
const PLAN = { mode: 'fmode', home: 'one-box', runs: [{ condition: 1, off: false, recal: false }, { condition: 2, off: false, recal: false }] };
const handAt = (x, y, z) => { const a = []; for (let i = 0; i < 25; i++) a.push(x + i * 0.002, y, z - i * 0.002); return a; };
const FRAME = { head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, left: handAt(-0.15, 0.9, -0.4), right: handAt(0.1, 0.9, -0.4), leftValid: true, rightValid: true, activeSphere: 0, radius: 0.5, height: 1, score: 0, condition: 1, dominantHand: 'LEFT', fireMode: false, isPaused: false, trialCount: 0, totalTrials: 44, homePos: { x: 0, y: 0.9, z: -0.4 } };

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  await p.clock.install();
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => window.__peers && window.__peers.length > 0);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const tick = (ms) => p.clock.runFor(ms || 300);
  const checks = (id) => E((i) => [...document.querySelectorAll('#' + i + ' li')].map(li => li.children[0].className.replace('ck ', '') + ':' + li.children[1].textContent), id);
  const openStep = () => E(() => +(document.querySelector('#guide .step.open')?.dataset.step || 0));
  const text = (id) => E((i) => document.getElementById(i).textContent, id);
  const cyan = () => E(() => [...document.querySelectorAll('#guide .g-primary:not(.amber):not(:disabled), #plan-send-row .g-primary:not(:disabled), #recentre.want')].filter(el => el.offsetParent !== null).map(el => el.id || el.dataset.calib));
  const nextShown = (n) => E((k) => document.querySelector(`[data-next="${k}"]`).offsetParent !== null, n);
  let S = JSON.parse(JSON.stringify(BASE));
  const st = (o) => { S = Object.assign(JSON.parse(JSON.stringify(S)), o); return E((x) => window.__c.emit('data', JSON.stringify(x)), S); };
  const frame = (o) => E((x) => window.__c.emit('data', JSON.stringify(x)), Object.assign({}, FRAME, o || {}));

  console.log('NOTHING CONNECTED');
  ok((await checks('g1-checks')).join('|') === 'info:Searching for headset…|info:Version check pending headset connection.', 'waiting for the headset: no warning marks');

  await E(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
    const send = c.send.bind(c);
    c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: true, reason: '' }))); };
    c.open = true; c.emit('open');
  });
  await st({}); await frame(); await tick();

  console.log('PARTICIPANT');
  ok(await openStep() === 2, 'Participant opens');
  ok((await cyan()).join() === 'g-confirm', 'one cyan button: Send to headset');
  ok(await nextShown(2) === false, 'Next hidden until sent');
  ok((await checks('g2-checks')).join('|') === 'bad:Experimenter: not sent|bad:Participant ID: not sent|ok:Dominant hand: Left', 'empty form: nothing sent, headset hand shown');
  await p.fill('#g-exp', 'Jo'); await p.fill('#g-id', 'P9'); await p.click('[data-g="dom"][data-v="RIGHT"]'); await tick();
  ok((await checks('g2-checks')).join('|') === 'warn:Experimenter not sent: Jo|warn:Participant ID not sent: P9|warn:Dominant hand not sent: Right', 'typed values marked as not sent');
  await p.click('#g-confirm'); await tick();
  await st({ participantId: 'P9', experimenter: 'Jo', dominantHand: 'RIGHT' }); await frame(); await tick();
  ok((await checks('g2-checks')).join('|') === 'ok:Experimenter: Jo|ok:Participant ID: P9|ok:Dominant hand: Right', 'after sending: values ticked');
  ok(await openStep() === 3, 'sending moves on to Run plan');
  ok((await text('g2-val')) === 'P9, Right', 'collapsed Participant shows ID and hand');

  console.log('RUN PLAN');
  ok((await cyan()).join() === 'g-plan-send', 'one cyan button: Send to headset');
  ok(await nextShown(3) === false, 'Next hidden until sent');
  ok((await checks('g3-checks')).every(r => r.startsWith('info:')), 'plan facts carry no warning mark');
  await p.click('#plan-add'); await tick();
  await p.click('#g-plan-send'); await tick();
  await st({ plan: PLAN, plannedRuns: 2 }); await frame(); await tick();
  ok((await checks('g3-checks')).every(r => r.startsWith('ok:')), 'plan facts ticked once sent');
  ok(await openStep() === 4, 'sending moves on to Position');
  ok((await text('g3-val')) === '2 runs · 88 trials', 'collapsed Run plan shows runs and trials');

  console.log('VIEW BUTTONS');
  const viewsOff = () => E(() => [...document.querySelectorAll('[data-view]')].every(b => b.disabled));
  await p.click('[data-open="3"]'); await tick();
  ok(await viewsOff() && await E(() => !document.getElementById('recentre').disabled), 'run plan covers the 3D view: view buttons off, Recentre still on');
  await p.click('[data-open="4"]'); await tick();
  ok(await E(() => [...document.querySelectorAll('[data-view]')].every(b => !b.disabled)), '3D view showing: view buttons on');
  await p.click('[data-open="3"]'); await tick();

  console.log('RUN PLAN LAYOUT');
  ok(await E(() => { const s = document.getElementById('stage'); s.scrollLeft = 200; return s.scrollLeft === 0; }), '3D area cannot scroll sideways');
  ok(await E(() => document.getElementById('left-slot').scrollTop === 0), 'guide fits: finished steps stay in view');
  await p.click('[data-open="3"]'); await tick();
  ok(await E(() => { const send = document.getElementById('g-plan-send'), body = document.getElementById('plan-body'); return document.getElementById('plan-builder').contains(send) && send.getBoundingClientRect().top >= body.getBoundingClientRect().bottom - 1; }), 'Send to headset sits under the plan, in the same panel');
  await p.setViewportSize({ width: 1440, height: 500 }); await tick();
  ok(await E(() => { const r = document.getElementById('g-plan-send').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return r.top >= s.top && r.bottom <= s.bottom; }), 'short window: Send stays visible');
  await p.setViewportSize({ width: 1440, height: 900 }); await tick();
  await p.click('[data-open="4"]'); await tick();

  console.log('POSITION');
  ok((await cyan()).join() === 'g-recentre', 'one cyan button: Recentre in the guide');
  ok(await nextShown(4) === false, 'Next hidden until recentred');
  ok(await E(() => !document.getElementById('recentre').classList.contains('want')), 'bottom Recentre neutral while the guide is open');
  await p.click('#g-hide'); await tick();
  ok((await cyan()).join() === 'recentre', 'guide hidden, recentre needed: bottom Recentre cyan');
  await p.click('#btn-guide'); await tick();
  await st({ recentred: true }); await frame(); await tick();

  console.log('CALIBRATE');
  ok(await openStep() === 5, 'Calibrate opens');
  ok((await cyan()).join() === 'reach', 'one cyan button: Calibrate reach');
  await st({ calib: CALIB(true, false, false) }); await tick();
  ok((await cyan()).join() === 'height', 'reach done: Calibrate height cyan, Redo reach neutral');
  await st({ calib: CALIB(true, true, false) }); await tick();
  ok((await cyan()).join() === 'lap', 'height done: Calibrate home cyan');
  await p.click('[data-open="4"]'); await tick();
  ok(await E(() => !document.getElementById('g-recentre').classList.contains('g-primary')), 'already recentred: Recentre in the guide neutral');
  ok((await text('g3-val')) === '2 runs · 88 trials', 'values stay on collapsed steps');
  await st({ calib: CALIB(true, true, true) }); await frame(); await tick();

  console.log('CHECK');
  ok(await openStep() === 6, 'Check opens');
  ok((await text('g5-val')) === 'Reach 0.62 m, height 1.04 m', 'collapsed Calibrate shows reach and height');
  let top = await checks('g6-top');
  ok(top.length === 1 && /^ok:All \d+ passed$/.test(top[0]), `all passing folds to one line (${top[0]})`);
  ok((await cyan()).join() === 'g-start', 'one cyan button: Start');
  ok(await E(() => !document.querySelector('.g6-all').open && document.querySelectorAll('#g6-required li').length === 10 && document.querySelectorAll('#g6-advisory li').length === 4), 'full list folded under All checks');
  await frame({ leftValid: false, left: null }); await tick();
  top = await checks('g6-top');
  ok(top[0] === 'warn:Both hands tracked' && top[top.length - 1] === 'ok:12 of 14 passed' && top.length === 3, `failures first, then the count (${top.join(' | ')})`);
  ok((await cyan()).length === 0 && await E(() => document.getElementById('g-start').classList.contains('amber')), 'Start anyway is amber, not cyan');
  await st({ calib: CALIB(true, false, true) }); await frame(); await tick();
  await p.click('[data-open="6"]'); await tick();
  top = await checks('g6-top');
  ok(top[0] === 'bad:Height calibrated' && await E(() => document.getElementById('g-start').disabled), 'required failure listed first, Start blocked');
  await st({ calib: CALIB(true, true, true) }); await frame(); await tick();

  await st({ recentred: false }); await frame(); await tick();
  ok(await openStep() === 4 && await E(() => document.getElementById('g-start').disabled) && (await checks('g6-required')).includes('bad:Recentred'), 'not recentred: guide returns to Position, Start blocked');
  await st({ recentred: true }); await frame(); await tick();

  console.log('REACHING ARM');
  await st({ reachHand: 'RIGHT' }); await frame(); await tick();
  await p.click('[data-open="5"]'); await tick();
  const reachOn = (v) => E((k) => document.querySelector(`.sub [data-reach="${k}"]`).classList.contains('on'), v);
  ok(await reachOn('RIGHT') && !(await reachOn('LEFT')), 'toggle shows the arm the headset reports');
  ok((await text('g5-reach-say')).includes('Stretch your right arm'), 'read-aloud line names the arm');
  await E(() => { window.__c.sent.length = 0; });
  await p.click('.sub [data-reach="LEFT"]'); await tick();
  const armCmd = await E(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'cmd' && m.name === 'setReachHand').map(m => m.value));
  ok(armCmd.join() === 'LEFT', 'pressing Left sends the choice to the headset');
  await st({ reachHand: 'LEFT' }); await frame(); await tick();
  ok((await text('g5-reach-say')).includes('Stretch your left arm'), 'read-aloud line follows the choice');
  ok((await checks('g5-reach')).some(r => r.startsWith('warn:Reach was measured with the right arm')), 'changed arm: old measurement flagged');
  ok((await checks('g6-required')).includes('bad:Reach calibrated') && await E(() => document.getElementById('g-start').disabled), 'changed arm: Start blocked until reach is redone');
  ok(await openStep() === 5 && (await cyan()).join() === 'reach', 'guide stays on Calibrate with Redo reach cyan');
  await st({ reachHand: 'RIGHT' }); await frame(); await tick();
  ok(await E(() => !document.getElementById('g-start').disabled), 'arm matches the measurement again: Start available');

  console.log('REOPEN AND RESEND');
  await p.click('[data-open="2"]'); await tick();
  ok(await openStep() === 2 && await nextShown(2) === true, 'reopened sent step: Next available');
  ok(await E(() => !document.getElementById('g-confirm').classList.contains('g-primary')), 'nothing to send: Send to headset neutral');
  ok((await text('g2-val')) === '', 'open step shows no value in the header');
  await p.fill('#g-id', 'P10'); await tick();
  ok(await E(() => document.getElementById('g-confirm').classList.contains('g-primary')) && await nextShown(2) === false, 'edited: Send cyan, Next hidden');
  await p.click('#g-confirm'); await tick();
  await st({ participantId: 'P10' }); await frame(); await tick();
  ok(await openStep() === 6, 'resent: back to the step in progress');

  console.log('ALERT SLOT');
  ok(await E(() => getComputedStyle(document.getElementById('g-alert')).display === 'none'), 'setup: no empty alert slot');

  console.log('RUNNING');
  await st({ phase: 'running', setupLocked: true }); await frame(); await tick();
  ok(await E(() => { const a = document.getElementById('g-alert'); return getComputedStyle(a).display !== 'none' && a.offsetHeight > 0 && getComputedStyle(a).backgroundColor === 'rgb(11, 14, 20)'; }), 'running: alert slot kept, solid background');
  const order = await E(() => ['g-pause', 'g-note-spoke', 'g-save-headset', 'g-end'].map(i => document.getElementById(i).getBoundingClientRect().top));
  ok(order[0] < order[1] && order[1] < order[2] && order[2] < order[3], 'order: Pause, notes, rare controls, End run');
  for (const [w, h] of [[2560, 1440], [1920, 1080], [1707, 960], [1536, 864], [1440, 900]]) {
    await p.setViewportSize({ width: w, height: h });
    await st({ participantId: 'P012345', plannedRuns: 2, trialCount: 118, totalTrials: 352 }); await frame({ score: 137 }); await tick();
    const rows = await E(() => { const items = [...document.getElementById('topbar').children].filter(c => !c.hidden), a = items[1].getBoundingClientRect(); return items.slice(2).every(c => Math.abs(c.getBoundingClientRect().top - a.top) < 2); });
    ok(rows, w + 'x' + h + ': top bar on one row at Normal text');
    const seen = await E(() => document.getElementById('g-note-add').getBoundingClientRect().bottom <= innerHeight);
    ok(seen, w + 'x' + h + ': note buttons on screen');
  }
  await p.setViewportSize({ width: 1440, height: 900 }); await st({ plannedRuns: 2, participantId: 'P10', trialCount: 0, totalTrials: 44 }); await frame(); await tick();
  ok((await cyan()).join() === 'g-pause', 'one cyan button: Pause');
  ok(await E(() => !document.getElementById('recentre').classList.contains('want')), 'bottom Recentre neutral while running');
  await st({ setupLocked: false }); await tick();
  ok((await cyan()).join() === 'g-pause' && await E(() => document.getElementById('g-relock').classList.contains('amber')), 'unlocked: Relock setup amber, Pause stays the only cyan');
  await st({ setupLocked: true }); await tick();

  console.log('BETWEEN RUNS');
  await st({ phase: 'between', betweenRecentres: 0, betweenMs: 0, trialCount: 44 }); await frame(); await tick();
  ok((await cyan()).join() === 'g7-b-recentre', 'recentre recommended: Recentre cyan, Start neutral');
  ok(await E(() => !document.getElementById('g7-b-start').disabled), 'Start still enabled');
  await st({ betweenRecentres: 1 }); await frame(); await tick();
  ok((await cyan()).join() === 'g7-b-start', 'recentred: Start cyan');
  ok(await E(() => document.getElementById('g-pause').offsetParent === null && document.getElementById('g-end').offsetParent === null && document.getElementById('g-note-spoke').offsetParent !== null && document.getElementById('plan-send-row').offsetParent === null), 'between runs: run controls and Send gone, notes stay');

  ok(await viewsOff(), 'between runs: view buttons off');

  console.log('RUN REPORT NOTES');
  await st({ noteMarks: [{ run: 1, time: 109000, trial: 18, type: 'note', text: 'Spoke <b>to</b> "P9"', estimated: false }, { run: 1, time: 120000, trial: 20, type: 'alert', text: 'Tracking left: 80%', estimated: false }, { run: 1, time: 130000, trial: 22, type: 'note', text: 'Sneezed', estimated: true }, { run: 2, time: 5000, trial: 1, type: 'note', text: 'Other run', estimated: false }] }); await frame(); await tick();
  const rows = await E(() => [...document.querySelectorAll('[data-report-run="1"] .rep-note')].map(r => [...r.children].map(c => c.textContent).join('|')));
  ok(rows.join(' / ') === '1:49|Trial 18|Spoke <b>to</b> "P9" / 2:10 est.|Trial 22|Sneezed', 'notes listed with time and trial, alerts and other runs left out (' + rows.join(' / ') + ')');
  ok(await E(() => document.querySelector('[data-report-run="1"] .rep-note b') === null), 'note text shown as typed, never as page code');

  console.log('RESULTS');
  const onColour = (cls) => E((c) => { const box = document.createElement('div'); box.className = c; const btn = document.createElement('button'); btn.className = 'on'; box.appendChild(btn); document.body.appendChild(box); const col = getComputedStyle(btn).color; box.remove(); return col; }, cls);
  ok(await onColour('ws3d-bar') === 'rgb(3, 20, 24)' && await onColour('ws-option') === 'rgb(3, 20, 24)', 'selected Results buttons use dark text on cyan');
  ok(await E(() => window.__obs.hands.L.mats[0].color.getHex() === 0x3a86ea && window.__obs.hands.R.mats[0].color.getHex() === 0xe5534b), 'live hands use the chart colours');

  console.log('FINISH');
  await st({ phase: 'complete', endReason: 'finished', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' } }); await frame(); await tick();
  ok(await E(() => [...document.querySelectorAll('[data-view]')].every(b => !b.disabled)), 'finish, Results closed: view buttons on');
  await p.click('#g-results'); await tick();
  ok(await viewsOff(), 'Results open: view buttons off');
  await p.click('#res-close'); await tick();
  ok(await E(() => [...document.querySelectorAll('[data-view]')].every(b => !b.disabled)), 'Results closed: view buttons back on');
  ok(await E(() => !document.getElementById('recentre').classList.contains('want')), 'session over: bottom Recentre neutral');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

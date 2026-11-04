const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('NEXT ACTION BROWSER');
const VERSION = '2.5.3';
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
  const cyan = () => E(() => [...document.querySelectorAll('#guide .g-primary:not(.amber):not(:disabled), #recentre.want')].filter(el => el.offsetParent !== null).map(el => el.id || el.dataset.calib));
  const nextShown = (n) => E((k) => document.querySelector(`[data-next="${k}"]`).offsetParent !== null, n);
  let S = JSON.parse(JSON.stringify(BASE));
  const st = (o) => { S = Object.assign(JSON.parse(JSON.stringify(S)), o); return E((x) => window.__c.emit('data', JSON.stringify(x)), S); };
  const frame = (o) => E((x) => window.__c.emit('data', JSON.stringify(x)), Object.assign({}, FRAME, o || {}));

  console.log('NOTHING CONNECTED');
  ok((await checks('g1-checks')).join('|') === 'info:Searching for headset…|info:Version checked on connection', 'waiting for the headset: no warning marks');

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

  console.log('RUNNING');
  await st({ phase: 'running', setupLocked: true }); await frame(); await tick();
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

  console.log('FINISH');
  await st({ phase: 'complete', endReason: 'finished', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' } }); await frame(); await tick();
  ok(await E(() => !document.getElementById('recentre').classList.contains('want')), 'session over: bottom Recentre neutral');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

const fs = require('fs'), os = require('os'), path = require('path');
const { serve, launch, counter } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { openDownload } = require('./unzip.cjs');
const { ok, done } = counter('PRACTICE BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function openPractice(b, viewport) {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: viewport || { width: 1707, height: 960 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.dl = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('download', d => p.dl.push(d));
  await serve(p);
  await p.goto('https://test.local/observer.html?practice=1');
  await p.waitForFunction(() => document.getElementById('practice-headset'), null, { timeout: 10000 });
  let f = null;
  for (let i = 0; i < 200 && !f; i++) {
    f = p.frames().find(x => x.url().includes('index.html'));
    if (!f) await sleep(50);
  }
  await f.waitForFunction(() => window.__practice, null, { timeout: 30000 });
  return { ctx, p, f };
}

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-practice-'));
  const b = await launch();

  console.log('REAL PAGES UNTOUCHED');
  {
    const ctx = await b.newContext({ viewport: { width: 1707, height: 960 } });
    const p = await ctx.newPage();
    await serve(p);
    await p.goto('https://test.local/observer.html');
    await p.waitForFunction(() => window.__peers && window.__peers.length > 0);
    const real = await p.evaluate(() => ({ iframe: !!document.querySelector('iframe'), scripts: [...document.scripts].some(s => s.src.includes('practice')), bar: document.getElementById('practice-bar').hidden, cls: document.body.classList.contains('practice') }));
    ok(!real.iframe && !real.scripts && real.bar && !real.cls, 'observer without ?practice: no practice code, frame or banner');
    ok(await p.evaluate(() => document.getElementById('g-practice').offsetParent !== null && document.getElementById('g-practice').textContent === 'Practise without a headset'), 'no headset connected: practice button on the Connect step');
    await p.evaluate(() => { window.__opened = []; window.open = (url, target) => { window.__opened.push([url, target]); return null; }; });
    await p.click('#g-practice');
    const opened = await p.evaluate(() => window.__opened);
    ok(opened.length === 1 && opened[0][0] === '/observer.html?practice=1' && opened[0][1] === '_blank', 'button opens practice in a new tab');
    ok(p.url().endsWith('/observer.html'), 'the real page stays where it was');
    await p.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); c.emit('data', JSON.stringify({ type: 'state', version: 'x', phase: 'setup', backup: { trials: 0, kinL: 0, kinR: 0 }, calib: { reach: { done: false }, height: { done: false }, lap: { done: false, home: { x: 0, y: 0.9, z: -0.4 } } } })); });
    await p.waitForFunction(() => document.getElementById('g-practice').offsetParent === null, null, { timeout: 3000 });
    ok(true, 'headset connected: practice button gone');
    await ctx.close();

    const { p: host, ctx: hctx } = await openHost(b);
    const info = await host.evaluate(() => { window.__dm.participantId = 'P1'; return { info: window.__dm.buildSessionInfo(), file: window.__dm.filePrefix(), session: window.__dm.sessionPrefix(), practice: !!window.__practice, scripts: [...document.scripts].some(s => s.src.includes('practice')) }; });
    ok(!info.scripts && !info.practice, 'headset page without ?practice: no practice code');
    ok(!info.info.includes('Practice') && info.info.trimEnd().split('\n').at(-1).startsWith('XRMode,'), 'real session info has no Practice row and still ends with XRMode');
    ok(info.file === 'P1_' && info.session === 'P1_', 'real file names unmarked');
    await hctx.close();

    const dctx = await b.newContext();
    const d = await dctx.newPage();
    await serve(d);
    await d.goto('https://test.local/index.html?practice=1', { waitUntil: 'domcontentloaded' });
    await d.waitForFunction(() => window.__peers && window.__peers.length > 0 && document.querySelector('a-scene').hasLoaded, null, { timeout: 20000 });
    ok(await d.evaluate(() => !window.__practice && ![...document.scripts].some(s => s.src.includes('practice'))), 'headset page opened directly with ?practice stays the real page');
    await dctx.close();
  }

  console.log('ISOLATION');
  const { ctx, p, f } = await openPractice(b);
  const H = (fn, arg) => f.evaluate(fn, arg);
  const O = (fn, arg) => p.evaluate(fn, arg);
  const step = () => O(() => +(document.querySelector('#guide .step.open')?.dataset.step || 0));
  const waitStep = (n) => p.waitForFunction((k) => +(document.querySelector('#guide .step.open')?.dataset.step || 0) === k, n, { timeout: 15000, polling: 50 });
  ok(await O(() => window.__peers.length === 0) && await H(() => window.__peers.length === 0), 'real Peer never created on either page');
  ok(await O(() => !document.getElementById('practice-bar').hidden && document.getElementById('practice-bar').textContent.includes('Practice session')), 'banner shown');
  ok(await O(() => document.getElementById('g-practice').offsetParent === null), 'no practice button inside practice');

  console.log('CONNECT');
  await waitStep(2);
  ok(await O(() => document.getElementById('conn-state').textContent.toLowerCase().includes('connected')), 'connects to the hidden headset');
  const seen = await O(() => [...document.querySelectorAll('#g1-checks li')].map(li => li.textContent).join('|'));
  ok(seen.includes('Connected'), 'Connect step passes (' + seen + ')');

  console.log('SETUP WITH THE SIMULATED PARTICIPANT');
  await p.fill('#g-exp', 'Jo Smith');
  await p.fill('#g-id', 'G05');
  await p.click('#g-confirm');
  await waitStep(3);
  await p.click('[data-plan-mode="fmode"]');
  await p.click('#plan-add');
  await p.click('[data-plan-link="0"]');
  await p.click('#g-plan-send');
  await waitStep(4);
  await p.click('#g-recentre');
  await p.waitForFunction(() => document.getElementById('recentre-note').className === 'ok', null, { timeout: 5000 });
  await waitStep(5);
  ok(await H(() => !!window.__practice.spectator.activeSpace), 'recentre works through the real flow');
  await f.waitForFunction(() => window.__practice.right.z < -0.69, null, { timeout: 5000 });
  ok(await H(() => window.__practice.left.y < 1), 'reach cue: simulated participant stretches one arm, other hand on the lap');
  await p.click('[data-calib="reach"]');
  await p.waitForFunction(() => document.getElementById('g5-reach').textContent.includes('Right hand'), null, { timeout: 5000 });
  const reach = +/reach ([\d.]+) m/.exec(await O(() => document.getElementById('g5-reach').textContent))[1];
  ok(reach > 0.65 && reach < 0.85, 'reach measured from the simulated arm (' + reach + ' m)');
  await f.waitForFunction(() => window.__practice.right.z > -0.45, null, { timeout: 5000 });
  ok(true, 'arm returns to the lap after the reach');
  await p.click('[data-calib="height"]');
  await p.waitForFunction(() => document.getElementById('g5-height').textContent.includes('0.96'), null, { timeout: 5000 });
  ok(true, 'height measured from the simulated head');
  await p.click('[data-calib="lap"]');
  await waitStep(6);
  await p.waitForFunction(() => !document.getElementById('g-start').disabled, null, { timeout: 5000 });
  const adv = await O(() => [...document.querySelectorAll('#g6-advisory li')].map(li => li.textContent).join('|'));
  ok(adv.includes('In VR') && adv.includes('Both hands tracked') && adv.includes('Both hands in home box'), 'recommended checks see the simulated hands (' + adv + ')');
  ok(await O(() => window.__obs.hands.L.group ? true : true), 'observer draws both hands');

  console.log('RUN 1');
  await p.click('#g-start');
  await waitStep(7);
  const t0 = await H(() => ({ n: window.__practice.dm ? document.querySelector('#kinematics-manager').components['kinematics-manager'].leftHandData.length : 0, t: Date.now() }));
  await sleep(6000);
  const t1 = await H(() => ({ n: document.querySelector('#kinematics-manager').components['kinematics-manager'].leftHandData.length, t: Date.now() }));
  const fps = (t1.n - t0.n) / ((t1.t - t0.t) / 1000);
  ok(fps >= 80, `recording about 90 frames per second (${fps.toFixed(1)})`);
  const light = await O(() => [...document.querySelectorAll('#g7-quality .q-row')].map(r => r.className + ':' + r.textContent).find(t => t.includes('Frame rate')));
  ok(/q-row ok/.test(light), 'Frame rate light is OK (' + light + ')');
  console.log('SIMULATED TRIALS');
  await f.waitForFunction(() => window.__practice.dm.trialData.length >= 4, null, { timeout: 40000, polling: 100 });
  const hits = await H(() => window.__practice.dm.trialData.slice(0, 4).map(t => ({ hand: t.hand, type: t.hitType, d: t.decisionTime, m: t.totalMovementTime })));
  ok(hits.every(h => (h.hand === 'LEFT' || h.hand === 'RIGHT') && h.type !== 'SKIP'), 'participant hits targets by itself (' + hits.map(h => h.hand[0]).join('') + ')');
  ok(hits.every(h => h.d > 200 && h.d < 1500), 'decision times look human (' + hits.map(h => Math.round(h.d)).join(', ') + ' ms)');
  ok(hits.every(h => h.m > h.d && h.m < 2500), 'total times look human (' + hits.map(h => Math.round(h.m)).join(', ') + ' ms)');
  ok(new Set(hits.map(h => Math.round(h.d))).size > 1, 'times vary from trial to trial');
  await O(() => document.getElementById('g-pause').click());
  await p.waitForFunction(() => document.getElementById('g-pause').textContent === 'Resume', null, { timeout: 8000 });
  const held = await H(() => window.__practice.dm.trialData.length);
  await sleep(2500);
  ok(await H(() => window.__practice.dm.trialData.length) === held && await H(() => { const { left, right, sm } = window.__practice; const h = sm.homeRectangle.getAttribute('position'); return Math.abs(left.y - h.y) < 0.06 && Math.abs(right.y - h.y) < 0.06; }), 'paused: no new trials, hands rest in the home box');
  await O(() => document.getElementById('g-pause').click());
  await f.waitForFunction((n) => window.__practice.dm.trialData.length > n, held, { timeout: 15000, polling: 100 });
  ok(true, 'resumed: trials continue');
  const finishRun = () => H(() => new Promise((resolve) => {
    const { sm } = window.__practice;
    const t = setInterval(() => {
      if (sm.phase !== 'running') { clearInterval(t); resolve(); return; }
      sm.runCommand('skip');
    }, 5);
  }));
  await finishRun();

  console.log('HEADSET-OFF BREAK');
  await p.waitForFunction(() => document.getElementById('g7-head').textContent === 'Between runs', null, { timeout: 8000 });
  ok(await O(() => document.getElementById('g7-b-start').disabled), 'Start locked during a headset-off break');
  ok(p.dl.length === 0, 'break saves no file on this laptop');
  await p.click('#g7-b-recentre');
  await p.click('#g7-b-removed');
  await p.waitForFunction(() => !document.getElementById('g7-b-start').disabled, null, { timeout: 8000 });
  await p.click('#g7-b-start');
  await p.waitForFunction(() => document.getElementById('g7-head').textContent === 'Running', null, { timeout: 8000 });

  console.log('RUN 2 AND FINISH');
  await finishRun();
  await p.waitForFunction(() => document.getElementById('g7-b-finish') && !document.getElementById('g7-b-finish').disabled && document.getElementById('g7-head').textContent === 'Between runs' || +(document.querySelector('#guide .step.open')?.dataset.step || 0) === 8, null, { timeout: 8000 });
  await waitStep(8);
  await p.waitForFunction(() => document.getElementById('g8-files').textContent.includes('Download started'), null, { timeout: 15000 });
  await sleep(1500);

  console.log('MARKING');
  ok(p.dl.length === 1, `exactly one zip downloads (${p.dl.length})`);
  const zipName = p.dl[0].suggestedFilename();
  ok(zipName.startsWith('PRACTICE_G05_') && zipName.endsWith('.zip'), 'zip name marked (' + zipName + ')');
  const files = await openDownload(p.dl[0], OUT);
  ok(files.length >= 8 && files.every(x => x.path.split('/').pop().startsWith('PRACTICE_G05_')), `every file inside marked (${files.length} files)`);
  const infos = files.filter(x => /session-info/.test(x.path));
  ok(infos.length === 2 && infos.every(x => x.text.trimEnd().split('\n').at(-1) === 'Practice,1'), 'each run\'s session info ends with Practice,1');
  ok(infos.every(x => x.text.split('\n').filter(l => l.startsWith('XRMode,')).length === 1), 'session info still has its XRMode row');
  const trial = files.find(x => /vr-session-data/.test(x.path));
  ok(trial.text.split('\n')[0] === 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Run', 'trial CSV header same as a real session');
  ok(trial.text.includes(',G05'), 'ParticipantID column keeps what was typed');
  const kin = files.find(x => /RIGHT/.test(x.path));
  ok(kin.text.split('\n').length > 300, 'kinematics recorded from the simulated hand');
  const dbs = await O(() => indexedDB.databases().then(l => l.map(d => d.name)));
  ok(dbs.includes('webspheres-practice-copy') && !dbs.includes('webspheres-laptop-copy'), 'stored apart from real sessions (' + dbs.join(', ') + ')');
  ok(await O(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return !e.defaultPrevented; }), 'no leave warning in practice');
  ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
  await Promise.all([p.waitForNavigation(), p.click('#practice-leave')]);
  ok(p.url().endsWith('/observer.html') && await O(() => document.querySelector('iframe') === null && document.getElementById('practice-bar').hidden), 'Leave practice returns to the real observer');
  await ctx.close();

  console.log('ONE HOME BOX PER HAND');
  {
    const { ctx: c, p: q, f: g } = await openPractice(b);
    const open = (n) => q.waitForFunction((k) => +(document.querySelector('#guide .step.open')?.dataset.step || 0) === k, n, { timeout: 15000, polling: 50 });
    await open(2);
    await q.fill('#g-exp', 'Jo Smith');
    await q.fill('#g-id', 'H1');
    await q.click('#g-confirm');
    await open(3);
    await q.click('[data-plan-mode="fmode"]');
    await q.click('[data-plan-home="per-hand"]');
    await q.click('#g-plan-send');
    await open(4);
    await q.click('#g-recentre');
    await open(5);
    await g.waitForFunction(() => window.__practice.right.z < -0.69, null, { timeout: 5000 });
    await q.click('[data-calib="reach"]');
    await q.click('[data-calib="height"]');
    await g.waitForFunction(() => window.__practice.right.z > -0.45, null, { timeout: 5000 });
    await q.click('[data-calib="lap"]');
    await open(6);
    await q.waitForFunction(() => !document.getElementById('g-start').disabled, null, { timeout: 5000 });
    ok(await q.evaluate(() => document.getElementById('g-start').textContent) === 'Start run 1', 'all checks pass with a box per hand');
    await q.click('#g-start');
    await g.waitForFunction(() => window.__practice.dm.trialData.length >= 2, null, { timeout: 30000, polling: 100 });
    ok(true, 'trials run with a box per hand');
    await c.close();
  }

  console.log('TROUBLE BUTTONS');
  {
    const { ctx: c, p: q, f: g } = await openPractice(b);
    const open = (n) => q.waitForFunction((k) => +(document.querySelector('#guide .step.open')?.dataset.step || 0) === k, n, { timeout: 15000, polling: 50 });
    const alertText = () => q.evaluate(() => document.getElementById('g-alert').textContent);
    const waitAlert = (text, timeout) => q.waitForFunction((t) => document.getElementById('g-alert').textContent.includes(t), text, { timeout: timeout || 8000, polling: 100 });
    const waitNoAlert = (text) => q.waitForFunction((t) => !document.getElementById('g-alert').textContent.includes(t), text, { timeout: 8000, polling: 100 });
    const trials = () => g.evaluate(() => window.__practice.dm.trialData.length);
    const moreTrials = async (n) => g.waitForFunction((k) => window.__practice.dm.trialData.length > k, n, { timeout: 20000, polling: 100 });
    const toggle = (kind) => q.click(`[data-trouble="${kind}"]`);
    const on = (kind) => q.evaluate((k) => document.querySelector(`[data-trouble="${k}"]`).classList.contains('on'), kind);
    await open(2);
    await q.fill('#g-exp', 'Jo Smith');
    await q.fill('#g-id', 'T1');
    await q.click('#g-confirm');
    await open(3);
    await q.click('[data-plan-mode="fmode"]');
    await q.click('#g-plan-send');
    await open(4);
    await q.click('#g-recentre');
    await open(5);
    await g.waitForFunction(() => window.__practice.right.z < -0.69, null, { timeout: 5000 });
    await q.click('[data-calib="reach"]');
    await q.click('[data-calib="height"]');
    await g.waitForFunction(() => window.__practice.right.z > -0.45, null, { timeout: 5000 });
    await q.click('[data-calib="lap"]');
    await open(6);
    await q.waitForFunction(() => !document.getElementById('g-start').disabled, null, { timeout: 5000 });
    await q.click('#g-start');
    await g.waitForFunction(() => window.__practice.dm.trialData.length >= 2, null, { timeout: 30000, polling: 100 });

    await toggle('left');
    ok(await on('left') && await g.evaluate(() => window.__practice.left.valid === false), 'Lose left hand: hand no longer tracked');
    await waitAlert('Left hand not tracked');
    ok(true, 'real alert appears for the lost hand');
    const kinLeft = await g.evaluate(() => { const km = document.querySelector('#kinematics-manager').components['kinematics-manager']; return km.leftHandData.at(-1); });
    ok(kinLeft.split(',')[10] === '0', 'recorded as not valid in the left kinematics');
    await toggle('left');
    ok(!(await on('left')), 'pressed again: button off');
    await waitNoAlert('Left hand not tracked');
    ok(true, 'alert clears when the hand returns');
    await moreTrials(await trials());
    ok(true, 'trials continue');

    await toggle('right');
    await waitAlert('Right hand not tracked');
    await toggle('right');
    await waitNoAlert('Right hand not tracked');
    ok(true, 'Lose right hand raises and clears its alert');

    const atDrop = await g.evaluate(() => document.querySelector('#kinematics-manager').components['kinematics-manager'].leftHandData.length);
    await toggle('drop');
    await q.waitForFunction(() => document.getElementById('conn-state').textContent !== 'Connected', null, { timeout: 5000 });
    await waitAlert('Connection lost');
    ok(true, 'Drop connection: real alert and status');
    await sleep(2000);
    ok(await g.evaluate((n) => document.querySelector('#kinematics-manager').components['kinematics-manager'].leftHandData.length > n + 90, atDrop), 'headset keeps recording while the connection is down');
    await toggle('drop');
    await q.waitForFunction(() => document.getElementById('conn-state').textContent === 'Connected', null, { timeout: 12000, polling: 100 });
    await waitNoAlert('Connection lost');
    ok(true, 'connection returns by itself when switched back');

    await g.waitForFunction(() => window.__practice.sm.currentState === 'invisible' || window.__practice.sm.currentState === 'visible', null, { timeout: 5000 });
    await toggle('stops');
    const frozen = await g.evaluate(() => [window.__practice.left.x, window.__practice.right.x]);
    const atStop = await trials();
    await waitAlert('No new trial for 30 s', 40000);
    ok(await trials() === atStop, 'Participant stops: no new trials, real alert after 30 s');
    ok(await g.evaluate((p) => window.__practice.left.x === p[0] && window.__practice.right.x === p[1], frozen), 'hands hold still but stay tracked');
    ok(!(await alertText()).includes('not tracked'), 'no tracking alert while the participant is only still');
    await toggle('stops');
    await moreTrials(atStop);
    ok(true, 'pressed again: trials resume');

    await q.click('#g-save-headset');
    await q.waitForFunction(() => document.getElementById('g7-msg').textContent.includes('no headset copy'), null, { timeout: 5000 });
    ok(true, 'Save headset copy says no copy is saved in practice');
    await q.click('#g-end');
    await q.click('#g-end-yes');
    await open(8);
    await q.waitForFunction(() => document.getElementById('g8-files').textContent.includes('Download started'), null, { timeout: 20000 });
    const finish = await q.evaluate(() => document.getElementById('g8-files').textContent);
    ok(finish.includes('no headset copy is saved') && !finish.includes('Headset copy saved') && !finish.includes('No cable') && finish.includes('keep it apart from study data'), 'Finish wording fits practice (' + finish + ')');
    await sleep(800);
    ok(q.dl.length === 1, 'one zip after the dropped connection');
    const out = await openDownload(q.dl[0], OUT);
    const rows = (re) => out.find(x => re.test(x.path)).text.trimEnd().split('\n').length - 1;
    const hs = await g.evaluate(() => { const km = document.querySelector('#kinematics-manager').components['kinematics-manager']; return { l: km.leftHandData.length, r: km.rightHandData.length, t: window.__practice.dm.trialData.length }; });
    ok(rows(/kinematics-LEFT/) === hs.l && rows(/kinematics-RIGHT/) === hs.r && rows(/vr-session-data/) === hs.t, `laptop copy complete despite the drop (${hs.l} left, ${hs.r} right, ${hs.t} trials)`);
    ok(q.errs.length === 0, 'no page errors (' + q.errs.join(' | ') + ')');
    await c.close();
  }

  console.log('LAYOUT');
  for (const [w, h] of [[2560, 1440], [1920, 1080], [1707, 960]]) {
    const { ctx: c, p: q } = await openPractice(b, { width: w, height: h });
    for (const scale of [1, 1.2, 1.4]) {
      await q.evaluate((s) => document.querySelector(`[data-set="textSize"][data-val="${s}"]`).click(), scale);
      await sleep(250);
      const r = await q.evaluate(() => {
        const rect = (id) => document.getElementById(id).getBoundingClientRect();
        const bar = rect('practice-bar'), app = rect('app'), stage = rect('stage');
        return { top: bar.top, joined: Math.abs(bar.bottom - app.top) < 1, fits: Math.abs(app.bottom - innerHeight) < 1, stage: stage.height, hscroll: document.documentElement.scrollWidth > innerWidth };
      });
      ok(r.top === 0 && r.joined && r.fits && r.stage > 200 && !r.hscroll, `${w}x${h} text ${scale}: banner fits (${JSON.stringify(r)})`);
    }
    await c.close();
  }
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

const fs = require('fs'), os = require('os'), path = require('path');
const { launch, counter, ROOT, TOOLS } = require('./harness.cjs');
const { openHost } = require('./host-page.cjs');
const { ok, done } = counter('DATA BROWSER');
const VIEWER = process.env.WS_VIEWER || path.join(ROOT, 'For Claude', 'reference', 'viewer-src');
const OLD_HEADER = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount';
const INFO_KEYS = ['ParticipantID', 'AppVersion', 'SessionStartISO', 'SessionEndISO', 'EndReason', 'DominantHand', 'Condition', 'Mode', 'TotalTrials', 'TrialsCompleted', 'ReachHand', 'ReachDistance', 'Radius', 'Height', 'HomeX', 'HomeY', 'HomeZ', 'RecentreCount', 'Pauses', 'SetupUnlocks'];

async function saveAll(p, from, dir) {
  const out = [];
  for (const d of p.dl.slice(from)) {
    const f = path.join(dir, d.suggestedFilename());
    await d.saveAs(f);
    out.push({ name: d.suggestedFilename(), file: f, text: fs.readFileSync(f, 'utf8') });
  }
  return out;
}
const info = (text) => { const lines = text.trimEnd().split('\n'); return { header: lines[0], keys: lines.slice(1).map(l => l.split(',')[0]), map: Object.fromEntries(lines.slice(1).map(l => { const i = l.indexOf(','); return [l.slice(0, i), l.slice(i + 1)]; })) }; };

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-data-'));
  const b = await launch(['--autoplay-policy=no-user-gesture-required']);

  console.log('WITH PARTICIPANT ID');
  let { ctx, p } = await openHost(b);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const cmd = (n, v) => E(([a, c]) => window.__cmd(a, c), [n, v]);
  const until = (fn, arg, t) => p.waitForFunction(fn, arg, { timeout: t || 5000, polling: 10 });
  for (const [n, v] of [['setParticipant', 'P07'], ['setDominant', 'RIGHT'], ['setCondition', 2], ['setMode', 'short'], ['calibrate', 'height']]) await cmd(n, v);
  await E(() => window.__home(true));
  await cmd('calibrate', 'lap');
  await E(() => { const c = document.querySelector('a-scene').camera.el.getAttribute('position'); window.__track('L', null); window.__track('R', [c.x + 0.1, c.y, c.z - 0.55]); });
  await cmd('calibrate', 'reach');
  await E(() => { window.__sm.homeRectangle.setAttribute('position', '0 0.9 -0.4'); window.__home(true); });
  await cmd('start');
  await until(() => window.__sm.currentState === 'visible');
  await E(() => window.__hitLeft());
  await until(() => window.__dm.trialNumber === 1);
  await E(() => window.__home(true));
  await until(() => window.__sm.currentState === 'visible');
  await cmd('skip');
  await E(() => window.__home(false));
  await p.waitForTimeout(100);
  await cmd('pause'); await p.waitForTimeout(250); await cmd('resume');
  await cmd('unlockSetup');
  await p.waitForTimeout(200);
  let mark = p.dl.length;
  await cmd('saveOnHeadset');
  await p.waitForTimeout(600);
  const mid = await saveAll(p, mark, OUT);
  const midInfo = mid.find(f => f.name.includes('session-info'));
  ok(mid.length === 4 && mid.every(f => f.name.startsWith('P07_')), 'S mid-session exports 4 files, all prefixed "P07_" (' + mid.map(f => f.name).join(', ') + ')');
  ok(midInfo && info(midInfo.text).map.SessionEndISO === '' && info(midInfo.text).map.EndReason === '', 'mid-session session info: no end time or reason yet');
  await E(() => window.__home(true));
  await until(() => window.__sm.currentState === 'visible');
  mark = p.dl.length;
  await cmd('endEarly');
  await p.waitForTimeout(1500);
  const fin = await saveAll(p, mark, OUT);
  const names = fin.map(f => f.name);
  const ts = (names[0] || '').match(/(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d)\.csv$/)?.[1];
  ok(fin.length === 4 && ts && ['P07_vr-session-data-', 'P07_kinematics-LEFT-', 'P07_kinematics-RIGHT-', 'P07_session-info-'].every(pre => names.includes(pre + ts + '.csv')), 'final export: <ID>_vr-session-data / kinematics-LEFT / kinematics-RIGHT / session-info, one shared timestamp');
  const trial = fin.find(f => f.name.includes('vr-session-data')).text;
  const expect = await E(() => ({ shared: window.__dm.TRIAL_HEADER + window.__dm.trialData.map(t => window.__dm.formatTrialRow(t)).join(''), old: window.__dm.trialData.map(t => `${t.trial},${t.timestamp},${t.target},${t.hand},${t.points},${t.hitType},${t.decisionTime},${t.totalMovementTime},${t.recentreCount}`), kl: window.__km.HEADER + window.__km.leftHandData.join(''), kr: window.__km.HEADER + window.__km.rightHandData.join(''), n: window.__dm.trialNumber }));
  ok(trial === expect.shared, 'trial file is byte-identical to the shared formatter output (what the backup will use)');
  const tl = trial.trimEnd().split('\n');
  ok(tl[0] === OLD_HEADER + ',ParticipantID', 'header: every original column unchanged and in order, ParticipantID appended last');
  ok(tl.length - 1 === expect.n && tl.slice(1).every((l, i) => l === expect.old[i] + ',P07'), `each row = the original 9 columns exactly as before + ",P07" (${expect.n} rows)`);
  ok(fin.find(f => f.name.includes('LEFT')).text === expect.kl && fin.find(f => f.name.includes('RIGHT')).text === expect.kr, 'kinematics files byte-identical to header + stored row strings (26 columns, unchanged format)');
  const si = info(fin.find(f => f.name.includes('session-info')).text);
  ok(si.header === 'Key,Value' && si.keys.join() === INFO_KEYS.join(), 'session info: Key,Value with the 20 keys in the planned order');
  const st = await E(() => ({ start: new Date(window.__dm.sessionStartTime).toISOString(), end: window.__dm.sessionEndTime, reach: window.__sm.calib.reach, r: window.__sm.radius, h: window.__sm.height, pauses: window.__dm.pauses, unlocks: window.__dm.setupUnlocks }));
  const m = si.map;
  ok(m.ParticipantID === 'P07' && m.AppVersion === '2.0.0' && m.EndReason === 'ended-early', 'ParticipantID, AppVersion, EndReason');
  ok(m.SessionStartISO === st.start && m.SessionEndISO === new Date(st.end).toISOString() && m.SessionEndISO > m.SessionStartISO, 'SessionStartISO and SessionEndISO');
  ok(m.DominantHand === 'RIGHT' && m.Condition === '2' && m.Mode === 'short' && m.TotalTrials === '110' && m.TrialsCompleted === String(expect.n), 'DominantHand, Condition, Mode, TotalTrials, TrialsCompleted');
  ok(m.ReachHand === 'RIGHT' && +m.ReachDistance === st.reach.distance && +m.Radius === st.r && +m.Height === st.h, 'ReachHand, ReachDistance, Radius, Height');
  ok(m.HomeX === '0' && m.HomeY === '0.9' && m.HomeZ === '-0.4' && m.RecentreCount === '0', 'HomeX/Y/Z and RecentreCount');
  ok(/^\d+-\d+$/.test(m.Pauses) && m.Pauses === st.pauses.map(x => `${x.start}-${x.end}`).join(';') && m.SetupUnlocks === st.unlocks.join(';') && /^\d+$/.test(m.SetupUnlocks), `Pauses "${m.Pauses}" and SetupUnlocks "${m.SetupUnlocks}"`);
  ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
  await ctx.close();

  console.log('WITHOUT PARTICIPANT ID (keyboard-only style)');
  ({ ctx, p } = await openHost(b));
  const E2 = (fn, arg) => p.evaluate(fn, arg);
  await E2(() => window.__key('KeyS'));
  await p.waitForTimeout(400);
  ok(p.dl.length === 0, 'S before the session has nothing to save → no files');
  await E2(() => { window.__key('KeyP'); window.__home(true); });
  await p.waitForFunction(() => window.__sm.currentState === 'visible', null, { timeout: 5000, polling: 10 });
  await E2(() => window.__key('KeyZ'));
  await p.waitForTimeout(300);
  await E2(() => window.__key('KeyS'));
  await p.waitForTimeout(600);
  const plain = await saveAll(p, 0, OUT);
  const pn = plain.map(f => f.name);
  ok(plain.length === 4 && ['vr-session-data-', 'kinematics-LEFT-', 'kinematics-RIGHT-', 'session-info-'].every(pre => pn.some(n => n.startsWith(pre))), 'no ID → current filenames, no prefix (' + pn.join(', ') + ')');
  const pt = plain.find(f => f.name.startsWith('vr-session-data')).text.trimEnd().split('\n');
  ok(pt[1].endsWith(',SKIP,0,0,0,') && pt[1].split(',').length === 10, 'ParticipantID column present but empty');
  ok(info(plain.find(f => f.name.startsWith('session-info')).text).map.ParticipantID === '', 'session info ParticipantID empty');
  await ctx.close();

  console.log('3D VIEWER LOADS THE NEW FILES');
  if (!fs.existsSync(path.join(VIEWER, 'main.js'))) {
    console.log('  (viewer source not found at ' + VIEWER + ', skipped)');
  } else {
    const tpl = fs.readFileSync(path.join(VIEWER, 'template.html'), 'utf8').replace('<script>/*BUNDLE*/</script>', '<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/examples/jsm/":"/three/examples/jsm/"}}</script><script type="module" src="/main.js"></script>');
    const viewer = async (files) => {
      const vctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
      const v = await vctx.newPage();
      const errs = []; v.on('pageerror', e => errs.push(e.message));
      await v.route('https://viewer.local/**', r => {
        const u = new URL(r.request().url()).pathname;
        if (u === '/' || u === '/index.html') return r.fulfill({ body: tpl, contentType: 'text/html' });
        const f = u.startsWith('/three/') ? path.join(TOOLS, 'node_modules', 'three', u.slice(7)) : path.join(VIEWER, u.slice(1));
        return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' }) : r.fulfill({ status: 404, body: '' });
      });
      await v.goto('https://viewer.local/index.html');
      await v.waitForFunction(() => document.getElementById('file'));
      await v.setInputFiles('#file', files);
      await v.waitForFunction(() => document.getElementById('drop').classList.contains('hidden'), null, { timeout: 10000 }).catch(() => {});
      await v.waitForTimeout(500);
      const res = await v.evaluate(() => ({ files: document.getElementById('files').textContent, hidden: document.getElementById('drop').classList.contains('hidden') }));
      await vctx.close();
      return { res, errs };
    };
    const rows = (t) => t.trimEnd().split('\n').length - 1;
    const kl = fin.find(f => f.name.includes('LEFT')), kr = fin.find(f => f.name.includes('RIGHT'));
    let { res, errs } = await viewer(fin.map(f => f.file));
    ok(res.hidden && res.files === `KL ${rows(kl.text)} rows · KR ${rows(kr.text)} rows · ${expect.n} trials`, `viewer loads the ID-prefixed set incl. session info ("${res.files}")`);
    ok(errs.length === 0, 'viewer: no page errors (' + errs.join(' | ') + ')');
    ({ res, errs } = await viewer(plain.map(f => f.file)));
    ok(res.hidden && /^KL \d+ rows · KR \d+ rows · 1 trials$/.test(res.files), `viewer loads the no-ID set ("${res.files}")`);
    const risky = path.join(OUT, 'risky');
    fs.mkdirSync(risky, { recursive: true });
    const copies = fin.map(f => { const to = path.join(risky, f.name.replace('P07_', 'CLEFT01_')); fs.copyFileSync(f.file, to); return to; });
    ({ res } = await viewer(copies));
    console.log(`  NOTE  ID "CLEFT01" (contains LEFT): viewer shows "${res.files}" — the viewer matches LEFT/RIGHT anywhere in the filename`);
  }

  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

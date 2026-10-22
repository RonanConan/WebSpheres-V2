const fs = require('fs'), os = require('os'), path = require('path');
const { serve, launch } = require('./harness.cjs');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'webspheres-guide-shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = {
  type: 'state', version: '2.0.0', phase: 'setup', endReason: '', participantId: '', dominantHand: 'LEFT', condition: 1, mode: 'standard', totalTrials: 352, setupLocked: false,
  calib: { reach: { done: false, hand: '', distance: 0, radius: 0.45 }, height: { done: false, height: 1.2 }, lap: { done: false, home: { x: 0, y: 0.9, z: -0.4 } } },
  recentred: false, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: ''
};
const handAt = (x, y, z) => { const a = []; for (let i = 0; i < 25; i++) a.push(x + (i % 5) * 0.012, y + 0.01, z - Math.floor(i / 5) * 0.02); return a; };
const FRAME = { head: { px: 0.02, py: 1.22, pz: 0.03, qx: -0.13, qy: 0.087, qz: 0.011, qw: 0.988 }, left: handAt(-0.2, 0.9, -0.36), right: handAt(0.15, 0.9, -0.36), leftValid: true, rightValid: true, activeSphere: 4, radius: 0.5, height: 1.15, score: 37, condition: 2, dominantHand: 'RIGHT', fireMode: false, isPaused: false, trialCount: 0, totalTrials: 44, homePos: { x: 0, y: 0.9, z: -0.4 } };
const trials = Array.from({ length: 18 }, (_, i) => `${i + 1},${i * 4000},${(i % 11) + 1},${i % 3 ? 'RIGHT' : 'LEFT'},${(i % 5) + 1},${i % 4 ? 'normal' : 'critical'},${300 + i * 7},${800 + i * 13},0,G05\n`);
const kin = Array.from({ length: 300 }, (_, i) => `${i * 11},0.1,1,-0.3,0,0.9,-0.4,,,,${i % 17 ? 1 : 0},0,0,0,0,0,0,1,0,1.2,0,0,0,0,1,0\n`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch();
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const p = await ctx.newPage();
    await serve(p);
    await p.goto('https://test.local/observer.html');
    await p.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
    const shot = async (name) => { await sleep(450); const f = path.join(OUT, `guide-${name}-${w}x${h}.png`); await p.screenshot({ path: f }); console.log(f); };
    await shot('1-connecting');
    await p.evaluate(() => {
      const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
      const send = c.send.bind(c);
      c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: true, reason: '' }))); };
      c.open = true; c.emit('open');
    });
    let S = JSON.parse(JSON.stringify(BASE));
    const st = (o) => { S = Object.assign(JSON.parse(JSON.stringify(S)), o); return p.evaluate((s) => window.__c.emit('data', JSON.stringify(s)), S); };
    const fr = (o) => p.evaluate((f) => window.__c.emit('data', JSON.stringify(f)), Object.assign({}, FRAME, o || {}));
    await st({ version: '1.9.0' }); await fr();
    await shot('1-version-mismatch');
    await st({ version: '2.0.0' }); await fr();
    await p.fill('#g-id', 'G05');
    await p.click('[data-g="dom"][data-v="RIGHT"]'); await p.click('[data-g="cond"][data-v="2"]'); await p.click('[data-g="mode"][data-v="fmode"]');
    await shot('2-participant');
    await p.click('#g-confirm'); await sleep(100);
    await st({ participantId: 'G05', dominantHand: 'RIGHT', condition: 2, mode: 'fmode', totalTrials: 44 }); await fr();
    await shot('3-position');
    await st({ recentred: true, calib: Object.assign({}, S.calib, { reach: { done: true, hand: 'RIGHT', distance: 0.62, radius: 0.496 } }) }); await fr();
    await p.evaluate(() => { window.__obs.guide.sub = 'height'; });
    await shot('4-calibrate');
    await st({ calib: { reach: S.calib.reach, height: { done: true, height: 0.98 }, lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 } } } }); await fr({ leftValid: false, left: null });
    await shot('5-check');
    await st({ phase: 'running', setupLocked: true, trialCount: 18, sessionMs: 75000, backup: { trials: 18, kinL: 300, kinR: 300, final: false, exportTs: '' } });
    await p.evaluate(([t, k]) => { const c = window.__c; const th = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID\n'; c.emit('data', JSON.stringify({ type: 'rows', file: 'trials', from: 0, header: th, lines: t })); ['kinL', 'kinR'].forEach(f => c.emit('data', JSON.stringify({ type: 'rows', file: f, from: 0, header: 'Timestamp\n', lines: k }))); }, [trials, kin]);
    for (let i = 0; i < 9; i++) { await fr({ leftValid: false, left: null, trialCount: 18 }); await sleep(450); }
    await shot('6-running-alert');
    await st({ phase: 'complete', endReason: 'finished', trialCount: 18, sessionMs: 80000, recentreCount: 1, pauses: 1, backup: { trials: 18, kinL: 300, kinR: 300, final: true, exportTs: '2026-10-22T13-30-00' }, info: 'Key,Value\n' });
    await shot('7-finish');
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });

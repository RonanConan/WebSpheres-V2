const fs = require('fs'), os = require('os'), path = require('path');
const { serve, launch, ROOT } = require('./harness.cjs');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'webspheres-shots');
const SIZES = [[1440, 900], [1280, 720]];

function hand(side, dz, dx) {
  const s = side === 'L' ? 1 : -1;
  const w = [-s * 0.2 + (dx || 0), 0.95, -0.32 + (dz || 0)];
  const local = [[0, 0, 0], [s * 0.025, -0.01, -0.02], [s * 0.045, -0.015, -0.045], [s * 0.06, -0.018, -0.07], [s * 0.07, -0.02, -0.09]];
  for (const [x, k] of [[0.022, 1], [0.003, 1], [-0.016, 0.95], [-0.032, 0.75]]) {
    const knuckleZ = -0.085 * (k < 0.8 ? 0.88 : 1);
    local.push([s * x * 0.5, 0, -0.01], [s * x, 0, knuckleZ]);
    let z = knuckleZ, y = 0;
    for (const len of [0.045, 0.027, 0.022]) { z -= len * k * 0.97; y -= 0.008; local.push([s * x * 1.05, y, z]); }
  }
  return local.flatMap(p => [p[0] + w[0], p[1] + w[1], p[2] + w[2]]);
}

const frameOf = (x) => Object.assign({
  head: { px: 0.02, py: 1.22, pz: 0.03, qx: -0.13, qy: 0.087, qz: 0.011, qw: 0.988 },
  left: hand('L'), right: hand('R'), leftValid: true, rightValid: true,
  activeSphere: 5, radius: 0.45, height: 1.2, score: 42, condition: 1, dominantHand: 'RIGHT',
  fireMode: false, isPaused: false, trialCount: 12, totalTrials: 352, homePos: { x: 0, y: 0.9, z: -0.4 }
}, x || {});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch();
  const trees = [['new', ROOT]];
  if (process.env.WS_BASELINE) trees.push(['old', process.env.WS_BASELINE]);
  for (const [label, root] of trees) {
    for (const [w, h] of SIZES) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await serve(p, { root });
      await p.goto('https://test.local/observer.html');
      await p.waitForFunction(() => window.__peers && window.__peers.length > 0, null, { timeout: 20000 });
      const send = (f) => p.evaluate((x) => window.__peers[0].conns.at(-1).emit('data', JSON.stringify(x)), f);
      const shot = async (name, wait) => { await p.waitForTimeout(wait || 500); const file = path.join(OUT, `${label}-${name}-${w}x${h}.png`); await p.screenshot({ path: file }); console.log(file); };
      await p.evaluate(() => { const P = window.__peers[0]; P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); });
      await send(frameOf());
      const pick = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
      const viewSel = await p.evaluate(() => document.querySelector('[data-view]') ? 'data-view' : 'data-mode');
      const modes = await p.evaluate((a) => [...document.querySelectorAll(`[${a}]`)].map(b => b.getAttribute(a)), viewSel);
      for (const mode of modes) {
        await pick(`[${viewSel}="${mode}"]`);
        await send(frameOf());
        await shot(mode);
      }
      const handModes = await p.evaluate(() => [...document.querySelectorAll('[data-hands], [data-set="hands"]')].map(b => b.dataset.hands || b.dataset.val));
      if (handModes.length) {
        await pick(`[${viewSel}="orbit"]`);
        for (const hm of handModes) {
          await pick(`[data-hands="${hm}"], [data-set="hands"][data-val="${hm}"]`);
          for (let i = 0; i <= 20; i++) { await send(frameOf({ left: hand('L', -i * 0.004, i * 0.006), right: hand('R', -i * 0.004, -i * 0.006) })); await p.waitForTimeout(30); }
          await shot('hands-' + hm, 40);
        }
        await pick('[data-hands="mesh"], [data-set="hands"][data-val="mesh"]');
        await send(frameOf({ left: null, leftValid: false, right: hand('R', -0.08) }));
        await shot('hands-untracked-left');
      }
      if (await p.evaluate(() => !!document.getElementById('btn-settings'))) {
        await send(frameOf({ fireMode: true }));
        await p.click('#recentre');
        await p.evaluate(() => window.__peers[0].conns.at(-1).emit('data', JSON.stringify({ type: 'recentre', ok: true, reason: '' })));
        await shot('ui-bars');
        for (const id of ['btn-settings', 'btn-readouts', 'btn-help']) {
          await p.click('#' + id);
          await shot('ui-' + id.slice(4));
          await p.keyboard.press('Escape');
        }
        await p.evaluate(() => window.__obs.setLeftSlot(true));
        await send(frameOf());
        await shot('ui-left-slot');
        await p.evaluate(() => document.querySelector('[data-set="textSize"][data-val="1.4"]').click());
        await send(frameOf());
        await shot('ui-left-slot-xl-text');
        await p.evaluate(() => { window.__obs.setLeftSlot(false); document.querySelector('[data-set="textSize"][data-val="1"]').click(); });
        await shot('ui-stale', 2600);
      }
      await p.close();
    }
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });

const { serve } = require('./harness.cjs');

async function openHost(b) {
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  p.errs = [];
  p.downloads = [];
  p.dl = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('download', d => { p.downloads.push(d.suggestedFilename()); p.dl.push(d); });
  await serve(p);
  await p.goto('https://test.local/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__peers && window.__peers.length > 0 && document.querySelector('a-scene').hasLoaded, null, { timeout: 20000 });
  await p.evaluate(() => {
    const P = window.__peers[0]; P.serverOpen();
    const c = P.incoming(); c.open = true; c.emit('open');
    window.__conn = c;
    window.__id = 0;
    window.__cmd = (name, value) => { const id = 'c' + (++window.__id); c.emit('data', JSON.stringify({ type: 'cmd', name, value, id })); const msgs = c.sent.map(s => JSON.parse(s)); const i = msgs.findIndex(m => m.type === 'cmdResult' && m.id === id); return { result: msgs[i], next: msgs[i + 1] }; };
    window.__state = () => c.sent.map(s => JSON.parse(s)).filter(m => m.type === 'state').at(-1);
    window.__key = (code, repeat) => document.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: !!repeat, bubbles: true }));
    const names = ['Wrist', 'T_Tip', 'T_Distal', 'T_Proximal', 'T_Metacarpal', 'I_Tip', 'I_Distal', 'I_Intermediate', 'I_Proximal', 'I_Metacarpal', 'M_Tip', 'M_Distal', 'M_Intermediate', 'M_Proximal', 'M_Metacarpal', 'R_Tip', 'R_Distal', 'R_Intermediate', 'R_Proximal', 'R_Metacarpal', 'L_Tip', 'L_Distal', 'L_Intermediate', 'L_Proximal', 'L_Metacarpal'];
    window.__hand = { L: { x: -0.1, y: 0.5, z: -0.4 }, R: { x: 0.1, y: 0.5, z: -0.4 } };
    const mk = (h) => Object.fromEntries(names.map(n => [n, { isValid: () => true, getPosition: v => v.set(h.x, h.y, h.z) }]));
    const sm = document.querySelector('#sphere-manager').components['sphere-manager'];
    sm.leftJoints = mk(window.__hand.L);
    sm.rightJoints = mk(window.__hand.R);
    window.__sm = sm;
    window.__dm = document.querySelector('#data-manager').components['data-manager'];
    window.__km = document.querySelector('#kinematics-manager').components['kinematics-manager'];
    window.__sc = document.querySelector('#score-display').components['score-manager'];
    window.__home = (on) => { const hp = sm.homeRectangle.getAttribute('position'); window.__hand.L.x = hp.x - 0.1; window.__hand.R.x = hp.x + 0.1; window.__hand.L.y = window.__hand.R.y = on ? hp.y : hp.y - 0.4; window.__hand.L.z = window.__hand.R.z = hp.z; };
    window.__track = (side, tip) => {
      const el = document.querySelector(`[hand-tracking-controls="hand: ${side === 'L' ? 'left' : 'right'}"]`);
      const htc = el.components['hand-tracking-controls'];
      if (!el.components['tracked-controls']) el.components['tracked-controls'] = {};
      if (tip) {
        htc.hasPoses = true;
        el.components['tracked-controls'].controller = { hand: {} };
        htc.indexTipPosition.set(tip[0], tip[1], tip[2]);
      } else {
        htc.hasPoses = false;
        el.components['tracked-controls'].controller = undefined;
      }
    };
    window.__hitLeft = () => { const sp = sm.activeSphere.getAttribute('position'); window.__hand.L.x = sp.x; window.__hand.L.y = sp.y; window.__hand.L.z = sp.z; };
  });
  return { ctx, p };
}

module.exports = { openHost };

const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('LAYOUT BROWSER');
const FRAME = { seq: 1, head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, left: null, right: null, leftValid: false, rightValid: false, activeSphere: 3, radius: 0.45, height: 1.2, score: 1234, condition: 2, dominantHand: 'RIGHT', fireMode: true, isPaused: false, trialCount: 352, totalTrials: 352, homePos: { x: 0, y: 0.9, z: -0.4 } };

(async () => {
  const b = await launch();
  console.log('LAYOUT (Chromium)');
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await serve(p);
    await p.goto('https://test.local/observer.html');
    await p.waitForFunction(() => window.__peers && window.__peers.length > 0);
    await p.evaluate((f) => { const P = window.__peers[0]; P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); c.emit('data', JSON.stringify(f)); c.emit('data', JSON.stringify({ type: 'recentre', ok: false, reason: 'Head not tracked' })); }, FRAME);
    for (const scale of [1, 1.2, 1.4]) {
      for (const slot of [false, true]) {
        for (const panel of [null, 'drawer-settings', 'drawer-readouts', 'help']) {
          await p.evaluate(([s, sl, pn]) => {
            document.querySelector(`[data-set="textSize"][data-val="${s}"]`).click();
            window.__obs.setLeftSlot(sl);
            document.querySelectorAll('.open').forEach(e => e.classList.remove('open'));
            if (pn) document.querySelector(`[data-panel="${pn}"]`).click();
          }, [scale, slot, panel]);
          await p.waitForTimeout(220);
          const r = await p.evaluate(() => {
            const rect = (el) => el.getBoundingClientRect();
            const bars = ['topbar', 'bottombar'].map(id => document.getElementById(id));
            const clipped = [];
            bars.forEach(bar => {
              const br = rect(bar);
              [...bar.children].forEach(ch => {
                if (ch.id === 'recentre-note' || ch.hidden) return;
                const cr = rect(ch);
                if (cr.right > br.right + 0.5 || cr.left < br.left - 0.5 || cr.bottom > br.bottom + 0.5) clipped.push(ch.id || ch.className || ch.textContent.trim().slice(0, 12));
              });
            });
            const kids = [...document.getElementById('bottombar').children].filter(c => c.id !== 'recentre-note');
            const overlaps = [];
            const hit = (a, b2) => a.left < b2.right - 0.5 && b2.left < a.right - 0.5 && a.top < b2.bottom - 0.5 && b2.top < a.bottom - 0.5;
            const all = kids.concat([document.getElementById('recentre-note')]);
            for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (hit(rect(all[i]), rect(all[j]))) overlaps.push(i + '/' + j);
            const tops = [...bars[0].children].filter(c => !c.hidden);
            for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) if (hit(rect(tops[i]), rect(tops[j]))) overlaps.push('top ' + tops[i].id + '/' + j);
            document.querySelectorAll('#topbar .value, #topbar .label, #bottombar button').forEach(el => { if (el.scrollWidth > el.clientWidth + 1) overlaps.push('overflow ' + (el.id || el.textContent.trim())); });
            const top = rect(bars[0]), stage = rect(document.getElementById('stage')), bottom = rect(bars[1]);
            const open = document.querySelector('.drawer.open, #help.open');
            const pr = open ? rect(open) : null;
            const note = document.getElementById('recentre-note');
            const btnH = Math.min(...[...document.querySelectorAll('#bottombar button')].map(x => rect(x).height));
            return {
              clipped, overlaps, btnH,
              stack: top.bottom <= stage.top + 0.5 && stage.bottom <= bottom.top + 0.5 && bottom.bottom <= innerHeight + 0.5 && stage.height > 200,
              hscroll: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
              panelInStage: !pr || (pr.top >= stage.top - 0.5 && pr.bottom <= stage.bottom + 0.5 && pr.right <= stage.right + 0.5 && pr.left >= stage.left - 0.5),
              noteVisible: rect(note).width > 40,
              fit: (() => { const s = document.getElementById('stage'), c = window.__obs.camera, a = s.clientWidth / s.clientHeight; return c.isPerspectiveCamera ? Math.abs(c.aspect - a) < 1e-6 : Math.abs((c.right - c.left) / (c.top - c.bottom) - a) < 1e-6; })()
            };
          });
          const tag = `${w}×${h} text ${scale} slot ${slot ? 'open' : 'closed'}${panel ? ' + ' + panel : ''}`;
          const good = !r.clipped.length && !r.overlaps.length && r.stack && !r.hscroll && r.panelInStage && r.btnH >= 44 && r.fit;
          ok(good, tag + (good ? '' : ' → ' + JSON.stringify(r)));
          if (!panel) ok(r.noteVisible || slot, tag + ': recentre status text has room');
        }
      }
    }
    ok(errs.length === 0, `${w}×${h}: no page errors (` + errs.join(' | ') + ')');
    await p.close();
  }
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

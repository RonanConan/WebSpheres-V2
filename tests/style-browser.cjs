const fs = require('fs'), path = require('path');
const { serve, launch, counter, ROOT } = require('./harness.cjs');
const { ok, done } = counter('STYLE BROWSER');

const FILES = ['next-400', 'next-600', 'next-700', 'mono-500', 'mono-700'].map(n => `atkinson-hyperlegible-${n}.woff2`);

async function openPage(b, block) {
  const ctx = await b.newContext({ viewport: { width: 1707, height: 960 } });
  const p = await ctx.newPage();
  const errs = [], fonts = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { if (r.resourceType() === 'font') fonts.push(r.url()); });
  await serve(p);
  if (block) await p.route('**/fonts/**', r => r.abort());
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  return { ctx, p, errs, fonts };
}

(async () => {
  const b = await launch();
  console.log('STYLE (font, colours, sentence case)');

  FILES.forEach(f => ok(fs.existsSync(path.join(ROOT, 'fonts', f)), `${f} is in the project`));
  ['OFL-Next.txt', 'OFL-Mono.txt'].forEach(f => ok(/SIL Open Font License/.test(fs.readFileSync(path.join(ROOT, 'fonts', f), 'utf8')), `${f} holds the font licence`));

  const { ctx, p, errs, fonts } = await openPage(b);
  const css = (sel, prop) => p.evaluate(([s, k]) => getComputedStyle(document.querySelector(s))[k], [sel, prop]);
  ok(fonts.length > 0 && fonts.every(u => u.startsWith('https://test.local/fonts/')), 'fonts load only from the project');
  const faces = await p.evaluate(async () => {
    const loaded = await Promise.all(['400 16px "Atkinson Hyperlegible Next"', '600 16px "Atkinson Hyperlegible Next"', '700 16px "Atkinson Hyperlegible Next"', '500 16px "Atkinson Hyperlegible Mono"', '700 16px "Atkinson Hyperlegible Mono"'].map(f => document.fonts.load(f, '0').then(r => r.length).catch(() => 0)));
    return loaded;
  });
  ok(faces.every(n => n > 0), `all five Atkinson faces load (${faces.join()})`);
  ok((await css('body', 'fontFamily')).startsWith('"Atkinson Hyperlegible Next"'), 'body text uses Atkinson Hyperlegible');
  ok((await css('#v-score', 'fontFamily')).startsWith('"WebSpheres Figures"'), 'readings use the figures face, falling back to Atkinson for words');
  ok((await css('#g-id', 'fontFamily')).startsWith('"Atkinson Hyperlegible Mono"'), 'participant ID field is fully monospace');
  ok((await css('#v-id', 'fontFamily')).startsWith('"Atkinson Hyperlegible Mono"'), 'participant ID in the top bar is fully monospace');
  ok((await css('#g-exp', 'fontFamily')).startsWith('"Atkinson Hyperlegible Next"'), 'experimenter name uses the text face');
  const figures = await p.evaluate(() => {
    const w = (t) => { const s = document.createElement('span'); s.style.cssText = 'position:absolute;visibility:hidden;font:700 40px var(--mono)'; s.textContent = t; document.body.append(s); const r = s.getBoundingClientRect().width; s.remove(); return r; };
    return { one: w('1'), eight: w('8'), i: w('i'), m: w('m') };
  });
  ok(Math.abs(figures.one - figures.eight) < 0.01, 'digits share one width, so readings line up');
  ok(figures.m - figures.i > 5, 'letters in readings keep natural widths');

  const upper = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).textTransform === 'uppercase').map(e => e.id || e.className));
  ok(upper.length === 0, `no spaced capitals are applied (${upper.join(', ') || 'none'})`);
  const spaced = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => parseFloat(getComputedStyle(e).letterSpacing) > 0).map(e => e.id || e.className));
  ok(spaced.length === 0, `no extra letter spacing is applied (${spaced.join(', ') || 'none'})`);

  ok(parseFloat(await css('#v-score', 'fontSize')) >= 26, 'top-bar readings stay at 26 px or larger');
  const fill = (cls) => p.evaluate((c) => { const b = document.createElement('button'); b.className = c; document.body.append(b); const v = getComputedStyle(b); const r = [v.backgroundColor, v.color]; b.remove(); return r; }, cls);
  const main = await fill('g-primary');
  ok(main[0] === 'rgb(38, 198, 220)' && main[1] === 'rgb(3, 20, 24)', 'main actions use the softer cyan with dark text');
  const amber = await fill('g-primary amber');
  ok(amber[0] === 'rgb(239, 168, 72)' && amber[1] === 'rgb(26, 16, 0)', 'warning actions use the softer amber with dark text');
  const vars = await p.evaluate(() => { const s = getComputedStyle(document.documentElement); return ['--accent', '--ok', '--warn', '--err', '--left', '--right'].map(k => s.getPropertyValue(k).trim()); });
  ok(vars.join() === '#00e5ff,#3ddc84,#ffb347,#ff5c5c,#3a86ea,#e5534b', 'text, outline and hand colours are unchanged');
  ok(errs.length === 0, `no page errors (${errs.join('; ') || 'none'})`);
  await ctx.close();

  const off = await openPage(b, true);
  ok((await off.p.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('system-ui'), 'system font is the fallback if the font files cannot load');
  ok(await off.p.evaluate(() => document.querySelector('.g-head h2').getBoundingClientRect().width > 0 && !!window.__obs), 'page still runs and shows text without the font files');
  ok(off.errs.length === 0, `no page errors without the font files (${off.errs.join('; ') || 'none'})`);
  await off.ctx.close();

  ['observer.html', 'results-charts.js'].forEach(f => ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('·'), `no middle dots in ${f}`));

  console.log('LAYOUT AND GUIDE');
  const lay = await openPage(b);
  const q = lay.p;
  await q.evaluate(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
    c.open = true; c.emit('open');
  });
  const STATE = { type: 'state', version: fs.readFileSync(path.join(ROOT, 'spectator-manager.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1], phase: 'setup', endReason: '', participantId: 'P1', filePrefix: 'P1_', experimenter: 'Jo', homeMode: 'one-box', dominantHand: 'RIGHT', condition: 1, mode: 'fmode', totalTrials: 44, setupLocked: false, calib: { reach: { done: false, hand: '', distance: 0, radius: 0.45 }, height: { done: false, height: 1.2 }, lap: { done: false, home: { x: 0, y: 0.9, z: -0.4 } } }, recentred: false, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' };
  const send = (o) => q.evaluate((s) => window.__c.emit('data', JSON.stringify(s)), Object.assign({}, STATE, o));
  await send({}); await q.waitForTimeout(200);
  const box = (sel) => q.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
  const near = (a, c, tol) => Math.abs(a - c) <= (tol === undefined ? 1 : tol);

  ok(near((await box('#left-slot')).w, 486), 'guide panel is 486 px wide');
  const stage = await box('#stage');
  ok((await q.evaluate(() => getComputedStyle(document.getElementById('stage')).borderTopLeftRadius)) === '13.5px', '3D view has rounded corners');
  ok(near((await box('#conn')).l, stage.l), 'top bar starts at the edge of the 3D view');
  ok(near((await box('#bottombar > :first-child')).l, stage.l), 'bottom bar starts at the edge of the 3D view');
  ok(near((await box('#btn-help')).r, stage.r), 'bottom bar ends at the edge of the 3D view');

  const mark = await q.evaluate(() => { const c = getComputedStyle(document.querySelector('.step .step-mark')); return { radius: c.borderRadius, image: c.backgroundImage, w: parseFloat(c.width), h: parseFloat(c.height) }; });
  ok(mark.radius === '50%' && mark.image === 'none' && near(mark.w, mark.h, 0.01), 'step numbers are plain circles');
  const rail = await q.evaluate(() => { const c = getComputedStyle(document.querySelector('.step[data-step="4"]'), '::before'); return { d: c.display, w: c.width, content: c.content }; });
  ok(rail.d === 'block' && rail.w === '2px', 'a line connects the steps during setup');
  const railX = await q.evaluate(() => { const step = document.querySelector('.step[data-step="4"]'); const c = getComputedStyle(step, '::before'); const m = step.querySelector('.step-mark').getBoundingClientRect(); return { line: step.getBoundingClientRect().left + parseFloat(c.left), mid: m.left + m.width / 2 }; });
  ok(near(railX.line, railX.mid, 1), 'the line runs through the centre of the circles');
  const first = await q.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.step[data-step="1"]'), '::before').top));
  const last = await q.evaluate(() => { const c = getComputedStyle(document.querySelector('.step[data-step="8"]'), '::before'); return parseFloat(c.height); });
  ok(first > 0 && near(last, 27, 1), 'the line stops at the first and last circles');

  await send({ phase: 'running', setupLocked: true, trialCount: 5, sessionMs: 30000 }); await q.waitForTimeout(250);
  ok(await q.evaluate(() => getComputedStyle(document.querySelector('.step[data-step="7"]'), '::before').display === 'none'), 'no loose line when only one step is showing');

  const pauseBefore = (await box('#g-pause')).t;
  await q.evaluate(() => { document.getElementById('g-alert').classList.add('on'); document.getElementById('g-alert-text').textContent = 'Left hand not tracked (5 s)'; });
  ok(near((await box('#g-pause')).t, pauseBefore, 0), 'buttons stay still when an alert appears');
  const centred = await q.evaluate(() => { const a = document.getElementById('g-alert').getBoundingClientRect(), t = document.getElementById('g-alert-text').getBoundingClientRect(); return [t.top - a.top, a.bottom - t.bottom]; });
  ok(near(centred[0], centred[1], 1), `one-line alert text is centred (${centred.map(Math.round).join('/')})`);
  const heightOne = (await box('#g-alert')).h;
  await q.evaluate(() => { document.getElementById('g-alert-text').textContent = 'Connection lost and more text. '.repeat(8); });
  const clamp = await q.evaluate(() => { const t = document.getElementById('g-alert-text'), a = document.getElementById('g-alert').getBoundingClientRect(), r = t.getBoundingClientRect(); return { lines: Math.round(r.height / parseFloat(getComputedStyle(t).lineHeight)), cut: t.scrollHeight > t.clientHeight, inside: r.top >= a.top && r.bottom <= a.bottom }; });
  ok(clamp.lines === 2 && clamp.cut && clamp.inside, 'long alerts cut off cleanly after two lines');
  ok(near((await box('#g-alert')).h, heightOne, 0), 'alert band keeps its height');
  await q.evaluate(() => { document.getElementById('g-alert').classList.remove('on'); document.getElementById('g-alert-text').textContent = ''; });

  const gap = async (a, c) => (await box(c)).t - (await box(a)).b;
  const lineA = await box('#g7-notes'), lineB = await box('#g7-run-more');
  ok(near(lineA.t - (await box('#g-pause')).b, 18, 1), 'even space above the first divider');
  ok(near((await box('#g-note-spoke')).t - lineA.t, 18, 2), 'even space below the first divider');
  ok(near(lineB.t - (await box('#g-note-spoke')).b, 18, 1), 'even space above the second divider');
  ok(near((await box('#g-save-headset')).t - lineB.t, 18, 2), 'even space below the second divider');
  ok(near(await gap('#g-save-headset', '#g-end'), 9, 1), '9 px between rows of buttons');
  ok(near((await box('#g-hide')).r, (await box('#g7-bar')).l + (await q.evaluate(() => document.querySelector('.bar').getBoundingClientRect().width)), 1), 'Hide guide lines up with the guide content');
  ok(near((await box('.g-head h2')).l, (await box('.step:not([hidden]) .step-mark')).l, 1), 'guide title lines up with the step circle');
  console.log('BUTTONS');
  const edges = async (...ids) => Promise.all(ids.map(i => box('#' + i)));
  const [pause, spoke, note, save, unlock, end, skip] = await edges('g-pause', 'g-note-spoke', 'g-note-add', 'g-save-headset', 'g-unlock', 'g-end', 'g-skip');
  ok([spoke, save, end].every(x => near(x.l, pause.l, 0.5) && near(x.r, spoke.r, 0.5)), 'left column buttons share both edges');
  ok([note, unlock, skip].every(x => near(x.l, note.l, 0.5) && near(x.r, pause.r, 0.5)), 'right column buttons share both edges, including Skip target');
  ok(near(spoke.w, note.w, 0.5), 'the two columns are the same width');
  ok(near(note.l - spoke.r, 9, 1), '9 px between columns, matching the rows');
  const css2 = (sel, prop) => q.evaluate(([s, k]) => getComputedStyle(document.querySelector(s))[k], [sel, prop]);
  ok((await css2('#g-end', 'borderTopLeftRadius')) === '9px' && (await css2('#g-pause', 'borderTopRightRadius')) === '9px', 'single buttons have rounded corners');
  const groupFirst = await q.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-view="orbit"]')); return [c.borderTopLeftRadius, c.borderTopRightRadius]; });
  const groupMid = await q.evaluate(() => getComputedStyle(document.querySelector('[data-view="top"]')).borderTopLeftRadius);
  const groupLast = await q.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-view="pov"]')); return [c.borderTopLeftRadius, c.borderTopRightRadius]; });
  ok(groupFirst.join() === '9px,0px' && groupMid === '0px' && groupLast.join() === '0px,9px', 'joined buttons are rounded only at their outer ends');
  ok((await css2('#g-end', 'fontSize')) === '18px', 'normal buttons use 18 px text');
  ok((await css2('#recentre', 'fontSize')) === '18.9px', 'Recentre in the bottom bar uses 19 px text');
  ok((await css2('#g-recentre', 'fontSize')) === '19.8px', 'main actions use 20 px text');
  ok((await css2('#g-pause', 'fontSize')) === '21.6px', 'large actions use 22 px text');
  ok((await css2('.step-mark', 'borderRadius')) === '50%' && (await css2('button.info', 'borderRadius')) === '50%', 'step circles and info icons stay round');
  const fit = await q.evaluate(() => {
    const cv = document.createElement('canvas').getContext('2d');
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const body = 486 - 4 * root - 1.25 * root;
    const out = [];
    document.querySelectorAll('#guide .step-body .g-actions').forEach(row => {
      const kids = [...row.children].filter(k => k.tagName === 'BUTTON');
      kids.forEach(k => {
        const c = getComputedStyle(k);
        cv.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
        const room = (kids.length === 1 ? body : (body - 0.5 * root) / 2) - 2 * parseFloat(c.paddingLeft) - 2;
        out.push({ label: k.textContent.trim(), over: cv.measureText(k.textContent.trim()).width - room });
      });
    });
    return out.filter(x => x.over > 0);
  });
  ok(fit.length === 0, `every guide button label fits on one line (${fit.map(x => x.label).join(', ') || 'all fit'})`);
  const optionFit = await q.evaluate(() => {
    const cv = document.createElement('canvas').getContext('2d');
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const body = 486 - 4 * root - 1.25 * root - 2 * 0.8 * root - 2;
    const out = [];
    document.querySelectorAll('#guide .step-body .opts').forEach(row => {
      const kids = [...row.children].filter(k => k.tagName === 'BUTTON');
      kids.forEach(k => {
        const c = getComputedStyle(k);
        cv.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
        const room = body / kids.length - 2 * parseFloat(c.paddingLeft) - 2;
        const width = cv.measureText(k.textContent.trim()).width;
        if (width > room) out.push(`${k.textContent.trim()} (${Math.round(width)} of ${Math.round(room)})`);
      });
    });
    return out;
  });
  ok(optionFit.length === 0, `every guide option label fits in its column (${optionFit.join(', ') || 'all fit'})`);
  await send({ phase: 'running', setupLocked: false, trialCount: 5, sessionMs: 30000 }); await q.waitForTimeout(250);
  const redo = await q.evaluate(() => { const rows = [...document.querySelectorAll('#g-unlocked .opts')].filter(o => o.children.length === 3); const r = [...rows[0].children].map(b => b.getBoundingClientRect()); const box = rows[0].getBoundingClientRect(); return { width: box.width, tops: r.map(x => x.top), left: r[0].left - box.left, right: box.right - r[2].right }; });
  ok(redo.width > 0 && new Set(redo.tops).size === 1 && near(redo.left, 0, 0.5) && near(redo.right, 0, 0.5), 'the three Redo buttons stay on one row and fill it');
  const dom = await q.evaluate(() => { const o = document.querySelector('#g-unlocked .opts'); const a = o.children[0].getBoundingClientRect(), z = o.children[1].getBoundingClientRect(); return { a: a.width, gap: Math.abs(a.width - z.width) }; });
  ok(dom.a > 0 && dom.gap <= 1, 'option buttons in the guide are equal widths');
  ok(near((await box('#g-save-headset')).r, pause.r, 0.5) && await q.evaluate(() => document.getElementById('g-unlock').hidden), 'Save headset copy fills the row when Unlock setup is hidden');
  await send({ phase: 'running', setupLocked: true, trialCount: 5, sessionMs: 30000 }); await q.waitForTimeout(250);
  console.log('WINDOW AND TEXT SIZES');
  for (const [w, h] of [[2560, 1440], [1920, 1080], [1707, 960], [1440, 900]]) {
    for (const scale of [1, 1.2, 1.4]) {
      await q.setViewportSize({ width: w, height: h });
      await q.evaluate((s) => document.documentElement.style.setProperty('--scale', String(s)), scale);
      await q.waitForTimeout(150);
      const m = await q.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        const rows = [['g-note-spoke', 'g-save-headset', 'g-end'], ['g-note-add', 'g-unlock', 'g-skip']];
        const aligned = rows.every(ids => ids.every(i => Math.abs(r(i).left - r(ids[0]).left) < 1 && Math.abs(r(i).right - r(ids[0]).right) < 1));
        const cut = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.classList.contains('info') && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1)).map(b => b.id || b.textContent.trim());
        return { aligned, cut, wide: document.documentElement.scrollWidth <= innerWidth };
      });
      ok(m.aligned && m.cut.length === 0 && m.wide, `${w}×${h} text ${scale}: columns line up, no cut-off buttons, no sideways scroll${m.cut.length ? ' (' + m.cut.join(', ') + ')' : ''}`);
    }
  }
  await q.evaluate(() => document.documentElement.style.setProperty('--scale', '1'));
  ok(lay.errs.length === 0, `no page errors (${lay.errs.join('; ') || 'none'})`);
  await lay.ctx.close();

  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

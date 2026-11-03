const fs = require('fs'), os = require('os'), path = require('path');
const { launch, serve, counter } = require('./harness.cjs');
const { openDownload, readZip } = require('./unzip.cjs');
const { ok, done } = counter('CHARTS BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-charts-'));
const VERSION = '2.5.1';
const kin = (t, x, z, o) => {
  const a = Object.assign({ target: true, valid: 1, rec: 0, hx: 0, hz: -0.4, y: 1 }, o);
  return `${t},${x},${a.y},${z},${a.hx},0.9,${a.hz},${a.target ? '0.1,1.2,-0.5' : ',,'},${a.valid},0,0,0,0,0,0,1,0,1.2,0,0,0,0,1,${a.rec}\n`;
};
const trial = (n, t, target, hand, hit, dt, mt) => `${n},${t},${target},${hand},2,${hit || 'normal'},${dt === undefined ? 300 : dt},${mt === undefined ? 800 : mt},0,P1,1\n`;

async function numbersSuite(b) {
  console.log('NUMBERS, CHECKED BY HAND');
  const p = await (await b.newContext()).newPage();
  await serve(p);
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => typeof ResultsCharts !== 'undefined');
  const result = await p.evaluate(({ kinL, kinR, trials }) => {
    const C = ResultsCharts;
    const run = C.parseRun({ run: 1, label: 'Run 1', kinL, kinR, trials, quality: { lines: [] } });
    const hu = C.handUseSets(run, 'RIGHT');
    return {
      frames: C.framesOf(run, 'L').count, first: [...C.framesOf(run, 'L').pts.subarray(0, 3)].map(v => Math.round(v * 10) / 10),
      breaks: [...C.framesOf(run, 'L').breaks], mark: C.marks(run).targets[0], titles: C.IDS.map(C.titleOf),
      sets: C.trialSets(run).map(s => [s.first, s.last]),
      setCount: C.workspaceSets(run, C.SHAPE_DEFAULT).length,
      handUse: hu.map(s => [s.value, s.n]),
      choice: C.handChoice(run).slice(0, 3),
      times: C.timesByTarget(run).slice(0, 2),
      recentres: run.recentres,
      targets: run.targets.length,
      timesTitle: C.titleOf('times'),
      median: [C.median([100, 300]), C.median([1, 5, 9]), C.median([])]
    };
  }, {
    kinL: [kin(1000, 0.001, -0.3), kin(1500, 0.021, -0.3), kin(2500, 0.041, -0.3), kin(2600, 0.5, -0.3, { valid: 0 }), kin(2700, 0.7, -0.3, { target: false })],
    kinR: [kin(1000, 0.001, -0.3), kin(1500, 0.3, -0.3)],
    trials: [
      ...Array.from({ length: 11 }, (_, i) => trial(i + 1, 1000 + i, 1, 'LEFT', 'normal', i === 0 ? 0 : 100, 500)),
      ...Array.from({ length: 9 }, (_, i) => trial(i + 12, 1100 + i, 2, 'RIGHT', 'critical', 200, 600)),
      trial(21, 1200, 3, 'NA', 'SKIP', 0, 0), trial(22, 1300, 3, 'NA', 'SKIP', 0, 0),
      ...Array.from({ length: 5 }, (_, i) => trial(i + 23, 2000 + i, 3, 'LEFT'))
    ]
  });
  ok(result.frames === 3, 'workspace uses tracked frames with an active target only (' + result.frames + ')');
  ok(result.first.join() === '0.1,10,-10', 'frame in cm from home: across, height, forward (' + result.first.join() + ')');
  ok(result.breaks.join() === '1,0,0', 'path starts once, then joins consecutive frames');
  ok(result.mark.n === 7 && Math.round(result.mark.x) === 10 && Math.round(result.mark.f) === 10, 'target numbered from its angle (' + result.mark.n + ')');
  ok(JSON.stringify(result.sets) === '[[1,22]]', 'only full sets of 22 trials: 27 trials gives one set');
  ok(result.setCount === 1, 'over-time area has one value per full set');
  ok(result.handUse[0][0] === 55 && result.handUse[0][1] === 20, 'dominant right: 11 of 20 hits non-dominant = 55%, skips excluded');
  ok(result.choice[0].L === 11 && result.choice[0].R === 0 && result.choice[1].R === 9 && result.choice[2].L === 5, 'hand choice counts per target, skips excluded');
  ok(result.times[0].decision === 100 && result.times[0].total === 500 && result.times[1].decision === 200, 'median times per target, zero decision times excluded');
  ok(result.times[0].movement === 400 && result.times[1].movement === 400, 'movement time is total minus decision, per trial');
  ok(result.times[0].decisionLow === 100 && result.times[0].decisionHigh === 100, 'band holds the middle 50% of trials');
  ok(result.median[0] === 200 && result.median[1] === 5 && result.median[2] === null, 'median correct for even, odd and empty');
  ok(result.targets === 1, 'target positions collected');
  ok(result.timesTitle === 'Decision and movement time by target', 'chart named for what it shows');
  await p.context().close();
}

async function panelSuite(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const o = await ctx.newPage();
  const errs = [];
  const dl = [];
  o.on('pageerror', e => errs.push(e.message));
  o.on('download', d => dl.push(d));
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await o.evaluate(() => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
    const send = c.send.bind(c);
    c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: true, reason: '' }))); };
    c.open = true; c.emit('open');
  });
  const O = (fn, arg) => o.evaluate(fn, arg);
  const emit = (m) => O((d) => window.__c.emit('data', JSON.stringify(d)), m);
  const shown = (sel) => O((s) => { const el = document.querySelector(s); return !!el && el.checkVisibility(); }, sel);
  const text = (id) => O((i) => document.getElementById(i).textContent, id);
  const charts = () => O(() => [...document.querySelectorAll('#res-charts [data-chart]')].map(x => x.dataset.chart));
  const RUNS = [{ condition: 1, off: false, recal: false }];
  const STATE = { type: 'state', version: VERSION, sessionId: 'A', phase: 'setup', endReason: '', participantId: 'P1', filePrefix: 'P1_', sessionPrefix: 'P1_', experimenter: 'Jo', homeMode: 'one-box', dominantHand: 'RIGHT', condition: 1, mode: 'fmode', totalTrials: 44, setupLocked: false, calib: { reach: { done: true, hand: 'RIGHT', distance: 0.6, radius: 0.5 }, height: { done: true, height: 1 }, lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 } } }, recentred: true, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, run: 1, plannedRuns: 1, plan: null, inVR: true, closing: false, saving: false, headsetCopyRun: 0, betweenMs: 0, betweenRecentres: 0, recalibrated: [], completedRuns: [], noteMarks: [], notesCsv: '', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: 'Key,Value\nCondition,1\n' };

  console.log('RUN PLAN TICKS');
  await emit(STATE);
  await sleep(350);
  ok(await shown('#plan-builder') && (await text('plan-builder')).includes('Results at end of session'), 'Run plan offers the charts');
  ok(await O(() => document.querySelectorAll('[data-plan-chart]').length) === 6, 'all six charts listed');
  ok(await O(() => [...document.querySelectorAll('[data-plan-chart]')].every(c => !c.checked)), 'none ticked to begin with');
  await o.check('[data-plan-chart="workspaceMap"]');
  await o.check('[data-plan-chart="handChoice"]');
  await sleep(50);
  await o.click('#g-plan-send'); await sleep(100);
  const sent = await O(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.name === 'setPlan').at(-1).value);
  ok(sent.charts.join() === 'workspaceMap,handChoice', 'ticks sent with the plan');
  const plan = { mode: 'fmode', home: 'one-box', charts: sent.charts, runs: RUNS };
  await emit(Object.assign({}, STATE, { plan }));
  await sleep(300);

  console.log('DURING THE SESSION');
  await emit(Object.assign({}, STATE, { phase: 'running', plan, setupLocked: true }));
  await sleep(300);
  ok(!(await shown('#results')) && !(await shown('#g-results')), 'no results during a run');

  console.log('RESULTS');
  const kinL = [], kinR = [];
  for (let i = 0; i < 650; i++) {
    const t = i * 100;
    kinL.push(kin(t, -0.15 + 0.14 * Math.sin(i / 7), -0.4 - 0.12 * Math.sin(i / 11) ** 2, { y: 1 + 0.2 * Math.sin(i / 5) ** 2 }));
    kinR.push(kin(t, 0.15 + 0.14 * Math.sin(i / 6), -0.4 - 0.12 * Math.sin(i / 13) ** 2, { y: 1 + 0.2 * Math.sin(i / 4) ** 2 }));
  }
  const trials = Array.from({ length: 44 }, (_, i) => trial(i + 1, (i + 1) * 900, (i % 11) + 1, i % 3 ? 'RIGHT' : 'LEFT'));
  for (const [file, lines] of [['kinL', kinL], ['kinR', kinR], ['trials', trials]]) await emit({ type: 'rows', run: 1, file, from: 0, header: 'H\n', lines });
  const done1 = Object.assign({}, STATE, { phase: 'complete', endReason: 'finished', plan, trialCount: 44, sessionMs: 40000, setupLocked: true, backup: { trials: 44, kinL: 650, kinR: 650, final: true, exportTs: 'TS' } });
  await emit(done1);
  await sleep(700);
  ok(await shown('#results'), 'charts ticked: Results opens at session end');
  ok((await charts()).join() === 'workspaceMap,handChoice', 'only ticked charts drawn');
  ok(dl.length === 1 && dl[0].suggestedFilename() === 'P1_TS.zip', 'data zip saved on its own, no figures downloaded');
  ok(await O(() => !document.querySelector('[data-res-view]') && !document.querySelector('[data-res-frames]')), 'old hand and frame buttons gone');
  ok((await text('res-showing')) === 'Workspace shape. 3D: gaps filled up to 16 cm, smoothing 0.5 cm. 2D: gaps filled up to 8 cm, smoothing 0.5 cm.', 'settings stated in words');
  ok((await text('res-save')) === 'Save figures (2)', 'Save figures counts what is selected');
  const colourAt = (id, hex) => O(([chart, rgb]) => {
    const c = document.querySelector(`[data-chart="${chart}"] canvas`);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++;
    return n;
  }, [id, hex]);
  const hits = () => O(() => document.querySelector('[data-chart="workspaceMap"] > canvas').hits.length);
  ok(await hits() === 1, '2D figure hover marks the target');
  ok(await O(() => document.querySelector('[data-chart="handChoice"] canvas').hits.length) === 11, 'hand choice has one bar per target');
  await o.check('[data-res-chart="quality"]'); await sleep(350);
  const lastFps = await O(() => { const h = document.querySelector('[data-chart="quality"] canvas').hits.filter(x => x.text.includes('frames/s')); return h.at(-1).text; });
  const lastRate = +/: (\d+) frames/.exec(lastFps)[1];
  ok(lastRate >= 9 && lastRate <= 11, 'frame rate in the last, shorter time slice is not understated (' + lastFps + ')');
  ok(await hits() >= 1, 'map still drawn');
  await o.uncheck('[data-res-chart="quality"]'); await sleep(350);

  console.log('3D VIEW');
  const tableText = () => text('ws3d-table');
  const painted = () => O(() => { const c = document.getElementById('ws3d-canvas'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data; let blue = 0, red = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 2] > d[i] + 40 && d[i + 2] > 80) blue++; if (d[i] > d[i + 2] + 40 && d[i] > 80) red++; } return { blue, red }; });
  ok(await shown('#ws3d-canvas'), '3D view shown');
  const both3D = await painted();
  ok(both3D.blue > 100 && both3D.red > 100, `left drawn blue, right drawn red (${both3D.blue}, ${both3D.red})`);
  ok(/Volume.*Left[\d,]+[\d,]+Right[\d,]+[\d,]+Overlap[\d,]+[\d,]+Total[\d,]+[\d,]+Hand positions outside shape[\d.]+%[\d.]+%/.test(await tableText()), 'volume and area side by side, with positions outside');
  await o.uncheck('[data-ws-show="left"]'); await sleep(150);
  const noLeft = await painted();
  ok(noLeft.blue < both3D.blue / 2 && noLeft.red > 100, 'Left off: blue gone, red stays');
  await o.check('[data-ws-show="left"]'); await sleep(150);
  const before3D = await O(() => document.getElementById('ws3d-canvas').toDataURL());
  await o.click('[data-ws-view="Side"]'); await sleep(200);
  ok(await O((b) => document.getElementById('ws3d-canvas').toDataURL() !== b && document.querySelector('[data-ws-view="Side"]').classList.contains('on'), before3D), 'Side view changes the picture and is marked');
  await o.click('[data-ws-view="Free"]'); await sleep(200);
  const beforeDrag = await O(() => document.getElementById('ws3d-canvas').toDataURL());
  await O(() => document.getElementById('ws3d-canvas').scrollIntoView({ block: 'center' }));
  await sleep(100);
  const dragAt = await O(() => { const r = document.getElementById('ws3d-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await o.mouse.move(dragAt.x, dragAt.y); await o.mouse.down(); await o.mouse.move(dragAt.x + 120, dragAt.y + 20, { steps: 4 }); await o.mouse.up(); await sleep(150);
  ok(await O((b) => document.getElementById('ws3d-canvas').toDataURL() !== b, beforeDrag), 'dragging rotates the view');
  await o.mouse.move(5, 5);

  console.log('SHAPE SETTINGS');
  await O(() => { document.getElementById('ws-settings').open = true; });
  const settingsText = await text('ws-settings');
  ok(['Gap filling, 3D', 'Smoothing, 3D', 'Gap filling, 2D', 'Smoothing, 2D'].every(t => settingsText.includes(t)), 'all four settings offered');
  const rows = await O(() => [...document.querySelectorAll('.ws-option')].map(r => r.children.length === 3 && r.children[1].textContent.startsWith('+ ') && r.children[2].textContent.startsWith('− ')));
  ok(rows.length === 13 && rows.every(Boolean), 'every option has one pro and one con');
  ok(!/ball/i.test(settingsText) && !/\d\s*%/.test(settingsText) && !/participant/i.test(settingsText), 'settings text plain: no specialist term, no figures from earlier data');
  ok(await O(() => ['gap3D:16', 'smooth3D:0.5', 'gap2D:8', 'smooth2D:0.5'].every(k => { const [a, v] = k.split(':'); return document.querySelector(`[data-shape="${a}"][data-v="${v}"]`).classList.contains('on'); })), 'defaults marked as chosen');
  const areaNow = () => O(() => { const g = window.__obs.guide.results; return { area: ResultsCharts.shape2D(g.ws.data.runs[0], 'top', g.shape).total, volume: ResultsCharts.shape3D(g.ws.data.runs[0], g.shape).total }; });
  const start = await areaNow();
  await o.click('[data-shape="gap3D"][data-v="24"]'); await sleep(500);
  const larger = await areaNow();
  ok(larger.volume > start.volume && larger.area === start.area, 'more 3D gap filling changes volume, not area');
  ok((await text('res-showing')).includes('3D: gaps filled up to 24 cm') && await O(() => document.querySelector('[data-shape="gap3D"][data-v="24"]').classList.contains('on')), 'choice stated and marked');
  ok(await O((v) => document.getElementById('ws3d-table').textContent.includes(Math.round(v).toLocaleString('en-GB')), larger.volume), 'table shows the new volume');
  await o.click('[data-shape="gap2D"][data-v="16"]'); await sleep(500);
  const larger2D = await areaNow();
  ok(larger2D.area > start.area && larger2D.volume === larger.volume, 'more 2D gap filling changes area, not volume');
  await o.click('#ws-defaults'); await sleep(500);
  const reset = await areaNow();
  ok(reset.area === start.area && reset.volume === start.volume && (await text('res-showing')).includes('3D: gaps filled up to 16 cm'), 'Back to defaults');
  await O(() => { document.getElementById('ws-settings').open = false; });
  const tip = await O(() => { const c = document.querySelector('[data-chart="handChoice"] canvas'); const h = c.hits[0]; const r = c.getBoundingClientRect(); const s = r.width / +c.dataset.width; return { x: r.left + (h.x + h.w / 2) * s, y: r.top + (h.y + h.h / 2) * s, text: h.text }; });
  await o.evaluate((y) => document.getElementById('results').scrollTo(0, 0), 0);
  await O(() => document.querySelector('[data-chart="handChoice"]').scrollIntoView({ block: 'center' }));
  await sleep(100);
  const tip2 = await O(() => { const c = document.querySelector('[data-chart="handChoice"] canvas'); const h = c.hits[0]; const r = c.getBoundingClientRect(); const s = r.width / +c.dataset.width; return { x: r.left + (h.x + h.w / 2) * s, y: r.top + (h.y + h.h / 2) * s, text: h.text }; });
  await o.mouse.move(tip2.x, tip2.y); await sleep(100);
  ok((await text('chart-tip')) === tip.text && /^Target 1: left \d+ \(\d+%\), right \d+ \(\d+%\)$/.test(tip.text) && await shown('#chart-tip'), 'hover shows the value (' + tip.text + ')');
  await O(() => document.getElementById('results').dispatchEvent(new Event('scroll')));
  ok(!(await shown('#chart-tip')), 'scrolling hides the hover label');
  await o.mouse.move(tip2.x + 1, tip2.y); await sleep(100);
  ok(await shown('#chart-tip'), 'hover label back on moving the mouse');
  await O(() => document.getElementById('res-close').click()); await sleep(350);
  ok(!(await shown('#chart-tip')), 'closing Results hides the hover label');
  await O(() => document.getElementById('g-results').click()); await sleep(350);
  await o.mouse.move(5, 5);

  console.log('SAVING FIGURES');
  await o.click('#res-save');
  await sleep(1000);
  ok(dl.length === 2 && /^P1_figures-[\dT-]+\.zip$/.test(dl[1].suggestedFilename()), 'separate figures zip, only when pressed');
  ok(await shown('#ws3d-canvas') && (await painted()).blue > 100, '3D view back on screen after saving');
  const f = path.join(OUT, 'figures.zip');
  await dl[1].saveAs(f);
  const { spawnSync } = require('child_process');
  const zipBytes = fs.readFileSync(f);
  const entries = readBinaryZip(zipBytes);
  ok(entries.length === 3 && entries.every(e => /^P1_[a-z0-9-]+-[\dT-]+\.png$/.test(e.name)) && entries.some(e => e.name.includes('workspace-map')) && entries.some(e => e.name.includes('hand-choice')) && entries.some(e => e.name.includes('workspace-3d-run1')), 'one PNG per selected chart, plus 3D at the current angle (' + entries.map(e => e.name).join(', ') + ')');
  ok(entries.every(e => e.data.subarray(1, 4).toString() === 'PNG'), 'valid PNG files');
  const corner = await O(async (b64) => { const res = await fetch(`data:image/png;base64,${b64}`); const bmp = await createImageBitmap(await res.blob()); const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return { w: bmp.width, px: [...x.getImageData(2, 2, 1, 1).data] }; }, entries[0].data.toString('base64'));
  ok(corner.w === 2400 && corner.px[0] === 255 && corner.px[1] === 255 && corner.px[2] === 255, 'saved figures on white at high resolution');
  const shot3D = entries.find(e => e.name.includes('workspace-3d-run1'));
  const corner3D = await O(async (b64) => { const res = await fetch(`data:image/png;base64,${b64}`); const bmp = await createImageBitmap(await res.blob()); const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return { w: bmp.width, h: bmp.height, px: [...x.getImageData(2, 2, 1, 1).data] }; }, shot3D.data.toString('base64'));
  ok(corner3D.w === 2400 && corner3D.h === 1500 && corner3D.px[0] === 255, '3D figure on white at high resolution');
  ok((await text('res-msg')) === '3 figures saved in zip.', 'says what was saved');
  ok(await O(() => { const n = document.querySelectorAll('#res-charts [data-chart]').length; document.querySelector('[data-res-chart="times"]').click(); return document.querySelectorAll('#res-charts [data-chart]').length === n; }), 'drawing runs after the guide update, not inside it');
  await sleep(350);
  ok((await charts()).join() === 'workspaceMap,handChoice,times' && (await text('res-save')) === 'Save figures (3)', 'unticked chart can be added afterwards and saved too');
  await o.uncheck('[data-res-chart="times"]'); await o.uncheck('[data-res-chart="workspaceMap"]'); await o.uncheck('[data-res-chart="handChoice"]');
  await sleep(350);
  const before = dl.length;
  ok(await O(() => document.getElementById('res-save').disabled) && (await text('res-save')) === 'Save figures' && (await charts()).length === 0, 'nothing selected: button disabled');
  await O(() => document.getElementById('res-save').click());
  await sleep(300);
  ok(dl.length === before, 'nothing selected: no zip');
  for (const id of ['workspaceMap', 'workspaceTime', 'handChoice', 'handUse', 'times', 'quality']) await o.check(`[data-res-chart="${id}"]`);
  await sleep(450);
  ok((await charts()).length === 6, 'all six draw without error');
  const written = await O(() => {
    const g = window.__obs.guide.results;
    const real = CanvasRenderingContext2D.prototype.fillText;
    const out = {};
    ResultsCharts.IDS.forEach(id => {
      const seen = [];
      CanvasRenderingContext2D.prototype.fillText = function (s) { seen.push(String(s)); };
      ResultsCharts.render(document.createElement('canvas'), id, g.ws.data, { shape: g.shape }, 'light', 1200, 1);
      out[id] = seen;
    });
    CanvasRenderingContext2D.prototype.fillText = real;
    return out;
  });
  const axes = { workspaceMap: ['Left–right of home centre (cm)', 'Forward of home (cm)', 'Height above home (cm)'], workspaceTime: ['Area (cm²)', 'Trial (across the whole session)'], handChoice: ['Share of hits (%)', 'Target (1 = far left, 11 = far right)'], handUse: ['Non-dominant hand (% of hits)', 'Trial (across the whole session)'], times: ['Time (ms)', 'Target (1 = far left, 11 = far right)'], quality: ['Time in run (min:s)'] };
  Object.entries(axes).forEach(([id, want]) => ok(want.every(w => written[id].includes(w)), `${id}: axes titled`));
  ok(Object.values(written).flat().every(s => !/ball/i.test(s)), 'no specialist wording on any figure');
  ok(!written.quality.includes('Within limits') && written.times.includes('Movement time') && written.handChoice.includes('Hits'), 'legends and hit counts present; no limits legend on the timeline');
  await o.setViewportSize({ width: 2560, height: 1440 }); await sleep(1500);
  const shapes = await O(() => [...document.querySelectorAll('.res-chart canvas:not(#ws3d-canvas)')].map(c => { const r = c.getBoundingClientRect(); return { w: r.width, shown: r.width / r.height, drawn: c.width / c.height }; }));
  ok(shapes.length > 0 && shapes.every(s => Math.abs(s.shown - s.drawn) < 0.01 && s.w <= 1400), `1440p: charts keep their shape, at most 1400 px wide (${shapes.length} charts, widest ${Math.max(...shapes.map(s => s.w))})`);
  await o.setViewportSize({ width: 1440, height: 900 }); await sleep(1500);
  await o.click('#res-close'); await sleep(50);
  ok(!(await shown('#results')) && await shown('#g-results'), 'Close returns to the 3D view; Results button remains');
  await o.click('#g-results'); await sleep(350);
  ok(await shown('#results'), 'Results reopens');
  await o.uncheck('[data-res-chart="quality"]'); await sleep(350);
  await emit(Object.assign({}, done1, { phase: 'between', backup: { trials: 44, kinL: 650, kinR: 650, final: false, exportTs: '' } }));
  await sleep(300);
  await emit(done1);
  await sleep(600);
  ok((await charts()).join() === 'workspaceMap,workspaceTime,handChoice,handUse,times', 'chart ticks kept after Add run and finishing again');

  console.log('CHART FAILS TO DRAW');
  await O(() => { window.__render = ResultsCharts.render; ResultsCharts.render = function (c, id) { if (id === 'handUse') throw new Error('bad chart'); return window.__render.apply(ResultsCharts, arguments); }; });
  await o.check('[data-res-chart="quality"]'); await sleep(450);
  ok((await text('res-charts')).includes('Hand use across session: could not draw. Data not affected.'), 'failed chart says so');
  ok(await O(() => document.querySelectorAll('#res-charts [data-chart] > canvas').length) === 5, 'other charts still drawn');
  await O(() => { ResultsCharts.render = window.__render; });
  await O(() => { window.__parse = ResultsCharts.parseRun; ResultsCharts.parseRun = () => { throw new Error('bad data'); }; window.__obs.guide.results.parsed = new Map(); });
  await o.uncheck('[data-res-chart="quality"]'); await sleep(450);
  ok((await text('res-charts')).includes('could not draw') && await O(() => document.querySelectorAll('#res-charts canvas').length) === 0, 'bad data: message, not a blank panel');
  ok(await O(() => !!document.getElementById('ws3d')), '3D view kept for the next draw');
  await O(() => document.getElementById('res-save').click()); await sleep(300);
  ok((await text('res-msg')) === 'Figures not saved. Try again.' && !(await O(() => document.getElementById('res-save').disabled)), 'bad data: figures report failure, button recovers');
  await O(() => { ResultsCharts.parseRun = window.__parse; });
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await ctx.close();

  console.log('CHART SCRIPT MISSING');
  const c3 = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const m = await c3.newPage();
  const errs3 = [];
  m.on('pageerror', e => errs3.push(e.message));
  await serve(m);
  await m.route('**/results-charts.js', r => r.abort());
  await m.goto('https://test.local/observer.html');
  await m.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await m.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); });
  const mem = (d) => m.evaluate((x) => window.__c.emit('data', JSON.stringify(x)), d);
  await mem(Object.assign({}, STATE, { sessionId: 'M' }));
  await sleep(350);
  ok(await m.evaluate(() => document.getElementById('plan-builder').textContent.includes('Runs') && !document.querySelector('[data-plan-chart]')), 'run plan works without the charts');
  await m.evaluate(() => { document.querySelector('[data-plan-mode="short"]').click(); });
  await sleep(300);
  ok(await m.evaluate(() => document.querySelector('[data-plan-mode="short"]').classList.contains('on')), 'guide still updates');
  await mem(Object.assign({}, done1, { sessionId: 'M', plan: { mode: 'fmode', home: 'one-box', charts: ['times'], runs: RUNS }, backup: { trials: 0, kinL: 0, kinR: 0, final: true, exportTs: 'TS' } }));
  await sleep(600);
  ok(await m.evaluate(() => document.getElementById('g8-files').textContent.includes('Charts unavailable. Data not affected.') && !document.getElementById('g-results').checkVisibility() && !document.getElementById('results').checkVisibility()), 'Finish says charts are unavailable, no Results button');
  ok(errs3.length === 0, 'no page errors (' + errs3.join(' | ') + ')');
  await c3.close();

  for (const [name, file, want, still] of [['3D VIEW MISSING', 'workspace-view.js', '3D view unavailable', true], ['SHAPE MATHS MISSING', 'workspace-shape.js', 'could not draw', false]]) {
    console.log(name);
    const cx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const w = await cx.newPage();
    const werrs = [];
    w.on('pageerror', e => werrs.push(e.message));
    await serve(w);
    await w.route(`**/${file}`, r => r.abort());
    await w.goto('https://test.local/observer.html');
    await w.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
    await w.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); });
    const wem = (d) => w.evaluate((x) => window.__c.emit('data', JSON.stringify(x)), d);
    await wem(Object.assign({}, done1, { sessionId: 'W', phase: 'running', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' } }));
    for (const [f, lines] of [['kinL', kinL], ['kinR', kinR], ['trials', trials]]) await wem({ type: 'rows', run: 1, file: f, from: 0, header: 'H\n', lines });
    await wem(Object.assign({}, done1, { sessionId: 'W' }));
    await sleep(900);
    const seen = await w.evaluate(() => document.getElementById('res-charts').textContent);
    ok(seen.includes(want), `${file} missing: says so`);
    ok(await w.evaluate(() => !!document.querySelector('[data-chart="handChoice"] > canvas') || !!document.querySelector('[data-chart="workspaceMap"] > canvas')), `${file} missing: other figures still drawn`);
    if (still) ok(await w.evaluate(() => !!document.querySelector('[data-chart="workspaceMap"] > canvas')), '2D figure still drawn');
    ok(werrs.length === 0, 'no page errors (' + werrs.join(' | ') + ')');
    await cx.close();
  }

  console.log('NO CHARTS TICKED');
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const n = await c2.newPage();
  const dl2 = [];
  n.on('download', d => dl2.push(d));
  await serve(n);
  await n.goto('https://test.local/observer.html');
  await n.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  await n.evaluate(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); });
  const nem = (m) => n.evaluate((d) => window.__c.emit('data', JSON.stringify(d)), m);
  await nem(Object.assign({}, STATE, { sessionId: 'N', phase: 'running', plan: { mode: 'fmode', home: 'one-box', charts: [], runs: RUNS } }));
  for (const [file, lines] of [['kinL', kinL], ['kinR', kinR], ['trials', trials]]) await nem({ type: 'rows', run: 1, file, from: 0, header: 'H\n', lines });
  await nem(Object.assign({}, done1, { sessionId: 'N', plan: { mode: 'fmode', home: 'one-box', charts: [], runs: RUNS } }));
  await sleep(700);
  ok(!(await n.evaluate(() => document.getElementById('results').checkVisibility())), 'nothing ticked: Results stays closed');
  ok(dl2.length === 1 && dl2[0].suggestedFilename().endsWith('.zip') && !dl2[0].suggestedFilename().includes('figures'), 'nothing ticked: no figures zip');
  await nem(Object.assign({}, done1, { sessionId: 'N', plan: { mode: 'fmode', home: 'one-box', charts: [], runs: RUNS }, info: 'Key,Value\nCondition,2\nSetupChanges,5000|200|Condition|1|2\n' }));
  await n.click('#g-results'); await sleep(350);
  ok(await n.evaluate(() => document.getElementById('results').checkVisibility() && document.getElementById('res-save').disabled), 'can still open Results; nothing selected');
  await n.check('[data-res-chart="workspaceMap"]'); await sleep(350);
  ok(await n.evaluate(() => !!document.querySelector('[data-chart="workspaceMap"] canvas') && !document.getElementById('res-save').disabled), 'unticked chart available afterwards');
  ok(await n.evaluate(() => [...window.__obs.guide.results.parsed.values()].at(-1).label) === 'Run 1: No boost to trial 200, then Boost', 'run label shows a mid-run condition change');
  await c2.close();
}

function readBinaryZip(buf) {
  const zlib = require('zlib');
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const compressed = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28), extra = buf.readUInt16LE(at + 30), comment = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = zlib.inflateRawSync(buf.subarray(start, start + compressed));
    if (zlib.crc32(data) !== buf.readUInt32LE(at + 16)) throw new Error('crc ' + name);
    out.push({ name, data });
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

(async () => {
  const b = await launch();
  await numbersSuite(b);
  await panelSuite(b);
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

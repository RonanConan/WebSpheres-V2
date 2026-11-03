const { launch, serve, counter } = require('./harness.cjs');
const { ok, done } = counter('WORKSPACE BROWSER');
const near = (v, want, share) => Math.abs(v - want) <= want * share;

(async () => {
  const b = await launch();
  const p = await (await b.newContext()).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => typeof WorkspaceShape !== 'undefined');

  console.log('EDGE TRACE');
  const t = await p.evaluate(() => {
    const S = WorkspaceShape;
    const grid = (x0, x1, y0, y1) => { const f = []; for (let x = x0; x <= x1; x += 0.5) for (let y = y0; y <= y1; y += 0.5) f.push(x, y); return f; };
    const box = grid(0, 30, 0, 20);
    const a = S.trace(box, 8, 0.5);
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const turned = [];
    for (let i = 0; i < box.length; i += 2) turned.push(box[i] * c - box[i + 1] * s, box[i] * s + box[i + 1] * c);
    const shifted = box.map(v => v + 0.37);
    const narrow = S.trace(grid(0, 10, 0, 30).concat(grid(16, 26, 0, 30)), 8, 0.5);
    const wide = S.trace(grid(0, 10, 0, 30).concat(grid(22, 32, 0, 30)), 8, 0.5);
    const hollow = [];
    for (let x = 0; x <= 30; x += 0.5) hollow.push(x, 0, x, 20);
    for (let y = 0; y <= 20; y += 0.5) hollow.push(0, y, 30, y);
    return {
      area: a.area, outside: a.outside, points: a.edge.length,
      turned: S.trace(turned, 8, 0.5).area, shifted: S.trace(shifted, 8, 0.5).area,
      islandHigh: S.trace(box.concat([5, 60]), 8, 0.5).area, islandLow: S.trace(box.concat([-40, -40]), 8, 0.5).area,
      narrow: narrow.area, wide: wide.area, hollow: S.trace(hollow, 8, 0.5).area,
      smooth1: S.trace(box, 8, 1).area,
      empty: S.trace([], 8, 0.5).area, two: S.trace([1, 1, 2, 2], 8, 0.5).area, same: S.trace([1, 1, 1, 1, 1, 1, 1, 1], 8, 0.5).area, line: S.trace(Array.from({ length: 200 }, (_, i) => (i % 2 ? 0 : i / 2)), 8, 0.5).area,
      overlap: S.overlapArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]),
      apart: S.overlapArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }]),
      none: S.overlapArea([], [{ x: 0, y: 0 }]),
      halfOut: S.outsideShare([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], [5, 5, 50, 50])
    };
  });
  ok(near(t.area, 600, 0.03), `filled 30 x 20 cm: 600 cm² (${Math.round(t.area)})`);
  ok(t.outside < 0.02, `almost every point inside the outline (${(t.outside * 100).toFixed(2)}% out)`);
  ok(near(t.turned, t.area, 0.03), `same shape turned 30°: same area (${Math.round(t.turned)})`);
  ok(near(t.shifted, t.area, 0.01), `same shape moved: same area, no grid effect (${Math.round(t.shifted)})`);
  ok(near(t.islandHigh, t.area, 0.001), `stray point at the starting edge ignored (${Math.round(t.islandHigh)})`);
  ok(near(t.islandLow, t.area, 0.001), `stray point at the far edge ignored (${Math.round(t.islandLow)})`);
  ok(near(t.narrow, 780, 0.04), `6 cm gap, filling up to 8 cm: gap filled, about 780 cm² (${Math.round(t.narrow)})`);
  ok(near(t.wide, 300, 0.04), `12 cm gap, filling up to 8 cm: only the main shape, about 300 cm² (${Math.round(t.wide)})`);
  ok(near(t.hollow, 600, 0.03), `outline only: inside counts, about 600 cm² (${Math.round(t.hollow)})`);
  ok(near(t.smooth1, t.area, 0.02), `more smoothing barely changes area (${Math.round(t.smooth1)})`);
  ok(t.empty === 0 && t.two === 0 && t.same === 0, 'no frames, or too few: area 0, no error');
  ok(t.line < 300, `straight line: thin shape, no error (${Math.round(t.line)})`);
  ok(near(t.overlap, 25, 0.03), `squares offset by half: overlap 25 cm² (${t.overlap.toFixed(1)})`);
  ok(t.apart === 0 && t.none === 0, 'shapes apart, or one empty: overlap 0');
  ok(t.halfOut === 0.5, 'share of points outside');

  console.log('VOLUME');
  const v = await p.evaluate(() => {
    const S = WorkspaceShape;
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cloud = (w, h, d, ox) => {
      const f = [];
      for (let k = 0; k < 1500; k++) {
        const a = [rnd() * w + ox, rnd() * h, rnd() * d], c = [rnd() * w + ox, rnd() * h, rnd() * d];
        for (let i = 0; i <= 30; i++) f.push(...a.map((q, j) => q + (c[j] - q) * i / 30));
      }
      return f;
    };
    const box = cloud(30, 20, 20, 0);
    const t0 = performance.now();
    const same = S.solid(box, box, 16, 0.5);
    const ms = performance.now() - t0;
    const apart = S.solid(cloud(20, 20, 20, 0), cloud(20, 20, 20, 60), 16, 0.5);
    const glitch = S.solid(box.concat([5, 90, 5]), box, 16, 0.5);
    const noLeft = S.solid([], box, 16, 0.5);
    const sizes = [8, 16, 24].map(r => S.solid(box, box, r, 0.5).left.volume);
    const soft = S.solid(box, box, 16, 2);
    return {
      volume: same.left.volume, overlap: same.overlap.volume, total: same.total, outside: same.left.outside, soft: soft.left.outside, softVolume: soft.left.volume,
      drawn: same.left.drawnVolume, ms, apartL: apart.left.volume, apartR: apart.right.volume, apartO: apart.overlap.volume, apartT: apart.total,
      glitch: glitch.left.volume, noLeft: noLeft.left.volume, noLeftTotal: noLeft.total, noLeftR: noLeft.right.volume, nothing: S.solid([], [], 16, 0.5), sizes,
      closed: same.left.idx.length % 3 === 0 && same.left.pos.every(Number.isFinite)
    };
  });
  ok(near(v.volume, 12000, 0.13), `filled 30 x 20 x 20 cm: about 12,000 cm³ (${Math.round(v.volume)})`);
  ok(v.outside < 0.01, `0.5 cm smoothing keeps frames inside (${(v.outside * 100).toFixed(2)}% out)`);
  ok(v.soft > v.outside && v.softVolume < v.volume, `more smoothing leaves more frames out (${(v.soft * 100).toFixed(1)}%)`);
  ok(near(v.drawn, v.volume, 0.05), `drawn surface stays close to the measured one (${Math.round(v.drawn)} vs ${Math.round(v.volume)})`);
  ok(near(v.overlap, v.volume, 0.01) && near(v.total, v.volume, 0.01), 'same cloud for both hands: overlap and total equal the volume');
  ok(v.apartO === 0 && near(v.apartT, v.apartL + v.apartR, 0.01), 'hands apart: no overlap, total is the sum');
  ok(near(v.glitch, v.volume, 0.001), `stray frame leaves volume unchanged (${Math.round(v.glitch)})`);
  ok(v.noLeft === 0 && near(v.noLeftTotal, v.noLeftR, 0.01), 'one hand unused: its volume 0, total from the other');
  ok(v.nothing === null, 'no frames at all: no shape, no error');
  ok(v.sizes[0] <= v.sizes[1] && v.sizes[1] <= v.sizes[2], `more gap filling, more volume (${v.sizes.map(Math.round).join(' / ')})`);
  ok(v.closed, 'surface data well formed');
  ok(v.ms < 5000, `calculation fast enough (${Math.round(v.ms)} ms)`);
  const fs = require('fs'), path = require('path');
  const sources = ['observer.html', 'results-charts.js', 'workspace-shape.js', 'workspace-view.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  ok(sources.every(s => !/\bball/i.test(s)), 'old specialist term gone from the source');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

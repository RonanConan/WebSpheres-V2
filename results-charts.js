const ResultsCharts = (() => {
    const SET_SIZE = 22;
    const PAD = 12;
    const TARGETS = 11;
    const THEMES = {
        dark: { bg: '#0b0e14', text: '#dfe5f0', muted: '#8d97a8', grid: '#252c3a', left: '#3a86ea', right: '#e5534b', overlap: '#aab1bd', ok: '#245a3f', warn: '#ffb347', bad: '#ff5c5c', none: '#232a38' },
        light: { bg: '#ffffff', text: '#1a1d24', muted: '#5b6472', grid: '#e3e6eb', left: '#2a78d6', right: '#d43b3b', overlap: '#9aa1ad', ok: '#bfe3cd', warn: '#d98a00', bad: '#d43b3b', none: '#eceef1' }
    };
    const SHAPE_DEFAULT = { gap3D: 16, smooth3D: 0.5, gap2D: 8, smooth2D: 0.5 };
    const SHAPE_OPTIONS = [
        { key: 'gap3D', title: 'Gap filling, 3D', options: [
            { value: 8, pro: 'Follows the recorded hand paths more closely.', con: 'Leaves more gaps and irregularities, making the overlap appear smaller.' },
            { value: 16, pro: 'Produces a more continuous workspace shape.', con: 'Includes some space the hand did not reach.' },
            { value: 24, pro: 'Produces the simplest, most rounded shape.', con: 'Includes the most unreached space and makes the overlap appear larger.' }
        ] },
        { key: 'smooth3D', title: 'Smoothing, 3D', options: [
            { value: 0.5, pro: 'Keeps almost all recorded hand positions inside the measured workspace.', con: 'The measured boundary is less smooth than the displayed surface.' },
            { value: 1, pro: 'The measured boundary matches the displayed surface.', con: 'Some recorded hand positions fall outside the measured boundary.' },
            { value: 2, pro: 'Produces the smoothest surface.', con: 'More recorded hand positions fall outside the shape, and narrow reaches may disappear from it.' }
        ] },
        { key: 'gap2D', title: 'Gap filling, 2D', options: [
            { value: 4, pro: 'Produces the tightest outline around the hand paths.', con: 'Leaves larger notches between paths and produces the smallest area estimate.' },
            { value: 8, pro: 'Follows the overall pattern of the reaches.', con: 'Some irregularities remain in the outline.' },
            { value: 12, pro: 'Produces a more continuous outline.', con: 'Includes some gaps between recorded paths, increasing the estimated area.' },
            { value: 16, pro: 'Produces the simplest outline.', con: 'Removes small indentations and produces the largest area estimate.' }
        ] },
        { key: 'smooth2D', title: 'Smoothing, 2D', options: [
            { value: 0.25, pro: 'Keeps the outline closest to the recorded paths.', con: 'Produces a more angular outline.' },
            { value: 0.5, pro: 'Produces a smoother outline that remains close to the recorded paths.', con: 'A small number of recorded hand positions fall outside the outline.' },
            { value: 1, pro: 'Produces the smoothest outline.', con: 'More recorded hand positions fall outside the outline.' }
        ] }
    ];
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    function parseHand(lines) {
        const n = lines.length;
        const hand = { n: 0, t: new Float64Array(n), x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), valid: new Uint8Array(n), target: new Uint8Array(n), recentre: new Uint16Array(n), homes: new Map(), targets: new Map() };
        lines.forEach(line => {
            const c = line.split(',');
            if (c.length < 26) return;
            const i = hand.n++;
            hand.t[i] = +c[0];
            hand.x[i] = +c[1];
            hand.y[i] = +c[2];
            hand.z[i] = +c[3];
            hand.valid[i] = c[10] === '1' ? 1 : 0;
            hand.target[i] = c[7] !== '' ? 1 : 0;
            hand.recentre[i] = +c[25] || 0;
            if (c[4] !== '' && c[6] !== '') hand.homes.set(`${c[4]},${c[5]},${c[6]}`, { x: +c[4], y: +c[5], z: +c[6] });
            if (c[7] !== '') hand.targets.set(`${c[7]},${c[8]},${c[9]}`, { x: +c[7], y: +c[8], z: +c[9] });
        });
        return hand;
    }

    function parseTrials(lines) {
        return lines.map(line => {
            const c = line.trimEnd().split(',');
            return { n: +c[0], t: +c[1], target: +c[2], hand: c[3], hit: c[5], dt: +c[6], mt: +c[7] };
        });
    }

    function parseRun(run) {
        const L = parseHand(run.kinL);
        const R = parseHand(run.kinR);
        const recentres = [];
        for (let i = 1; i < L.n; i++) if (L.recentre[i] !== L.recentre[i - 1]) recentres.push(L.t[i]);
        const homes = new Map([...L.homes, ...R.homes]);
        const targets = new Map([...L.targets, ...R.targets]);
        return { run: run.run, label: run.label, L, R, trials: parseTrials(run.trials), recentres, homes: [...homes.values()], targets: [...targets.values()], quality: run.quality, cache: new Map() };
    }

    function cached(run, key, make) {
        if (!run.cache.has(key)) run.cache.set(key, make());
        return run.cache.get(key);
    }

    function homeCentre(run) {
        const first = [run.L, run.R].map(h => h.homes.values().next().value).filter(Boolean);
        if (!first.length) return { x: 0, y: 0, z: 0 };
        const mean = (k) => first.reduce((n, p) => n + p[k], 0) / first.length;
        return { x: mean('x'), y: mean('y'), z: mean('z') };
    }

    function framesOf(run, hand) {
        return cached(run, `frames:${hand}`, () => {
            const h = run[hand];
            const o = homeCentre(run);
            const pts = new Float32Array(h.n * 3), times = new Float64Array(h.n), breaks = new Uint8Array(h.n);
            let count = 0, last = -1;
            for (let i = 0; i < h.n; i++) {
                if (!h.valid[i] || !h.target[i]) continue;
                pts[count * 3] = (h.x[i] - o.x) * 100;
                pts[count * 3 + 1] = (h.y[i] - o.y) * 100;
                pts[count * 3 + 2] = (o.z - h.z[i]) * 100;
                times[count] = h.t[i];
                breaks[count] = last < 0 || i !== last + 1 || h.recentre[i] !== h.recentre[last] ? 1 : 0;
                last = i;
                count++;
            }
            return { pts: pts.subarray(0, count * 3), times: times.subarray(0, count), breaks: breaks.subarray(0, count), count };
        });
    }

    function flatten(frames, view, from, to) {
        const a = view === 'top' ? 0 : 2, b = view === 'top' ? 2 : 1;
        const out = [];
        for (let i = 0; i < frames.count; i++) {
            if (frames.times[i] <= from || frames.times[i] > to) continue;
            out.push(frames.pts[i * 3 + a], frames.pts[i * 3 + b]);
        }
        return out;
    }

    function shape2D(run, view, shape, from, to) {
        const start = from === undefined ? -Infinity : from;
        const end = to === undefined ? Infinity : to;
        return cached(run, `2d:${view}:${shape.gap2D}:${shape.smooth2D}:${start}:${end}`, () => {
            const left = WorkspaceShape.trace(flatten(framesOf(run, 'L'), view, start, end), shape.gap2D, shape.smooth2D);
            const right = WorkspaceShape.trace(flatten(framesOf(run, 'R'), view, start, end), shape.gap2D, shape.smooth2D);
            const overlap = WorkspaceShape.overlapArea(left.edge, right.edge);
            return { left, right, overlap, total: left.area + right.area - overlap };
        });
    }

    function shape3D(run, shape) {
        return cached(run, `3d:${shape.gap3D}:${shape.smooth3D}`, () => WorkspaceShape.solid(framesOf(run, 'L').pts, framesOf(run, 'R').pts, shape.gap3D, shape.smooth3D));
    }

    function marks(run) {
        return cached(run, 'marks', () => {
            const o = homeCentre(run);
            const place = (p) => ({ x: (p.x - o.x) * 100, h: (p.y - o.y) * 100, f: (o.z - p.z) * 100 });
            const targets = run.targets.map(t => Object.assign(place(t), { n: Math.round((Math.atan2(t.x, -t.z) * 180 / Math.PI + 40) / 8) + 1 }));
            const homes = run.homes.map(place);
            const radius = run.targets.length ? Math.max(...run.targets.map(t => Math.hypot(t.x, t.z))) * 100 : 0;
            return { targets, homes, radius };
        });
    }

    function view3D(run, shape) {
        const m = marks(run);
        return { solid: shape3D(run, shape), paths: { left: framesOf(run, 'L'), right: framesOf(run, 'R') }, targets: m.targets, homes: m.homes };
    }

    const outward = (lo, hi) => [Math.floor((lo - 3) / 10) * 10, Math.ceil((hi + 3) / 10) * 10];

    function limits3D(data, shape) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        const grow = (x, h, f) => [x, h, f].forEach((v, k) => {
            lo[k] = Math.min(lo[k], v);
            hi[k] = Math.max(hi[k], v);
        });
        data.runs.forEach(run => {
            const s = shape3D(run, shape);
            if (s) [s.left, s.right].forEach(p => { for (let i = 0; i < p.pos.length; i += 3) grow(p.pos[i], p.pos[i + 1], p.pos[i + 2]); });
            const m = marks(run);
            m.targets.concat(m.homes).forEach(p => grow(p.x, p.h, p.f));
        });
        if (lo[0] === Infinity) return { x: [-50, 50], h: [-10, 50], f: [-10, 40] };
        return { x: outward(lo[0], hi[0]), h: outward(lo[1], hi[1]), f: outward(lo[2], hi[2]) };
    }

    function trialSets(run) {
        const sets = [];
        for (let i = 0; i + SET_SIZE <= run.trials.length; i += SET_SIZE) {
            sets.push({ first: i + 1, last: i + SET_SIZE, from: i === 0 ? -Infinity : run.trials[i - 1].t, to: run.trials[i + SET_SIZE - 1].t, trials: run.trials.slice(i, i + SET_SIZE) });
        }
        return sets;
    }

    function workspaceSets(run, shape) {
        return trialSets(run).map(s => {
            const top = shape2D(run, 'top', shape, s.from, s.to);
            return { first: s.first, last: s.last, left: top.left.area, right: top.right.area, total: top.total };
        });
    }

    function handUseSets(run, dominant) {
        return trialSets(run).map(s => {
            const hits = s.trials.filter(t => t.hit !== 'SKIP' && (t.hand === 'LEFT' || t.hand === 'RIGHT'));
            const other = hits.filter(t => t.hand !== dominant).length;
            return { first: s.first, last: s.last, value: hits.length ? 100 * other / hits.length : null, n: hits.length };
        });
    }

    function handChoice(run) {
        const rows = Array.from({ length: TARGETS }, (_, i) => ({ target: i + 1, L: 0, R: 0 }));
        run.trials.forEach(t => {
            if (t.hit === 'SKIP' || t.target < 1 || t.target > TARGETS) return;
            if (t.hand === 'LEFT') rows[t.target - 1].L++;
            else if (t.hand === 'RIGHT') rows[t.target - 1].R++;
        });
        return rows;
    }

    function median(values) {
        if (!values.length) return null;
        const v = values.slice().sort((a, b) => a - b);
        const m = v.length >> 1;
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    }

    function quantile(values, share) {
        if (!values.length) return null;
        const v = values.slice().sort((a, b) => a - b);
        const at = (v.length - 1) * share;
        const low = Math.floor(at);
        return v[low] + (v[Math.min(low + 1, v.length - 1)] - v[low]) * (at - low);
    }

    function timesByTarget(run) {
        return Array.from({ length: TARGETS }, (_, i) => {
            const hits = run.trials.filter(t => t.target === i + 1 && t.hit !== 'SKIP');
            const decision = hits.map(t => t.dt).filter(v => v > 0);
            const total = hits.map(t => t.mt).filter(v => v > 0);
            const movement = hits.filter(t => t.dt > 0 && t.mt > t.dt).map(t => t.mt - t.dt);
            return {
                target: i + 1, n: hits.length,
                decision: median(decision), decisionLow: quantile(decision, 0.25), decisionHigh: quantile(decision, 0.75),
                movement: median(movement), movementLow: quantile(movement, 0.25), movementHigh: quantile(movement, 0.75),
                total: median(total)
            };
        });
    }

    function niceMax(value) {
        if (!(value > 0)) return 1;
        const power = 10 ** Math.floor(Math.log10(value));
        const unit = [1, 2, 2.5, 5, 10].find(u => u * power >= value);
        return unit * power;
    }

    function text(ctx, value, x, y, color, size, align, weight) {
        ctx.fillStyle = color;
        ctx.font = `${weight || 400} ${size || 12}px ${FONT}`;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(value, x, y);
    }

    function header(ctx, width, data, theme, title, lines) {
        text(ctx, title, 0, 18, theme.text, 16, 'left', 600);
        lines.forEach((line, i) => text(ctx, line, 0, 38 + i * 18, theme.muted, 13));
        text(ctx, data.session, width, 18, theme.muted, 13, 'right');
        return 38 + lines.length * 18 + 4;
    }

    function panels(width, count) {
        const cols = Math.min(Math.max(1, count), 4);
        const gap = 24;
        const w = Math.min(PANEL_MAX, (width - gap * (cols - 1)) / cols);
        return { cols, gap, w, rows: Math.ceil(Math.max(1, count) / cols), at: (i) => ({ x: (i % cols) * (w + gap), row: Math.floor(i / cols) }) };
    }

    function yAxis(ctx, x, y, w, h, max, theme, format) {
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const py = Math.round(y + h - (h * i) / 4) + 0.5;
            ctx.strokeStyle = theme.grid;
            ctx.beginPath();
            ctx.moveTo(x, py);
            ctx.lineTo(x + w, py);
            ctx.stroke();
            text(ctx, format((max * i) / 4), x - 6, py + 4, theme.muted, 12, 'right');
        }
    }

    function legend(ctx, width, y, theme, items) {
        let x = width;
        items.slice().reverse().forEach(item => {
            ctx.font = `400 13px ${FONT}`;
            const w = ctx.measureText(item.label).width;
            x -= w;
            text(ctx, item.label, x, y, theme.text, 13);
            x -= 22;
            if (item.line) {
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 2;
                ctx.setLineDash(item.dash || []);
                ctx.beginPath();
                ctx.moveTo(x, y - 4);
                ctx.lineTo(x + 18, y - 4);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.fillStyle = item.color;
                ctx.fillRect(x + 4, y - 9, 10, 10);
            }
            x -= 14;
        });
    }

    function axisTitleY(ctx, value, x, y, theme) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 2);
        text(ctx, value, 0, 0, theme.text, 13, 'center');
        ctx.restore();
    }

    const cm2 = (v) => `${Math.round(v).toLocaleString('en-GB')}`;
    const MAP = { left: 58, gap: 34, right: 12, maxScale: 8, minScale: 2.5, rowHead: 50, axis: 44, note: 18 };

    function mapLayout(width, data, opts) {
        const span = { x: [Infinity, -Infinity], f: [Infinity, -Infinity], h: [Infinity, -Infinity] };
        const grow = (k, v) => {
            span[k][0] = Math.min(span[k][0], v);
            span[k][1] = Math.max(span[k][1], v);
        };
        data.runs.forEach(run => {
            const top = shape2D(run, 'top', opts.shape), side = shape2D(run, 'side', opts.shape);
            [top.left, top.right].forEach(s => s.edge.forEach(p => { grow('x', p.x); grow('f', p.y); }));
            [side.left, side.right].forEach(s => s.edge.forEach(p => { grow('f', p.x); grow('h', p.y); }));
            const m = marks(run);
            m.targets.concat(m.homes).forEach(p => { grow('x', p.x); grow('f', p.f); grow('h', p.h); });
        });
        const has = span.x[0] !== Infinity;
        const lim = has ? { x: outward(...span.x), f: outward(...span.f), h: outward(...span.h) } : { x: [-50, 50], f: [-10, 40], h: [-10, 50] };
        const sx = lim.x[1] - lim.x[0], sf = lim.f[1] - lim.f[0], sh = lim.h[1] - lim.h[0];
        const S = Math.max(MAP.minScale, Math.min(MAP.maxScale, (width - MAP.left * 2 - MAP.gap - MAP.right) / (sx + sf)));
        const plotH = Math.max(sf, sh) * S;
        return { has, lim, S, topW: sx * S, sideW: sf * S, plotH, rowH: MAP.rowHead + plotH + MAP.axis + MAP.note };
    }

    function drawOverlay(ctx, gx, gy, left, right, theme, paths) {
        const path = (edge) => {
            ctx.beginPath();
            edge.forEach((p, i) => (i ? ctx.lineTo(gx(p.x), gy(p.y)) : ctx.moveTo(gx(p.x), gy(p.y))));
            ctx.closePath();
        };
        ctx.globalAlpha = 0.22;
        if (left.edge.length) { ctx.fillStyle = theme.left; path(left.edge); ctx.fill(); }
        if (right.edge.length) { ctx.fillStyle = theme.right; path(right.edge); ctx.fill(); }
        ctx.globalAlpha = 1;
        if (left.edge.length && right.edge.length) {
            ctx.save();
            path(left.edge);
            ctx.clip();
            ctx.fillStyle = theme.bg;
            path(right.edge);
            ctx.fill();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = theme.overlap;
            path(right.edge);
            ctx.fill();
            ctx.restore();
        }
        paths.forEach(([frames, color, a, b]) => {
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            for (let i = 0; i < frames.count; i++) {
                const x = gx(frames.pts[i * 3 + a]), y = gy(frames.pts[i * 3 + b]);
                if (frames.breaks[i]) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
        ctx.lineWidth = 2;
        if (left.edge.length) { ctx.strokeStyle = theme.left; path(left.edge); ctx.stroke(); }
        if (right.edge.length) { ctx.strokeStyle = theme.right; path(right.edge); ctx.stroke(); }
    }

    function mapPlot(ctx, X, Y, limX, limY, S, xTitle, yTitle, theme) {
        const w = (limX[1] - limX[0]) * S, h = (limY[1] - limY[0]) * S;
        const gx = (v) => X + (v - limX[0]) * S, gy = (v) => Y + h - (v - limY[0]) * S;
        ctx.lineWidth = 1;
        ctx.strokeStyle = theme.grid;
        const skip = S < 4.5 ? 20 : 10;
        for (let v = limX[0]; v <= limX[1]; v += skip) {
            ctx.beginPath();
            ctx.moveTo(gx(v) + 0.5, Y);
            ctx.lineTo(gx(v) + 0.5, Y + h);
            ctx.stroke();
            text(ctx, String(v), gx(v), Y + h + 16, theme.muted, 12, 'center');
        }
        for (let v = limY[0]; v <= limY[1]; v += skip) {
            ctx.beginPath();
            ctx.moveTo(X, gy(v) + 0.5);
            ctx.lineTo(X + w, gy(v) + 0.5);
            ctx.stroke();
            text(ctx, String(v), X - 6, gy(v) + 4, theme.muted, 12, 'right');
        }
        text(ctx, xTitle, X + w / 2, Y + h + 35, theme.text, 13, 'center');
        axisTitleY(ctx, yTitle, X - 42, Y + h / 2, theme);
        return { gx, gy, w, h };
    }

    function seriesLine(ctx, box, points, max, color, theme, hits, tip, dash) {
        const py = (v) => box.y + box.h - (box.h * v) / max;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        let down = false;
        points.forEach(p => {
            if (p.value === null) {
                down = false;
                return;
            }
            if (down) ctx.lineTo(p.x, py(p.value));
            else ctx.moveTo(p.x, py(p.value));
            down = true;
        });
        ctx.stroke();
        ctx.setLineDash([]);
        points.forEach(p => {
            if (p.value === null) return;
            ctx.beginPath();
            ctx.arc(p.x, py(p.value), 3.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = theme.bg;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            hits.push({ x: p.x - 7, y: py(p.value) - 7, w: 14, h: 14, text: tip(p) });
        });
    }

    function referenceLine(ctx, box, y, theme) {
        ctx.strokeStyle = theme.muted;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.w, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    const SESSION_H = 420;
    const LINE_H = 240;
    const QUALITY_RUN_H = 195;
    const PANEL_MAX = 720;
    const TARGET_TITLE = 'Target (1 = far left, 11 = far right)';

    function sessionPlot(ctx, width, top, data, theme, hits, cfg) {
        const box = { x: 66, y: top + 30, w: width - 74, h: SESSION_H - top - 30 - 54 };
        const trials = data.runs.map(r => r.trials.length);
        const total = trials.reduce((a, b) => a + b, 0);
        const sets = data.runs.map(cfg.sets);
        const max = cfg.max(sets.flat());
        yAxis(ctx, box.x, box.y, box.w, box.h, max, theme, cfg.format);
        axisTitleY(ctx, cfg.yTitle, 14, box.y + box.h / 2, theme);
        if (!sets.flat().length) {
            text(ctx, 'Not enough trials to plot', box.x + box.w / 2, box.y + box.h / 2, theme.muted, 13, 'center');
            return;
        }
        const px = (trial) => box.x + (box.w * trial) / total;
        if (cfg.reference !== undefined) referenceLine(ctx, box, box.y + box.h - (box.h * cfg.reference) / max, theme);
        let offset = 0;
        data.runs.forEach((run, i) => {
            const x0 = px(offset), x1 = px(offset + trials[i]);
            const at = offset;
            if (i % 2) {
                ctx.globalAlpha = 0.05;
                ctx.fillStyle = theme.text;
                ctx.fillRect(x0, box.y - 26, x1 - x0, box.h + 26);
                ctx.globalAlpha = 1;
            }
            const note = `${run.label}${run.recentres.length ? `, recentred ${run.recentres.length}×` : ''}`;
            ctx.font = `600 13px ${FONT}`;
            text(ctx, ctx.measureText(note).width < x1 - x0 - 12 ? note : `Run ${run.run}`, x0 + 6, box.y - 10, run.recentres.length ? theme.warn : theme.text, 13, 'left', 600);
            cfg.lines.forEach(line => {
                const points = sets[i].map(s => ({ x: px(at + (s.first + s.last) / 2), s, value: s[line.key] }));
                seriesLine(ctx, box, points, max, line.color, theme, hits, (p) => `Trials ${at + p.s.first}–${at + p.s.last}: ${line.tip(p.s, p.value)}`);
            });
            offset += trials[i];
        });
        const step = [22, 44, 88, 110, 176, 352, 704, 1408].find(v => total / v <= 8) || 2816;
        for (let v = 0; v <= total; v += step) text(ctx, String(v), px(v), box.y + box.h + 18, theme.muted, 12, 'center');
        text(ctx, 'Trial number (across the session)', box.x + box.w / 2, box.y + box.h + 40, theme.text, 13, 'center');
    }

    const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

    const CHARTS = {
        workspaceMap: {
            title: 'Workspace map',
            height: (width, data, opts) => 80 + data.runs.length * mapLayout(width, data, opts).rowH,
            draw: (ctx, width, data, opts, theme, hits) => {
                const top = header(ctx, width, data, theme, 'Workspace map', ['Fingertip positions recorded while a target was active, viewed from above and from the side.', `Gaps filled up to ${opts.shape.gap2D} cm; smoothing ${opts.shape.smooth2D} cm. Dots show targets; dashed lines show home positions.`]);
                legend(ctx, width, 38, theme, [{ label: 'Left hand', color: theme.left }, { label: 'Right hand', color: theme.right }, { label: 'Overlap', color: theme.overlap }]);
                const L = mapLayout(width, data, opts);
                data.runs.forEach((run, i) => {
                    const Y = top + 6 + i * L.rowH;
                    const a = shape2D(run, 'top', opts.shape), b = shape2D(run, 'side', opts.shape);
                    const m = marks(run);
                    const X1 = MAP.left, X2 = MAP.left + L.topW + MAP.gap + MAP.left;
                    const plotY = Y + MAP.rowHead;
                    text(ctx, `${run.label}, from above`, X1 - 58, Y + 14, theme.text, 14, 'left', 600);
                    text(ctx, `Total ${cm2(a.total)} cm²`, X1 + L.topW, Y + 14, theme.text, 14, 'right', 700);
                    text(ctx, `Left ${cm2(a.left.area)}; right ${cm2(a.right.area)}; overlap ${cm2(a.overlap)}${m.radius ? `; target distance ${Math.round(m.radius)} cm` : ''}`, X1 + L.topW, Y + 33, theme.muted, 13, 'right');
                    text(ctx, 'From the side', X2 - 58, Y + 14, theme.text, 14, 'left', 600);
                    text(ctx, `Total ${cm2(b.total)} cm²`, X2 + L.sideW, Y + 14, theme.text, 14, 'right', 700);
                    text(ctx, `Left ${cm2(b.left.area)}; right ${cm2(b.right.area)}`, X2 + L.sideW, Y + 33, theme.muted, 13, 'right');
                    const P = mapPlot(ctx, X1, plotY, L.lim.x, L.lim.f, L.S, 'Left–right of home centre (cm)', 'Forward of home (cm)', theme);
                    drawOverlay(ctx, P.gx, P.gy, a.left, a.right, theme, [[framesOf(run, 'L'), theme.left, 0, 2], [framesOf(run, 'R'), theme.right, 0, 2]]);
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(X1, plotY, P.w, P.h);
                    ctx.clip();
                    ctx.strokeStyle = theme.muted;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 3]);
                    m.homes.forEach(h => ctx.strokeRect(P.gx(h.x - data.homeHalf * 100), P.gy(h.f + 11), data.homeHalf * 200 * L.S, 22 * L.S));
                    ctx.setLineDash([]);
                    ctx.restore();
                    m.targets.forEach(t => {
                        ctx.beginPath();
                        ctx.arc(P.gx(t.x), P.gy(t.f), 3, 0, Math.PI * 2);
                        ctx.fillStyle = theme.text;
                        ctx.fill();
                        text(ctx, String(t.n), P.gx(t.x), P.gy(t.f) - 7, theme.text, 10, 'center');
                        hits.push({ x: P.gx(t.x) - 7, y: P.gy(t.f) - 7, w: 14, h: 14, text: `Target ${t.n}: horizontal position ${Math.round(t.x)} cm, forward position ${Math.round(t.f)} cm` });
                    });
                    const Q = mapPlot(ctx, X2, plotY, L.lim.f, L.lim.h, L.S, 'Forward of home (cm)', 'Height above home (cm)', theme);
                    drawOverlay(ctx, Q.gx, Q.gy, b.left, b.right, theme, [[framesOf(run, 'L'), theme.left, 2, 1], [framesOf(run, 'R'), theme.right, 2, 1]]);
                    m.targets.forEach(t => {
                        ctx.beginPath();
                        ctx.arc(Q.gx(t.f), Q.gy(t.h), 3, 0, Math.PI * 2);
                        ctx.fillStyle = theme.text;
                        ctx.fill();
                    });
                    m.homes.forEach(h => {
                        ctx.strokeStyle = theme.text;
                        ctx.lineWidth = 1.2;
                        ctx.setLineDash([3, 2]);
                        ctx.beginPath();
                        ctx.arc(Q.gx(h.f), Q.gy(h.h), 4.5, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    });
                    if (m.targets.length) {
                        const far = m.targets.reduce((n, t) => (t.f > n.f ? t : n));
                        ctx.font = `600 12px ${FONT}`;
                        const fits = Q.gx(far.f) + 8 + ctx.measureText('Targets').width <= X2 + L.sideW;
                        if (fits) text(ctx, 'Targets', Q.gx(far.f) + 8, Q.gy(far.h) - 6, theme.text, 12, 'left', 600);
                        else text(ctx, 'Targets', X2 + L.sideW, Q.gy(far.h) - 10, theme.text, 12, 'right', 600);
                    }
                    if (m.homes.length) text(ctx, 'Home', Q.gx(Math.min(...m.homes.map(h => h.f))), Q.gy(m.homes[0].h) + 20, theme.text, 12, 'center', 600);
                    if (run.recentres.length) text(ctx, `The headset was recentred ${run.recentres.length}× during this run. Positions recorded before and after may not align.`, X1 - 58, plotY + L.plotH + MAP.axis + 10, theme.warn, 12);
                });
            }
        },
        workspaceTime: {
            title: 'Workspace over time',
            height: () => SESSION_H,
            draw: (ctx, width, data, opts, theme, hits) => {
                const top = header(ctx, width, data, theme, 'Workspace over time', [`Workspace area viewed from above, calculated in groups of ${SET_SIZE} trials. Gap filling: ${opts.shape.gap2D} cm; smoothing: ${opts.shape.smooth2D} cm.`]);
                legend(ctx, width, 38, theme, [{ label: 'Left hand', color: theme.left, line: true }, { label: 'Right hand', color: theme.right, line: true }, { label: 'Total', color: theme.text, line: true }]);
                const tip = (name) => (s, v) => `${name} ${cm2(v)} cm²`;
                sessionPlot(ctx, width, top, data, theme, hits, {
                    sets: (run) => workspaceSets(run, opts.shape),
                    max: (all) => niceMax(Math.max(1, ...all.map(s => s.total))),
                    format: v => Math.round(v).toLocaleString('en-GB'),
                    yTitle: 'Area (cm²)',
                    lines: [{ key: 'total', color: theme.text, tip: tip('total') }, { key: 'left', color: theme.left, tip: tip('left') }, { key: 'right', color: theme.right, tip: tip('right') }]
                });
            }
        },
        handChoice: {
            title: 'Hand choice by target',
            height: (width, data) => 70 + panels(width, data.runs.length).rows * (LINE_H + 94),
            draw: (ctx, width, data, opts, theme, hits) => {
                const top = header(ctx, width, data, theme, 'Hand choice by target', [`Hand used to hit each target. Dominant hand: ${data.dominant}.`]);
                legend(ctx, width, 38, theme, [{ label: 'Left hand', color: theme.left }, { label: 'Right hand', color: theme.right }]);
                const p = panels(width, data.runs.length);
                data.runs.forEach((run, i) => {
                    const at = p.at(i);
                    const y0 = top + at.row * (LINE_H + 94);
                    text(ctx, run.label, at.x, y0 + 14, theme.text, 14, 'left', 600);
                    const box = { x: at.x + 58, y: y0 + 26, w: p.w - 64, h: LINE_H };
                    yAxis(ctx, box.x, box.y, box.w, box.h, 100, theme, v => String(v));
                    axisTitleY(ctx, 'Share of hits (%)', at.x + 14, box.y + box.h / 2, theme);
                    const rows = handChoice(run);
                    const slot = box.w / TARGETS;
                    const barW = Math.max(3, slot - 4);
                    rows.forEach((row, t) => {
                        const n = row.L + row.R;
                        const x = box.x + t * slot + 2;
                        text(ctx, String(row.target), x + barW / 2, box.y + box.h + 17, theme.muted, 12, 'center');
                        text(ctx, String(n), x + barW / 2, box.y + box.h + 34, theme.muted, 11, 'center');
                        if (!n) return;
                        const lh = (box.h * row.L) / n;
                        ctx.fillStyle = theme.left;
                        ctx.fillRect(x, box.y + box.h - lh, barW, Math.max(0, lh - (row.R ? 1 : 0)));
                        ctx.fillStyle = theme.right;
                        ctx.fillRect(x, box.y, barW, Math.max(0, box.h - lh - (row.L ? 1 : 0)));
                        hits.push({ x, y: box.y, w: barW, h: box.h, text: `Target ${row.target}: left ${row.L} (${Math.round(100 * row.L / n)}%), right ${row.R} (${Math.round(100 * row.R / n)}%)` });
                    });
                    referenceLine(ctx, box, box.y + box.h / 2, theme);
                    text(ctx, 'Hits', box.x - 6, box.y + box.h + 34, theme.muted, 11, 'right');
                    text(ctx, TARGET_TITLE, box.x + box.w / 2, box.y + box.h + 54, theme.text, 13, 'center');
                });
            }
        },
        handUse: {
            title: 'Hand use across session',
            height: () => SESSION_H,
            draw: (ctx, width, data, opts, theme, hits) => {
                const top = header(ctx, width, data, theme, 'Hand use across session', [`Percentage of hits made with the non-dominant hand, calculated in groups of ${SET_SIZE} trials. Dominant hand: ${data.dominant}.`]);
                sessionPlot(ctx, width, top, data, theme, hits, {
                    sets: (run) => handUseSets(run, data.dominantCode),
                    max: () => 100,
                    reference: 50,
                    format: v => String(v),
                    yTitle: 'Non-dominant hand (% of hits)',
                    lines: [{ key: 'value', color: data.dominantCode === 'LEFT' ? theme.right : theme.left, tip: (s, v) => `${Math.round(v)}% of ${s.n} hits` }]
                });
            }
        },
        times: {
            title: 'Decision and movement time by target',
            height: (width, data) => 88 + panels(width, data.runs.length).rows * (LINE_H + 76),
            draw: (ctx, width, data, opts, theme, hits) => {
                const top = header(ctx, width, data, theme, 'Decision and movement time by target', ['Median time for each target, using successful hits only. Shaded bands show the middle 50% of trials.', 'Decision time: from target appearance to leaving home. Movement time: from leaving home to target hit.']);
                legend(ctx, width, 38, theme, [{ label: 'Movement time', color: theme.text, line: true }, { label: 'Decision time', color: theme.muted, line: true, dash: [5, 4] }]);
                const p = panels(width, data.runs.length);
                const rows = data.runs.map(timesByTarget);
                const max = niceMax(Math.max(1, ...rows.flat().flatMap(r => [r.decisionHigh || 0, r.movementHigh || 0])));
                data.runs.forEach((run, i) => {
                    const at = p.at(i);
                    const y0 = top + at.row * (LINE_H + 76);
                    text(ctx, run.label, at.x, y0 + 14, theme.text, 14, 'left', 600);
                    const box = { x: at.x + 62, y: y0 + 26, w: p.w - 68, h: LINE_H };
                    yAxis(ctx, box.x, box.y, box.w, box.h, max, theme, v => Math.round(v).toLocaleString('en-GB'));
                    axisTitleY(ctx, 'Time (ms)', at.x + 14, box.y + box.h / 2, theme);
                    const px = (t) => box.x + box.w * (t + 0.5) / TARGETS;
                    const py = (v) => box.y + box.h - (box.h * v) / max;
                    const band = (low, high, color) => {
                        const list = rows[i].map((r, t) => ({ x: px(t), lo: r[low], hi: r[high] })).filter(q => q.lo !== null);
                        if (!list.length) return;
                        ctx.globalAlpha = 0.16;
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        list.forEach((q, k) => (k ? ctx.lineTo(q.x, py(q.hi)) : ctx.moveTo(q.x, py(q.hi))));
                        list.slice().reverse().forEach(q => ctx.lineTo(q.x, py(q.lo)));
                        ctx.closePath();
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    };
                    band('decisionLow', 'decisionHigh', theme.muted);
                    band('movementLow', 'movementHigh', theme.text);
                    const points = (key) => rows[i].map((r, t) => ({ x: px(t), r, value: r[key] }));
                    const tip = (name) => (q) => `Target ${q.r.target}: ${name} ${Math.round(q.value)} ms, ${q.r.n} hits`;
                    seriesLine(ctx, box, points('movement'), max, theme.text, theme, hits, tip('movement'));
                    seriesLine(ctx, box, points('decision'), max, theme.muted, theme, hits, tip('decision'), [5, 4]);
                    rows[i].forEach((r, t) => text(ctx, String(r.target), px(t), box.y + box.h + 18, theme.muted, 12, 'center'));
                    text(ctx, TARGET_TITLE, box.x + box.w / 2, box.y + box.h + 40, theme.text, 13, 'center');
                });
            }
        },
        quality: {
            title: 'Data quality timeline',
            height: (width, data) => 66 + data.runs.length * QUALITY_RUN_H,
            draw: (ctx, width, data, opts, theme, hits) => {
                const top = header(ctx, width, data, theme, 'Data quality timeline', ['Each block represents part of a run. Amber and red indicate potential data-quality problems. Hover to see the value.']);
                data.runs.forEach((run, i) => {
                    const y0 = top + 6 + i * QUALITY_RUN_H;
                    text(ctx, run.label, 0, y0 + 14, theme.text, 14, 'left', 600);
                    const q = run.quality;
                    if (!q || !q.lines.length) {
                        text(ctx, 'No data', 0, y0 + 36, theme.muted, 13);
                        return;
                    }
                    const left = 130, right = 84;
                    const w = width - left - right;
                    text(ctx, 'Whole run', width, y0 + 14, theme.muted, 12, 'right');
                    q.lines.forEach((line, row) => {
                        const y = y0 + 24 + row * 27;
                        text(ctx, line.label, 0, y + 15, theme.text, 13);
                        const cell = w / line.kinds.length;
                        line.kinds.forEach((kind, c) => {
                            const x = left + c * cell;
                            ctx.fillStyle = theme[kind] || theme.none;
                            ctx.fillRect(x, y, Math.max(1, cell - 2), 21);
                            hits.push({ x, y, w: cell, h: 21, text: line.tips[c] });
                        });
                        text(ctx, line.summary, width, y + 15, theme.text, 13, 'right', 600);
                    });
                    const yAxisEnd = y0 + 24 + q.lines.length * 27;
                    const seconds = (q.ms || 0) / 1000;
                    const step = [15, 30, 60, 120, 300, 600, 1200].find(v => seconds / v <= 8) || 2400;
                    if (seconds > 0) for (let v = 0; v <= seconds; v += step) text(ctx, clock(v * 1000), left + (w * v) / seconds, yAxisEnd + 13, theme.muted, 12, v ? 'center' : 'left');
                    text(ctx, 'Time in run (min:s)', left + w / 2, yAxisEnd + 33, theme.text, 13, 'center');
                });
            }
        }
    };

    function render(canvas, id, data, opts, themeName, width, scale) {
        const chart = CHARTS[id];
        const theme = THEMES[themeName];
        const inner = width - PAD * 2;
        const height = Math.ceil(chart.height(inner, data, opts)) + PAD * 2;
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, width, height);
        ctx.translate(PAD, PAD);
        const hits = [];
        chart.draw(ctx, inner, data, opts, theme, hits);
        return hits.map(h => Object.assign(h, { x: h.x + PAD, y: h.y + PAD }));
    }

    const IDS = Object.keys(CHARTS);
    const titleOf = (id) => CHARTS[id].title;
    return { IDS, titleOf, parseRun, trialSets, workspaceSets, handUseSets, handChoice, timesByTarget, median, render, shape2D, shape3D, view3D, limits3D, framesOf, marks, SHAPE_DEFAULT, SHAPE_OPTIONS };
})();

const WorkspaceShape = (() => {
    const THIN = 5;
    const ROW = 0.2;
    const DRAW_SMOOTH = 0.8;

    function thin(flat) {
        const seen = new Set();
        const xs = [], ys = [];
        for (let i = 0; i < flat.length; i += 2) {
            const key = (Math.round(flat[i] * THIN) + 50000) * 200000 + Math.round(flat[i + 1] * THIN) + 50000;
            if (seen.has(key)) continue;
            seen.add(key);
            xs.push(flat[i]);
            ys.push(flat[i + 1]);
        }
        return { xs, ys };
    }

    const binKey = (a, b) => (a + 50000) * 200000 + b + 50000;

    function mainBody({ xs, ys }, radius) {
        const reach = 2 * radius;
        const side = reach / Math.SQRT2;
        const cells = new Map();
        xs.forEach((x, i) => {
            const a = Math.floor(x / side), b = Math.floor(ys[i] / side);
            const key = binKey(a, b);
            if (!cells.has(key)) cells.set(key, { a, b, list: [], seen: false });
            cells.get(key).list.push(i);
        });
        const linked = (p, q) => {
            for (const i of p.list) for (const j of q.list) if (Math.hypot(xs[i] - xs[j], ys[i] - ys[j]) <= reach) return true;
            return false;
        };
        let best = [];
        cells.forEach(cell => {
            if (cell.seen) return;
            cell.seen = true;
            const group = [];
            const stack = [cell];
            while (stack.length) {
                const c = stack.pop();
                c.list.forEach(i => group.push(i));
                for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
                    const n = cells.get(binKey(c.a + i, c.b + j));
                    if (n && !n.seen && linked(c, n)) {
                        n.seen = true;
                        stack.push(n);
                    }
                }
            }
            if (group.length > best.length) best = group;
        });
        return { xs: best.map(i => xs[i]), ys: best.map(i => ys[i]) };
    }

    function roll({ xs, ys }, radius) {
        const size = 2 * radius;
        const bins = new Map();
        xs.forEach((x, i) => {
            const key = binKey(Math.floor(x / size), Math.floor(ys[i] / size));
            if (!bins.has(key)) bins.set(key, []);
            bins.get(key).push(i);
        });
        let start = 0;
        ys.forEach((y, i) => { if (y > ys[start]) start = i; });
        let cur = start;
        let cx = xs[start], cy = ys[start] + radius;
        const edge = [start];
        const walked = new Set();
        const TAU = Math.PI * 2;
        for (;;) {
            const from = Math.atan2(cy - ys[cur], cx - xs[cur]);
            const a = Math.floor(xs[cur] / size), b = Math.floor(ys[cur] / size);
            let best = -1, bestTurn = Infinity, bestX = 0, bestY = 0;
            for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) {
                const list = bins.get(binKey(i, j));
                if (!list) continue;
                for (const q of list) {
                    const dx = xs[q] - xs[cur], dy = ys[q] - ys[cur];
                    const d = Math.hypot(dx, dy);
                    if (q === cur || d > size || d < 1e-9) continue;
                    const h = Math.sqrt(Math.max(0, radius * radius - d * d / 4));
                    const mx = xs[cur] + dx / 2, my = ys[cur] + dy / 2;
                    for (const side of [1, -1]) {
                        const px = mx - side * dy / d * h, py = my + side * dx / d * h;
                        let turn = (Math.atan2(py - ys[cur], px - xs[cur]) - from) % TAU;
                        if (turn < 0) turn += TAU;
                        if (turn < 1e-7) turn += TAU;
                        if (turn < bestTurn) {
                            bestTurn = turn;
                            best = q;
                            bestX = px;
                            bestY = py;
                        }
                    }
                }
            }
            if (best < 0) break;
            const step = cur * 1e7 + best;
            if (walked.has(step)) break;
            walked.add(step);
            cur = best;
            cx = bestX;
            cy = bestY;
            if (cur === start) break;
            edge.push(cur);
        }
        return edge.map(i => ({ x: xs[i], y: ys[i] }));
    }

    function soften(edge, sigma) {
        const n = edge.length;
        const spacing = Math.min(0.25, sigma / 2);
        const lens = [0];
        edge.forEach((p, i) => {
            const q = edge[(i + 1) % n];
            lens.push(lens[i] + Math.hypot(q.x - p.x, q.y - p.y));
        });
        const total = lens[n];
        const m = Math.max(8, Math.round(total / spacing));
        const even = [];
        let k = 0;
        for (let i = 0; i < m; i++) {
            const s = total * i / m;
            while (lens[k + 1] < s) k++;
            const f = (s - lens[k]) / Math.max(1e-9, lens[k + 1] - lens[k]);
            const a = edge[k], b = edge[(k + 1) % n];
            even.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        }
        const step = total / m;
        const r = Math.ceil(sigma * 3 / step);
        const w = [];
        for (let i = -r; i <= r; i++) w.push(Math.exp(-((i * step) ** 2) / (2 * sigma * sigma)));
        const sum = w.reduce((a, b) => a + b, 0);
        return even.map((_, i) => {
            let x = 0, y = 0;
            for (let j = -r; j <= r; j++) {
                const p = even[(((i + j) % m) + m) % m];
                x += p.x * w[j + r];
                y += p.y * w[j + r];
            }
            return { x: x / sum, y: y / sum };
        });
    }

    function polygonArea(poly) {
        let a = 0;
        poly.forEach((p, i) => {
            const q = poly[(i + 1) % poly.length];
            a += p.x * q.y - q.x * p.y;
        });
        return Math.abs(a / 2);
    }

    function spansOf(poly) {
        const rows = new Map();
        poly.forEach((p, i) => {
            const q = poly[(i + 1) % poly.length];
            if (p.y === q.y) return;
            const lo = Math.min(p.y, q.y), hi = Math.max(p.y, q.y);
            for (let r = Math.ceil(lo / ROW); r * ROW < hi; r++) {
                if (!rows.has(r)) rows.set(r, []);
                rows.get(r).push(p.x + (q.x - p.x) * (r * ROW - p.y) / (q.y - p.y));
            }
        });
        rows.forEach(list => list.sort((a, b) => a - b));
        return rows;
    }

    function overlapArea(a, b) {
        if (!a.length || !b.length) return 0;
        const ra = spansOf(a), rb = spansOf(b);
        let length = 0;
        ra.forEach((list, r) => {
            const other = rb.get(r);
            if (!other) return;
            let i = 0, j = 0;
            while (i + 1 < list.length && j + 1 < other.length) {
                length += Math.max(0, Math.min(list[i + 1], other[j + 1]) - Math.max(list[i], other[j]));
                if (list[i + 1] < other[j + 1]) i += 2;
                else j += 2;
            }
        });
        return length * ROW;
    }

    function outsideShare(poly, flat) {
        const total = flat.length / 2;
        if (!total) return 0;
        if (!poly.length) return 1;
        const rows = spansOf(poly);
        let out = 0;
        for (let i = 0; i < flat.length; i += 2) {
            const list = rows.get(Math.round(flat[i + 1] / ROW));
            let inside = false;
            if (list) for (let k = 0; k + 1 < list.length; k += 2) if (flat[i] >= list[k] && flat[i] <= list[k + 1]) inside = true;
            if (!inside) out++;
        }
        return out / total;
    }

    function trace(flat, gap, smooth) {
        if (flat.length < 6) return { edge: [], area: 0, outside: flat.length ? 1 : 0 };
        const radius = gap / 2;
        const raw = roll(mainBody(thin(flat), radius), radius);
        if (raw.length < 3) return { edge: [], area: 0, outside: 1 };
        const edge = soften(raw, smooth);
        return { edge, area: polygonArea(edge), outside: outsideShare(edge, flat) };
    }

    function gridOf(sets, margin) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        sets.forEach(flat => {
            for (let i = 0; i < flat.length; i += 3) for (let k = 0; k < 3; k++) {
                if (flat[i + k] < lo[k]) lo[k] = flat[i + k];
                if (flat[i + k] > hi[k]) hi[k] = flat[i + k];
            }
        });
        if (lo[0] === Infinity) return null;
        const o = lo.map(v => Math.floor(v) - margin);
        const n = hi.map((v, k) => Math.ceil(v) + margin - o[k] + 1);
        return { o, n, size: n[0] * n[1] * n[2] };
    }

    function distanceLine(f, off, step, len, v, z, g) {
        for (let i = 0; i < len; i++) g[i] = f[off + i * step];
        let k = 0;
        v[0] = 0;
        z[0] = -Infinity;
        z[1] = Infinity;
        for (let q = 1; q < len; q++) {
            let s;
            for (;;) {
                const p = v[k];
                s = ((g[q] + q * q) - (g[p] + p * p)) / (2 * (q - p));
                if (s > z[k]) break;
                k--;
            }
            k++;
            v[k] = q;
            z[k] = s;
            z[k + 1] = Infinity;
        }
        k = 0;
        for (let q = 0; q < len; q++) {
            while (z[k + 1] < q) k++;
            const p = v[k];
            f[off + q * step] = (q - p) * (q - p) + g[p];
        }
    }

    function distanceSquared(mask, grid) {
        const [X, Y, Z] = grid.n;
        const LARGE = 1e9;
        const f = new Float64Array(grid.size);
        for (let i = 0; i < f.length; i++) f[i] = mask[i] ? 0 : LARGE;
        const longest = Math.max(X, Y, Z);
        const v = new Int32Array(longest), z = new Float64Array(longest + 1), g = new Float64Array(longest);
        for (let c = 0; c < Z; c++) for (let b = 0; b < Y; b++) distanceLine(f, X * (b + Y * c), 1, X, v, z, g);
        for (let c = 0; c < Z; c++) for (let a = 0; a < X; a++) distanceLine(f, a + X * Y * c, X, Y, v, z, g);
        for (let b = 0; b < Y; b++) for (let a = 0; a < X; a++) distanceLine(f, a + X * b, X * Y, Z, v, z, g);
        return f;
    }

    function keepLargest(mask, grid) {
        const [X, Y] = grid.n;
        const steps = [1, -1, X, -X, X * Y, -X * Y];
        const seen = new Uint8Array(mask.length);
        let best = [];
        for (let i = 0; i < mask.length; i++) {
            if (!mask[i] || seen[i]) continue;
            const group = [i];
            seen[i] = 1;
            for (let h = 0; h < group.length; h++) {
                for (const s of steps) {
                    const w = group[h] + s;
                    if (w >= 0 && w < mask.length && mask[w] && !seen[w]) {
                        seen[w] = 1;
                        group.push(w);
                    }
                }
            }
            if (group.length > best.length) best = group;
        }
        const out = new Uint8Array(mask.length);
        best.forEach(i => { out[i] = 1; });
        return out;
    }

    function closedSolid(flat, grid, radius) {
        const [X, Y] = grid.n;
        const seed = new Uint8Array(grid.size);
        for (let i = 0; i < flat.length; i += 3) {
            seed[Math.round(flat[i] - grid.o[0]) + X * (Math.round(flat[i + 1] - grid.o[1]) + Y * Math.round(flat[i + 2] - grid.o[2]))] = 1;
        }
        const r2 = radius * radius;
        const near = distanceSquared(seed, grid);
        const outside = new Uint8Array(grid.size);
        const stack = [0];
        const steps = [1, -1, X, -X, X * Y, -X * Y];
        outside[0] = 1;
        while (stack.length) {
            const v = stack.pop();
            for (const s of steps) {
                const w = v + s;
                if (w >= 0 && w < grid.size && !outside[w] && near[w] > r2) {
                    outside[w] = 1;
                    stack.push(w);
                }
            }
        }
        const far = distanceSquared(outside, grid);
        const closed = new Uint8Array(grid.size);
        for (let i = 0; i < closed.length; i++) closed[i] = far[i] > r2 ? 1 : 0;
        return keepLargest(closed, grid);
    }

    function blurred(mask, grid, sigma) {
        const [X, Y, Z] = grid.n;
        const rad = Math.ceil(sigma * 3);
        const kern = [];
        for (let i = -rad; i <= rad; i++) kern.push(Math.exp(-i * i / (2 * sigma * sigma)));
        const sum = kern.reduce((a, b) => a + b, 0);
        const weights = kern.map(k => k / sum);
        let f = Float32Array.from(mask);
        const pass = (step, len, lines, lineStep, planes, planeStep) => {
            const g = new Float32Array(f.length);
            for (let p = 0; p < planes; p++) for (let l = 0; l < lines; l++) {
                const off = p * planeStep + l * lineStep;
                for (let q = 0; q < len; q++) {
                    let v = 0;
                    for (let k = -rad; k <= rad; k++) {
                        const t = q + k;
                        if (t >= 0 && t < len) v += f[off + t * step] * weights[k + rad];
                    }
                    g[off + q * step] = v;
                }
            }
            f = g;
        };
        pass(1, X, Y, X, Z, X * Y);
        pass(X, Y, X, 1, Z, X * Y);
        pass(X * Y, Z, X, 1, Y, X);
        return f;
    }

    const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const EDGES = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];

    function surface(f, grid) {
        const [X, Y, Z] = grid.n;
        const id = (a, b, c) => a + X * (b + Y * c);
        const vert = new Int32Array(f.length).fill(-1);
        const pos = [], idx = [];
        const v = new Float32Array(8);
        for (let c = 0; c < Z - 1; c++) for (let b = 0; b < Y - 1; b++) for (let a = 0; a < X - 1; a++) {
            let inside = 0;
            for (let k = 0; k < 8; k++) {
                const q = CORNERS[k];
                v[k] = f[id(a + q[0], b + q[1], c + q[2])] - 0.5;
                if (v[k] > 0) inside++;
            }
            if (inside === 0 || inside === 8) continue;
            let sx = 0, sy = 0, sz = 0, m = 0;
            for (const [p, q] of EDGES) {
                if ((v[p] > 0) === (v[q] > 0)) continue;
                const t = v[p] / (v[p] - v[q]);
                sx += CORNERS[p][0] + (CORNERS[q][0] - CORNERS[p][0]) * t;
                sy += CORNERS[p][1] + (CORNERS[q][1] - CORNERS[p][1]) * t;
                sz += CORNERS[p][2] + (CORNERS[q][2] - CORNERS[p][2]) * t;
                m++;
            }
            vert[id(a, b, c)] = pos.length / 3;
            pos.push(grid.o[0] + a + sx / m, grid.o[1] + b + sy / m, grid.o[2] + c + sz / m);
        }
        const quad = (p, q, r, s, flip) => {
            if (p < 0 || q < 0 || r < 0 || s < 0) return;
            if (flip) idx.push(p, r, q, p, s, r);
            else idx.push(p, q, r, p, r, s);
        };
        for (let c = 1; c < Z - 1; c++) for (let b = 1; b < Y - 1; b++) for (let a = 1; a < X - 1; a++) {
            const here = f[id(a, b, c)] > 0.5;
            if (here !== (f[id(a + 1, b, c)] > 0.5)) quad(vert[id(a, b - 1, c - 1)], vert[id(a, b, c - 1)], vert[id(a, b, c)], vert[id(a, b - 1, c)], !here);
            if (here !== (f[id(a, b + 1, c)] > 0.5)) quad(vert[id(a - 1, b, c - 1)], vert[id(a - 1, b, c)], vert[id(a, b, c)], vert[id(a, b, c - 1)], !here);
            if (here !== (f[id(a, b, c + 1)] > 0.5)) quad(vert[id(a - 1, b - 1, c)], vert[id(a, b - 1, c)], vert[id(a, b, c)], vert[id(a - 1, b, c)], !here);
        }
        return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
    }

    function meshVolume({ pos, idx }) {
        let v = 0;
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
            v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
                - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
                + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
        }
        return Math.abs(v / 6);
    }

    function relaxed({ pos, idx }, passes) {
        const count = pos.length / 3;
        const next = new Float32Array(pos);
        const sum = new Float32Array(pos.length);
        const links = new Uint16Array(count);
        for (let n = 0; n < passes; n++) {
            sum.fill(0);
            links.fill(0);
            for (let i = 0; i < idx.length; i += 3) {
                for (let e = 0; e < 3; e++) {
                    const a = idx[i + e], b = idx[i + (e + 1) % 3];
                    for (let k = 0; k < 3; k++) {
                        sum[a * 3 + k] += next[b * 3 + k];
                        sum[b * 3 + k] += next[a * 3 + k];
                    }
                    links[a]++;
                    links[b]++;
                }
            }
            for (let v = 0; v < count; v++) {
                if (!links[v]) continue;
                for (let k = 0; k < 3; k++) next[v * 3 + k] = 0.5 * next[v * 3 + k] + 0.5 * sum[v * 3 + k] / links[v];
            }
        }
        return next;
    }

    function outsideSolid(f, grid, flat) {
        const total = flat.length / 3;
        if (!total) return 0;
        const [X, Y] = grid.n;
        let out = 0;
        for (let i = 0; i < flat.length; i += 3) {
            if (f[Math.round(flat[i] - grid.o[0]) + X * (Math.round(flat[i + 1] - grid.o[1]) + Y * Math.round(flat[i + 2] - grid.o[2]))] <= 0.5) out++;
        }
        return out / total;
    }

    function solid(left, right, gap, smooth) {
        const radius = gap / 2;
        const grid = gridOf([left, right], Math.ceil(radius) + Math.ceil(smooth * 3) + 3);
        if (!grid) return null;
        const a = closedSolid(left, grid, radius), b = closedSolid(right, grid, radius);
        const both = new Uint8Array(grid.size), either = new Uint8Array(grid.size);
        for (let i = 0; i < grid.size; i++) {
            both[i] = a[i] & b[i];
            either[i] = a[i] | b[i];
        }
        const build = (mask, flat) => {
            const f = blurred(mask, grid, smooth);
            const measured = surface(f, grid);
            const volume = meshVolume(measured);
            let drawn = smooth < DRAW_SMOOTH ? surface(blurred(mask, grid, DRAW_SMOOTH), grid) : measured;
            if (meshVolume(drawn) < volume * 0.8) drawn = measured;
            return { idx: drawn.idx, pos: relaxed(drawn, 2), volume, drawnVolume: meshVolume(drawn), outside: flat ? outsideSolid(f, grid, flat) : 0 };
        };
        return { left: build(a, left), right: build(b, right), overlap: build(both), total: build(either).volume };
    }

    return { trace, overlapArea, polygonArea, outsideShare, solid };
})();

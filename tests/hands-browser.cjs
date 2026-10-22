const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('HANDS BROWSER');
const joints = (dx, side) => { const a = []; for (let i = 0; i < 25; i++) a.push(side * 0.2 + dx + i * 0.003, 0.95 + (i % 5) * 0.004, -0.3 - i * 0.004); return a; };
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  await p.clock.install();
  await p.goto('https://test.local/observer.html');
  await p.clock.runFor(500);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const L0 = joints(0, -1), R0 = joints(0, 1);
  const frame = (x) => E((f) => window.__peers.at(-1).conns.at(-1).emit('data', JSON.stringify(f)), Object.assign({ head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, left: L0, right: R0, leftValid: true, rightValid: true, activeSphere: 3, radius: 0.45, height: 1.2, score: 0, condition: 1, dominantHand: 'LEFT', fireMode: false, isPaused: false, trialCount: 0, totalTrials: 352, homePos: { x: 0, y: 0.9, z: -0.4 } }, x || {}));
  const tick = () => p.clock.runFor(34);
  const near = (a, b) => Math.abs(a - b) < 1e-5;
  const mode = (m) => E((x) => document.querySelector(`[data-set="hands"][data-val="${x}"]`).click(), m).then(tick);
  const trail = (m) => E((x) => { const q = (sel) => document.querySelector(sel).click(); if (x === '0') { q('[data-set="trails"][data-val="false"]'); return; } q('[data-set="trails"][data-val="true"]'); q(`[data-set="trailSeconds"][data-val="${x}"]`); }, m).then(tick);

  console.log('HANDS (Chromium)');
  ok(await E(() => !window.__obs.hands.L.root.visible && !window.__obs.hands.R.root.visible), 'no hands drawn before any hand data');
  await E(() => { const P = window.__peers[0]; P.serverOpen(); const c = P.conns.at(-1); c.open = true; c.emit('open'); });
  await frame(); await tick();

  const m = await E(() => { const h = window.__obs.hands.L; return { vis: [h.root.visible, h.mesh.visible, h.skeleton.visible, h.keys.visible], j: h.meshJoints.map(x => x.position.toArray()), r: h.meshJoints.map(x => x.geometry.parameters.radius), bones: h.meshBones.map(x => ({ p: x.position.toArray(), s: x.scale.y, up: [0, 1, 0].map((_, i) => { x.updateMatrix(); return x.matrix.elements[4 + i]; }) })), palm: Array.from(h.palm.geometry.attributes.position.array) }; });
  ok(m.vis.join() === 'true,true,false,false', 'default mode is Hand mesh');
  ok(m.j.every((q, i) => near(q[0], L0[i * 3]) && near(q[1], L0[i * 3 + 1]) && near(q[2], L0[i * 3 + 2])), 'mesh: 25 joint spheres at the streamed joints');
  ok(near(m.r[0], 0.009) && near(m.r[5], 0.009) && near(m.r[9], 0.006) && near(m.r[1], 0.009) && near(m.r[4], 0.006) && near(m.r[22], 0.0075), 'mesh: joint radii taper 9 mm (base) → 6 mm (tip)');
  const CH = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24]];
  const SEG = CH.flatMap(c => c.slice(1).map((j, i) => [c[i], j]));
  const J = (i) => [L0[i * 3], L0[i * 3 + 1], L0[i * 3 + 2]];
  ok(m.bones.length === 24 && SEG.every(([a, bb], k) => { const A = J(a), B = J(bb); const d = B.map((v, i) => v - A[i]); return m.bones[k].p.every((v, i) => near(v, A[i])) && m.bones[k].up.every((v, i) => near(v, d[i])); }), 'mesh: 24 tapered bones span every finger chain incl. metacarpals');
  ok([0, 6, 11, 0, 11, 16, 0, 16, 21].every((j, k) => [0, 1, 2].every(d => near(m.palm[k * 3 + d], L0[j * 3 + d]))), 'mesh: palm spans wrist → index/middle/ring/pinky metacarpal ends');

  await mode('skeleton');
  const s = await E(() => { const h = window.__obs.hands.L; return { vis: [h.mesh.visible, h.skeleton.visible, h.keys.visible], d: h.skelDots.map(x => x.position.toArray()), l: Array.from(h.skelLines.geometry.attributes.position.array) }; });
  ok(s.vis.join() === 'false,true,false', 'Skeleton mode shows only the skeleton');
  ok(s.d.every((q, i) => near(q[0], L0[i * 3]) && near(q[2], L0[i * 3 + 2])) && SEG.every(([a, bb], k) => near(s.l[k * 6], L0[a * 3]) && near(s.l[k * 6 + 5], L0[bb * 3 + 2])), 'skeleton: dots at joints, bone lines between them');

  await mode('keys');
  const k = await E(() => { const h = window.__obs.hands.L; return { vis: [h.mesh.visible, h.skeleton.visible, h.keys.visible], w: h.keyWrist.position.toArray(), t: h.keyTip.position.toArray(), l: Array.from(h.keyLine.geometry.attributes.position.array), n: h.keys.children.length }; });
  ok(k.vis.join() === 'false,false,true', 'Key points mode shows only key points');
  ok(k.w.every((v, i) => near(v, L0[i])) && k.t.every((v, i) => near(v, L0[27 + i])) && k.l.every((v, i) => near(v, i < 3 ? L0[i] : L0[24 + i])) && k.n === 3, 'key points: exactly joint 0 (wrist) and joint 9 (index tip), joined by a line');
  await mode('mesh');

  await frame({ left: null, leftValid: false }); await tick();
  const u = await E(() => { const o = window.__obs.hands; return { vis: o.L.root.visible, lc: o.L.mats.map(x => x.color.getHex()), rc: o.R.mats[0].color.getHex(), x: o.L.meshJoints[9].position.x }; });
  ok(u.vis && u.lc.every(c => c === 0x5a5f6b), 'untracked hand stays drawn, in untracked grey');
  ok(near(u.x, L0[27]), 'untracked hand keeps its last joints');
  ok(u.rc === 0x4f9dff || u.rc === 0xff9a3c, 'other hand keeps its colour');
  await frame(); await tick();
  ok(await E(() => window.__obs.hands.L.mats[0].color.getHex() === 0x4f9dff), 'hand regains its colour when tracked again');

  await frame({ left: [1, 2, 3] }); await frame({ left: joints(0, -1).map((v, i) => i === 4 ? null : v + 1) }); await tick();
  ok(await E((x) => Math.abs(window.__obs.hands.L.meshJoints[9].position.x - x) < 1e-6, L0[27]), 'malformed joint arrays ignored');

  let step = 0;
  const stream = async (n) => { for (let i = 0; i < n; i++) { await frame({ left: joints((step++) * 0.002, -1) }); await p.clock.runFor(33); } };
  const cnt = () => E(() => window.__obs.hands.L.trail.geometry.drawRange.count);
  await stream(70);
  const c1 = await cnt();
  ok(await E(() => window.__obs.hands.L.trail.visible) && c1 >= 28 && c1 <= 33, `trail on, 1 s ≈ 30 points at 30 Hz (${c1})`);
  ok(await E(() => { const h = window.__obs.hands.L; const a = h.trail.geometry.attributes.position.array; const n = h.trail.geometry.drawRange.count; return Math.abs(a[(n - 1) * 3] - h.pos[27]) < 1e-6; }), 'trail ends at the current index tip');
  await trail('0.5'); await stream(20); const c05 = await cnt();
  ok(c05 >= 13 && c05 <= 17, `trail 0.5 s (${c05})`);
  await trail('2'); await stream(70); const c2 = await cnt();
  ok(c2 >= 55 && c2 <= 62, `trail 2 s (${c2})`);
  await trail('0');
  ok(await E(() => !window.__obs.hands.L.trail.visible && !window.__obs.hands.R.trail.visible), 'trails Off hides them');
  await trail('1');
  await p.clock.runFor(1100);
  ok(await cnt() === 0, 'trail fades out within its length once data stops');
  for (let i = 0; i < 10; i++) { await frame(); await p.clock.runFor(33); }
  await E(() => window.__peers.at(-1).conns.at(-1).emit('data', JSON.stringify({ type: 'recentre', ok: true, reason: '' })));
  await tick();
  ok(await cnt() === 0, 'successful recentre clears trails (no line across the jump)');

  const f0 = await E(() => window.__obs.frames); await p.clock.runFor(200);
  ok(await E((x) => window.__obs.frames > x, f0), 'render loop running');
  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });

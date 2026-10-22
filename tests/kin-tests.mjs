import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const TOOLS = process.env.WS_TOOLS || 'C:\\Users\\ronan\\webspheres-tools';
const THREE = await import(pathToFileURL(path.join(TOOLS, 'node_modules', 'three', 'build', 'three.module.js')).href);
const NEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kinematics-manager.js'), OLD = path.join(process.env.WS_BASELINE || process.argv[2], 'kinematics-manager.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
globalThis.THREE = THREE;
let defs = {}; globalThis.AFRAME = { registerComponent: (n, d) => { defs[n] = d; } };
const load = f => { const s = fs.readFileSync(f, 'utf8'); defs = {}; eval(s); return defs['kinematics-manager']; };
const deg = THREE.MathUtils.degToRad;
const M = (p, q) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
function makeHand(wristM, tip) { const jp = new Float32Array(16 * 25); wristM.toArray(jp, 0); return { htc: { indexTipPosition: tip.clone(), hasPoses: true, jointPoses: jp }, tc: { controller: { hand: {} } } }; }
const handL = makeHand(M(new THREE.Vector3(-0.2, 0.95, -0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(10), deg(-30), deg(70), 'YXZ'))), new THREE.Vector3(-0.15, 1.0, -0.45));
const handR = makeHand(M(new THREE.Vector3(0.21, 0.97, -0.31), new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(-5), deg(25), deg(-80), 'YXZ'))), new THREE.Vector3(0.16, 1.01, -0.46));
const ctrlEl = h => ({ components: { 'hand-tracking-controls': h.htc, 'tracked-controls': h.tc } });
const L = ctrlEl(handL), R = ctrlEl(handR);
const camObj = new THREE.Object3D(); camObj.position.set(0.02, 1.21, 0.03); camObj.quaternion.setFromEuler(new THREE.Euler(deg(-25), deg(12), deg(3), 'YXZ'));
const rig = new THREE.Object3D(); rig.add(camObj); rig.updateMatrixWorld(true);
const home = { x: 0, y: 0.9, z: -0.4 };
const sphere = { getAttribute: () => ({ x: 0.1234567891234, y: 1.2, z: -0.43 }) };
const sm = { activeSphere: sphere };
const dm = { recentreCount: 2 };
globalThis.document = { querySelector: s => s.includes('left') ? L : s.includes('right') ? R : s === '#home-rectangle' ? { getAttribute: () => home } : s === '#sphere-manager' ? { components: { 'sphere-manager': sm } } : s === '#data-manager' ? { components: { 'data-manager': dm } } : null,
  createElement: () => ({ style: {}, click() {} }), body: { appendChild() {}, removeChild() {} } };
let blobs = []; globalThis.Blob = function (parts) { this.text = parts.join(''); blobs.push(this.text); }; globalThis.URL = { createObjectURL: () => 'u', revokeObjectURL() {} };
let now = 5000; Date.now = () => now;
const sceneEl = { camera: { el: { object3D: camObj } } };
function run(def, frames) { const c = Object.create(def); c.el = { sceneEl }; c.init(); c.startTracking(1000); frames.forEach(f => { f(); now += 14; c.tick(); }); blobs = []; c.exportCSV(); return blobs.slice(); }
const steps = [() => {}, () => { handL.htc.indexTipPosition.x += 0.01; }, () => { handL.htc.hasPoses = false; }, () => { handL.htc.hasPoses = true; handL.tc.controller = undefined; }, () => { handL.tc.controller = { hand: {} }; sm.activeSphere = null; }];
const reset = () => { now = 5000; handL.htc.indexTipPosition.set(-0.15, 1.0, -0.45); handL.htc.hasPoses = true; handL.tc.controller = { hand: {} }; sm.activeSphere = sphere; };
reset(); const oldOut = run(load(OLD), steps);
reset(); const newOut = run(load(NEW), steps);

console.log('KINEMATICS');
const parse = t => t.trim().split('\n').map(l => l.split(','));
const [oL, oR] = oldOut.map(parse), [nL, nR] = newOut.map(parse);
ok(newOut.length === 2, 'still exports exactly two files (LEFT, RIGHT)');
ok(nL[0].length === 26 && nL.slice(1).every(r => r.length === 26) && nR.slice(1).every(r => r.length === 26), 'header and every row have 26 columns');
ok(nL[0].slice(0, 10).join() === oL[0].slice(0, 10).join(), 'first 10 header names identical to legacy');
ok(nL.slice(1).every((r, i) => r.slice(0, 10).join() === oL[i + 1].slice(0, 10).join()) && nR.slice(1).every((r, i) => r.slice(0, 10).join() === oR[i + 1].slice(0, 10).join()), 'legacy 10 columns byte-identical to old code on every row (incl. full precision & blank targets)');
ok(nL.length === oL.length, 'same number of rows as old code');
const col = (rows, name) => rows.slice(1).map(r => r[rows[0].indexOf(name)]);
ok(col(nL, 'Valid').join() === '1,1,0,0,1', 'Valid: tracked=1, hasPoses false=0, input source gone (stale hasPoses)=0');
ok(col(nR, 'Valid').every(v => v === '1'), 'other hand unaffected');
const wx = col(nL, 'WristX'); ok(wx[2] === wx[1] && wx[3] === wx[1], 'wrist repeats last valid value while invalid (as agreed)');
ok(col(nL, 'RecentreCount').every(v => v === '2'), 'RecentreCount column populated');
const row = nL[1], h = nL[0];
const g = n => +row[h.indexOf(n)];
const wristBack = M(new THREE.Vector3(g('WristX'), g('WristY'), g('WristZ')), new THREE.Quaternion(g('WristQX'), g('WristQY'), g('WristQZ'), g('WristQW')).normalize());
const wristTrue = new THREE.Matrix4().fromArray(handL.htc.jointPoses, 0);
const err = (a, b) => { const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), pb = new THREE.Vector3(), qb = new THREE.Quaternion(), s = new THREE.Vector3(); a.decompose(pa, qa, s); b.decompose(pb, qb, s); return { mm: pa.distanceTo(pb) * 1000, deg: THREE.MathUtils.radToDeg(qa.angleTo(qb)) }; };
let e = err(wristBack, wristTrue); ok(e.mm < 0.01 && e.deg < 0.001, `wrist pose reconstructs from CSV (err ${e.mm.toFixed(4)} mm, ${e.deg.toFixed(5)}°)`);
const headBack = M(new THREE.Vector3(g('HeadX'), g('HeadY'), g('HeadZ')), new THREE.Quaternion(g('HeadQX'), g('HeadQY'), g('HeadQZ'), g('HeadQW')).normalize());
e = err(headBack, camObj.matrixWorld); ok(e.mm < 0.01 && e.deg < 0.001, `head pose reconstructs from CSV (err ${e.mm.toFixed(4)} mm, ${e.deg.toFixed(5)}°)`);
const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(g('HeadQX'), g('HeadQY'), g('HeadQZ'), g('HeadQW')));
ok(Math.abs(THREE.MathUtils.radToDeg(Math.asin(fwd.y)) + 25) < 0.01, 'gaze direction from quaternion gives the true -25° pitch');
ok(nL[1][h.indexOf('HeadX')] === nR[1][h.indexOf('HeadX')] && nL[1][h.indexOf('HeadQW')] === nR[1][h.indexOf('HeadQW')], 'head identical in KL and KR for the same frame');


console.log('HEAD FROM CURRENT XR FRAME');
{
  const def = load(NEW);
  const trueHead = { position: { x: 0.11, y: 1.33, z: -0.07 }, orientation: new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(-40), deg(60), deg(5), 'YXZ')) };
  let mode = 'ok'; const space = { id: 'active' }; let askedWith = null;
  const frame = { getViewerPose: (sp) => { askedWith = sp; if (mode === 'null') return null; if (mode === 'throw') throw new Error('InvalidState'); return { transform: { position: trueHead.position, orientation: trueHead.orientation } }; } };
  const xrScene = { camera: { el: { object3D: camObj } }, frame, renderer: { xr: { getSession: () => ({}), getReferenceSpace: () => space } } };
  const c = Object.create(def); c.el = { sceneEl: xrScene }; c.init(); c.startTracking(1000);
  now += 14; c.tick(); mode = 'null'; now += 14; c.tick(); mode = 'throw'; let threw = false; now += 14; try { c.tick(); } catch (e) { threw = true; }
  blobs = []; c.exportCSV(); const rows = parse(blobs[0]); const H = rows[0]; const gg = (r, n) => +r[H.indexOf(n)];
  ok(askedWith === space, 'viewer pose queried in the renderer\'s (recentred) reference space');
  ok(Math.abs(gg(rows[1], 'HeadY') - 1.33) < 1e-9 && Math.abs(gg(rows[1], 'HeadQW') - Math.round(trueHead.orientation.w * 1e6) / 1e6) < 1e-9, 'in XR, head = current-frame viewer pose (not last render\'s camera)');
  ok(rows[2].slice(18, 25).join() === rows[1].slice(18, 25).join() && rows[3].slice(18, 25).join() === rows[1].slice(18, 25).join(), 'head tracking lost / error → last head repeated');
  ok(!threw, 'exception from getViewerPose never escapes tick (render loop safe)');
}

console.log('SIZE (72 Hz, realistic values)');
const def = load(NEW); const c = Object.create(def); c.el = { sceneEl }; c.init(); c.startTracking(1000);
for (let i = 0; i < 72 * 60; i++) { now += 14; handL.htc.indexTipPosition.set(Math.random() * 0.6 - 0.3, 0.9 + Math.random() * 0.4, -0.2 - Math.random() * 0.4); handR.htc.indexTipPosition.copy(handL.htc.indexTipPosition); camObj.position.set(Math.random() * 0.1, 1.2 + Math.random() * 0.05, Math.random() * 0.1); camObj.quaternion.setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())); rig.updateMatrixWorld(true); c.tick(); }
blobs = []; c.exportCSV(); const newMB = blobs[0].length / 1e6;
const cOld = Object.create(load(OLD)); cOld.el = { sceneEl }; cOld.init(); cOld.startTracking(1000); for (let i = 0; i < 72 * 60; i++) { now += 14; handL.htc.indexTipPosition.set(Math.random() * 0.6 - 0.3, 0.9 + Math.random() * 0.4, -0.2 - Math.random() * 0.4); cOld.tick(); }
blobs = []; cOld.exportCSV(); const oldMB = blobs[0].length / 1e6;
console.log(`  per file per minute: old ${oldMB.toFixed(2)} MB → new ${newMB.toFixed(2)} MB (25 min ≈ ${(newMB * 25).toFixed(0)} MB per file)`);
console.log(`\nKINEMATICS: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

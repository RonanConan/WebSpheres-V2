import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const TOOLS = process.env.WS_TOOLS || 'C:\\Users\\ronan\\webspheres-tools';
const THREE = await import(pathToFileURL(path.join(TOOLS, 'node_modules', 'three', 'build', 'three.module.js')).href);
const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
class EE { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; } emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); } }

let now = 1e6, timers = [], intervals = [], tid = 0;
Date.now = () => now;
globalThis.setTimeout = (f, ms) => { const t = { id: ++tid, f, at: now + ms }; timers.push(t); return t; };
globalThis.clearTimeout = t => { timers = timers.filter(x => x !== t); };
globalThis.setInterval = (f, ms) => { const t = { id: ++tid, f, ms, at: now + ms }; intervals.push(t); return t; };
globalThis.clearInterval = t => { intervals = intervals.filter(x => x !== t); };
const errors = [];
function advance(ms) { const end = now + ms; for (;;) { const cands = [...timers, ...intervals].filter(t => t.at <= end).sort((a, b) => a.at - b.at); if (!cands.length) break; const t = cands[0]; now = t.at; if (timers.includes(t)) timers = timers.filter(x => x !== t); else t.at += t.ms; try { t.f(); } catch (e) { errors.push(e); } } now = end; }

class Conn extends EE { constructor() { super(); this.open = false; this.sent = []; this.closed = false; } send(d) { this.sent.push(d); } close() { if (this.closed) return; this.closed = true; this.open = false; this.emit('close'); } }
let peers = [];
class Peer extends EE {
  constructor(id) { super(); this.reqId = id; this._open = false; this._disconnected = false; this._destroyed = false; this.lastServerId = null; this.reconnects = 0; this.conns = []; peers.push(this); }
  get open() { return this._open; } get disconnected() { return this._disconnected; } get destroyed() { return this._destroyed; }
  serverOpen() { this._open = true; this.lastServerId = this.reqId; this.emit('open', this.reqId); }
  disconnect() { if (this._disconnected) return; this._disconnected = true; this._open = false; this.emit('disconnected', this.reqId); }
  destroy() { if (this._destroyed) return; this.conns.forEach(c => c.close()); this.disconnect(); this._destroyed = true; this.emit('close'); }
  reconnect() { if (this._disconnected && !this._destroyed) { this._disconnected = false; this.reconnects++; } else if (this._destroyed) throw new Error('destroyed'); else if (!this._disconnected && !this._open) {} else throw new Error('not disconnected'); }
  socketDrop() { this.emit('error', { type: 'network' }); this.disconnect(); }
  idTaken() { this.emit('error', { type: 'unavailable-id' }); if (!this.lastServerId) this.destroy(); else this.disconnect(); }
  incoming() { const c = new Conn(); this.conns.push(c); this.emit('connection', c); return c; }
}
globalThis.Peer = Peer;
globalThis.THREE = THREE;

const M4 = (p, q) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
class Space { constructor(session, origin) { this.session = session; this.origin = origin; } getOffsetReferenceSpace(t) { return new Space(this.session, this.origin.clone().multiply(M4(new THREE.Vector3(t.position.x, t.position.y, t.position.z), new THREE.Quaternion(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w)))); } }
globalThis.XRRigidTransform = class { constructor(p, o) { [p.x, p.y, p.z, o.x, o.y, o.z, o.w].forEach(v => { if (!Number.isFinite(v)) throw new TypeError('non-finite'); }); this.position = p; this.orientation = o; } };
class Frame { constructor(session, head) { this.session = session; this.head = head; this.nullPose = false; } getViewerPose(space) { if (space.session !== this.session) throw new Error('InvalidStateError: space from another session'); if (this.nullPose) return null; const rel = space.origin.clone().invert().multiply(this.head); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); rel.decompose(p, q, s); return { transform: { position: p, orientation: q } }; } }
const poseIn = (space, worldM) => { const rel = space.origin.clone().invert().multiply(worldM); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); rel.decompose(p, q, s); return { p, e: new THREE.Euler().setFromQuaternion(q, 'YXZ') }; };

let session = null, refSpace = null, custom = null;
const xr = { getSession: () => session, getReferenceSpace: () => custom || refSpace, setReferenceSpace: s => { custom = s; } };
const sceneListeners = {};
const htcL = { referenceSpace: undefined }, htcR = { referenceSpace: undefined };
const tcSystem = { referenceSpace: undefined };
const sceneEl = { renderer: { xr }, frame: null, xrSession: undefined, systems: { 'tracked-controls': tcSystem }, camera: null,
  addEventListener: (e, f) => { (sceneListeners[e] = sceneListeners[e] || []).push(f); }, removeEventListener() {} };
const fire = e => (sceneListeners[e] || []).forEach(f => f());
function enterVR() { session = { id: Math.random() }; custom = null; refSpace = new Space(session, new THREE.Matrix4()); sceneEl.xrSession = session; htcL.referenceSpace = undefined; htcR.referenceSpace = undefined; fire('enter-vr'); }
function exitVR() { session = null; sceneEl.xrSession = undefined; sceneEl.frame = null; fire('exit-vr'); }

let defs = {};
globalThis.AFRAME = { registerComponent: (n, d) => { defs[n] = d; } };
const dispatched = [];
const ctrl = (htc) => ({ components: { 'hand-tracking-controls': htc }, addEventListener() {}, removeEventListener() {}, getAttribute() { return {}; } });
const leftCtrl = ctrl(htcL), rightCtrl = ctrl(htcR);
let dm;
globalThis.document = {
  hidden: false, _l: {},
  addEventListener(e, f) { (this._l[e] = this._l[e] || []).push(f); }, removeEventListener() {},
  dispatchEvent: e => dispatched.push(e.code),
  querySelector: (s) => s === '[hand-tracking-controls="hand: left"]' ? leftCtrl : s === '[hand-tracking-controls="hand: right"]' ? rightCtrl : s === '#data-manager' ? { components: { 'data-manager': dm } } : null,
  createElement: () => ({ style: {}, click() {} }), body: { appendChild() {}, removeChild() {} }
};
globalThis.window = { _l: {}, addEventListener(e, f) { (this._l[e] = this._l[e] || []).push(f); }, removeEventListener() {} };
globalThis.KeyboardEvent = function (t, o) { return o; };

eval(fs.readFileSync(W + '/spectator-manager.js', 'utf8'));
eval(fs.readFileSync(W + '/data-manager.js', 'utf8'));
dm = Object.create(defs['data-manager']); dm.el = {}; dm.init(); intervals = intervals.filter(i => i.f.toString().indexOf('tryAttachListener') < 0);
const sm = Object.create(defs['spectator-manager']); sm.el = { sceneEl }; sm.init();
let t = 0; const tick = () => { t += 14; sm.tick(t); };
const acks = c => c.sent.map(s => JSON.parse(s)).filter(d => d.type === 'recentre');

console.log('HOST — networking');
let p0 = peers.at(-1); p0.serverOpen();
ok(peers.length === 1 && p0.reqId === 'webspheres-host', 'hosts with fixed ID');
p0.socketDrop(); advance(3100);
ok(p0.reconnects === 1 && peers.length === 1, 'signalling drop → reconnect() same peer after 3 s (existing P2P links kept)');
p0.serverOpen();
const c1 = p0.incoming(); c1.open = true; c1.emit('open');
ok(sm.connections.length === 1, 'observer connection registered on open');
p0.socketDrop(); ok(c1.closed === false, 'signalling drop does not kill live observer link');
p0.serverOpen();
p0.idTaken(); advance(3100);
ok(p0.reconnects >= 2 && !p0.destroyed, 'unavailable-id after a prior open → reconnect retried');
for (let i = 0; i < 4; i++) { p0.idTaken(); advance(3100); }
ok(peers.length === 1 && p0.reconnects >= 6, 'repeated ID clashes keep retrying every ~3 s, no peer storm');
p0.serverOpen();

peers = []; const sm2 = Object.create(defs['spectator-manager']); sm2.el = { sceneEl }; sm2.init();
const q0 = peers.at(-1); q0.idTaken();
ok(q0.destroyed, 'first-ever unavailable-id destroys peer (PeerJS behaviour)');
advance(3100);
ok(peers.length === 2 && !peers[1].destroyed, 'destroyed host peer rebuilt after 3 s');
const before = peers.length; advance(17500);
ok(peers.length === before + 1, 'peer stuck connecting gets rebuilt by health check within 15–20 s gets rebuilt by health check');
peers.at(-1).serverOpen(); const pc = peers.length; advance(30000);
ok(peers.length === pc, 'healthy open peer left alone for 30 s');
const q1 = peers.at(-1); q1.reconnect = () => { throw new Error('boom'); }; q1.disconnect(); advance(3100);
ok(peers.length === pc + 1, 'reconnect() throwing → full rebuild');
const pBeforeHidden = peers.at(-1); pBeforeHidden.serverOpen(); pBeforeHidden.disconnect(); document._l['visibilitychange'].forEach(f => f());
ok(pBeforeHidden.reconnects === 1, 'visibility restore heals immediately (no 3 s wait)');
sm2.remove(); const intervalsAfterRemove = intervals.length;

console.log('HOST — connection hygiene');
c1.closed = false; c1.open = true; const c1b = p0.incoming(); c1b.open = true; c1b.emit('open'); const c2 = p0.incoming(); c2.open = true; c2.emit('open');
ok(sm.connections.includes(c1b) && sm.connections.includes(c2), 'two observers registered');
advance(6000); c2.emit('data', JSON.stringify({ type: 'ping' })); advance(5000); c2.emit('data', JSON.stringify({ type: 'ping' })); advance(5000);
ok(!sm.connections.includes(c1b) && c1b.closed, 'silent observer (>10 s, no ping) pruned & closed');
ok(sm.connections.includes(c2), 'pinging observer kept');
c2.emit('error', {}); ok(!sm.connections.includes(c2), 'conn error → removed');
const c3 = p0.incoming(); c3.open = true; c3.emit('open');
c3.emit('data', JSON.stringify({ type: 'ping' })); c3.emit('data', JSON.stringify({ code: 'KeyS' })); c3.emit('data', 'garbage{'); c3.emit('data', 'null');
ok(dispatched.join() === 'KeyS', 'ping ignored, key relayed, malformed/null payloads ignored without throwing');

console.log('HOST — recentre');
c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
let a = acks(c3).at(-1); ok(a && a.ok === false && a.reason === 'Not in VR', 'recentre outside VR → ack fail "Not in VR", no throw');
ok(sm.recentrePending === false, 'pending flag cleared (no stale recentre later)');

enterVR();
ok(sm.baseRefSpace === refSpace && sm.baseSession === session, 'enter-vr captures base space of the current session');
const headW = M4(new THREE.Vector3(0.3, 1.2, 0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(4), 'YXZ')));
sceneEl.frame = new Frame(session, headW);
htcL.referenceSpace = refSpace; htcR.referenceSpace = refSpace; tcSystem.referenceSpace = refSpace;
c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
a = acks(c3).at(-1); ok(a.ok === true, 'recentre in VR → ack ok');
const active = xr.getReferenceSpace();
ok(active !== refSpace && active === sm.activeSpace, 'renderer now uses offset space');
ok(htcL.referenceSpace === active && htcR.referenceSpace === active && tcSystem.referenceSpace === active, 'hand-tracking-controls (both) + tracked-controls share the recentred space');
const hp = poseIn(active, headW);
ok(Math.abs(hp.p.x) < 1e-6 && Math.abs(hp.p.z) < 1e-6 && Math.abs(hp.p.y - 1.2) < 1e-6 && Math.abs(hp.e.y) < 1e-6, 'head at x=z=0, height kept, yaw 0 in recentred frame');
ok(Math.abs(THREE.MathUtils.radToDeg(hp.e.x) - 15) < 1e-4 && Math.abs(THREE.MathUtils.radToDeg(hp.e.z) - 4) < 1e-4, 'pitch/roll preserved');
const handW = M4(new THREE.Vector3(0.5, 1.0, -0.3), new THREE.Quaternion());
const viaHTC = poseIn(htcL.referenceSpace, handW).p, viaExtras = poseIn(xr.getReferenceSpace(), handW).p;
ok(viaHTC.distanceTo(viaExtras) < 1e-9, 'indexTip/kinematics frame == collision/camera frame (was ~12 cm apart)');
htcL.referenceSpace = refSpace; tcSystem.referenceSpace = refSpace; tick();
ok(htcL.referenceSpace === active && tcSystem.referenceSpace === active, 'late async refspace overwrite (A-Frame inputsourceschange) re-synced next tick');
c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
const again = xr.getReferenceSpace(); const hp2 = poseIn(again, headW);
ok(again.origin.equals(active.origin) && Math.abs(hp2.p.x) < 1e-9, 'second recentre with no movement identical (offset from base, no drift)');
ok(dm.recentreCount === 0, 'recentres before session start not counted');

dm.startSession(now);
c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
dm.recordTrial(3, 'LEFT', 10, 'normal', 300);
ok(dm.recentreCount === 1 && dm.trialData.at(-1).recentreCount === 1, 'mid-session recentre counted and stamped on trial row');
let csv = ''; globalThis.Blob = function (parts) { csv = parts.join(''); }; globalThis.URL = { createObjectURL: () => 'u', revokeObjectURL() {} }; dm.exportCSV();
ok(csv.split('\n')[0].endsWith(',RecentreCount') && csv.split('\n')[1].endsWith(',1'), 'trial CSV has RecentreCount as last column');
ok(csv.split('\n')[0].split(',').length === csv.split('\n')[1].split(',').length, 'header/row column counts match');

let cur = xr.getReferenceSpace(); sceneEl.frame.nullPose = true; c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
ok(acks(c3).at(-1).reason === 'Head not tracked' && xr.getReferenceSpace() === cur, 'lost head tracking → fail ack, previous recentre kept');
sceneEl.frame.nullPose = false;
const bad = sceneEl.frame.getViewerPose; sceneEl.frame.getViewerPose = () => ({ transform: { position: { x: NaN, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
ok(acks(c3).at(-1).ok === false && xr.getReferenceSpace() === cur, 'NaN pose rejected, nothing applied');
sceneEl.frame.getViewerPose = () => { throw new Error('driver'); };
c3.emit('data', JSON.stringify({ code: 'KeyR' })); let threw = false; try { tick(); } catch (e) { threw = true; }
ok(!threw && acks(c3).at(-1).reason.startsWith('Error'), 'exception inside recentre caught → render loop survives');
sceneEl.frame.getViewerPose = bad;

console.log('HOST — exit / re-enter VR (old freeze bug)');
exitVR(); tick();
ok(sm.baseRefSpace === null && sm.activeSpace === null, 'exit-vr clears base + active space');
const oldSession = session;
enterVR();
const fr = new Frame(session, headW); sceneEl.frame = fr;
htcL.referenceSpace = refSpace;
c3.emit('data', JSON.stringify({ code: 'KeyR' })); threw = false; try { tick(); } catch (e) { threw = true; }
ok(!threw && acks(c3).at(-1).ok === true, 'recentre after re-entering VR works (no cross-session throw)');
ok(xr.getReferenceSpace().session === session && htcL.referenceSpace.session === session, 'all spaces belong to the new session');
sm.baseSession = { stale: true }; c3.emit('data', JSON.stringify({ code: 'KeyR' })); tick();
ok(acks(c3).at(-1).reason === 'Tracking not ready', 'session mismatch guard refuses instead of throwing');
sm.onEnterVR();

console.log('HOST — stream');
tick(); tick(); tick();
const frames = c3.sent.map(s => JSON.parse(s)).filter(d => d.type === undefined);
ok(frames.length > 0 && 'homePos' in frames.at(-1), 'frame stream still flowing to observers');

console.log('HOST — frame seq and rounding (Plan A §7)');
const camObj = new THREE.Object3D(); camObj.position.set(0.0123456789, 1.2345678912, -0.0000123456); camObj.quaternion.setFromEuler(new THREE.Euler(-0.31234567, 0.4123456789, 0.0212345, 'YXZ')); camObj.updateMatrixWorld(true);
sceneEl.camera = { el: { object3D: camObj } };
const rawJoint = (i) => [0.123456789 + i * 0.0123456789, 1.000049999 - i * 0.00098765, -0.333333333 - i * 0.0011111];
sm.leftHandData = { getValidity: () => true, getPosition: (i, v) => v.set(...rawJoint(i)) };
sm.rightHandData = { getValidity: () => false, getPosition: () => {} };
const n0 = c3.sent.length;
for (let i = 0; i < 30; i++) tick();
const sf = c3.sent.slice(n0).map(s => JSON.parse(s)).filter(d => d.type === undefined);
const allFrames = c3.sent.map(s => JSON.parse(s)).filter(d => d.type === undefined);
ok(sf.length >= 8 && allFrames.every(f => Number.isInteger(f.seq)), 'every frame carries an integer seq (' + sf.length + ' frames)');
ok(allFrames.every((f, i) => i === 0 || f.seq === allFrames[i - 1].seq + 1), 'seq increases by exactly 1 per frame');
const dec4 = (v) => Math.abs(v * 1e4 - Math.round(v * 1e4)) < 1e-6;
const lf = sf.at(-1);
ok(lf.left.length === 75 && lf.left.every(dec4) && Object.values(lf.head).every(dec4), 'joint and head values rounded to 4 decimals');
ok(lf.left.every((v, k) => Math.abs(v - rawJoint(Math.floor(k / 3))[k % 3]) <= 0.00005 + 1e-12), 'rounding error ≤ 0.05 mm on every joint coordinate');
const qh = new THREE.Quaternion(lf.head.qx, lf.head.qy, lf.head.qz, lf.head.qw).normalize();
ok(THREE.MathUtils.radToDeg(qh.angleTo(camObj.quaternion)) < 0.02 && Math.abs(lf.head.py - 1.2346) < 1e-12, 'head pose after rounding within 0.02° and 0.05 mm');
ok(lf.right === null && lf.rightValid === false && lf.leftValid === true, 'invalid hand still sent as null');
const unrounded = JSON.stringify(Object.assign({}, lf, { seq: undefined, left: Array.from({ length: 25 }, (_, i) => rawJoint(i)).flat(), right: Array.from({ length: 25 }, (_, i) => rawJoint(i)).flat(), head: { px: camObj.position.x, py: camObj.position.y, pz: camObj.position.z, qx: camObj.quaternion.x, qy: camObj.quaternion.y, qz: camObj.quaternion.z, qw: camObj.quaternion.w } }));
sm.rightHandData = sm.leftHandData;
const n1 = c3.sent.length; for (let i = 0; i < 4; i++) tick();
const both = c3.sent.slice(n1).map(s => JSON.parse(s)).filter(d => d.type === undefined).at(-1);
const roundedLen = JSON.stringify(both).length;
console.log(`  frame size, both hands tracked: ${unrounded.length} → ${roundedLen} bytes (${Math.round(100 * roundedLen / unrounded.length)}%)`);
ok(roundedLen < unrounded.length * 0.6, 'messages about half the size or smaller');
const raw = Array.from({ length: 25 }, (_, i) => rawJoint(i)).flat();
const bench = (fn) => { const t0 = process.hrtime.bigint(); let s = 0; for (let i = 0; i < 20000; i++) s += fn().length; return Number(process.hrtime.bigint() - t0) / 20000 / 1000; };
const r4 = (v) => Math.round(v * 10000) / 10000;
const tRaw = bench(() => JSON.stringify({ left: raw, right: raw }));
const tRound = bench(() => JSON.stringify({ left: raw.map(r4), right: raw.map(r4) }));
console.log(`  per-frame build+stringify (both hands, this PC): unrounded ${tRaw.toFixed(1)} µs → rounded ${tRound.toFixed(1)} µs`);
ok(tRound < tRaw * 1.5, 'rounding adds no meaningful per-frame cost (fewer bytes to stringify)');
sceneEl.camera = null;
sm.remove();
ok(intervals.length === intervalsAfterRemove - 1, 'remove() clears health interval');
ok(errors.length === 0, 'no uncaught errors in timers (' + errors.map(e => e.message).join('; ') + ')');

console.log(`\nHOST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

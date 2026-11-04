(function () {
    if (window.parent === window) return;

    const FRAME_MS = 1000 / 90;
    let nextFrame = 0;
    window.requestAnimationFrame = (callback) => {
        const now = performance.now();
        nextFrame = Math.max(now - 100, nextFrame + FRAME_MS);
        return setTimeout(() => callback(performance.now()), Math.max(0, nextFrame - now));
    };
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };

    const JOINT_NAMES = ['Wrist', 'T_Tip', 'T_Distal', 'T_Proximal', 'T_Metacarpal', 'I_Tip', 'I_Distal', 'I_Intermediate', 'I_Proximal', 'I_Metacarpal', 'M_Tip', 'M_Distal', 'M_Intermediate', 'M_Proximal', 'M_Metacarpal', 'R_Tip', 'R_Distal', 'R_Intermediate', 'R_Proximal', 'R_Metacarpal', 'L_Tip', 'L_Distal', 'L_Intermediate', 'L_Proximal', 'L_Metacarpal'];
    const INDEX_TIP = 9;

    function handShape(side) {
        const s = side === 'L' ? 1 : -1;
        const joints = [[0, 0, 0], [s * 0.025, -0.01, -0.02], [s * 0.045, -0.015, -0.045], [s * 0.06, -0.018, -0.07], [s * 0.07, -0.02, -0.09]];
        [[0.022, 1], [0.003, 1], [-0.016, 0.95], [-0.032, 0.75]].forEach(([x, k]) => {
            const knuckleZ = -0.085 * (k < 0.8 ? 0.88 : 1);
            joints.push([s * x * 0.5, 0, -0.01], [s * x, 0, knuckleZ]);
            let z = knuckleZ, y = 0;
            [0.045, 0.027, 0.022].forEach((len) => {
                z -= len * k * 0.97;
                y -= 0.008;
                joints.push([s * x * 1.05, y, z]);
            });
        });
        const tip = joints[INDEX_TIP];
        return joints.map(j => [j[0] - tip[0], j[1] - tip[1], j[2] - tip[2]]);
    }

    function makeHand(side, controller) {
        const hand = { side, controller, x: 0, y: 0, z: 0, valid: true, shape: handShape(side), base: { x: 0, y: 0, z: 0 }, rest: { x: 0, y: 0, z: 0 }, goal: null, motion: null, phase: Math.random() * 6 };
        const htc = controller.components['hand-tracking-controls'];
        controller.components['tracked-controls'] = { play: () => {}, pause: () => {}, remove: () => {} };

        hand.place = (x, y, z) => {
            hand.x = x;
            hand.y = y;
            hand.z = z;
            htc.indexTipPosition.set(x, y, z);
            const wrist = hand.shape[0];
            htc.jointPoses.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x + wrist[0], y + wrist[1], z + wrist[2], 1]);
        };
        hand.setValid = (valid) => {
            hand.valid = valid;
            htc.hasPoses = valid;
            controller.components['tracked-controls'].controller = valid ? { hand: {} } : undefined;
        };
        hand.joints = Object.fromEntries(JOINT_NAMES.map(name => [name, {
            isValid: () => hand.valid,
            getPosition: (v) => v.set(hand.x, hand.y, hand.z)
        }]));
        hand.data = {
            getValidity: () => hand.valid,
            getPosition: (i, v) => {
                const j = hand.shape[i];
                return v.set(hand.x + j[0], hand.y + j[1], hand.z + j[2]);
            }
        };
        hand.setValid(true);
        return hand;
    }

    const rand = (a, b) => a + Math.random() * (b - a);
    const LAP = { L: { x: -0.2, y: 0.62, z: -0.3 }, R: { x: 0.2, y: 0.62, z: -0.3 } };

    function makeParticipant(sm, spectator, left, right) {
        const hands = { L: left, R: right };
        const reachPose = { x: rand(0.08, 0.14), y: rand(1.05, 1.12), z: -rand(0.7, 0.76) };
        const participant = { frozen: false, trial: null };

        const goTo = (hand, to, ms, bow) => {
            const goal = hand.goal;
            if (goal && Math.hypot(goal.x - to.x, goal.y - to.y, goal.z - to.z) < 0.001) return;
            hand.goal = { x: to.x, y: to.y, z: to.z };
            hand.motion = { from: { x: hand.base.x, y: hand.base.y, z: hand.base.z }, to: hand.goal, start: performance.now(), ms, bow: bow || { x: 0, y: 0, z: 0 } };
        };

        const advance = (hand, now) => {
            const m = hand.motion;
            if (m) {
                const s = Math.min(1, (now - m.start) / m.ms);
                const e = s * s * s * (10 - 15 * s + 6 * s * s);
                const arc = Math.sin(Math.PI * e);
                ['x', 'y', 'z'].forEach((k) => { hand.base[k] = m.from[k] + (m.to[k] - m.from[k]) * e + m.bow[k] * arc; });
                if (s >= 1) hand.motion = null;
            }
            const sway = (rate, phase) => 0.002 * Math.sin(now / rate + phase);
            hand.place(hand.base.x + sway(700, hand.phase), hand.base.y + sway(900, hand.phase + 1), hand.base.z + sway(800, hand.phase + 2));
        };

        const restFor = (side) => {
            const lap = sm.calib.lap;
            if (!lap.done) return LAP[side];
            const j = hands[side].rest;
            const base = sm.homeMode === 'per-hand' ? (side === 'L' ? sm.homeLeft : sm.homeRight) : (() => {
                const home = sm.homeRectangle.getAttribute('position');
                return { x: home.x + (side === 'L' ? -0.16 : 0.16), y: home.y, z: home.z };
            })();
            return { x: base.x + j.x, y: base.y + j.y, z: base.z + j.z };
        };

        const otherSide = (side) => (side === 'L' ? 'R' : 'L');
        const chooseSide = (x) => {
            const side = Math.random() < 1 / (1 + Math.exp(x / 0.12)) ? 'L' : 'R';
            return hands[side].valid ? side : otherSide(side);
        };
        participant.setLost = (side, lost) => hands[side].setValid(!lost);

        const stepTrial = (now) => {
            const live = (sm.phase === 'running' || sm.phase === 'pausing') && sm.currentState === 'visible' ? sm.activeSphere : null;
            if (participant.trial && participant.trial.sphere !== live) participant.trial = null;
            if (live && !participant.trial) {
                const at = live.getAttribute('position');
                participant.trial = { sphere: live, side: chooseSide(at.x), decideAt: now + rand(250, 650), moving: false };
            }
            const trial = participant.trial;
            if (trial && !hands[trial.side].valid && hands[otherSide(trial.side)].valid) {
                trial.side = otherSide(trial.side);
                trial.moving = false;
                trial.decideAt = now + rand(200, 400);
            }
            if (trial && !trial.moving && hands[trial.side].valid && now >= trial.decideAt) {
                const at = trial.sphere.getAttribute('position');
                const bow = { x: rand(-0.11, 0.11), y: rand(0.02, 0.1), z: rand(-0.07, 0.07) };
                goTo(hands[trial.side], at, rand(450, 800), bow);
                hands[trial.side].rest = { x: rand(-0.04, 0.04), y: rand(-0.02, 0.02), z: rand(-0.05, 0.05) };
                trial.moving = true;
            }
        };

        participant.step = () => {
            const now = performance.now();
            if (!participant.frozen) {
                stepTrial(now);
                const trial = participant.trial;
                const setup = sm.phase === 'setup' || sm.phase === 'between';
                const reachSide = setup && spectator.cue === 'reach' ? (sm.reachHand() === 'LEFT' ? 'L' : 'R') : null;
                ['L', 'R'].forEach((side) => {
                    if (trial && trial.moving && trial.side === side) return;
                    if (side === reachSide) goTo(hands[side], { x: (side === 'L' ? -1 : 1) * reachPose.x, y: reachPose.y, z: reachPose.z }, 800);
                    else goTo(hands[side], restFor(side), rand(450, 750));
                });
                advance(left, now);
                advance(right, now);
            }
        };
        return participant;
    }

    AFRAME.registerComponent('practice-participant', {
        tick: function () {
            if (window.__practice && window.__practice.participant) window.__practice.participant.step();
        }
    });

    function install(scene) {
        const component = (selector, name) => document.querySelector(selector).components[name];
        const sm = component('#sphere-manager', 'sphere-manager');
        const dm = component('#data-manager', 'data-manager');
        const spectator = component('#spectator-manager', 'spectator-manager');

        const is = scene.is.bind(scene);
        scene.is = (state) => state === 'vr-mode' ? true : is(state);
        scene.camera.el.setAttribute('position', '0 1.2 0');
        if (scene.renderer) scene.renderer.render = () => {};

        dm.practice = true;
        dm.downloadBlob = () => {};

        spectator.recentreReady = () => ({ ok: true });
        spectator.sampleHead = function (time) {
            this.recentre.samples.push({ t: time, x: 0, z: 0, yaw: 0 });
        };
        spectator.applyRecentre = function () {
            this.activeSpace = {};
            if (dm.logRecentre) dm.logRecentre();
            return { ok: true };
        };

        const left = makeHand('L', sm.leftController);
        const right = makeHand('R', sm.rightController);
        Object.assign(left.base, LAP.L);
        Object.assign(right.base, LAP.R);
        left.place(LAP.L.x, LAP.L.y, LAP.L.z);
        right.place(LAP.R.x, LAP.R.y, LAP.R.z);
        sm.leftJoints = left.joints;
        sm.rightJoints = right.joints;
        spectator.leftHandData = left.data;
        spectator.rightHandData = right.data;

        const participant = makeParticipant(sm, spectator, left, right);
        window.__practice = { left, right, sm, dm, spectator, participant };
        scene.setAttribute('practice-participant', '');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const scene = document.querySelector('a-scene');
        if (scene.hasLoaded) install(scene);
        else scene.addEventListener('loaded', () => install(scene));
    });
})();

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
        const hand = { side, controller, x: 0, y: 0, z: 0, valid: true, shape: handShape(side) };
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
        left.place(-0.2, 0.9, -0.36);
        right.place(0.2, 0.9, -0.36);
        sm.leftJoints = left.joints;
        sm.rightJoints = right.joints;
        spectator.leftHandData = left.data;
        spectator.rightHandData = right.data;

        window.__practice = { left, right, sm, dm, spectator };
    }

    document.addEventListener('DOMContentLoaded', () => {
        const scene = document.querySelector('a-scene');
        if (scene.hasLoaded) install(scene);
        else scene.addEventListener('loaded', () => install(scene));
    });
})();

AFRAME.registerComponent('spectator-manager', {
    init: function () {
        this.HOST_ID = 'webspheres-host';
        this.HEAL_DELAY = 3000;
        this.HEALTH_INTERVAL = 5000;
        this.STUCK_TIMEOUT = 15000;
        this.STALE_CONN_TIMEOUT = 10000;

        this.peer = null;
        this.connections = [];
        this.lastSeen = new Map();
        this.healTimer = null;
        this.peerStartedAt = 0;
        this.lastSendTime = 0;
        this.frameSeq = 0;

        this.recentrePending = false;
        this.baseRefSpace = null;
        this.baseSession = null;
        this.activeSpace = null;

        this.vec = new THREE.Vector3();
        this.pos = new THREE.Vector3();
        this.quat = new THREE.Quaternion();
        this.leftHandData = null;
        this.rightHandData = null;

        this.leftController = document.querySelector('[hand-tracking-controls="hand: left"]');
        this.rightController = document.querySelector('[hand-tracking-controls="hand: right"]');

        this.bindExtrasReady = this.onExtrasReady.bind(this);
        this.bindEnterVR = this.onEnterVR.bind(this);
        this.bindExitVR = this.onExitVR.bind(this);
        this.bindHeal = this.heal.bind(this);
        this.bindVisibility = this.onVisibilityChange.bind(this);
        this.bindUnload = this.onUnload.bind(this);

        if (this.leftController) {
            const ext = this.leftController.components?.['hand-tracking-extras'];
            if (ext?.HandData) this.leftHandData = ext.HandData;
            this.leftController.addEventListener('hand-tracking-extras-ready', this.bindExtrasReady);
        }
        if (this.rightController) {
            const ext = this.rightController.components?.['hand-tracking-extras'];
            if (ext?.HandData) this.rightHandData = ext.HandData;
            this.rightController.addEventListener('hand-tracking-extras-ready', this.bindExtrasReady);
        }

        this.el.sceneEl.addEventListener('enter-vr', this.bindEnterVR);
        this.el.sceneEl.addEventListener('exit-vr', this.bindExitVR);
        document.addEventListener('visibilitychange', this.bindVisibility);
        window.addEventListener('online', this.bindHeal);
        window.addEventListener('beforeunload', this.bindUnload);

        this.setupPeer();
        this.healthInterval = setInterval(() => {
            this.heal();
            this.pruneConnections();
        }, this.HEALTH_INTERVAL);
    },

    onExtrasReady: function (evt) {
        const hand = evt.target.getAttribute('hand-tracking-controls')?.hand;
        if (hand === 'left') this.leftHandData = evt.detail.data;
        else if (hand === 'right') this.rightHandData = evt.detail.data;
    },

    onEnterVR: function () {
        const sceneEl = this.el.sceneEl;
        this.recentrePending = false;
        this.activeSpace = null;
        this.baseSession = sceneEl.xrSession || sceneEl.renderer?.xr?.getSession?.() || null;
        this.baseRefSpace = this.baseSession ? sceneEl.renderer.xr.getReferenceSpace() : null;
    },

    onExitVR: function () {
        this.recentrePending = false;
        this.activeSpace = null;
        this.baseSession = null;
        this.baseRefSpace = null;
    },

    onVisibilityChange: function () {
        if (!document.hidden) this.heal();
    },

    onUnload: function () {
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
        }
    },

    setupPeer: function () {
        const oldPeer = this.peer;
        this.peer = null;
        if (oldPeer && !oldPeer.destroyed) {
            try { oldPeer.destroy(); } catch (e) {}
        }
        this.connections.forEach(conn => this.lastSeen.delete(conn));
        this.connections = [];

        if (typeof Peer === 'undefined') {
            console.warn('[Spectator] PeerJS not loaded — observer unavailable');
            return;
        }

        let peer;
        try {
            peer = new Peer(this.HOST_ID, { debug: 0 });
        } catch (e) {
            console.warn('[Spectator] Could not create peer:', e?.message || e);
            this.scheduleHeal();
            return;
        }
        this.peer = peer;
        this.peerStartedAt = Date.now();

        peer.on('open', () => {
            if (this.peer !== peer) return;
            console.log('[Spectator] Hosting as ' + this.HOST_ID);
        });

        peer.on('connection', (conn) => {
            if (this.peer !== peer) {
                try { conn.close(); } catch (e) {}
                return;
            }
            this.addConnection(conn);
        });

        peer.on('disconnected', () => {
            if (this.peer === peer) this.scheduleHeal();
        });

        peer.on('close', () => {
            if (this.peer === peer) this.scheduleHeal();
        });

        peer.on('error', (err) => {
            console.warn('[Spectator] PeerJS error:', err?.type);
            if (this.peer === peer) this.scheduleHeal();
        });
    },

    scheduleHeal: function () {
        if (this.healTimer) return;
        this.healTimer = setTimeout(() => {
            this.healTimer = null;
            this.heal();
        }, this.HEAL_DELAY);
    },

    heal: function () {
        const peer = this.peer;
        if (!peer || peer.destroyed) {
            this.setupPeer();
            return;
        }
        if (peer.disconnected) {
            try {
                peer.reconnect();
                this.peerStartedAt = Date.now();
            } catch (e) {
                this.setupPeer();
            }
            return;
        }
        if (!peer.open && Date.now() - this.peerStartedAt > this.STUCK_TIMEOUT) {
            this.setupPeer();
        }
    },

    addConnection: function (conn) {
        this.lastSeen.set(conn, Date.now());
        conn.on('open', () => {
            this.lastSeen.set(conn, Date.now());
            if (!this.connections.includes(conn)) this.connections.push(conn);
        });
        conn.on('data', (rawData) => {
            this.lastSeen.set(conn, Date.now());
            this.handleMessage(rawData);
        });
        conn.on('close', () => this.dropConnection(conn));
        conn.on('error', () => this.dropConnection(conn));
    },

    dropConnection: function (conn) {
        this.connections = this.connections.filter(c => c !== conn);
        this.lastSeen.delete(conn);
        try { conn.close(); } catch (e) {}
    },

    pruneConnections: function () {
        const now = Date.now();
        this.connections.slice().forEach(conn => {
            const seen = this.lastSeen.get(conn) || 0;
            if (!conn.open || now - seen > this.STALE_CONN_TIMEOUT) this.dropConnection(conn);
        });
    },

    handleMessage: function (rawData) {
        let data;
        try { data = JSON.parse(rawData); } catch (e) { return; }
        if (!data || data.type === 'ping') return;
        if (data.code === 'KeyR') {
            this.recentrePending = true;
        } else if (data.code) {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: data.code, bubbles: true }));
        }
    },

    broadcast: function (payload) {
        this.connections.forEach(conn => {
            if (conn.open) {
                try { conn.send(payload); } catch (e) {}
            }
        });
    },

    round4: function (v) {
        return Math.round(v * 10000) / 10000;
    },

    getJointPositions: function (handData) {
        if (!handData || !handData.getValidity()) return null;
        const positions = [];
        for (let i = 0; i < 25; i++) {
            handData.getPosition(i, this.vec);
            positions.push(this.round4(this.vec.x), this.round4(this.vec.y), this.round4(this.vec.z));
        }
        return positions;
    },

    syncReferenceSpaces: function () {
        const space = this.activeSpace;
        if (!space) return;
        [this.leftController, this.rightController].forEach(ctrl => {
            const htc = ctrl?.components?.['hand-tracking-controls'];
            if (htc && htc.referenceSpace !== space) htc.referenceSpace = space;
        });
        const tcSystem = this.el.sceneEl.systems?.['tracked-controls'];
        if (tcSystem && tcSystem.referenceSpace !== space) tcSystem.referenceSpace = space;
    },

    doRecentre: function () {
        const sceneEl = this.el.sceneEl;
        const renderer = sceneEl.renderer;
        const session = renderer?.xr?.getSession?.();
        const frame = sceneEl.frame;
        if (!session || !frame) return { ok: false, reason: 'Not in VR' };
        if (!this.baseRefSpace || this.baseSession !== session) return { ok: false, reason: 'Tracking not ready' };

        try {
            const pose = frame.getViewerPose(this.baseRefSpace);
            if (!pose) return { ok: false, reason: 'Head not tracked' };

            const q = pose.transform.orientation;
            const p = pose.transform.position;
            const headQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
            const euler = new THREE.Euler().setFromQuaternion(headQuat, 'YXZ');
            const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0));

            if (![p.x, p.z, yawQuat.x, yawQuat.y, yawQuat.z, yawQuat.w].every(Number.isFinite)) {
                return { ok: false, reason: 'Invalid head pose' };
            }

            const offsetTransform = new XRRigidTransform(
                { x: p.x, y: 0, z: p.z, w: 1 },
                { x: yawQuat.x, y: yawQuat.y, z: yawQuat.z, w: yawQuat.w }
            );
            const space = this.baseRefSpace.getOffsetReferenceSpace(offsetTransform);

            renderer.xr.setReferenceSpace(space);
            this.activeSpace = space;
            this.syncReferenceSpaces();

            const dataM = document.querySelector('#data-manager')?.components?.['data-manager'];
            if (dataM?.logRecentre) dataM.logRecentre();

            return { ok: true };
        } catch (e) {
            return { ok: false, reason: 'Error: ' + (e?.message || e) };
        }
    },

    tick: function (time) {
        if (this.recentrePending) {
            this.recentrePending = false;
            const result = this.doRecentre();
            this.broadcast(JSON.stringify({ type: 'recentre', ok: result.ok, reason: result.reason || '' }));
        }
        this.syncReferenceSpaces();

        if (this.connections.length === 0) return;
        if (time - this.lastSendTime < 33) return;
        this.lastSendTime = time;

        const cameraEl = this.el.sceneEl.camera?.el;
        let head = null;
        if (cameraEl) {
            cameraEl.object3D.getWorldPosition(this.pos);
            cameraEl.object3D.getWorldQuaternion(this.quat);
            const r = this.round4;
            head = {
                px: r(this.pos.x), py: r(this.pos.y), pz: r(this.pos.z),
                qx: r(this.quat.x), qy: r(this.quat.y), qz: r(this.quat.z), qw: r(this.quat.w)
            };
        }

        const leftPos = this.getJointPositions(this.leftHandData);
        const rightPos = this.getJointPositions(this.rightHandData);

        const sm = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        const scoreM = document.querySelector('#score-display')?.components?.['score-manager'];
        const dataM = document.querySelector('#data-manager')?.components?.['data-manager'];
        const homeEl = document.querySelector('#home-rectangle');
        const homePos = homeEl?.getAttribute('position') || { x: 0, y: 0.9, z: -0.4 };

        let activeSphere = -1;
        if (sm?.activeSphere) {
            activeSphere = sm.allSpheres.indexOf(sm.activeSphere);
        }

        this.broadcast(JSON.stringify({
            seq: ++this.frameSeq,
            head,
            left: leftPos,
            right: rightPos,
            leftValid: leftPos !== null,
            rightValid: rightPos !== null,
            activeSphere,
            radius: sm?.radius ?? 0.45,
            height: sm?.height ?? 1.2,
            score: scoreM?.score ?? 0,
            condition: scoreM?.currentCondition ?? 1,
            dominantHand: scoreM?.dominantHand ?? 'LEFT',
            fireMode: scoreM?.isFireMode ?? false,
            isPaused: sm?.isPaused ?? true,
            trialCount: dataM?.trialNumber ?? 0,
            totalTrials: sm?.totalTrials ?? 352,
            homePos: { x: homePos.x, y: homePos.y, z: homePos.z }
        }));
    },

    remove: function () {
        if (this.leftController) {
            this.leftController.removeEventListener('hand-tracking-extras-ready', this.bindExtrasReady);
        }
        if (this.rightController) {
            this.rightController.removeEventListener('hand-tracking-extras-ready', this.bindExtrasReady);
        }
        this.el.sceneEl.removeEventListener('enter-vr', this.bindEnterVR);
        this.el.sceneEl.removeEventListener('exit-vr', this.bindExitVR);
        document.removeEventListener('visibilitychange', this.bindVisibility);
        window.removeEventListener('online', this.bindHeal);
        window.removeEventListener('beforeunload', this.bindUnload);
        clearInterval(this.healthInterval);
        if (this.healTimer) clearTimeout(this.healTimer);
        this.healTimer = null;
        const peer = this.peer;
        this.peer = null;
        if (peer) {
            try { peer.destroy(); } catch (e) {}
        }
    }
});

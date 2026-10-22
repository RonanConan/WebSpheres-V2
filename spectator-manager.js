const APP_VERSION = '2.0.0';

AFRAME.registerComponent('spectator-manager', {
    init: function () {
        this.HOST_ID = 'webspheres-host';
        this.STATE_INTERVAL = 1000;
        this.SYNC_INTERVAL = 250;
        this.SYNC_BATCH = 1500;
        this.lastSyncReply = 0;
        this.pendingSync = new Map();
        this.stateDirty = true;
        this.lastStateTime = 0;
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

        this.RECENTRE_DELAY = 1500;
        this.RECENTRE_WINDOW = 500;
        this.CUES = {
            lookAhead: 'Please look straight ahead',
            reach: 'Stretch one arm straight out',
            lap: 'Rest both hands in the green box',
            ready: 'Get ready...',
            paused: 'Short break',
            done: 'All done - thank you!'
        };
        this.recentre = null;
        this.cue = null;
        this.cueBeforeRecentre = null;

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
        this.recentre = null;
        this.activeSpace = null;
        this.baseSession = sceneEl.xrSession || sceneEl.renderer?.xr?.getSession?.() || null;
        this.baseRefSpace = this.baseSession ? sceneEl.renderer.xr.getReferenceSpace() : null;
    },

    onExitVR: function () {
        this.recentrePending = false;
        if (this.recentre) {
            this.recentre = null;
            if (this.cue === 'lookAhead') this.setCue(this.cueBeforeRecentre || null);
            this.broadcast(JSON.stringify({ type: 'recentre', ok: false, reason: 'Not in VR' }));
        }
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
            this.sendTo(conn, this.buildState());
        });
        conn.on('data', (rawData) => {
            this.lastSeen.set(conn, Date.now());
            this.handleMessage(rawData, conn);
        });
        conn.on('close', () => this.dropConnection(conn));
        conn.on('error', () => this.dropConnection(conn));
    },

    dropConnection: function (conn) {
        this.connections = this.connections.filter(c => c !== conn);
        this.lastSeen.delete(conn);
        this.pendingSync.delete(conn);
        try { conn.close(); } catch (e) {}
    },

    pruneConnections: function () {
        const now = Date.now();
        this.connections.slice().forEach(conn => {
            const seen = this.lastSeen.get(conn) || 0;
            if (!conn.open || now - seen > this.STALE_CONN_TIMEOUT) this.dropConnection(conn);
        });
    },

    handleMessage: function (rawData, conn) {
        let data;
        try { data = JSON.parse(rawData); } catch (e) { return; }
        if (!data || data.type === 'ping') return;
        if (data.type === 'cmd') {
            this.handleCommand(data, conn);
            return;
        }
        if (data.type === 'sync') {
            if (conn) this.pendingSync.set(conn, data.have || {});
            return;
        }
        if (data.code === 'KeyR') {
            this.recentrePending = true;
        } else if (data.code) {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: data.code, bubbles: true }));
        }
    },

    handleCommand: function (data, conn) {
        let result;
        if (data.name === 'recentre') {
            this.recentrePending = true;
            result = { ok: true };
        } else if (data.name === 'cue') {
            result = this.requestCue(data.value);
        } else {
            const sm = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
            result = sm?.runCommand ? sm.runCommand(data.name, data.value) : { ok: false, reason: 'Experiment not ready' };
        }
        if (conn) this.sendTo(conn, JSON.stringify({ type: 'cmdResult', id: data.id, ok: !!result.ok, reason: result.reason || '' }));
        this.sendState();
    },

    buildState: function () {
        const sm = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        const scoreM = document.querySelector('#score-display')?.components?.['score-manager'];
        const dataM = document.querySelector('#data-manager')?.components?.['data-manager'];
        const km = document.querySelector('#kinematics-manager')?.components?.['kinematics-manager'];
        return JSON.stringify({
            type: 'state',
            version: APP_VERSION,
            phase: sm?.phase ?? 'setup',
            endReason: sm?.endReason ?? '',
            participantId: dataM?.participantId ?? '',
            dominantHand: scoreM?.dominantHand ?? 'LEFT',
            condition: scoreM?.currentCondition ?? 1,
            mode: sm?.mode ?? 'standard',
            totalTrials: sm?.totalTrials ?? 352,
            setupLocked: sm?.setupLocked ?? false,
            calib: sm?.calib ?? null,
            recentred: !!this.activeSpace,
            cue: this.cue,
            sessionMs: dataM?.sessionStartTime > 0 ? (dataM.sessionEndTime || Date.now()) - dataM.sessionStartTime : 0,
            trialCount: dataM?.trialNumber ?? 0,
            recentreCount: dataM?.recentreCount ?? 0,
            pauses: dataM?.pauses?.length ?? 0,
            backup: {
                trials: dataM?.trialData?.length ?? 0,
                kinL: km?.leftHandData?.length ?? 0,
                kinR: km?.rightHandData?.length ?? 0,
                final: sm?.phase === 'complete' && km?.isTracking === false,
                exportTs: dataM?.lastExportTimestamp ?? ''
            },
            info: dataM?.buildSessionInfo ? dataM.buildSessionInfo() : ''
        });
    },

    replySync: function () {
        this.lastSyncReply = Date.now();
        const pending = this.pendingSync;
        this.pendingSync = new Map();
        const dataM = document.querySelector('#data-manager')?.components?.['data-manager'];
        const km = document.querySelector('#kinematics-manager')?.components?.['kinematics-manager'];
        if (!dataM || !km) return;
        const sources = [
            ['trials', dataM.trialData, dataM.TRIAL_HEADER, (t) => dataM.formatTrialRow(t), true],
            ['kinL', km.leftHandData, km.HEADER, null, false],
            ['kinR', km.rightHandData, km.HEADER, null, false]
        ];
        pending.forEach((have, conn) => {
            sources.forEach(([file, rows, header, format, all]) => {
                const from = Math.max(0, Math.floor(Number(have[file]) || 0));
                if (from >= rows.length) return;
                const end = all ? rows.length : Math.min(rows.length, from + this.SYNC_BATCH);
                const slice = rows.slice(from, end);
                this.sendTo(conn, JSON.stringify({ type: 'rows', file, from, header, lines: format ? slice.map(format) : slice }));
            });
        });
    },

    sendState: function () {
        this.stateDirty = false;
        this.lastStateTime = Date.now();
        if (this.connections.length === 0) return;
        let payload;
        try { payload = this.buildState(); } catch (e) { return; }
        this.broadcast(payload);
    },

    sendTo: function (conn, payload) {
        if (conn && conn.open) {
            try { conn.send(payload); } catch (e) {}
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

    recentreReady: function () {
        const sceneEl = this.el.sceneEl;
        const session = sceneEl.renderer?.xr?.getSession?.();
        if (!session || !sceneEl.frame) return { ok: false, reason: 'Not in VR' };
        if (!this.baseRefSpace || this.baseSession !== session) return { ok: false, reason: 'Tracking not ready' };
        return { ok: true };
    },

    setCue: function (id) {
        const text = id ? this.CUES[id] : '';
        if (id && !text) return;
        this.cue = id || null;
        const box = document.querySelector('#participant-cue');
        const label = document.querySelector('#participant-cue-text');
        if (label) label.setAttribute('value', text || '');
        if (box) box.setAttribute('visible', !!id);
        this.stateDirty = true;
    },

    requestCue: function (id) {
        const sm = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        if (sm && sm.phase !== 'setup') return { ok: false, reason: 'Cues are automatic once the session has started' };
        if (id !== null && !['reach', 'lap', 'ready'].includes(id)) return { ok: false, reason: 'Unknown cue' };
        if (this.recentre) this.cueBeforeRecentre = id;
        else this.setCue(id);
        return { ok: true };
    },

    trialInProgress: function () {
        const sm = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        return !!sm && (sm.phase === 'running' || sm.phase === 'pausing') && sm.currentState !== 'invisible';
    },

    beginRecentre: function (time) {
        const ready = this.recentreReady();
        if (!ready.ok) {
            this.broadcast(JSON.stringify({ type: 'recentre', ok: false, reason: ready.reason }));
            return;
        }
        this.recentre = { start: time, samples: [], invalid: false, error: null };
        this.cueBeforeRecentre = this.cue;
        if (!this.trialInProgress()) this.setCue('lookAhead');
    },

    sampleHead: function (time) {
        const r = this.recentre;
        if (!this.recentreReady().ok) return;
        try {
            const pose = this.el.sceneEl.frame.getViewerPose(this.baseRefSpace);
            if (!pose) return;
            const p = pose.transform.position;
            const q = pose.transform.orientation;
            const yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ').y;
            if ([p.x, p.z, yaw].every(Number.isFinite)) r.samples.push({ t: time, x: p.x, z: p.z, yaw });
            else r.invalid = true;
        } catch (e) {
            r.error = e;
        }
    },

    stepRecentre: function (time) {
        this.sampleHead(time);
        if (time - this.recentre.start < this.RECENTRE_DELAY) return;
        const r = this.recentre;
        this.recentre = null;
        if (this.cue === 'lookAhead') this.setCue(this.cueBeforeRecentre || null);
        const result = this.finishRecentre(r, time);
        this.broadcast(JSON.stringify({ type: 'recentre', ok: result.ok, reason: result.reason || '' }));
    },

    finishRecentre: function (r, time) {
        const ready = this.recentreReady();
        if (!ready.ok) return ready;
        const win = r.samples.filter(s => s.t >= time - this.RECENTRE_WINDOW);
        if (win.length === 0) {
            if (r.error) return { ok: false, reason: 'Error: ' + (r.error?.message || r.error) };
            return { ok: false, reason: r.invalid ? 'Invalid head pose' : 'Head not tracked' };
        }
        let sx = 0, sz = 0, ss = 0, sc = 0;
        win.forEach(s => { sx += s.x; sz += s.z; ss += Math.sin(s.yaw); sc += Math.cos(s.yaw); });
        return this.applyRecentre(sx / win.length, sz / win.length, Math.atan2(ss, sc));
    },

    applyRecentre: function (x, z, yaw) {
        try {
            const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
            if (![x, z, yawQuat.x, yawQuat.y, yawQuat.z, yawQuat.w].every(Number.isFinite)) {
                return { ok: false, reason: 'Invalid head pose' };
            }
            const offsetTransform = new XRRigidTransform(
                { x: x, y: 0, z: z, w: 1 },
                { x: yawQuat.x, y: yawQuat.y, z: yawQuat.z, w: yawQuat.w }
            );
            const space = this.baseRefSpace.getOffsetReferenceSpace(offsetTransform);

            this.el.sceneEl.renderer.xr.setReferenceSpace(space);
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
            if (!this.recentre) this.beginRecentre(time);
        }
        if (this.recentre) {
            try {
                this.stepRecentre(time);
            } catch (e) {
                this.recentre = null;
                this.broadcast(JSON.stringify({ type: 'recentre', ok: false, reason: 'Error: ' + (e?.message || e) }));
            }
        }
        this.syncReferenceSpaces();

        if (this.connections.length === 0) return;
        if (this.pendingSync.size && Date.now() - this.lastSyncReply >= this.SYNC_INTERVAL) {
            try { this.replySync(); } catch (e) {}
        }
        if (this.stateDirty || Date.now() - this.lastStateTime >= this.STATE_INTERVAL) this.sendState();
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

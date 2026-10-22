AFRAME.registerComponent('sphere-manager', {
    init: function () {
        this.currentState = 'invisible';
        this.activeSphere = null;
        this.allSpheres = [];
        this.appearTimer = null;
        this.disappearTimer = null;
        this.appearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.totalAppearances = 0;
        this.decisionTimeRecorded = false;
        this.lastSelectedPosition = -1;
        this.radius = 0.45;
        this.height = 1.2;
        this.isPaused = true;
        this.appearancesPerSphere = 32;
        this.totalTrials = 11 * this.appearancesPerSphere;
        this.mode = 'standard';
        this.phase = 'setup';
        this.endReason = '';
        this.setupLocked = false;
        this.selectionBeforeWait = -1;
        this.calib = {
            reach: { done: false, hand: '', distance: 0, radius: this.radius },
            height: { done: false, height: this.height },
            lap: { done: false, home: { x: 0, y: 0.9, z: -0.4 } }
        };
        this.fModeActive = false;
        this.bModeActive = false;
        this.currentPhase = 0;
        this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        this.leftJoints = null;
        this.rightJoints = null;
        this.collisionMargin = 0.02;

        this.leftWasAtHome = false;
        this.rightWasAtHome = false;
        this.homeTrackingInitialized = false;

        // Single home rectangle
        this.homeRectangle = document.querySelector('#home-rectangle');
        this.leftController = document.querySelector('[hand-tracking-controls="hand: left"]');
        this.rightController = document.querySelector('[hand-tracking-controls="hand: right"]');

        this.scoreDisplay = document.querySelector('#score-display');
        this.progressDisplay = document.querySelector('#progress-display');
        this.sparkleBurst = null;

        this._onExtrasReady = this.onExtrasReady.bind(this);
        if (this.leftController) {
            this.leftController.addEventListener('hand-tracking-extras-ready', this._onExtrasReady);
        }
        if (this.rightController) {
            this.rightController.addEventListener('hand-tracking-extras-ready', this._onExtrasReady);
        }

        this.createSpheres();
        this.setupCalibration();
        this.updateTextPositions();
    },

    onExtrasReady: function (evt) {
        const joints = evt?.detail?.data?.joints;
        if (!joints) return;

        const handAttr = evt.target.getAttribute('hand-tracking-controls');
        const side = handAttr && handAttr.hand;

        if (side === 'left') {
            this.leftJoints = joints;
        }
        if (side === 'right') {
            this.rightJoints = joints;
        }
    },

    createSpheres: function () {
        for (let i = 0; i < 11; i++) {
            let angle = -40 + (i * 8);
            let x = this.radius * Math.sin(angle * Math.PI / 180);
            let z = -this.radius * Math.cos(angle * Math.PI / 180);

            let crystal = document.createElement('a-octahedron');
            crystal.setAttribute('position', `${x} ${this.height} ${z}`);
            crystal.setAttribute('material', 'color: #00FFFF; opacity: 0.8; transparent: true; metalness: 0.8; roughness: 0.2');
            crystal.setAttribute('radius', '0.06');
            crystal.setAttribute('visible', 'false');
            crystal.setAttribute('id', `sphere-${i}`);
            crystal.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear');
            crystal.setAttribute('animation__pulse', {
                property: 'scale',
                from: '1 1 1',
                to: '1.08 1.08 1.08',
                dir: 'alternate',
                loop: true,
                dur: 900,
                easing: 'easeInOutSine'
            });

            this.el.sceneEl.appendChild(crystal);
            this.allSpheres.push(crystal);
        }
    },

    createFloatingNumber: function (spherePosition, points, hitType) {
        try {
            const floatingNumber = document.createElement('a-entity');
            floatingNumber.setAttribute('position', `${spherePosition.x} ${spherePosition.y + 0.1} ${spherePosition.z}`);
            floatingNumber.setAttribute('floating-number', {
                value: points,
                hitType: hitType
            });
            this.el.sceneEl.appendChild(floatingNumber);
        } catch (e) {
            console.warn("Error creating floating number:", e);
        }
    },

    createShockwave: function (position, options = {}) {
        try {
            const color = options.color || '#FFD700';
            const scaleTo = options.scale || 3;
            const opacity = options.opacity || 0.4;
            const duration = options.duration || 600;

            const torus = document.createElement('a-torus');
            torus.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
            torus.setAttribute('rotation', '90 0 0');
            torus.setAttribute('radius', '0.1');
            torus.setAttribute('radius-tubular', '0.01');
            torus.setAttribute('segments-tubular', '32');
            torus.setAttribute('segments-radial', '16');
            torus.setAttribute('material', `color: ${color}; opacity: ${opacity}; transparent: true; shader: flat`);

            torus.setAttribute('animation', {
                property: 'scale',
                to: `${scaleTo} ${scaleTo} ${scaleTo}`,
                dur: duration,
                easing: 'easeOutQuad'
            });

            torus.setAttribute('animation__fade', {
                property: 'material.opacity',
                from: opacity,
                to: 0,
                dur: duration,
                easing: 'easeOutQuad'
            });

            this.el.sceneEl.appendChild(torus);

            setTimeout(() => {
                if (torus.parentNode) torus.parentNode.removeChild(torus);
            }, duration + 50);
        } catch (e) {
            console.warn("Error creating shockwave:", e);
        }
    },

    createShatterEffect: function (position) {
        try {
            const fragmentCount = 6 + Math.floor(Math.random() * 3);
            const duration = 500;

            for (let i = 0; i < fragmentCount; i++) {
                const fragment = document.createElement('a-octahedron');
                fragment.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
                fragment.setAttribute('radius', '0.015');
                fragment.setAttribute('material', 'color: #00FFFF; opacity: 0.8; transparent: true; metalness: 0.8; roughness: 0.2');

                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const distance = 0.25 + Math.random() * 0.1;

                const targetX = position.x + distance * Math.sin(phi) * Math.cos(theta);
                const targetY = position.y + distance * Math.sin(phi) * Math.sin(theta);
                const targetZ = position.z + distance * Math.cos(phi);

                fragment.setAttribute('animation__move', {
                    property: 'position',
                    to: `${targetX} ${targetY} ${targetZ}`,
                    dur: duration,
                    easing: 'easeOutQuad'
                });

                fragment.setAttribute('animation__fade', {
                    property: 'material.opacity',
                    from: 0.8,
                    to: 0,
                    dur: duration,
                    easing: 'easeInQuad'
                });

                fragment.setAttribute('animation__shrink', {
                    property: 'scale',
                    from: '1 1 1',
                    to: '0.5 0.5 0.5',
                    dur: duration,
                    easing: 'easeInQuad'
                });

                this.el.sceneEl.appendChild(fragment);

                setTimeout(() => {
                    if (fragment.parentNode) fragment.parentNode.removeChild(fragment);
                }, duration + 50);
            }
        } catch (e) {
            console.warn("Error creating shatter effect:", e);
        }
    },

    createBlockConfetti: function () {
        try {
            const dashboard = document.querySelector('#holo-dashboard');
            if (!dashboard) return;

            const dashPos = dashboard.getAttribute('position');
            const particleCount = 14;
            const duration = 2500;
            const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#AA96DA'];

            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('a-plane');
                const side = i < particleCount / 2 ? -1 : 1;

                const startX = dashPos.x + (side * 0.6);
                const startY = dashPos.y - 0.35;
                const startZ = dashPos.z + 0.15;

                particle.setAttribute('position', `${startX} ${startY} ${startZ}`);
                particle.setAttribute('width', '0.025');
                particle.setAttribute('height', '0.025');
                particle.setAttribute('rotation', `${Math.random() * 360} ${Math.random() * 360} 0`);

                const color = colors[Math.floor(Math.random() * colors.length)];
                particle.setAttribute('material', `color: ${color}; opacity: 1; transparent: true; shader: flat; side: double`);

                const spreadX = side * (0.2 + Math.random() * 0.3);
                const spreadY = 0.1 + Math.random() * 0.25;

                const targetX = startX + spreadX;
                const targetY = startY + spreadY - 0.5;
                const targetZ = startZ + 0.1;

                particle.setAttribute('animation__move', {
                    property: 'position',
                    to: `${targetX} ${targetY} ${targetZ}`,
                    dur: duration,
                    easing: 'easeOutQuad'
                });

                particle.setAttribute('animation__fade', {
                    property: 'material.opacity',
                    from: 1,
                    to: 0,
                    dur: duration,
                    easing: 'easeInCubic'
                });

                this.el.sceneEl.appendChild(particle);

                setTimeout(() => {
                    if (particle.parentNode) particle.parentNode.removeChild(particle);
                }, duration + 50);
            }
        } catch (e) {
            console.warn("Error creating block confetti:", e);
        }
    },

    setupCalibration: function () {
        const keyActions = {
            Space: ['calibrate', 'reach'],
            KeyH: ['calibrate', 'height'],
            KeyL: ['calibrate', 'lap'],
            KeyS: ['saveOnHeadset'],
            KeyP: ['playPause'],
            KeyC: ['toggleCondition'],
            Digit1: ['setDominant', 'LEFT'],
            Digit2: ['setDominant', 'RIGHT'],
            KeyN: ['setMode', 'short'],
            KeyF: ['setMode', 'fmode'],
            KeyB: ['setMode', 'block'],
            KeyZ: ['skip']
        };
        document.addEventListener('keydown', (event) => {
            if (event.repeat) return;
            const action = keyActions[event.code];
            if (action) this.runCommand(action[0], action[1]);
        });
    },

    runCommand: function (name, value) {
        let result;
        try {
            result = this.doCommand(name, value);
        } catch (e) {
            result = { ok: false, reason: 'Error: ' + (e?.message || e) };
        }
        if (result.ok) {
            try {
                document.querySelector('#audio-manager').components['audio-manager'].playCalibrationSound('switch');
            } catch (e) {}
            this.markStateChanged();
        }
        return result;
    },

    setupOpen: function () {
        if (this.phase === 'complete') return { ok: false, reason: 'Session complete' };
        if (this.setupLocked) return { ok: false, reason: 'Setup locked - unlock setup first' };
        return { ok: true };
    },

    doCommand: function (name, value) {
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        const scoreManager = document.querySelector('#score-display').components['score-manager'];
        const phase = this.phase;
        const setupCommands = ['setParticipant', 'setDominant', 'setCondition', 'toggleCondition', 'setMode', 'calibrate'];
        if (setupCommands.includes(name)) {
            const open = this.setupOpen();
            if (!open.ok) return open;
        }
        switch (name) {
            case 'setParticipant':
                if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) return { ok: false, reason: 'Participant ID must be 1-32 letters, digits, _ or -' };
                if (/left|right/i.test(value)) return { ok: false, reason: 'Participant ID cannot contain "left" or "right" (the 3D viewer reads those in filenames)' };
                dataManager.participantId = value;
                return { ok: true };
            case 'setDominant':
                if (value !== 'LEFT' && value !== 'RIGHT') return { ok: false, reason: 'Dominant hand must be LEFT or RIGHT' };
                scoreManager.setDominantHand(value);
                return { ok: true };
            case 'setCondition':
                if (value !== 1 && value !== 2) return { ok: false, reason: 'Condition must be 1 or 2' };
                scoreManager.setCondition(value);
                return { ok: true };
            case 'toggleCondition':
                scoreManager.toggleCondition();
                return { ok: true };
            case 'setMode':
                if (!['standard', 'short', 'fmode', 'block'].includes(value)) return { ok: false, reason: 'Unknown mode' };
                this.setMode(value);
                return { ok: true };
            case 'calibrate':
                if (value === 'reach') return this.calibrateReach();
                if (value === 'height') return this.calibrateHeight();
                if (value === 'lap') return this.calibrateLap();
                return { ok: false, reason: 'Unknown calibration' };
            case 'start':
                if (phase !== 'setup') return { ok: false, reason: 'Session already started' };
                this.startSession();
                return { ok: true };
            case 'pause':
                if (phase !== 'running') return { ok: false, reason: 'Can only pause while running' };
                this.requestPause();
                return { ok: true };
            case 'resume':
                if (phase === 'pausing') {
                    this.phase = 'running';
                    return { ok: true };
                }
                if (phase !== 'paused') return { ok: false, reason: 'Not paused' };
                this.resumeSession();
                return { ok: true };
            case 'playPause':
                if (phase === 'setup') return this.doCommand('start');
                if (phase === 'running') return this.doCommand('pause');
                if (phase === 'pausing' || phase === 'paused') return this.doCommand('resume');
                return { ok: false, reason: 'Session complete' };
            case 'endEarly':
                if (phase !== 'running' && phase !== 'pausing' && phase !== 'paused') return { ok: false, reason: 'No session running' };
                this.completeSession('ended-early');
                return { ok: true };
            case 'unlockSetup':
                if (phase !== 'running' && phase !== 'pausing' && phase !== 'paused') return { ok: false, reason: 'Setup is only locked during a session' };
                if (this.setupLocked) {
                    this.setupLocked = false;
                    dataManager.logSetupUnlock();
                }
                return { ok: true };
            case 'saveOnHeadset':
                this.saveData();
                return { ok: true };
            case 'skip':
                if (phase !== 'running' && phase !== 'pausing') return { ok: false, reason: 'No trial running' };
                if (!this.activeSphere || (this.currentState !== 'waiting-to-appear' && this.currentState !== 'visible')) return { ok: false, reason: 'No target to skip' };
                this.skipTarget();
                return { ok: true };
            default:
                return { ok: false, reason: 'Unknown command' };
        }
    },

    markStateChanged: function () {
        const spectator = document.querySelector('#spectator-manager')?.components?.['spectator-manager'];
        if (spectator) spectator.stateDirty = true;
    },

    setHeadsetCue: function (id) {
        const spectator = document.querySelector('#spectator-manager')?.components?.['spectator-manager'];
        if (spectator?.setCue) spectator.setCue(id);
    },

    startSession: function () {
        const startTime = Date.now();
        this.setHeadsetCue(null);
        this.phase = 'running';
        this.setupLocked = true;
        this.resumeGame();
        document.querySelector('#kinematics-manager').components['kinematics-manager'].startTracking(startTime);
        document.querySelector('#data-manager').components['data-manager'].startSession(startTime);
    },

    requestPause: function () {
        if (this.currentState === 'waiting-to-appear') {
            if (this.appearTimer) {
                clearTimeout(this.appearTimer);
                this.appearTimer = null;
            }
            this.activeSphere = null;
            this.lastSelectedPosition = this.selectionBeforeWait;
            this.currentState = 'invisible';
        }
        if (this.currentState === 'invisible') {
            this.enterPaused();
        } else {
            this.phase = 'pausing';
        }
    },

    enterPaused: function () {
        this.phase = 'paused';
        this.isPaused = true;
        this.setHeadsetCue('paused');
        document.querySelector('#data-manager').components['data-manager'].startPause();
        this.markStateChanged();
    },

    resumeSession: function () {
        document.querySelector('#data-manager').components['data-manager'].endPause();
        this.setHeadsetCue(null);
        this.phase = 'running';
        this.setupLocked = true;
        this.resumeGame();
    },

    completeSession: function (reason) {
        if (this.phase === 'complete') return;
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        if (this.appearTimer) {
            clearTimeout(this.appearTimer);
            this.appearTimer = null;
        }
        if (reason === 'ended-early') {
            if (this.disappearTimer) {
                clearTimeout(this.disappearTimer);
                this.disappearTimer = null;
            }
            if (this.activeSphere) this.activeSphere.setAttribute('visible', false);
            this.activeSphere = null;
            this.currentState = 'invisible';
        }
        if (this.phase === 'paused') dataManager.endPause();
        this.phase = 'complete';
        this.endReason = reason;
        this.setupLocked = true;
        this.isPaused = true;
        this.setHeadsetCue('done');
        dataManager.scheduleFinalExport();
        this.markStateChanged();
    },

    calibrateReach: function () {
        const camera = document.querySelector('a-scene').camera;
        const cameraPos = camera?.el?.getAttribute('position');
        if (!cameraPos) return { ok: false, reason: 'Head not tracked' };
        const kinematicsManager = document.querySelector('#kinematics-manager').components['kinematics-manager'];

        let best = null;
        [['LEFT', this.leftController], ['RIGHT', this.rightController]].forEach(([hand, controller]) => {
            if (!kinematicsManager.isHandValid(controller)) return;
            const tip = this.getHandPosition(controller);
            if (!tip) return;
            const distance = Math.sqrt(
                Math.pow(tip.x - cameraPos.x, 2) +
                Math.pow(tip.y - cameraPos.y, 2) +
                Math.pow(tip.z - cameraPos.z, 2)
            );
            if (Number.isFinite(distance) && (!best || distance > best.distance)) best = { hand, distance };
        });

        if (!best) return { ok: false, reason: 'No hand tracked' };
        this.radius = Math.max(0.3, 0.8 * best.distance);
        this.updateSpherePositions();
        this.calib.reach = { done: true, hand: best.hand, distance: best.distance, radius: this.radius };
        return { ok: true };
    },

    calibrateHeight: function () {
        const camera = document.querySelector('a-scene').camera;
        const cameraPos = camera.el.getAttribute('position');
        if (!cameraPos || cameraPos.y === undefined) return { ok: false, reason: 'Head not tracked' };
        this.height = Math.max(0.5, 0.8 * cameraPos.y);
        this.updateSpherePositions();
        this.updateTextPositions();
        this.calib.height = { done: true, height: this.height };
        return { ok: true };
    },

    calibrateLap: function () {
        const leftPos = this.getHandPosition(this.leftController);
        const rightPos = this.getHandPosition(this.rightController);

        // Keep x centered at 0, average y and z from both hands
        let newY = 0.9;
        let newZ = -0.4;

        if (leftPos && rightPos) {
            newY = (leftPos.y + rightPos.y) / 2;
            newZ = ((leftPos.z + rightPos.z) / 2) + 0.02;
        } else if (leftPos) {
            newY = leftPos.y;
            newZ = leftPos.z + 0.02;
        } else if (rightPos) {
            newY = rightPos.y;
            newZ = rightPos.z + 0.02;
        }

        this.homeRectangle.setAttribute('position', `0 ${newY} ${newZ}`);
        this.calib.lap = { done: true, home: { x: 0, y: newY, z: newZ } };
        return { ok: true };
    },

    saveData: function () {
        document.querySelector('#data-manager').components['data-manager'].exportAll();
    },

    updateTextPositions: function () {
        const dashboard = document.querySelector('#holo-dashboard');
        if (dashboard) {
            dashboard.setAttribute('position', `0 ${this.height + 0.3} -1.2`);
        } else {
            if (this.scoreDisplay) {
                this.scoreDisplay.setAttribute('position', `0 ${this.height + 0.6} -1.2`);
            }
            if (this.progressDisplay) {
                this.progressDisplay.setAttribute('position', `0 ${this.height + 0.4} -1.2`);
            }
        }
    },

    updateSpherePositions: function () {
        for (let i = 0; i < 11; i++) {
            let angle = -40 + (i * 8);
            let x = this.radius * Math.sin(angle * Math.PI / 180);
            let z = -this.radius * Math.cos(angle * Math.PI / 180);
            this.allSpheres[i].setAttribute('position', `${x} ${this.height} ${z}`);
        }
    },

    resumeGame: function () {
        this.isPaused = false;
        this.currentState = 'invisible';
    },

    pauseGame: function () {
        this.isPaused = true;
        if (this.appearTimer) {
            clearTimeout(this.appearTimer);
            this.appearTimer = null;
        }
        if (this.disappearTimer) {
            clearTimeout(this.disappearTimer);
            this.disappearTimer = null;
        }
        if (this.activeSphere) {
            this.activeSphere.setAttribute('visible', false);
        }
        this.currentState = 'invisible';
    },

    setMode: function (mode) {
        this.appearancesPerSphere = 32;
        this.totalTrials = 352;
        this.fModeActive = false;
        this.bModeActive = false;
        this.currentPhase = 0;
        this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        if (mode === 'short') {
            this.appearancesPerSphere = 10;
            this.totalTrials = 110;
        } else if (mode === 'fmode') {
            this.appearancesPerSphere = 4;
            this.totalTrials = 44;
            this.fModeActive = true;
        } else if (mode === 'block') {
            this.appearancesPerSphere = 2;
            this.totalTrials = 110;
            this.bModeActive = true;
        }
        this.mode = mode;
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.updateTotalTrials(this.totalTrials);
    },

    skipTarget: function () {
        if (!this.activeSphere) return;
        if (this.currentState !== 'waiting-to-appear' && this.currentState !== 'visible') return;

        const sphereIndex = this.allSpheres.indexOf(this.activeSphere);

        if (this.currentState === 'waiting-to-appear') {
            this.appearanceCounts[sphereIndex]++;
            this.totalAppearances++;
            if (this.fModeActive || this.bModeActive) {
                this.phaseAppearanceCounts[sphereIndex]++;
                if (this.fModeActive && this.totalAppearances === 22) {
                    this.currentPhase = 1;
                    this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                }
                if (this.bModeActive && this.totalAppearances % 22 === 0) {
                    this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                }
            }
            const scoreManager = document.querySelector('#score-display').components['score-manager'];
            scoreManager.updateProgress(this.totalAppearances, this.totalTrials);
        }

        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.recordTrial(sphereIndex, 'NA', 0, 'SKIP', 0);

        if (this.appearTimer) {
            clearTimeout(this.appearTimer);
            this.appearTimer = null;
        }
        if (this.disappearTimer) {
            clearTimeout(this.disappearTimer);
            this.disappearTimer = null;
        }

        this.activeSphere.setAttribute('visible', false);
        this.activeSphere = null;
        this.decisionTimeRecorded = false;
        this.currentState = 'invisible';
    },

    getHandPosition: function (handController) {
        if (!handController?.components?.['hand-tracking-controls']) {
            return null;
        }
        return handController.components['hand-tracking-controls'].indexTipPosition;
    },

    selectRandomSphere: function () {
        let availablePositions = [];

        if (this.fModeActive || this.bModeActive) {
            for (let i = 0; i < 11; i++) {
                if (this.phaseAppearanceCounts[i] < 2 && i !== this.lastSelectedPosition) {
                    availablePositions.push(i);
                }
            }
            if (availablePositions.length === 0) {
                for (let i = 0; i < 11; i++) {
                    if (this.phaseAppearanceCounts[i] < 2) {
                        availablePositions.push(i);
                    }
                }
            }
        } else {
            for (let i = 0; i < 11; i++) {
                if (this.appearanceCounts[i] < this.appearancesPerSphere && i !== this.lastSelectedPosition) {
                    availablePositions.push(i);
                }
            }
            if (availablePositions.length === 0) {
                for (let i = 0; i < 11; i++) {
                    if (this.appearanceCounts[i] < this.appearancesPerSphere) {
                        availablePositions.push(i);
                    }
                }
            }
        }

        if (availablePositions.length === 0) return;

        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        const selectedPosition = availablePositions[randomIndex];
        this.selectionBeforeWait = this.lastSelectedPosition;
        this.activeSphere = this.allSpheres[selectedPosition];
        this.lastSelectedPosition = selectedPosition;
    },

    startAppearTimer: function () {
        this.appearTimer = setTimeout(() => {
            this.activeSphere.setAttribute('visible', true);

            const sphereIndex = this.allSpheres.indexOf(this.activeSphere);
            this.appearanceCounts[sphereIndex]++;
            this.totalAppearances++;

            if (this.fModeActive || this.bModeActive) {
                this.phaseAppearanceCounts[sphereIndex]++;
                if (this.fModeActive && this.totalAppearances === 22) {
                    this.currentPhase = 1;
                    this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                }
                if (this.bModeActive && this.totalAppearances % 22 === 0) {
                    this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                }
            }

            const scoreManager = document.querySelector('#score-display').components['score-manager'];
            scoreManager.updateProgress(this.totalAppearances, this.totalTrials);

            const dataManager = document.querySelector('#data-manager').components['data-manager'];
            dataManager.startDecisionTimer();
            this.decisionTimeRecorded = false;

            this.currentState = 'visible';
            this.appearTimer = null;
        }, 500);
    },

    startDisappearTimer: function () {
        this.disappearTimer = setTimeout(() => {
            this.activeSphere.setAttribute('visible', false);
            this.activeSphere = null;
            this.decisionTimeRecorded = false;
            this.homeTrackingInitialized = false;
            this.currentState = 'invisible';
            this.disappearTimer = null;
        }, 300);
    },

    isInsideSphere: function (handPos, spherePos) {
        const hitRadius = 0.08;
        const distance = Math.sqrt(
            Math.pow(handPos.x - spherePos.x, 2) +
            Math.pow(handPos.y - spherePos.y, 2) +
            Math.pow(handPos.z - spherePos.z, 2)
        );
        return distance < hitRadius;
    },

    isInsideRectangle: function (pos, rectanglePos) {
        // Half-dimensions for single centered box (0.8 x 0.12 x 0.22)
        const width = 0.4;
        const height = 0.06;
        const depth = 0.11;
        return Math.abs(pos.x - rectanglePos.x) < width &&
            Math.abs(pos.y - rectanglePos.y) < height &&
            Math.abs(pos.z - rectanglePos.z) < depth;
    },

    isAnyJointInsideRectangle: function (joints, rectanglePos) {
        if (!joints) return false;

        const jointNames = [
            'Wrist',
            'T_Tip', 'T_Distal', 'T_Proximal', 'T_Metacarpal',
            'I_Tip', 'I_Distal', 'I_Intermediate', 'I_Proximal', 'I_Metacarpal',
            'M_Tip', 'M_Distal', 'M_Intermediate', 'M_Proximal', 'M_Metacarpal',
            'R_Tip', 'R_Distal', 'R_Intermediate', 'R_Proximal', 'R_Metacarpal',
            'L_Tip', 'L_Distal', 'L_Intermediate', 'L_Proximal', 'L_Metacarpal'
        ];

        const jointPos = new THREE.Vector3();

        for (let jointName of jointNames) {
            const joint = joints[jointName];
            if (!joint || !joint.isValid()) continue;
            joint.getPosition(jointPos);
            if (this.isInsideRectangle(jointPos, rectanglePos)) return true;
        }
        return false;
    },

    checkJointCollisions: function (joints, spherePos) {
        if (!joints) return false;
        const jointNames = [
            'Wrist',
            'T_Tip', 'T_Distal', 'T_Proximal', 'T_Metacarpal',
            'I_Tip', 'I_Distal', 'I_Intermediate', 'I_Proximal', 'I_Metacarpal',
            'M_Tip', 'M_Distal', 'M_Intermediate', 'M_Proximal', 'M_Metacarpal',
            'R_Tip', 'R_Distal', 'R_Intermediate', 'R_Proximal', 'R_Metacarpal',
            'L_Tip', 'L_Distal', 'L_Intermediate', 'L_Proximal', 'L_Metacarpal'
        ];

        const jointPos = new THREE.Vector3();

        for (let jointName of jointNames) {
            const joint = joints[jointName];
            if (!joint || !joint.isValid()) continue;
            joint.getPosition(jointPos);
            if (this.isInsideSphere(jointPos, spherePos)) return true;
        }
        return false;
    },

    handleHit: function (handUsed, spherePos) {
        if (this.currentState !== 'visible') return;

        try {
            const scoreManager = document.querySelector('#score-display').components['score-manager'];
            const result = scoreManager.calculateHitPoints(handUsed);
            scoreManager.addPoints(result.points, result.hitType, handUsed);

            this.activeSphere.setAttribute('visible', false);

            try {
                this.createFloatingNumber(spherePos, result.points, result.hitType);

                if (result.hitType === 'critical') {
                    this.createShockwave(spherePos, { color: '#FFD700', scale: 3, opacity: 0.4 });
                } else {
                    this.createShockwave(spherePos, { color: '#888888', scale: 1.5, opacity: 0.2 });
                }

                if (result.hitType === 'critical') {
                    if (!this.sparkleBurst) {
                        this.sparkleBurst = document.querySelector('#sparkle-burst');
                    }
                    if (this.sparkleBurst && this.sparkleBurst.components['sparkle-system']) {
                        const sphereVec3 = new THREE.Vector3(spherePos.x, spherePos.y, spherePos.z);
                        this.sparkleBurst.components['sparkle-system'].createBurst(sphereVec3);
                    }

                    this.createShatterEffect(spherePos);
                }
            } catch (fxError) {
                console.warn("FX Generation failed:", fxError);
            }

            const sphereIndex = this.allSpheres.indexOf(this.activeSphere);
            const dataManager = document.querySelector('#data-manager').components['data-manager'];
            dataManager.calculateAndStoreMovementTime();
            dataManager.recordTrial(
                sphereIndex,
                handUsed,
                result.points,
                result.hitType,
                dataManager.currentDecisionTime
            );

            if (this.bModeActive && this.totalAppearances > 0 && this.totalAppearances % 22 === 0) {
                const audioManager = document.querySelector('#audio-manager').components['audio-manager'];
                audioManager.playConfettiSound();
                this.createBlockConfetti();
            }

        } catch (e) {
            console.error("Critical error in handleHit:", e);
        } finally {
            this.currentState = 'cooldown';
            this.startDisappearTimer();
        }
    },

    tick: function () {
        if (this.phase === 'pausing' && this.currentState === 'invisible') this.enterPaused();
        if (this.isPaused) return;

        const homeRectPos = this.homeRectangle.getAttribute('position');

        // Check if each hand has ANY joint inside the single home box
        let leftAtHome = false;
        let rightAtHome = false;

        if (this.leftJoints) {
            leftAtHome = this.isAnyJointInsideRectangle(this.leftJoints, homeRectPos);
        } else {
            // Fallback to fingertip if joints not available
            const leftPos = this.getHandPosition(this.leftController);
            leftAtHome = leftPos && this.isInsideRectangle(leftPos, homeRectPos);
        }

        if (this.rightJoints) {
            rightAtHome = this.isAnyJointInsideRectangle(this.rightJoints, homeRectPos);
        } else {
            // Fallback to fingertip if joints not available
            const rightPos = this.getHandPosition(this.rightController);
            rightAtHome = rightPos && this.isInsideRectangle(rightPos, homeRectPos);
        }

        if (this.currentState === 'invisible' && this.totalAppearances < this.totalTrials) {
            if (leftAtHome && rightAtHome) {
                this.selectRandomSphere();
                if (this.activeSphere) {
                    this.currentState = 'waiting-to-appear';
                    this.startAppearTimer();
                }
            }
        }

        if (this.currentState === 'visible') {
            if (!this.homeTrackingInitialized) {
                this.leftWasAtHome = leftAtHome;
                this.rightWasAtHome = rightAtHome;
                this.homeTrackingInitialized = true;
            }

            if (!this.decisionTimeRecorded) {
                const leftLeftHome = this.leftWasAtHome && !leftAtHome;
                const rightLeftHome = this.rightWasAtHome && !rightAtHome;

                if (leftLeftHome || rightLeftHome) {
                    const dataManager = document.querySelector('#data-manager').components['data-manager'];
                    dataManager.stopDecisionTimer();
                    this.decisionTimeRecorded = true;
                }
                this.leftWasAtHome = leftAtHome;
                this.rightWasAtHome = rightAtHome;
            }
        }

        if (this.currentState === 'visible' && this.activeSphere) {
            const spherePos = this.activeSphere.getAttribute('position');
            if (this.leftJoints || this.rightJoints) {
                const leftCollision = this.checkJointCollisions(this.leftJoints, spherePos);
                const rightCollision = this.checkJointCollisions(this.rightJoints, spherePos);
                if (leftCollision) { this.handleHit('LEFT', spherePos); return; }
                if (rightCollision) { this.handleHit('RIGHT', spherePos); return; }
            } else {
                const leftPos = this.getHandPosition(this.leftController);
                const rightPos = this.getHandPosition(this.rightController);
                if (leftPos && this.isInsideSphere(leftPos, spherePos)) { this.handleHit('LEFT', spherePos); }
                else if (rightPos && this.isInsideSphere(rightPos, spherePos)) { this.handleHit('RIGHT', spherePos); }
            }
        }
    }
});

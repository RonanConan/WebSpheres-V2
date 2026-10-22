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
        this.trialsSwitched = false;
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
        document.addEventListener('keydown', (event) => {
            const audioManager = document.querySelector('#audio-manager').components['audio-manager'];

            if (event.code === 'Space') {
                audioManager.playCalibrationSound('switch');
                this.calibrateReach();
            }
            if (event.code === 'KeyH') {
                audioManager.playCalibrationSound('switch');
                this.calibrateHeight();
            }
            if (event.code === 'KeyL') {
                audioManager.playCalibrationSound('switch');
                this.calibrateLap();
            }
            if (event.code === 'KeyS') {
                audioManager.playCalibrationSound('switch');
                this.saveData();
            }
            if (event.code === 'KeyP') {
                audioManager.playCalibrationSound('switch');
                this.resumeGame();
                const startTime = Date.now();
                const kinematicsManager = document.querySelector('#kinematics-manager').components['kinematics-manager'];
                kinematicsManager.startTracking(startTime);
                const dataManager = document.querySelector('#data-manager').components['data-manager'];
                dataManager.startSession(startTime);
            }
            if (event.code === 'KeyC') {
                audioManager.playCalibrationSound('switch');
                const scoreManager = document.querySelector('#score-display').components['score-manager'];
                scoreManager.toggleCondition();
            }
            if (event.code === 'Digit1') {
                audioManager.playCalibrationSound('switch');
                const scoreManager = document.querySelector('#score-display').components['score-manager'];
                scoreManager.setDominantHand('LEFT');
            }
            if (event.code === 'Digit2') {
                audioManager.playCalibrationSound('switch');
                const scoreManager = document.querySelector('#score-display').components['score-manager'];
                scoreManager.setDominantHand('RIGHT');
            }
            if (event.code === 'KeyN') {
                audioManager.playCalibrationSound('switch');
                this.switchToShortSession();
            }
            if (event.code === 'KeyF') {
                audioManager.playCalibrationSound('switch');
                this.setTwoReachesPerSphere();
            }
            if (event.code === 'KeyB') {
                audioManager.playCalibrationSound('switch');
                this.setBlockMode();
            }
            if (event.code === 'KeyZ') {
                audioManager.playCalibrationSound('switch');
                this.skipTarget();
            }
        });
    },

    calibrateReach: function () {
        const camera = document.querySelector('a-scene').camera;
        const cameraPos = camera.el.getAttribute('position');
        const rightPos = this.getHandPosition(this.rightController);

        if (rightPos && cameraPos) {
            const distance = Math.sqrt(
                Math.pow(rightPos.x - cameraPos.x, 2) +
                Math.pow(rightPos.y - cameraPos.y, 2) +
                Math.pow(rightPos.z - cameraPos.z, 2)
            );
            this.radius = Math.max(0.3, 0.8 * distance);
            this.updateSpherePositions();
        }
    },

    calibrateHeight: function () {
        const camera = document.querySelector('a-scene').camera;
        const cameraPos = camera.el.getAttribute('position');
        if (cameraPos && cameraPos.y !== undefined) {
            this.height = Math.max(0.5, 0.8 * cameraPos.y);
            this.updateSpherePositions();
            this.updateTextPositions();
        }
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
    },

    saveData: function () {
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.exportCSV();
        const kinematicsManager = document.querySelector('#kinematics-manager').components['kinematics-manager'];
        kinematicsManager.exportCSV();
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

    switchToShortSession: function () {
        if (this.trialsSwitched) return;
        this.appearancesPerSphere = 10;
        this.totalTrials = 110;
        this.trialsSwitched = true;
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.updateTotalTrials(110);
    },

    setTwoReachesPerSphere: function () {
        if (this.trialsSwitched) return;
        this.appearancesPerSphere = 4;
        this.totalTrials = 44;
        this.trialsSwitched = true;
        this.fModeActive = true;
        this.currentPhase = 0;
        this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.updateTotalTrials(44);
    },

    setBlockMode: function () {
        if (this.trialsSwitched) return;
        this.appearancesPerSphere = 2;
        this.totalTrials = 110;
        this.trialsSwitched = true;
        this.bModeActive = true;
        this.phaseAppearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.updateTotalTrials(110);
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

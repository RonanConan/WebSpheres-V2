AFRAME.registerComponent('score-manager', {
    init: function () {
        this.score = 0;
        this.scoreTextEl = this.el;
        this.progressFillEl = document.querySelector('#progress-fill');
        this.progressTextEl = document.querySelector('#progress-display');

        this.dashboardContainer = document.querySelector('#holo-dashboard');
        this.dashboardBg = document.querySelector('#dashboard-bg');
        this.dashboardBorders = document.querySelectorAll('.dashboard-border');

        this.currentStreak = 0;
        this.isFireMode = false;

        this.leftHandCriticalChance = 0.3;
        this.rightHandCriticalChance = 0.3;
        this.currentCondition = 1;
        this.dominantHand = 'LEFT';

        // Milestone tracking - persisted
        this.lastMilestoneReached = 0;
    },

    toggleCondition: function () {
        this.currentCondition = this.currentCondition === 1 ? 2 : 1;
        this.updateProbabilities();
    },

    setDominantHand: function (hand) {
        this.dominantHand = hand;
        this.updateProbabilities();
    },

    updateProbabilities: function () {
        if (this.currentCondition === 1) {
            this.leftHandCriticalChance = 0.3;
            this.rightHandCriticalChance = 0.3;
        } else {
            if (this.dominantHand === 'LEFT') {
                this.leftHandCriticalChance = 0.05;
                this.rightHandCriticalChance = 0.55;
            } else {
                this.leftHandCriticalChance = 0.55;
                this.rightHandCriticalChance = 0.05;
            }
        }
    },

    calculateHitPoints: function (handUsed) {
        const random = Math.random();
        const audioManager = document.querySelector('#audio-manager').components['audio-manager'];

        const criticalChance = handUsed === 'LEFT' ? this.leftHandCriticalChance : this.rightHandCriticalChance;

        if (random < (1 - criticalChance)) {
            audioManager.playHitSound('normal');
            return {
                points: Math.floor(Math.random() * 5) + 1,
                hitType: 'normal'
            };
        } else {
            audioManager.playHitSound('critical');
            return {
                points: Math.floor(Math.random() * 6) + 5,
                hitType: 'critical'
            };
        }
    },

    addPoints: function (amount, hitType, handUsed) {
        this.score += amount;
        this.updateDisplay();

        const audioManager = document.querySelector('#audio-manager').components['audio-manager'];

        // Check for 100-point milestone FIRST
        const currentMilestone = Math.floor(this.score / 100);
        if (currentMilestone > this.lastMilestoneReached) {
            this.lastMilestoneReached = currentMilestone;
            this.el.sceneEl.emit('haze-milestone');
        } else if (hitType === 'critical') {
            // Only emit critical if no milestone
            this.el.sceneEl.emit('haze-critical-hit');
        } else {
            // Only emit normal if no milestone
            this.el.sceneEl.emit('haze-normal-hit');
        }

        // === STREAK LOGIC ===
        if (handUsed === this.dominantHand) {
            // Dominant hand always breaks streak
            if (this.isFireMode) {
                this.exitFireMode(audioManager);
            }
            this.currentStreak = 0;
        } else {
            // Non-dominant hand
            if (this.isFireMode) {
                // Phase 2: Already in fire mode - any non-dominant hit maintains it
                if (hitType === 'critical') {
                    this.triggerPulseAnimation();
                }
            } else {
                // Phase 1: Building toward fire mode - strict consecutive
                if (hitType === 'critical') {
                    this.currentStreak++;
                    if (this.currentStreak === 3) {
                        this.enterFireMode(audioManager);
                    }
                    this.triggerPulseAnimation();
                } else {
                    // Normal hit while building - reset
                    this.currentStreak = 0;
                }
            }
        }
    },

    enterFireMode: function (audioManager) {
        this.isFireMode = true;

        audioManager.playFireVoice();

        this.dashboardBg.setAttribute('animation__color', {
            property: 'material.color',
            to: '#551100',
            dur: 500,
            easing: 'easeOutQuad'
        });

        this.dashboardBorders.forEach(border => {
            border.setAttribute('animation__color', {
                property: 'material.color',
                to: '#FF4500',
                dur: 500,
                easing: 'easeOutQuad'
            });
        });

        this.dashboardContainer.setAttribute('animation__heartbeat', {
            property: 'scale',
            from: '1 1 1',
            to: '1.02 1.02 1.02',
            dur: 1000,
            dir: 'alternate',
            loop: true,
            easing: 'easeInOutSine'
        });
    },

    exitFireMode: function (audioManager) {
        this.isFireMode = false;

        audioManager.playStreakBreak();

        this.dashboardBg.setAttribute('animation__color', {
            property: 'material.color',
            to: '#000000',
            dur: 800,
            easing: 'easeOutQuad'
        });

        this.dashboardBorders.forEach(border => {
            border.setAttribute('animation__color', {
                property: 'material.color',
                to: '#00ffff',
                dur: 800,
                easing: 'easeOutQuad'
            });
        });

        this.dashboardContainer.removeAttribute('animation__heartbeat');
        this.dashboardContainer.setAttribute('scale', '1 1 1');
    },

    triggerPulseAnimation: function () {
        this.scoreTextEl.removeAttribute('animation__pulse');
        this.scoreTextEl.setAttribute('animation__pulse', {
            property: 'scale',
            from: '2 2 2',
            to: '1 1 1',
            dur: 300,
            easing: 'easeOutElastic'
        });

        this.scoreTextEl.setAttribute('color', '#00ffff');
        setTimeout(() => {
            this.scoreTextEl.setAttribute('color', '#FFFFFF');
        }, 200);
    },

    updateProgress: function (current, total) {
        const percentage = Math.round((current / total) * 100);
        if (this.progressTextEl) {
            this.progressTextEl.setAttribute('value', `${percentage}%`);
        }
        if (this.progressFillEl) {
            const decimal = current / total;
            const scaleX = Math.min(Math.max(decimal, 0), 1);
            this.progressFillEl.object3D.scale.set(scaleX, 1, 1);
        }
    },

    updateDisplay: function () {
        this.el.setAttribute('value', `${this.score}`);
    },

    getScore: function () {
        return this.score;
    }
});

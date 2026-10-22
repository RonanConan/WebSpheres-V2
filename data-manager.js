AFRAME.registerComponent('data-manager', {
    TRIAL_HEADER: 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID\n',

    init: function() {
        this.trialData = [];
        this.trialNumber = 0;
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        this.totalTrials = 352;
        this.sessionStartTime = 0;
        this.recentreCount = 0;
        this.participantId = '';
        this.sessionEndTime = 0;
        this.lastExportTimestamp = '';
        this.pauses = [];
        this.setupUnlocks = [];
        this.finalExportScheduled = false;
        this.setupManualExport();
    },

    sessionTime: function() {
        return this.sessionStartTime > 0 ? Date.now() - this.sessionStartTime : 0;
    },

    startPause: function() {
        this.pauses.push({ start: this.sessionTime(), end: null });
    },

    endPause: function() {
        const last = this.pauses[this.pauses.length - 1];
        if (last && last.end === null) last.end = this.sessionTime();
    },

    logSetupUnlock: function() {
        this.setupUnlocks.push(this.sessionTime());
    },

    scheduleFinalExport: function() {
        if (this.finalExportScheduled) return;
        this.finalExportScheduled = true;
        this.sessionEndTime = Date.now();
        setTimeout(() => {
            document.querySelector('#kinematics-manager').components['kinematics-manager'].stopTracking();
            this.exportAll();
        }, 1000);
    },

    filePrefix: function() {
        return this.participantId ? this.participantId + '_' : '';
    },

    fileTimestamp: function() {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    },

    formatTrialRow: function(trial) {
        return `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},${trial.hitType},${trial.decisionTime},${trial.totalMovementTime},${trial.recentreCount},${trial.participantId}\n`;
    },

    buildSessionInfo: function() {
        const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        const scoreManager = document.querySelector('#score-display')?.components?.['score-manager'];
        const home = document.querySelector('#home-rectangle')?.getAttribute('position') || {};
        const reach = sphereManager?.calib?.reach || {};
        const iso = (t) => t > 0 ? new Date(t).toISOString() : '';
        const rows = [
            ['ParticipantID', this.participantId],
            ['AppVersion', typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''],
            ['SessionStartISO', iso(this.sessionStartTime)],
            ['SessionEndISO', iso(this.sessionEndTime)],
            ['EndReason', sphereManager?.endReason ?? ''],
            ['DominantHand', scoreManager?.dominantHand ?? ''],
            ['Condition', scoreManager?.currentCondition ?? ''],
            ['Mode', sphereManager?.mode ?? ''],
            ['TotalTrials', sphereManager?.totalTrials ?? this.totalTrials],
            ['TrialsCompleted', this.trialNumber],
            ['ReachHand', reach.done ? reach.hand : ''],
            ['ReachDistance', reach.done ? reach.distance : ''],
            ['Radius', sphereManager?.radius ?? ''],
            ['Height', sphereManager?.height ?? ''],
            ['HomeX', home.x ?? ''],
            ['HomeY', home.y ?? ''],
            ['HomeZ', home.z ?? ''],
            ['RecentreCount', this.recentreCount],
            ['Pauses', this.pauses.map(p => `${p.start}-${p.end === null ? '' : p.end}`).join(';')],
            ['SetupUnlocks', this.setupUnlocks.join(';')]
        ];
        return 'Key,Value\n' + rows.map(([k, v]) => `${k},${v}\n`).join('');
    },

    download: function(filename, parts) {
        const blob = new Blob(parts, { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    exportAll: function() {
        const timestamp = this.fileTimestamp();
        this.lastExportTimestamp = timestamp;
        this.exportCSV(timestamp);
        document.querySelector('#kinematics-manager').components['kinematics-manager'].exportCSV(timestamp);
        if (this.sessionStartTime > 0) {
            this.download(`${this.filePrefix()}session-info-${timestamp}.csv`, [this.buildSessionInfo()]);
        }
    },
    
    setupManualExport: function() {
        this.buttonPressCount = 0;
        this.lastPressTime = 0;
        this.listenerAttached = false;
        
        // Try to attach listener periodically until successful
        this.attachInterval = setInterval(() => {
            this.tryAttachListener();
        }, 1000);
    },
    
    tryAttachListener: function() {
        if (this.listenerAttached) return;
        
        const rightController = document.querySelector('[meta-touch-controls="hand: right"]');
        if (rightController) {
            rightController.addEventListener('abuttondown', () => {
                this.handleAButtonPress();
            });
            this.listenerAttached = true;
            clearInterval(this.attachInterval);
        }
    },
    
    handleAButtonPress: function() {
        const currentTime = Date.now();
        
        // Reset count if more than 2 seconds since last press
        if (currentTime - this.lastPressTime > 2000) {
            this.buttonPressCount = 0;
        }
        
        this.buttonPressCount++;
        this.lastPressTime = currentTime;
        
        console.log(`A button pressed ${this.buttonPressCount}/5 times`);
        
        if (this.buttonPressCount >= 5) {
            this.exportCSV();
            this.buttonPressCount = 0; // Reset after export
        }
    },
    
    startSession: function(startTime) {
        this.sessionStartTime = startTime || Date.now();
    },
    
    logRecentre: function() {
        if (this.sessionStartTime > 0) this.recentreCount++;
    },
    
    startDecisionTimer: function() {
        this.sphereAppearTime = Date.now();
        this.currentDecisionTime = 0;
    },
    
    stopDecisionTimer: function() {
        if (this.sphereAppearTime > 0) {
            this.currentDecisionTime = Date.now() - this.sphereAppearTime;
        }
    },
    
    calculateAndStoreMovementTime: function() {
        if (this.sphereAppearTime > 0) {
            this.currentMovementTime = Date.now() - this.sphereAppearTime;
        }
    },
    
    recordTrial: function(targetPosition, handUsed, points, hitType, decisionTime) {
        this.trialNumber++;
        this.trialData.push({
            trial: this.trialNumber,
            timestamp: Date.now() - this.sessionStartTime,
            target: targetPosition + 1, // Convert 0-10 to 1-11
            hand: handUsed,
            points: points,
            hitType: hitType,
            decisionTime: decisionTime,
            totalMovementTime: this.currentMovementTime,
            recentreCount: this.recentreCount,
            participantId: this.participantId
        });
        
        console.log(`Trial ${this.trialNumber}: Target ${targetPosition + 1}, Hand ${handUsed}, Points ${points}, Type ${hitType}, Decision Time ${decisionTime}ms`);
        
        // Reset timer for next trial
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        
        // Check if session complete (110 trials)
        if (this.trialNumber >= this.totalTrials) {
            const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
            if (sphereManager?.completeSession) sphereManager.completeSession('finished');
            else this.scheduleFinalExport();
        }
    },
    
    exportCSV: function(timestamp) {
        if (this.trialData.length === 0) {
            return;
        }
        const csvContent = this.TRIAL_HEADER + this.trialData.map(trial => this.formatTrialRow(trial)).join('');
        this.download(`${this.filePrefix()}vr-session-data-${timestamp || this.fileTimestamp()}.csv`, [csvContent]);
    },
    
    updateTotalTrials: function(newTotal) {
        this.totalTrials = newTotal;
    },
    
    getTrialCount: function() {
        return this.trialNumber;
    },
    
    resetSession: function() {
        this.trialData = [];
        this.trialNumber = 0;
        this.recentreCount = 0;
    }
});

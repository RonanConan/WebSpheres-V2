AFRAME.registerComponent('data-manager', {
    init: function() {
        this.trialData = [];
        this.trialNumber = 0;
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        this.totalTrials = 352;
        this.sessionStartTime = 0;
        this.recentreCount = 0;
        this.setupManualExport();
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
            recentreCount: this.recentreCount
        });
        
        console.log(`Trial ${this.trialNumber}: Target ${targetPosition + 1}, Hand ${handUsed}, Points ${points}, Type ${hitType}, Decision Time ${decisionTime}ms`);
        
        // Reset timer for next trial
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        
        // Check if session complete (110 trials)
        if (this.trialNumber >= this.totalTrials) {
            setTimeout(() => {
                this.exportCSV();
                const kinematicsManager = document.querySelector('#kinematics-manager').components['kinematics-manager'];
                kinematicsManager.exportCSV();
            }, 1000); // Delay to ensure last trial is recorded
        }
    },
    
    exportCSV: function() {
        if (this.trialData.length === 0) {
            return;
        }
        
        // Generate CSV content
        let csvContent = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount\n';
        
        this.trialData.forEach(trial => {
            csvContent += `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},${trial.hitType},${trial.decisionTime},${trial.totalMovementTime},${trial.recentreCount}\n`;
        });
        
        // Create and download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `vr-session-data-${timestamp}.csv`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
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

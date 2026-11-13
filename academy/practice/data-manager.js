AFRAME.registerComponent('data-manager', {
    TRIAL_HEADER: 'Trial,Timestamp,Target,Hand,Points,HitType\n',

    init: function () {
        this.trialData = [];
        this.trialNumber = 0;
        this.sessionStartTime = Date.now();
    },

    recordTrial: function (targetPosition, handUsed, points, hitType) {
        this.trialNumber++;
        this.trialData.push({
            trial: this.trialNumber,
            timestamp: Date.now() - this.sessionStartTime,
            target: targetPosition + 1,
            hand: handUsed,
            points: points,
            hitType: hitType
        });

        console.log(`Trial ${this.trialNumber}: Target ${targetPosition + 1}, Hand ${handUsed}, Points ${points}, Type ${hitType}`);
    },

    formatTrialRow: function (trial) {
        return `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},${trial.hitType}\n`;
    },

    buildCSV: function () {
        return this.TRIAL_HEADER + this.trialData.map(trial => this.formatTrialRow(trial)).join('');
    }
});

AFRAME.registerComponent('score-manager', {
    init: function () {
        this.score = 0;
        this.leftHandCriticalChance = 0.3;
        this.rightHandCriticalChance = 0.3;
    },

    calculateHitPoints: function (handUsed) {
        const random = Math.random();
        const criticalChance = handUsed === 'LEFT' ? this.leftHandCriticalChance : this.rightHandCriticalChance;

        if (random < (1 - criticalChance)) {
            return {
                points: Math.floor(Math.random() * 5) + 1,
                hitType: 'normal'
            };
        } else {
            return {
                points: Math.floor(Math.random() * 6) + 5,
                hitType: 'critical'
            };
        }
    },

    addPoints: function (amount) {
        this.score += amount;
        this.el.setAttribute('text', 'value', `Score: ${this.score}`);
    },

    showBlockComplete: function () {
        this.el.setAttribute('text', 'value', `Block complete. Score: ${this.score}`);
    }
});

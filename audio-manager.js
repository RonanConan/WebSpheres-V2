AFRAME.registerComponent('audio-manager', {
    init: function () {
        this.createSounds();
    },

    createSounds: function () {
        // --- Hit Sounds (randomized) ---
        this.normalSounds = [
            new Audio('sounds/normal-hit-1.mp3'),
            new Audio('sounds/normal-hit-2.mp3'),
            new Audio('sounds/normal-hit-3.mp3'),
            new Audio('sounds/normal-hit-4.mp3')
        ];

        this.criticalSounds = [
            new Audio('sounds/critical-hit-1.mp3'),
            new Audio('sounds/critical-hit-2.mp3'),
            new Audio('sounds/critical-hit-3.mp3'),
            new Audio('sounds/critical-hit-4.mp3')
        ];

        // --- Calibration Sounds ---
        this.reachCalibrationSound = new Audio('sounds/reach-calibration.mp3');
        this.heightCalibrationSound = new Audio('sounds/height-calibration.mp3');
        this.lapCalibrationSound = new Audio('sounds/lap-calibration.mp3');
        this.switchSound = new Audio('sounds/switch.mp3');
        this.leftHandSound = new Audio('sounds/left-hand.mp3');
        this.rightHandSound = new Audio('sounds/right-hand.mp3');

        // --- Streak Sounds ---
        this.hissSound = new Audio('sounds/hiss.mp3');

        this.streakVoices = [
            new Audio('sounds/fire.mp3'),
            new Audio('sounds/great.mp3'),
            new Audio('sounds/amazing.mp3'),
            new Audio('sounds/wow.mp3')
        ];

        this.streakVoices.forEach(sound => sound.preload = 'auto');

        // --- Block Complete Sound ---
        this.confettiSound = new Audio('sounds/confetti.mp3');
    },

    playHitSound: function (hitType) {
        if (hitType === 'normal') {
            const randomIndex = Math.floor(Math.random() * this.normalSounds.length);
            const sound = this.normalSounds[randomIndex];
            sound.currentTime = 0;
            sound.play();
        } else if (hitType === 'critical') {
            const randomIndex = Math.floor(Math.random() * this.criticalSounds.length);
            const sound = this.criticalSounds[randomIndex];
            sound.currentTime = 0;
            sound.play();
        }
    },

    playFireVoice: function () {
        const randomIndex = Math.floor(Math.random() * this.streakVoices.length);
        const sound = this.streakVoices[randomIndex];
        sound.currentTime = 0;
        sound.play();
    },

    playStreakBreak: function () {
        this.hissSound.currentTime = 0;
        this.hissSound.play();
    },

    playConfettiSound: function () {
        this.confettiSound.currentTime = 0;
        this.confettiSound.play();
    },

    playCalibrationSound: function (soundType) {
        if (soundType === 'reach-calibration') {
            this.reachCalibrationSound.currentTime = 0;
            this.reachCalibrationSound.play();
        } else if (soundType === 'height-calibration') {
            this.heightCalibrationSound.currentTime = 0;
            this.heightCalibrationSound.play();
        } else if (soundType === 'lap-calibration') {
            this.lapCalibrationSound.currentTime = 0;
            this.lapCalibrationSound.play();
        } else if (soundType === 'switch') {
            this.switchSound.currentTime = 0;
            this.switchSound.play();
        } else if (soundType === 'left-hand') {
            this.leftHandSound.currentTime = 0;
            this.leftHandSound.play();
        } else if (soundType === 'right-hand') {
            this.rightHandSound.currentTime = 0;
            this.rightHandSound.play();
        }
    }
});
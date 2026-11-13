AFRAME.registerComponent('sphere-manager', {
    init: function () {
        this.radius = 0.45;
        this.height = 1.0;
        this.appearanceCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.lastSelectedPosition = -1;
        this.allSpheres = [];
        this.activeSphere = null;
        this.lastButton = 0;

        window.addEventListener('pointerdown', (event) => { this.lastButton = event.button; });
        window.addEventListener('contextmenu', (event) => event.preventDefault());

        this.createSpheres();
        this.selectRandomSphere();
        this.startAppearTimer();
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
            crystal.setAttribute('class', 'target');
            crystal.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear');
            crystal.addEventListener('click', () => this.handleHit(i));
            this.el.sceneEl.appendChild(crystal);
            this.allSpheres.push(crystal);
        }
    },

    selectRandomSphere: function () {
        let availablePositions = [];

        for (let i = 0; i < 11; i++) {
            if (this.appearanceCounts[i] < 2 && i !== this.lastSelectedPosition) {
                availablePositions.push(i);
            }
        }
        if (availablePositions.length === 0) {
            for (let i = 0; i < 11; i++) {
                if (this.appearanceCounts[i] < 2) {
                    availablePositions.push(i);
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
        setTimeout(() => {
            this.activeSphere.setAttribute('visible', true);
            this.appearanceCounts[this.lastSelectedPosition]++;
        }, 500);
    },

    handleHit: function (index) {
        if (index !== this.lastSelectedPosition || !this.activeSphere.getAttribute('visible')) return;

        const handUsed = this.lastButton === 2 ? 'RIGHT' : 'LEFT';
        const scoreManager = document.querySelector('#score-display').components['score-manager'];
        const result = scoreManager.calculateHitPoints(handUsed);
        scoreManager.addPoints(result.points);

        this.activeSphere.setAttribute('visible', false);
        this.createFloatingNumber(this.activeSphere.getAttribute('position'), result.points, result.hitType);

        const dataManager = document.querySelector('#data-manager').components['data-manager'];
        dataManager.recordTrial(index, handUsed, result.points, result.hitType);

        this.startDisappearTimer();
    },

    createFloatingNumber: function (spherePosition, points, hitType) {
        const floatingNumber = document.createElement('a-entity');
        floatingNumber.setAttribute('position', `${spherePosition.x} ${spherePosition.y + 0.1} ${spherePosition.z}`);
        floatingNumber.setAttribute('floating-number', {
            value: points,
            hitType: hitType
        });
        this.el.sceneEl.appendChild(floatingNumber);
    },

    startDisappearTimer: function () {
        setTimeout(() => {
            const dataManager = document.querySelector('#data-manager').components['data-manager'];
            if (dataManager.trialData.length >= 22) {
                document.querySelector('#score-display').components['score-manager'].showBlockComplete();
                return;
            }
            this.selectRandomSphere();
            this.startAppearTimer();
        }, 300);
    }
});

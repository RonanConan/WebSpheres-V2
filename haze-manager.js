AFRAME.registerComponent('haze-manager', {
    init: function () {
        this.hazeLayers = [];
        this.currentState = 'idle';
        this.idleColor = '#00FFFF';
        this.milestoneActive = false;

        setTimeout(() => {
            this.createHazeLayers();
            this.startIdlePulse();
        }, 100);

        this.setupListeners();
    },

    createHazeLayers: function () {
        const dashboard = document.querySelector('#holo-dashboard');
        if (!dashboard) {
            console.warn('Haze manager: Dashboard not found');
            return;
        }

        const layerConfigs = [
            { scaleW: 1.6, scaleH: 0.75, opacity: 0.4, zOffset: -0.01 },
            { scaleW: 1.8, scaleH: 0.9, opacity: 0.3, zOffset: -0.02 },
            { scaleW: 2.0, scaleH: 1.05, opacity: 0.2, zOffset: -0.03 },
            { scaleW: 2.2, scaleH: 1.2, opacity: 0.1, zOffset: -0.04 }
        ];

        layerConfigs.forEach((config, index) => {
            const layer = document.createElement('a-plane');
            layer.setAttribute('id', `haze-layer-${index}`);
            layer.setAttribute('width', config.scaleW);
            layer.setAttribute('height', config.scaleH);
            layer.setAttribute('position', `0 0 ${config.zOffset}`);
            layer.setAttribute('material', {
                color: this.idleColor,
                opacity: config.opacity,
                transparent: true,
                shader: 'flat',
                side: 'double'
            });

            layer.dataset.baseOpacity = config.opacity;

            dashboard.appendChild(layer);
            this.hazeLayers.push(layer);
        });
    },

    setupListeners: function () {
        this.el.sceneEl.addEventListener('haze-normal-hit', () => this.triggerNormalHit());
        this.el.sceneEl.addEventListener('haze-critical-hit', () => this.triggerCriticalHit());
        this.el.sceneEl.addEventListener('haze-milestone', () => this.triggerMilestone());
    },

    startIdlePulse: function () {
        if (this.hazeLayers.length === 0) return;

        this.hazeLayers.forEach(layer => {
            layer.removeAttribute('animation__pulse');
            const baseOpacity = parseFloat(layer.dataset.baseOpacity);
            layer.setAttribute('animation__pulse', {
                property: 'material.opacity',
                from: baseOpacity,
                to: baseOpacity * 0.3,
                dur: 2500,
                dir: 'alternate',
                loop: true,
                easing: 'easeInOutSine'
            });
        });
        this.currentState = 'idle';
    },

    setColor: function (color) {
        this.hazeLayers.forEach(layer => {
            layer.setAttribute('material', 'color', color);
        });
    },

    triggerNormalHit: function () {
        if (this.milestoneActive) return;

        this.hazeLayers.forEach(layer => layer.removeAttribute('animation__pulse'));
        this.setColor('#888888');

        this.hazeLayers.forEach(layer => {
            const baseOpacity = parseFloat(layer.dataset.baseOpacity);
            layer.setAttribute('material', 'opacity', baseOpacity * 1.5);
        });

        setTimeout(() => {
            if (this.milestoneActive) return;
            this.setColor(this.idleColor);
            this.hazeLayers.forEach(layer => {
                const baseOpacity = parseFloat(layer.dataset.baseOpacity);
                layer.setAttribute('material', 'opacity', baseOpacity);
            });
            this.startIdlePulse();
        }, 250);
    },

    triggerCriticalHit: function () {
        if (this.milestoneActive) return;

        this.currentState = 'critical';
        this.hazeLayers.forEach(layer => layer.removeAttribute('animation__pulse'));
        this.setColor('#FFD700');

        this.hazeLayers.forEach(layer => {
            const baseOpacity = parseFloat(layer.dataset.baseOpacity);
            layer.setAttribute('animation__pulse', {
                property: 'material.opacity',
                from: baseOpacity * 0.5,
                to: baseOpacity * 2,
                dur: 150,
                dir: 'alternate',
                loop: 3,
                easing: 'easeInOutSine'
            });
        });

        setTimeout(() => {
            if (this.milestoneActive) return;
            this.setColor(this.idleColor);
            this.startIdlePulse();
        }, 900);
    },

    triggerMilestone: function () {
        if (this.milestoneActive) return;
        this.milestoneActive = true;
        this.currentState = 'milestone';

        this.hazeLayers.forEach(layer => layer.removeAttribute('animation__pulse'));

        this.hazeLayers.forEach(layer => {
            layer.setAttribute('material', 'opacity', 0.5);
        });

        const colors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'];
        let colorIndex = 0;

        const cycleInterval = setInterval(() => {
            this.setColor(colors[colorIndex]);
            colorIndex++;
            if (colorIndex >= colors.length) colorIndex = 0;
        }, 200);

        setTimeout(() => {
            clearInterval(cycleInterval);
            this.milestoneActive = false;
            this.setColor(this.idleColor);
            this.hazeLayers.forEach(layer => {
                const baseOpacity = parseFloat(layer.dataset.baseOpacity);
                layer.setAttribute('material', 'opacity', baseOpacity);
            });
            this.startIdlePulse();
        }, 2000);
    }
});

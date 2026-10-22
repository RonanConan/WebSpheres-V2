AFRAME.registerComponent('floating-number', {
    schema: {
        value: { type: 'number' },
        hitType: { type: 'string', default: 'normal' }
    },

    init: function () {
        // 1. SETUP VISUALS
        const hitType = this.data.hitType;

        // MODIFIED: Ghost Text Logic
        // Critical = Gold, Large (1.5)
        // Normal = Light Grey, Small (0.8)
        const color = hitType === 'critical' ? '#FFD700' : '#CCCCCC';
        const initialScale = hitType === 'critical' ? '1.5 1.5 1.5' : '0.8 0.8 0.8';

        // Get starting position
        const currentPos = this.el.getAttribute('position');

        this.el.setAttribute('text', {
            value: `+${this.data.value}`,
            align: 'center',
            width: 4,
            color: color,
            font: 'exo2bold'
        });
        this.el.setAttribute('scale', initialScale);

        // 2. ORIENTATION (RESTORED OLD LOGIC)
        this.el.object3D.lookAt(0, currentPos.y, 0);

        // 3. CALCULATE DESTINATION
        const targetPos = new THREE.Vector3(0, 1.6, -1.2); // Default fallback
        const scoreEl = document.querySelector('#score-display');

        if (scoreEl && scoreEl.object3D) {
            scoreEl.object3D.updateMatrixWorld(true);
            scoreEl.object3D.getWorldPosition(targetPos);
            targetPos.z += 0.1; // Offset slightly forward so it doesn't clip
        }

        // 4. ANIMATION 1: FLOAT UP (0ms - 500ms)
        this.el.setAttribute('animation__float', {
            property: 'position',
            to: `${currentPos.x} ${currentPos.y + 0.25} ${currentPos.z}`,
            dur: 500,
            easing: 'easeOutQuad'
        });

        // 5. ANIMATION 2: FLY TO DASHBOARD (500ms - 1200ms)
        setTimeout(() => {
            // Fly to target
            this.el.setAttribute('animation__fly', {
                property: 'position',
                to: `${targetPos.x} ${targetPos.y} ${targetPos.z}`,
                dur: 700,
                easing: 'easeInQuad'
            });

            // Shrink while flying
            this.el.setAttribute('animation__shrink', {
                property: 'scale',
                to: '0 0 0',
                dur: 700,
                easing: 'easeInQuad'
            });
        }, 500);

        // 6. CLEANUP
        setTimeout(() => {
            if (this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }
        }, 1250);
    }
});
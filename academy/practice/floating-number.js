AFRAME.registerComponent('floating-number', {
    schema: {
        value: { type: 'number' },
        hitType: { type: 'string', default: 'normal' }
    },

    init: function () {
        const hitType = this.data.hitType;
        const color = hitType === 'critical' ? '#FFD700' : '#CCCCCC';
        const initialScale = hitType === 'critical' ? '1.5 1.5 1.5' : '0.8 0.8 0.8';

        this.el.setAttribute('text', {
            value: `+${this.data.value}`,
            align: 'center',
            width: 4,
            color: color,
            font: 'exo2bold'
        });
        this.el.setAttribute('scale', initialScale);

        const position = this.el.getAttribute('position');
        this.el.setAttribute('animation', {
            property: 'position',
            to: `${position.x} ${position.y + 0.3} ${position.z}`,
            dur: 1200,
            easing: 'easeOutQuad'
        });
        setTimeout(() => this.el.remove(), 1300);
    }
});

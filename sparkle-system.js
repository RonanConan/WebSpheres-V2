AFRAME.registerComponent('sparkle-system', {
    schema: {
        color: { type: 'color', default: '#FFD700' },
        count: { type: 'int', default: 30 },
        lifetime: { type: 'number', default: 1000 } // ms
    },

    init: function () {
        this.particles = [];
        // Generate a simple circular glow texture in memory
        this.texture = this.createSparkleTexture();

        // Create the geometry/material reuse containers
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.PointsMaterial({
            color: new THREE.Color(0xffffff),
            size: 0.05,
            map: this.texture,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        this.points = new THREE.Points(this.geometry, this.material);
        // Do not frustum cull to ensure particles don't flicker out at edges
        this.points.frustumCulled = false;

        // Add to the entity's object3D
        this.el.setObject3D('mesh', this.points);

        this.active = false;
    },

    createSparkleTexture: function () {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');

        // Draw a radial gradient (white center to transparent edge)
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    },

    createBurst: function (position, colorHex) {
        const particleCount = this.data.count;
        const color = new THREE.Color(colorHex || this.data.color);

        // Reset geometry arrays
        const positions = [];
        const colors = [];
        const velocities = [];
        const life = []; // 0.0 to 1.0

        for (let i = 0; i < particleCount; i++) {
            // Start at the burst source
            positions.push(position.x, position.y, position.z);

            // Random color variation (white to gold)
            colors.push(color.r, color.g, color.b);

            // Explosion velocity (sphere distribution)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 0.5 + Math.random() * 0.5; // Speed variance

            const vx = speed * Math.sin(phi) * Math.cos(theta);
            const vy = speed * Math.sin(phi) * Math.sin(theta);
            const vz = speed * Math.cos(phi);

            velocities.push(vx, vy, vz);
            life.push(1.0); // Full life
        }

        // Update internal state
        this.particles = {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors),
            velocities: velocities,
            life: new Float32Array(life),
            startTime: Date.now()
        };

        // Update BufferGeometry
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.particles.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.particles.colors, 3));

        this.active = true;
        this.points.visible = true;
    },

    tick: function (time, timeDelta) {
        if (!this.active) return;

        const dt = timeDelta / 1000; // seconds
        const positions = this.particles.positions;
        const life = this.particles.life;
        const velocities = this.particles.velocities;

        let activeCount = 0;

        for (let i = 0; i < this.data.count; i++) {
            if (life[i] > 0) {
                // Move particle
                positions[i * 3] += velocities[i * 3] * dt;
                positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
                positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;

                // Gravity (slight pull down)
                velocities[i * 3 + 1] -= 0.5 * dt;

                // Decay life
                life[i] -= dt * (1000 / this.data.lifetime);
                activeCount++;
            } else {
                // Hide inactive particles by moving them far away or collapsing scale (optional)
                // Here we just let them sit until the next burst resets them, 
                // but we rely on opacity fading out to hide them.
            }
        }

        // Update geometry
        this.geometry.attributes.position.needsUpdate = true;

        // Fade out whole material based on average life or just let them scatter?
        // Simpler: Just check if time expired
        if (Date.now() - this.particles.startTime > this.data.lifetime) {
            this.active = false;
            this.points.visible = false;
        }
    }
});
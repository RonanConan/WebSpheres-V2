const WorkspaceView = (() => {
    const THEMES = {
        dark: { bg: 0x0b0e14, grid: 0x2a3242, tick: '#aeb6c4', title: '#dfe5f0', mark: 0xffffff, markText: '#ffffff', left: 0x3a86ea, right: 0xe5534b, overlap: 0xaab1bd },
        light: { bg: 0xffffff, grid: 0xdfe3e9, tick: '#5b6472', title: '#1a1d24', mark: 0x1a1d24, markText: '#1a1d24', left: 0x2a78d6, right: 0xd43b3b, overlap: 0x9aa1ad }
    };
    const FONT = '500 64px system-ui, "Segoe UI", sans-serif';
    const VIEWS = ['Free', 'Above', 'Side', 'Behind'];
    const HIDDEN = { Free: '', Above: 'h', Side: 'x', Behind: 'f' };

    function create(THREE, OrbitControls, canvas) {
        const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(12, 1, 1, 6000);
        const controls = new OrbitControls(camera, canvas);
        controls.enablePan = true;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
        const lamp = new THREE.DirectionalLight(0xffffff, 1.5);
        lamp.position.set(40, 120, 60);
        scene.add(lamp);
        const frame = new THREE.Group();
        const content = new THREE.Group();
        const axisLabels = { x: [], f: [], h: [] };
        scene.add(frame, content);
        const state = { run: null, limits: null, theme: 'dark', view: 'Free', show: { left: true, right: true, overlap: true, paths: true, surfaces: true } };
        const parts = {};

        const render = () => renderer.render(scene, camera);
        controls.addEventListener('change', render);
        controls.addEventListener('start', () => showAxes(''));

        const clear = (group) => {
            group.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (o.material.map) o.material.map.dispose();
                    o.material.dispose();
                }
            });
            group.clear();
        };

        function label(text, size, color) {
            const c = document.createElement('canvas');
            const x = c.getContext('2d');
            x.font = FONT;
            c.width = Math.ceil(x.measureText(text).width) + 24;
            c.height = 88;
            x.font = FONT;
            x.fillStyle = color;
            x.textBaseline = 'middle';
            x.fillText(text, 12, 44);
            const map = new THREE.CanvasTexture(c);
            map.colorSpace = THREE.SRGBColorSpace;
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
            s.scale.set(size * c.width / c.height, size, 1);
            return s;
        }

        function buildFrame() {
            clear(frame);
            Object.values(axisLabels).forEach(list => { list.length = 0; });
            const T = THEMES[state.theme];
            const { x: X, h: H, f: F } = state.limits;
            const pts = [];
            const line = (a, b) => pts.push(a[0], a[1], -a[2], b[0], b[1], -b[2]);
            for (let v = X[0]; v <= X[1]; v += 10) line([v, H[0], F[0]], [v, H[0], F[1]]);
            for (let v = F[0]; v <= F[1]; v += 10) line([X[0], H[0], v], [X[1], H[0], v]);
            for (let v = H[0]; v <= H[1]; v += 10) line([X[0], v, F[1]], [X[1], v, F[1]]);
            for (let v = X[0]; v <= X[1]; v += 20) line([v, H[0], F[1]], [v, H[1], F[1]]);
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            frame.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: T.grid })));
            const put = (axis, s, x, y, f) => {
                s.position.set(x, y, -f);
                frame.add(s);
                axisLabels[axis].push(s);
            };
            for (let v = X[0]; v <= X[1]; v += 20) put('x', label(String(v), 3.2, T.tick), v, H[0] - 3, F[0] - 4);
            for (let v = F[0]; v <= F[1]; v += 10) put('f', label(String(v), 3.2, T.tick), X[1] + 5, H[0] - 2, v);
            for (let v = H[0]; v <= H[1]; v += 10) put('h', label(String(v), 3.2, T.tick), X[0] - 5, v, F[1]);
            put('x', label('Left–right of home centre (cm)', 4, T.title), (X[0] + X[1]) / 2, H[0] - 9, F[0] - 12);
            put('f', label('Forward of home (cm)', 4, T.title), X[1] + 26, H[0] - 9, (F[0] + F[1]) / 2);
            put('h', label('Height above home (cm)', 4, T.title), X[0] - 5, H[1] + 6, F[1]);
            showAxes(HIDDEN[state.view]);
        }

        function showAxes(hidden) {
            Object.keys(axisLabels).forEach(axis => axisLabels[axis].forEach(s => { s.visible = axis !== hidden; }));
        }

        function surfaceMesh(part, color, opacity, solid) {
            const pos = new Float32Array(part.pos.length);
            for (let i = 0; i < pos.length; i += 3) {
                pos[i] = part.pos[i];
                pos[i + 1] = part.pos[i + 1];
                pos[i + 2] = -part.pos[i + 2];
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setIndex(new THREE.BufferAttribute(part.idx, 1));
            g.computeVertexNormals();
            return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, transparent: !solid, opacity, side: THREE.DoubleSide, depthWrite: solid, roughness: 0.75, metalness: 0 }));
        }

        function pathLines(p, color) {
            const seg = [];
            for (let i = 1; i < p.count; i++) {
                if (p.breaks[i]) continue;
                const a = (i - 1) * 3, b = i * 3;
                seg.push(p.pts[a], p.pts[a + 1], -p.pts[a + 2], p.pts[b], p.pts[b + 1], -p.pts[b + 2]);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
            return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.33, depthWrite: false }));
        }

        function buildContent() {
            clear(content);
            const T = THEMES[state.theme];
            const r = state.run;
            if (!r) return;
            parts.left = surfaceMesh(r.solid.left, T.left, 0.24, false);
            parts.right = surfaceMesh(r.solid.right, T.right, 0.24, false);
            parts.overlap = surfaceMesh(r.solid.overlap, T.overlap, 0.9, true);
            parts.pathL = pathLines(r.paths.left, T.left);
            parts.pathR = pathLines(r.paths.right, T.right);
            parts.left.renderOrder = 2;
            parts.right.renderOrder = 2;
            content.add(parts.left, parts.right, parts.overlap, parts.pathL, parts.pathR);
            r.targets.forEach(t => {
                const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: T.mark }));
                dot.position.set(t.x, t.h, -t.f);
                content.add(dot);
                const name = label(String(t.n), 3, T.markText);
                name.position.set(t.x, t.h + 3, -t.f);
                content.add(name);
            });
            r.homes.forEach(h => {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.25, 8, 28), new THREE.MeshBasicMaterial({ color: T.mark }));
                ring.rotation.x = Math.PI / 2;
                ring.position.set(h.x, h.h, -h.f);
                content.add(ring);
                const name = label('Home', 3, T.markText);
                name.position.set(h.x, h.h - 4, -h.f);
                content.add(name);
            });
            applyShow();
        }

        function applyShow() {
            if (!parts.left) return;
            const s = state.show;
            parts.left.visible = s.left && s.surfaces;
            parts.right.visible = s.right && s.surfaces;
            parts.overlap.visible = s.overlap && s.left && s.right;
            parts.pathL.visible = s.left && s.paths;
            parts.pathR.visible = s.right && s.paths;
        }

        function setView(name) {
            state.view = name;
            if (!state.limits) return;
            const { x: X, h: H, f: F } = state.limits;
            const centre = new THREE.Vector3((X[0] + X[1]) / 2, (H[0] + H[1]) / 2, -(F[0] + F[1]) / 2);
            const reach = Math.max(X[1] - X[0], H[1] - H[0], F[1] - F[0]);
            const fitted = (w, h) => 1.05 * Math.max(w / camera.aspect, h) / (2 * Math.tan(camera.fov * Math.PI / 360));
            const far = reach * 7.4;
            const at = {
                Free: [far * 0.5, far * 0.38, far * 0.64],
                Above: [0, fitted(X[1] - X[0] + 64, F[1] - F[0] + 24), 0.01],
                Side: [fitted(F[1] - F[0] + 30, H[1] - H[0] + 24), 0, 0],
                Behind: [0, 0, fitted(X[1] - X[0] + 40, H[1] - H[0] + 24)]
            }[name];
            showAxes(HIDDEN[name]);
            camera.up.set(0, 1, 0);
            camera.position.set(centre.x + at[0], centre.y + at[1], centre.z + at[2]);
            controls.target.copy(centre);
            controls.update();
            render();
        }

        function fit() {
            const box = canvas.parentElement.getBoundingClientRect();
            if (!box.width || !box.height) return;
            renderer.setSize(box.width, box.height, false);
            camera.aspect = box.width / box.height;
            camera.updateProjectionMatrix();
            render();
        }

        function setTheme(name) {
            state.theme = name;
            scene.background = new THREE.Color(THEMES[name].bg);
            if (state.limits) buildFrame();
            buildContent();
        }

        setTheme('dark');

        return {
            VIEWS,
            show(run, limits) {
                const newFrame = JSON.stringify(limits) !== JSON.stringify(state.limits);
                state.run = run;
                state.limits = limits;
                if (newFrame) buildFrame();
                buildContent();
                fit();
                if (newFrame) setView(state.view);
                render();
            },
            setView,
            setShow(key, on) {
                state.show[key] = on;
                applyShow();
                render();
            },
            fit,
            async snapshot(runs, limits, width, height) {
                const was = state.run;
                const wasPos = camera.position.clone();
                const out = [];
                try {
                    state.limits = limits;
                    renderer.setPixelRatio(1);
                    renderer.setSize(width, height, false);
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();
                    for (const run of runs) {
                        state.run = run;
                        setTheme('light');
                        render();
                        const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No image')), 'image/png'));
                        out.push(new Uint8Array(await blob.arrayBuffer()));
                    }
                } finally {
                    state.run = was;
                    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                    setTheme('dark');
                    camera.position.copy(wasPos);
                    fit();
                }
                return out;
            }
        };
    }

    return { create, VIEWS };
})();

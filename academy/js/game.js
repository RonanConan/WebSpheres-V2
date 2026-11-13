(function (root) {
    const WSA = root.WSA = root.WSA || {};
    const DEFAULT_COUNT = 11;
    const MAX_TARGETS = 40;
    const MAX_TIMERS = 10000;

    WSA.createGame = function (opts) {
        opts = opts || {};
        const live = !!opts.live;
        const state = { angles: [], visible: [], shown: false, labels: [], message: '' };
        const listeners = { click: [], keydown: [] };
        const queue = [];
        const realTimers = new Map();
        const errors = [];
        const labelLog = [];
        let runner = null;
        let now = 0;
        let seq = 0;
        let labelId = 0;
        let disposed = false;

        const friendly = WSA.friendlyError;
        const changed = () => { if (!disposed && opts.onChange) opts.onChange(); };
        const count = () => state.angles.length || DEFAULT_COUNT;

        function needFunction(fn, what) {
            if (typeof fn === 'function') return;
            const given = fn === undefined ? 'undefined' : WSA.show(fn);
            throw friendly(`${what} needs a function to run later, but it was given ${given}. If there are brackets after the function's name, as in onHit(), the function runs straight away instead of later. Leave out the brackets: onHit.`);
        }

        function needIndex(i, what) {
            if (Number.isInteger(i) && i >= 0 && i < count()) return;
            throw friendly(`${what} needs a target position from 0 to ${count() - 1}, but it was given ${WSA.show(i)}.`);
        }

        function fire(fn, args) {
            if (disposed) return;
            if (!runner) {
                errors.push({ line: null, message: 'The code ran before it was ready.' });
                return;
            }
            if (!runner.ok) return;
            const r = runner.call(fn, args);
            if (!r.ok) {
                errors.push(r.error);
                if (opts.onError) opts.onError(r.error);
            }
            changed();
        }

        const api = {
            addTarget(angle) {
                if (typeof angle !== 'number' || !Number.isFinite(angle)) throw friendly(`addTarget needs a number, the angle in degrees, but it was given ${WSA.show(angle)}.`);
                if (state.angles.length >= MAX_TARGETS) throw friendly(`The code tried to add more than ${MAX_TARGETS} targets, the most the preview can show, so the page stopped it. If a loop adds the targets, check that the loop stops. A loop stops when its condition becomes false, so the counter has to change in the right direction, for example i++ when the condition is i < 11.`);
                state.angles.push(angle);
                changed();
            },
            showTarget(i) {
                needIndex(i, 'showTarget');
                state.shown = true;
                state.visible[i] = true;
                changed();
            },
            hideTarget(i) {
                needIndex(i, 'hideTarget');
                state.shown = true;
                state.visible[i] = false;
                changed();
            },
            floatLabel(i, text, colour) {
                needIndex(i, 'floatLabel');
                const label = { id: ++labelId, index: i, text: String(text), colour: typeof colour === 'string' ? colour : '#CCCCCC' };
                state.labels.push(label);
                if (!live) labelLog.push(label);
                if (state.labels.length > 6) state.labels.shift();
                changed();
            },
            showMessage(text) {
                state.message = WSA.show(text);
                changed();
            },
            targets: {
                addEventListener(type, fn) {
                    if (type !== 'click') throw friendly(`Targets only send "click" events in this lesson, not "${type}".`);
                    needFunction(fn, 'addEventListener');
                    if (!listeners.click.includes(fn)) listeners.click.push(fn);
                }
            },
            document: {
                addEventListener(type, fn) {
                    if (type !== 'keydown') throw friendly(`The page only sends "keydown" events in this lesson, not "${type}".`);
                    needFunction(fn, 'addEventListener');
                    if (!listeners.keydown.includes(fn)) listeners.keydown.push(fn);
                }
            },
            setTimeout(fn, ms) {
                needFunction(fn, 'setTimeout');
                const delay = Math.max(0, Number(ms) || 0);
                const id = ++seq;
                if (live) {
                    const handle = root.setTimeout(() => {
                        realTimers.delete(id);
                        fire(fn, []);
                    }, delay);
                    realTimers.set(id, handle);
                } else {
                    queue.push({ id, at: now + delay, fn });
                }
                return id;
            },
            clearTimeout(id) {
                if (live) {
                    root.clearTimeout(realTimers.get(id));
                    realTimers.delete(id);
                } else {
                    const k = queue.findIndex(t => t.id === id);
                    if (k !== -1) queue.splice(k, 1);
                }
            }
        };

        return {
            api,
            state,
            errors,
            labelLog,
            bind(r) {
                runner = r;
            },
            isVisible(i) {
                return state.shown ? !!state.visible[i] : true;
            },
            click(i, hand) {
                if (state.shown && !state.visible[i]) return false;
                listeners.click.forEach(fn => fire(fn, [{ type: 'click', index: i, hand: hand || 'LEFT' }]));
                return true;
            },
            key(code, key) {
                listeners.keydown.forEach(fn => fire(fn, [{ type: 'keydown', code, key: key || code.replace(/^Key/, '').toLowerCase() }]));
            },
            advance(ms) {
                const end = now + ms;
                let fired = 0;
                for (;;) {
                    queue.sort((a, b) => a.at - b.at || a.id - b.id);
                    const next = queue[0];
                    if (!next || next.at > end) break;
                    if (++fired > MAX_TIMERS) {
                        queue.length = 0;
                        errors.push({ line: null, message: `More than ${MAX_TIMERS} timers ran one after another, so the page stopped them. A function that starts a timer for itself runs again and again without end. Check that each timer starts only when it should.` });
                        break;
                    }
                    queue.shift();
                    now = next.at;
                    fire(next.fn, []);
                }
                now = end;
            },
            pending() {
                return live ? realTimers.size : queue.length;
            },
            hasListeners(type) {
                return listeners[type].length > 0;
            },
            dispose() {
                disposed = true;
                realTimers.forEach(h => root.clearTimeout(h));
                realTimers.clear();
                queue.length = 0;
            }
        };
    };

    WSA.checkContext = function (r, code, names, useGame, extra) {
        const run = (c) => {
            const g = useGame ? WSA.createGame({}) : null;
            const v = WSA.runner.run(c, names, g ? g.api : undefined);
            if (g) {
                g.bind(v);
                v.game = g;
            }
            return v;
        };
        return Object.assign({
            code,
            logs: r.logs,
            values: r.values,
            rhs: name => WSA.runner.rhs(code, name),
            call: (name, args) => r.call(r.values[name], args),
            variant(overrides) {
                let c = code;
                for (const name of Object.keys(overrides)) {
                    const next = WSA.runner.replaceDecl(c, name, overrides[name]);
                    if (next === null) return { ok: false, logs: [], missing: [], error: { line: null, message: `The line that makes ${name} is missing.` } };
                    c = next;
                }
                return run(c);
            },
            sim() {
                const g = WSA.createGame({});
                const v = WSA.runner.run(code, names, g.api);
                g.bind(v);
                return { ok: v.ok, error: v.error, run: v, values: v.values, read: () => (v.ok ? v.read() : {}), logs: v.logs, game: g, state: g.state, errors: g.errors, labels: g.labelLog, click: (i, hand) => g.click(i, hand), key: (c, k) => g.key(c, k), advance: ms => g.advance(ms), call: (name, args) => v.call(v.read()[name], args) };
            }
        }, extra || {});
    };

    if (typeof module !== 'undefined') module.exports = WSA;
})(typeof window !== 'undefined' ? window : globalThis);

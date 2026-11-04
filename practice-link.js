(function () {
    const inFrame = window.parent !== window;
    const channel = 'webspheres-practice';
    const conns = new Map();
    const peers = new Set();
    let hostReady = false;
    let down = false;
    let nextId = 1;

    const other = () => {
        if (inFrame) return window.parent;
        const frame = document.getElementById('practice-headset');
        return frame ? frame.contentWindow : null;
    };
    const post = (kind, id, data) => {
        const target = other();
        if (target) target.postMessage({ channel, kind, id, data }, location.origin);
    };

    class Emitter {
        constructor() { this.handlers = {}; }
        on(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); return this; }
        emit(name, ...args) { (this.handlers[name] || []).slice().forEach(fn => fn(...args)); }
    }

    class PracticeConn extends Emitter {
        constructor(id, peerId) {
            super();
            this.id = id;
            this.peer = peerId;
            this.open = false;
            this.closed = false;
        }
        send(data) {
            if (!this.open) throw new Error('Connection is not open');
            post('data', this.id, data);
        }
        close() {
            if (this.closed) return;
            this.closed = true;
            this.open = false;
            conns.delete(this.id);
            post('bye', this.id);
            this.emit('close');
        }
    }

    class PracticePeer extends Emitter {
        constructor(id) {
            super();
            this.id = typeof id === 'string' ? id : 'practice-observer';
            this.open = false;
            this.disconnected = false;
            this.destroyed = false;
            peers.add(this);
            setTimeout(() => {
                if (this.destroyed) return;
                this.open = true;
                this.emit('open', this.id);
                if (inFrame) post('ready');
            }, 0);
        }
        connect(hostId) {
            const conn = new PracticeConn(nextId++, hostId);
            conns.set(conn.id, conn);
            if (hostReady && !down) post('hello', conn.id);
            return conn;
        }
        disconnect() {
            if (this.disconnected) return;
            this.disconnected = true;
            this.open = false;
            this.emit('disconnected', this.id);
        }
        reconnect() {
            if (this.destroyed) throw new Error('Peer is destroyed');
            this.disconnected = false;
            this.open = true;
            this.emit('open', this.id);
        }
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.open = false;
            peers.delete(this);
            this.emit('close');
        }
    }

    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || e.source !== other()) return;
        const m = e.data;
        if (!m || m.channel !== channel) return;
        const conn = conns.get(m.id);
        if (m.kind === 'ready') {
            hostReady = true;
            if (!down) conns.forEach((c) => { if (!c.open && !c.closed) post('hello', c.id); });
        } else if (m.kind === 'hello') {
            const host = [...peers][0];
            if (!host) return;
            const incoming = new PracticeConn(m.id, 'practice-observer');
            conns.set(m.id, incoming);
            host.emit('connection', incoming);
            incoming.open = true;
            incoming.emit('open');
            post('welcome', m.id);
        } else if (m.kind === 'welcome') {
            if (!conn || conn.closed) return;
            conn.open = true;
            conn.emit('open');
        } else if (m.kind === 'data') {
            if (conn && conn.open) conn.emit('data', m.data);
        } else if (m.kind === 'bye') {
            if (!conn || conn.closed) return;
            conn.closed = true;
            conn.open = false;
            conns.delete(m.id);
            conn.emit('close');
        }
    });

    window.Peer = PracticePeer;
    window.__practiceLink = {
        setDown: (value) => {
            down = value;
            if (down) [...conns.values()].forEach(c => c.close());
            else if (hostReady) conns.forEach((c) => { if (!c.open && !c.closed) post('hello', c.id); });
        }
    };
})();

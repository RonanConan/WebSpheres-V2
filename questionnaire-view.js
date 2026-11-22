const WebSpheresQuestionnaireView = typeof WebSpheresQuestionnaires === 'undefined' ? undefined : (() => {
    const Q = WebSpheresQuestionnaires;
    const HOLD_MS = 2000;
    const TICK = (px) => `<svg width="${px}" height="${px}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.4l2.9 2.9 6.1-6.3"/></svg>`;
    const LOCK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';

    let opts = null, root = null, tried = new Set(), menuOpen = false, heldKey = null, suppressKey = null;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
    const tickEl = (cls, px, label) => { const e = el('span', cls); e.innerHTML = TICK(px); if (label) e.append(label); return e; };
    const $ = (sel) => root.querySelector(sel);

    const defs = () => opts.defs;
    const reviewPage = () => defs().length + 1;
    const thanksPage = () => defs().length + 2;
    const defOfPage = (p) => p >= 1 && p <= defs().length ? defs()[p - 1] : null;
    const st = () => opts.state;
    const answers = () => st().answers;
    const total = () => Q.count(defs());
    const answeredCount = () => Q.answeredCount(defs(), answers());

    function build() {
        root = el('div');
        root.id = 'qv';
        root.hidden = true;
        root.innerHTML = `
            <header class="qv-top">
                <div class="qv-brand"><span class="qv-orb" aria-hidden="true"></span>WebSpheres<span class="qv-who" id="qv-who" hidden></span><span class="qv-pill" id="qv-practice" hidden>Practice</span></div>
                <nav class="qv-tabs" id="qv-tabs" aria-label="Question sets"></nav>
                <button type="button" class="qv-staff" id="qv-staff" aria-label="Experimenter only: press and hold for 2 seconds"><span class="qv-staff-fill" id="qv-staff-fill"></span>${LOCK}Experimenter</button>
            </header>
            <div class="qv-staff-hint" id="qv-staff-hint" hidden>Experimenter only. Press and hold for 2 seconds.</div>
            <div class="qv-progress" id="qv-progress"><div class="qv-bar"><span id="qv-bar"></span></div><span class="qv-count" id="qv-count"></span></div>
            <main id="qv-main" tabindex="-1"></main>
            <footer class="qv-foot" id="qv-foot">
                <button type="button" id="qv-back">Back</button>
                <div id="qv-status" role="status" aria-live="polite"></div>
                <button type="button" class="qv-primary" id="qv-next">Next</button>
            </footer>
            <div class="qv-scrim" id="qv-menu" hidden>
                <div class="qv-dialog" role="dialog" aria-modal="true" aria-labelledby="qv-menu-title">
                    <h3 id="qv-menu-title">Experimenter menu</h3>
                    <p id="qv-menu-text"></p>
                    <div class="qv-actions"><button type="button" id="qv-menu-leave">Return to the observer</button><button type="button" class="qv-primary" id="qv-menu-stay">Back to the questions</button></div>
                </div>
            </div>`;
        document.body.appendChild(root);
        $('#qv-back').addEventListener('click', () => { if (st().page > 0) go(st().page - 1); });
        $('#qv-next').addEventListener('click', (e) => { if (e.detail < 2) next(); });
        $('#qv-menu-stay').addEventListener('click', closeMenu);
        $('#qv-menu-leave').addEventListener('click', () => { closeMenu(); const exit = opts.onExit; close(); if (exit) exit(); });
        root.addEventListener('keydown', (e) => {
            if (suppressKey && e.key === suppressKey) { e.preventDefault(); e.stopPropagation(); }
        }, true);
        root.addEventListener('keyup', (e) => {
            if (suppressKey && e.key === suppressKey) { e.preventDefault(); e.stopPropagation(); suppressKey = null; }
        }, true);
        root.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); if (menuOpen) closeMenu(); }
            e.stopPropagation();
        });
        setupHold();
        window.addEventListener('popstate', () => { if (isOpen()) history.pushState({ wsQuestionnaire: true }, ''); });
    }

    function setupHold() {
        const btn = $('#qv-staff'), fill = $('#qv-staff-fill'), hint = $('#qv-staff-hint');
        let t0 = 0, raf = 0, hintTimer = 0;
        const stop = (showHint) => {
            cancelAnimationFrame(raf);
            raf = 0;
            fill.style.transform = 'scaleX(0)';
            if (showHint && t0 && Date.now() - t0 < HOLD_MS) {
                hint.hidden = false;
                clearTimeout(hintTimer);
                hintTimer = setTimeout(() => { hint.hidden = true; }, 2200);
            }
            t0 = 0;
        };
        const tick = () => {
            const p = Math.min(1, (Date.now() - t0) / HOLD_MS);
            fill.style.transform = `scaleX(${p})`;
            if (p >= 1) { stop(false); suppressKey = heldKey; openMenu(); return; }
            raf = requestAnimationFrame(tick);
        };
        const start = () => { if (raf || menuOpen) return; hint.hidden = true; t0 = Date.now(); raf = requestAnimationFrame(tick); };
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); heldKey = null; if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (err) {} } start(); });
        btn.addEventListener('pointerup', () => stop(true));
        btn.addEventListener('pointercancel', () => stop(false));
        btn.addEventListener('lostpointercapture', () => { if (raf) stop(true); });
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
        btn.addEventListener('keydown', (e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat) { heldKey = e.key; start(); }
        });
        btn.addEventListener('keyup', (e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            heldKey = null;
            stop(true);
        });
        btn.addEventListener('click', (e) => e.preventDefault());
    }

    function openMenu() {
        menuOpen = true;
        const who = opts.participantId ? `This questionnaire is for participant ${opts.participantId}. ` : '';
        const stored = !opts.isStored || opts.isStored();
        $('#qv-menu-text').textContent = who + (st().page === thanksPage()
            ? 'The participant has submitted their answers.'
            : `The participant has answered ${answeredCount()} of ${total()} questions. ${stored ? 'Their answers are kept, and they can carry on later.' : 'Browser storage is not working, so the answers are held in memory only. Do not reload or close the observer page.'}`);
        $('#qv-menu').hidden = false;
        $('#qv-menu-stay').focus();
    }

    function closeMenu() {
        menuOpen = false;
        if (root) $('#qv-menu').hidden = true;
    }

    function changed() {
        if (opts.onChange) opts.onChange(st());
    }

    function renderTabs() {
        const nav = $('#qv-tabs');
        nav.textContent = '';
        const page = st().page;
        nav.hidden = page === 0;
        const tabs = defs().map((def, i) => ({ page: i + 1, label: def.title, done: !Q.missing(def, answers()).length && st().reached > i + 1 }))
            .concat([{ page: reviewPage(), label: 'Check and submit', done: false }]);
        tabs.forEach((t, i) => {
            const b = el('button', 'qv-tab');
            b.type = 'button';
            const n = el('span', 'qv-n qv-circ', t.done && t.page !== page ? null : String(i + 1));
            if (t.done && t.page !== page) { n.innerHTML = TICK(12); b.classList.add('done'); }
            b.append(n, el('span', 'qv-t', t.label));
            b.disabled = page === thanksPage() || t.page > st().reached;
            if (t.page === page) { b.classList.add('cur'); b.setAttribute('aria-current', 'step'); }
            b.addEventListener('click', () => go(t.page));
            nav.append(b);
        });
    }

    function renderProgress() {
        const n = answeredCount();
        $('#qv-bar').style.width = (100 * n / Math.max(1, total())) + '%';
        $('#qv-count').textContent = `${n} of ${total()} questions answered`;
        $('#qv-progress').hidden = st().page === 0 || st().page === thanksPage();
    }

    function updateStatus() {
        const s = $('#qv-status');
        const page = st().page;
        const def = defOfPage(page);
        const still = (n) => `${n} ${n === 1 ? 'question still needs' : 'questions still need'} an answer`;
        s.className = '';
        if (def) {
            const miss = Q.missing(def, answers()).length;
            if (tried.has(page) && miss) { s.className = 'warn'; s.textContent = still(miss); }
            else s.textContent = miss ? `${def.items.length - miss} of ${def.items.length} answered on this page` : 'All questions on this page answered';
        } else if (page === reviewPage()) {
            const miss = total() - answeredCount();
            s.className = miss && tried.has(page) ? 'warn' : '';
            s.textContent = miss ? still(miss) : 'Everything is answered';
        } else s.textContent = 'About 5 to 10 minutes';
    }

    function refreshChrome() {
        renderTabs();
        renderProgress();
        updateStatus();
    }

    function renderFoot() {
        const page = st().page;
        $('#qv-foot').hidden = page === thanksPage();
        $('#qv-back').style.visibility = page === 0 ? 'hidden' : 'visible';
        $('#qv-next').textContent = page === 0 ? 'Start' : page === reviewPage() ? 'Submit answers' : 'Next';
    }

    function pageWelcome(box) {
        box.append(el('h2', null, 'A few questions about your session'));
        box.append(el('p', 'qv-lead', `Thank you for your time. There ${defs().length === 1 ? 'is one short set' : `are ${defs().length === 2 ? 'two' : defs().length === 3 ? 'three' : defs().length} short sets`} of questions. Please answer every question.`));
        const ul = el('ul', 'qv-welcome');
        defs().forEach((def, i) => {
            const li = el('li');
            li.append(el('span', 'qv-n qv-circ', String(i + 1)), el('span', null, def.title), el('span', 'qv-meta', `${def.items.length} ${def.items.length === 1 ? 'question' : 'questions'}`));
            ul.append(li);
        });
        box.append(ul);
        const rules = el('ul', 'qv-rules');
        ['You can go back and change any answer until you press Submit.', 'There are no right or wrong answers.', 'If anything is unclear, ask the experimenter.'].forEach(t => rules.append(el('li', null, t)));
        box.append(rules);
    }

    function answerOf(id) {
        return answers()[id] || (answers()[id] = { value: null, text: '' });
    }

    function pageChoice(box, def) {
        const page = st().page;
        def.items.forEach((item, idx) => {
            const card = el('section', 'qv-q');
            card.id = 'qv-q-' + item.id;
            const title = el('h3', 'qv-q-title');
            title.append(el('span', null, item.text));
            const done = tickEl('qv-q-done', 14, 'Answered');
            title.append(done);
            card.append(el('span', 'qv-q-num', `${idx + 1}.`), title);
            const fs = el('fieldset', 'qv-opts');
            fs.setAttribute('aria-label', item.text);
            const follow = el('div', 'qv-follow');
            const label = el('label');
            const ta = el('textarea');
            ta.id = 'qv-ta-' + item.id;
            label.htmlFor = ta.id;
            ta.placeholder = 'Type your answer here';
            ta.value = (answers()[item.id] || {}).text || '';
            const hint = el('div', 'qv-hint');
            follow.append(label, ta, hint);
            const sync = () => {
                const a = answers()[item.id];
                const chosen = !!a && a.value !== null && a.value !== undefined;
                follow.hidden = !chosen;
                if (chosen) label.textContent = Q.followPrompt(item, a.value);
                const ok = Q.answered(def, item, a);
                done.hidden = !ok;
                card.classList.toggle('missing', tried.has(page) && !ok);
                const needText = tried.has(page) && chosen && !ok;
                hint.className = 'qv-hint' + (needText ? ' warn' : '');
                hint.textContent = needText ? 'Please write a short answer in the box.' : 'A sentence or two is enough.';
            };
            let pointerAt = 0;
            fs.addEventListener('pointerdown', () => { pointerAt = Date.now(); });
            item.options.forEach((opt, oi) => {
                const lab = el('label', 'qv-opt');
                const r = el('input');
                r.type = 'radio';
                r.name = 'qv-r-' + item.id;
                r.value = opt;
                r.id = `qv-r-${item.id}-${oi + 1}`;
                r.checked = (answers()[item.id] || {}).value === opt;
                r.addEventListener('change', () => {
                    const a = answerOf(item.id);
                    const first = a.value === null || a.value === undefined;
                    a.value = opt;
                    a.at = new Date().toISOString();
                    sync();
                    refreshChrome();
                    changed();
                    if (first && Date.now() - pointerAt < 1500) setTimeout(() => ta.focus({ preventScroll: true }), 30);
                });
                lab.append(r, el('span', null, opt));
                fs.append(lab);
            });
            ta.addEventListener('input', () => {
                const a = answerOf(item.id);
                a.text = ta.value;
                a.at = new Date().toISOString();
                sync();
                refreshChrome();
                changed();
            });
            card.append(fs, follow);
            card._sync = sync;
            box.append(card);
            sync();
        });
    }

    function pageScale(box, def) {
        const page = st().page;
        const sc = def.scale;
        const grid = el('div', 'qv-grid');
        grid.style.setProperty('--cols', sc.values.length);
        const head = el('div', 'qv-grid-head');
        head.setAttribute('aria-hidden', 'true');
        head.append(el('div'), el('div'));
        sc.values.forEach((v, i) => {
            const d = el('div');
            if (sc.showNumbers) d.append(el('span', 'qv-hn', String(v)));
            if (sc.labels[i]) d.append(el('span', null, sc.labels[i]));
            head.append(d);
        });
        grid.append(head);
        def.items.forEach((item, idx) => {
            const row = el('div', 'qv-row');
            row.id = 'qv-q-' + item.id;
            row.setAttribute('role', 'radiogroup');
            row.setAttribute('aria-label', `${idx + 1}. ${item.text}`);
            const num = el('div', 'qv-num');
            row.append(num, el('div', 'qv-stmt', item.text));
            const sync = () => {
                const ok = Q.answered(def, item, answers()[item.id]);
                row.classList.toggle('answered', ok);
                if (ok) num.innerHTML = TICK(16); else num.textContent = String(idx + 1);
                row.classList.toggle('missing', tried.has(page) && !ok);
            };
            sc.values.forEach((v, i) => {
                const lab = el('label', 'qv-cell');
                const r = el('input');
                r.type = 'radio';
                r.name = 'qv-r-' + item.id;
                r.value = String(v);
                r.id = `qv-r-${item.id}-${v}`;
                r.setAttribute('aria-label', sc.labels[i] ? `${v}, ${sc.labels[i]}` : String(v));
                r.checked = (answers()[item.id] || {}).value === v;
                r.addEventListener('change', () => {
                    answers()[item.id] = { value: v, at: new Date().toISOString() };
                    sync();
                    refreshChrome();
                    changed();
                });
                const inner = el('span', 'qv-cell-inner');
                inner.append(el('span', 'qv-mark qv-circ', sc.showNumbers ? String(v) : ''));
                inner.append(el('span', 'qv-cell-label', sc.labels[i] || ''));
                lab.append(r, inner);
                row.append(lab);
            });
            row.append(el('div', 'qv-missing-note', 'Please choose an answer for this statement.'));
            row._sync = sync;
            grid.append(row);
            sync();
        });
        box.append(grid);
    }

    function pageReview(box) {
        box.append(el('h2', null, 'Check your answers'));
        box.append(el('p', 'qv-lead', 'You can still change anything. When you are happy, press Submit answers.'));
        defs().forEach((def, i) => {
            const sec = el('section', 'qv-rev');
            const head = el('div', 'qv-rev-head');
            head.append(el('h3', null, `${i + 1}. ${def.title}`));
            const miss = Q.missing(def, answers());
            head.append(miss.length ? el('span', 'qv-rev-state warn', `${miss.length} still to answer`) : tickEl('qv-rev-state ok', 15, `All ${def.items.length} answered`));
            const b = el('button', null, miss.length ? 'Answer these' : 'Change answers');
            b.type = 'button';
            b.addEventListener('click', () => go(i + 1, miss.length ? miss[0].id : null));
            head.append(b);
            sec.append(head);
            if (def.type === 'choice-followup') {
                def.items.forEach(item => {
                    const a = answers()[item.id] || {};
                    const q = el('div', 'qv-rev-q');
                    q.append(el('div', 'qv-rev-qq', item.text));
                    q.append(el('div', 'qv-rev-aa', a.value || 'Not answered yet'));
                    if (a.text && a.text.trim()) q.append(el('div', 'qv-rev-tt', '“' + a.text.trim() + '”'));
                    sec.append(q);
                });
            }
            box.append(sec);
        });
    }

    function pageThanks(box) {
        const wrap = el('div', 'qv-thanks');
        const inner = el('div');
        const tick = el('div', 'qv-thanks-tick');
        tick.innerHTML = TICK(44);
        inner.append(tick, el('h2', null, 'Thank you'), el('p', null, 'Your answers are saved. Please let the experimenter know you have finished.'));
        wrap.append(inner);
        box.append(wrap);
    }

    function render(focusId) {
        const main = $('#qv-main');
        main.textContent = '';
        const page = st().page;
        $('#qv-practice').hidden = !opts.practice;
        $('#qv-who').hidden = !opts.participantId;
        $('#qv-who').textContent = opts.participantId ? `Participant ${opts.participantId}` : '';
        if (page === thanksPage()) pageThanks(main);
        else {
            const box = el('div', 'qv-page');
            const def = defOfPage(page);
            if (page === 0) pageWelcome(box);
            else if (page === reviewPage()) pageReview(box);
            else {
                box.append(el('h2', null, `${page}. ${def.title}`));
                if (def.instructions) box.append(el('p', 'qv-lead', def.instructions));
                if (def.type === 'scale') pageScale(box, def); else pageChoice(box, def);
            }
            main.append(box);
        }
        refreshChrome();
        renderFoot();
        main.scrollTop = 0;
        if (focusId) {
            const t = root.querySelector('#qv-q-' + CSS.escape(focusId));
            if (t) {
                t.scrollIntoView({ block: 'center' });
                const a = answers()[focusId];
                const input = a && a.value !== null && a.value !== undefined ? t.querySelector('textarea') || t.querySelector('input') : t.querySelector('input');
                if (input) input.focus({ preventScroll: true });
            }
        } else main.focus({ preventScroll: true });
    }

    function go(page, focusId) {
        st().page = page;
        st().reached = Math.max(st().reached || 0, page);
        render(focusId);
        changed();
    }

    function resync() {
        root.querySelectorAll('.qv-q, .qv-row').forEach(n => { if (n._sync) n._sync(); });
    }

    function next() {
        const page = st().page;
        if (page === 0) return go(1);
        const def = defOfPage(page);
        if (def) {
            const miss = Q.missing(def, answers());
            if (!miss.length) return go(page + 1);
            tried.add(page);
            resync();
            updateStatus();
            const t = root.querySelector('#qv-q-' + CSS.escape(miss[0].id));
            t.scrollIntoView({ block: 'center' });
            const a = answers()[miss[0].id];
            const input = a && a.value !== null && a.value !== undefined ? t.querySelector('textarea') : t.querySelector('input');
            if (input) input.focus({ preventScroll: true });
            return;
        }
        if (page === reviewPage()) {
            const first = defs().findIndex(d => Q.missing(d, answers()).length);
            if (first >= 0) {
                tried.add(page);
                tried.add(first + 1);
                return go(first + 1, Q.missing(defs()[first], answers())[0].id);
            }
            st().page = thanksPage();
            st().reached = thanksPage();
            render();
            if (opts.onSubmit) opts.onSubmit(st());
        }
    }

    function open(options) {
        opts = options;
        tried = new Set();
        if (!root) build();
        const s = st();
        if (!s.answers) s.answers = {};
        if (!Number.isInteger(s.page) || s.page < 0 || s.page > thanksPage()) s.page = 0;
        if (!Number.isInteger(s.reached) || s.reached < s.page) s.reached = s.page;
        closeMenu();
        $('#qv-staff-hint').hidden = true;
        root.hidden = false;
        document.body.classList.add('qv-open');
        try { history.pushState({ wsQuestionnaire: true }, ''); } catch (e) {}
        const fs = document.documentElement.requestFullscreen;
        if (fs && !document.fullscreenElement) {
            try { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
        }
        render();
    }

    function close() {
        if (!root || root.hidden) return;
        root.hidden = true;
        closeMenu();
        document.body.classList.remove('qv-open');
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }

    const isOpen = () => !!root && !root.hidden;

    return { open, close, isOpen, HOLD_MS, get root() { return root; } };
})();

(function () {
    const WSA = window.WSA;
    const LESSONS = window.LESSONS;
    const ROADMAP = ['Variables', 'Numbers and maths', 'Text', 'If and else', 'Functions', 'Loops', 'Randomness', 'Lists and records', 'Events', 'Build the game', 'The real code', 'Version control'];
    const QUICK = new URLSearchParams(location.search).has('quick');
    const HINT_DELAYS = QUICK ? [3, 3, 3] : [45, 60, 90];
    const KEY = 'wsa-progress-v2';
    const BASE_SCENE = { colour: '#00FFFF', size: 0.06, spin: 5000, radius: 0.45, reach: null, labels: false, ghost: null, label: null, labelColour: null, labelScale: null, highlights: null, tag: null, angles: null, game: null, counts: null, hand: null, clickable: false };
    const CODE_TYPES = ['code', 'bug', 'match', 'task'];
    const TYPES = {
        code: { label: 'Write code', work: 'Your code' },
        bug: { label: 'Spot the bug', work: 'Your code' },
        match: { label: 'Make it match', work: 'Your code' },
        task: { label: 'Do it', work: 'Spheres Practice' },
        trace: { label: 'What\'s in the box?', work: 'What\'s in the box?' },
        quiz: { label: 'Quiz', work: 'Quiz' },
        order: { label: 'Put the lines in order', work: 'Put the lines in order' },
        find: { label: 'Find it in the real code', work: 'Real WebSpheres code' }
    };
    const $ = id => document.getElementById(id);
    const typeOf = step => step.type || 'code';
    const isCode = step => CODE_TYPES.includes(typeOf(step));

    let progress = load();
    let lessonIndex = 0;
    let lesson = null;
    let rec = null;
    let runtime = {};
    let preview = { ready: false, pending: null };
    let liveTimer = null;
    let ideaClosed = false;
    let liveGame = null;
    let gameRuns = 0;
    let lastRun = null;
    let refreshQueued = false;
    let ws = null;
    let wsCore = null;

    function load() {
        try {
            return JSON.parse(localStorage.getItem(KEY)) || { lessons: {} };
        } catch (e) {
            return { lessons: {} };
        }
    }

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(progress));
        } catch (e) {}
    }

    function freshRecord(l) {
        return { step: 0, code: l.starterCode, stepStart: l.starterCode, results: [], hints: 0, misses: 0, prediction: null, done: false };
    }

    function recordFor(l) {
        if (!progress.lessons[l.id]) progress.lessons[l.id] = freshRecord(l);
        const r = progress.lessons[l.id];
        if (r.step >= l.steps.length) r.step = l.steps.length - 1;
        if (r.results.length > l.steps.length) r.results.length = l.steps.length;
        return r;
    }

    function unlocked(i) {
        if (i === 0 || QUICK) return true;
        const before = LESSONS[i - 1] && recordFor(LESSONS[i - 1]);
        return !!before && (before.done || before.finished);
    }

    function worth(step) {
        return 3 + (step.predict ? 1 : 0);
    }

    function maxStars(l) {
        return l.steps.reduce((n, s) => n + worth(s), 0);
    }

    function earned(l) {
        const r = progress.lessons[l.id];
        return r ? r.results.reduce((n, x) => n + (x ? x.stars + x.bonus : 0), 0) : 0;
    }

    function starsNow(step) {
        return WSA.marking.stars(rec.hints, rec.misses, !isCode(step));
    }

    function starCount(n, of) {
        const pct = of ? Math.round(100 * n / of) : 0;
        return `<span class="star-count"><span class="on">★</span> ${n} of ${of} stars</span><span class="star-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
    }

    function starRow(n, of) {
        return '<span class="on">' + '★'.repeat(n) + '</span><span class="off">' + '☆'.repeat(Math.max(0, of - n)) + '</span>';
    }

    function isColour(v) {
        return typeof v === 'string' && v.trim() !== '' && CSS.supports('color', v.trim());
    }

    function spec() {
        const upto = rec.done ? lesson.steps.length - 1 : rec.step;
        for (let i = upto; i >= 0; i--) {
            if (isCode(lesson.steps[i]) && lesson.steps[i].names) return { names: lesson.steps[i].names, types: lesson.steps[i].types };
        }
        return { names: lesson.names, types: lesson.types };
    }

    function typeProblem(r, code) {
        const { names, types } = spec();
        const values = r.values;
        for (const name of names) {
            const v = values[name];
            const kind = types[name];
            if (r.missing.includes(name)) {
                const twin = WSA.runner.declared(code).find(d => d !== name && d.toLowerCase() === name.toLowerCase());
                if (twin) return `Capital letters matter. The code makes <code>${WSA.esc(twin)}</code>, but the page is looking for <code>${name}</code>.`;
                return `There's no variable or function called <code>${name}</code> any more, and the page needs it. Did it get renamed or deleted? Use <b>Start this step again</b> if you're stuck.`;
            }
            if (v === undefined && kind !== 'any') return `<code>${name}</code> holds undefined, which means it has no value. If its value comes from a function, check that the function has a return line.`;
            if (kind === 'number') {
                if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return `<code>${name}</code> has quotes around it, so the computer treats <code>"${WSA.esc(v)}"</code> as text, not as a number. Numbers don't need quotes.`;
                if (typeof v !== 'number') return `<code>${name}</code> should hold a number, but it holds ${describe(v)}.`;
                if (Number.isNaN(v)) return `<code>${name}</code> holds NaN, which means "not a number". It usually comes from a calculation that went wrong.`;
                if (!Number.isFinite(v)) return `<code>${name}</code> holds Infinity, which usually comes from dividing by zero.`;
            }
            if (kind === 'text' && typeof v !== 'string') {
                return `<code>${name}</code> should hold text, inside quotes. It holds ${describe(v)}.`;
            }
            if (kind === 'boolean' && typeof v !== 'boolean') return `<code>${name}</code> should hold true or false, without quotes. It holds ${describe(v)}.`;
            if (kind === 'function' && typeof v !== 'function') return `<code>${name}</code> should be a function, made with <code>function ${name}(...) { ... }</code>.`;
            if (kind === 'array' && !Array.isArray(v)) return `<code>${name}</code> should hold a list in square brackets, such as <code>[1, 2, 3]</code>. It holds ${describe(v)}.`;
            if (kind === 'object' && (typeof v !== 'object' || v === null || Array.isArray(v))) return `<code>${name}</code> should hold an object in curly brackets, such as <code>{ trial: 1 }</code>. It holds ${describe(v)}.`;
            if (kind === 'colour') {
                if (typeof v !== 'string') return `<code>${name}</code> should be a colour inside quotes, like <code>"red"</code>.`;
                if (!isColour(v)) return `The computer doesn't recognise <code>"${WSA.esc(v)}"</code> as a colour. Try a colour name like <code>"red"</code>, or a code like <code>"#FF0000"</code>.`;
            }
        }
        return null;
    }

    function describe(v) {
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        if (typeof v === 'string') return `the text <code>"${WSA.esc(v)}"</code>`;
        if (typeof v === 'number') return `the number <code>${WSA.esc(WSA.fmt(v))}</code>`;
        if (typeof v === 'boolean') return `<code>${v}</code>`;
        if (typeof v === 'function') return 'a function';
        if (Array.isArray(v)) return 'a list';
        return 'an object';
    }

    function kindOf(v) {
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        if (typeof v === 'string') return 'text';
        if (typeof v === 'number') return 'number';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'function') return 'function';
        if (Array.isArray(v)) return 'list';
        return 'object';
    }

    function shortJson(v) {
        let text;
        try {
            text = JSON.stringify(v);
        } catch (e) {
            text = String(v);
        }
        return text.length > 60 ? text.slice(0, 57) + '...' : text;
    }

    function renderVars(values, missing) {
        const { names, types } = spec();
        $('vars').innerHTML = names.map(name => {
            const v = values ? values[name] : undefined;
            const gone = !values || (missing || []).includes(name);
            const kind = gone ? 'missing' : kindOf(v);
            let shown = '<span class="dim">?</span>';
            if (kind === 'text') shown = `<span class="t-str">"${WSA.esc(v)}"</span>`;
            else if (kind === 'number') shown = `<span class="t-num">${WSA.esc(WSA.fmt(v))}</span>` + (WSA.fmt(v) !== String(v) ? `<span class="stored">stored as ${WSA.esc(String(v))}</span>` : '');
            else if (kind === 'boolean') shown = `<span class="t-kw">${v}</span>`;
            else if (kind === 'function') shown = `<span class="dim">function ${WSA.esc(name)}(...)</span>`;
            else if (kind === 'list' || kind === 'object') shown = `<span class="t-id">${WSA.esc(shortJson(v))}</span>`;
            else if (kind === 'missing' && values) shown = '<span class="dim">no box with this label</span>';
            else if (values) shown = `<span class="dim">${kind}</span>`;
            const swatch = types[name] === 'colour' && isColour(v) ? `<span class="swatch" style="background:${WSA.esc(v)}"></span>` : '';
            const chip = values ? `<span class="kind ${kind}">${kind}</span>` : '';
            return `<div class="var"><span class="var-name">${name}</span>${chip}<span class="var-val">${swatch}${shown}</span></div>`;
        }).join('');
    }

    function renderConsole(logs) {
        if (!lesson.console) return;
        $('console-out').innerHTML = logs && logs.length ? logs.map(l => `<span class="log">${WSA.esc(l)}</span>`).join('') : '<span class="dim">Nothing has been printed yet. <code>console.log(...)</code> prints here.</span>';
    }

    function setStatus(kind, html) {
        const el = $('run-status');
        el.className = 'run-status ' + kind;
        el.innerHTML = html;
    }

    function post(message) {
        $('preview').contentWindow.postMessage(message, '*');
    }

    function sendScene(state) {
        preview.pending = state;
        post({ wsa: 'scene', state });
    }

    function sceneCtx(r, values) {
        return { values, run: r, game: liveGame ? liveGame.state : null, call: (name, args) => r.call(values[name], args) };
    }

    function ghostFor(values, ctx) {
        const step = currentStep();
        if (!step || typeOf(step) !== 'match') return null;
        const gap = step.gap(values, ctx);
        return Object.assign({}, typeof step.ghost === 'function' ? step.ghost(values, ctx) : step.ghost, { matched: gap <= step.tolerance, close: gap <= step.closeWithin });
    }

    function buildScene(r, values) {
        const ctx = sceneCtx(r, values);
        const step = currentStep();
        const s = Object.assign({}, BASE_SCENE, lesson.scene ? lesson.scene(values, ctx) : {}, step && step.scene ? step.scene(values, ctx) : {});
        s.ghost = ghostFor(values, ctx);
        if (liveGame) {
            const g = liveGame.state;
            s.game = { run: liveGame.run, shown: g.shown, visible: g.visible.slice(), labels: g.labels.slice(), message: g.message };
            if (g.angles.length || lesson.api === 'targets' || lesson.buildsArc) s.angles = g.angles.slice();
            s.clickable = liveGame.hasListeners('click') || liveGame.hasListeners('keydown');
        }
        return s;
    }

    function makeGame(live) {
        return WSA.createGame(live ? { live: true, onChange: queueRefresh, onError: showRunError } : {});
    }

    function showRunError(err) {
        editor.setErrorLine(err.line);
        const where = err.line ? `<b>Line ${err.line}.</b> ` : '';
        setStatus('bad', `<span class="icon">!</span><span>${where}${WSA.esc(err.message)}</span>`);
    }

    function queueRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        setTimeout(() => {
            refreshQueued = false;
            if (!lastRun || !lastRun.ok || (lesson && lesson.workspace)) return;
            const values = lastRun.read();
            renderVars(values, lastRun.missing);
            renderConsole(lastRun.logs);
            if (typeProblem(lastRun, lastRun.code)) return;
            sendScene(buildScene(lastRun, values));
        }, 16);
    }

    function makeCtx(r, code) {
        return WSA.checkContext(r, code, spec().names, !!lesson.api, { isColour });
    }

    function testRows(r, code) {
        const step = currentStep();
        if (!step || !step.tests || !r.ok) return null;
        try {
            return step.tests(makeCtx(r, code));
        } catch (e) {
            return [{ label: 'Running the tests', expected: '', got: WSA.esc(e.message), pass: false }];
        }
    }

    function renderTests(r, code) {
        const box = $('tests-box');
        const step = currentStep();
        if (!step || !step.tests) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        const rows = testRows(r, code);
        if (!rows) {
            box.innerHTML = '<h3>Tests</h3><p class="dim">The tests run when your code has no errors.</p>';
            return;
        }
        const passed = rows.filter(x => x.pass).length;
        box.innerHTML = `<h3>Tests <span class="${passed === rows.length ? 'ok' : 'dim'}">${passed} of ${rows.length} pass</span></h3><table class="tests"><thead><tr><th>Test</th><th>Expected</th><th>Your code gives</th><th></th></tr></thead><tbody>${rows.map(x => `<tr class="${x.pass ? 'pass' : 'fail'}"><td>${x.label}</td><td>${x.expected}</td><td>${x.got}</td><td>${x.pass ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table>`;
    }

    function renderPanel(r, values) {
        const step = currentStep();
        const panel = (step && step.panel) || lesson.panel;
        const box = $('view-panel');
        if (!panel || !r || !r.ok) {
            box.hidden = !panel;
            if (panel) box.innerHTML = '<p class="dim">The results show here when your code runs without errors.</p>';
            return;
        }
        box.hidden = false;
        try {
            box.innerHTML = panel(values, sceneCtx(r, values));
        } catch (e) {
            box.innerHTML = `<p class="dim">${WSA.esc(e.message)}</p>`;
        }
    }

    function stopLiveGame() {
        clearTimeout(liveTimer);
        if (liveGame) liveGame.dispose();
        liveGame = null;
        lastRun = null;
    }

    function runLive() {
        if (lesson.workspace) {
            stopLiveGame();
            ['tests-box', 'view-panel', 'stale'].forEach(id => { $(id).hidden = true; });
            return null;
        }
        const code = editor.value;
        const { names } = spec();
        if (liveGame) liveGame.dispose();
        liveGame = lesson.api ? makeGame(true) : null;
        if (liveGame) liveGame.run = ++gameRuns;
        const r = WSA.runner.run(code, names, liveGame ? liveGame.api : undefined);
        if (liveGame) liveGame.bind(r);
        lastRun = r;
        renderConsole(r.logs);
        rec.code = code;
        save();
        if (!r.ok) {
            showRunError(r.error);
            renderVars(null);
            renderTests(r, code);
            renderPanel(null);
            $('stale').hidden = false;
            return r;
        }
        editor.setErrorLine(null);
        renderVars(r.values, r.missing);
        renderTests(r, code);
        const problem = typeProblem(r, code);
        if (problem) {
            setStatus('warn', `<span class="icon">!</span><span>${problem}</span>`);
            renderPanel(null);
            $('stale').hidden = false;
            return r;
        }
        setStatus('ok', `<span class="icon">✓</span><span>${liveGame && liveGame.hasListeners('click') ? 'Your code runs. Click the targets in the preview to try it.' : lesson.view === 'panel' ? 'Your code runs. The results are on the right.' : 'Your code runs. The preview shows the result.'}</span>`);
        $('stale').hidden = true;
        renderPanel(r, r.values);
        sendScene(buildScene(r, r.values));
        return r;
    }

    function wsCtx() {
        return {
            files: wsCore.files(),
            active: wsCore.state.active,
            cursor: wsCore.rt.cursor,
            logs: wsCore.rt.logs,
            ran: wsCore.ranLatest(),
            runErrors: !!wsCore.rt.errorThisRun,
            runs: wsCore.rt.runs,
            step: wsCore.rt.step,
            git: wsCore.git,
            trialLines: wsCore.trialLines(),
            csv: wsCore.rt.csv,
            pristine: WSA.practiceFiles
        };
    }

    function mountWorkspace() {
        unmountWorkspace();
        const core = WSA.createWorkspaceCore(rec.ws || null);
        const owner = rec;
        wsCore = core;
        core.onChange(() => {
            if (wsCore !== core) return;
            owner.ws = core.snapshot();
            save();
        });
        ws = WSA.mountWorkspace({ core: wsCore, editor, top: $('ws-top'), bottom: $('ws-bottom'), frame: $('project'), gitEnabled: !!lesson.git });
        rec.ws = wsCore.snapshot();
    }

    function unmountWorkspace() {
        if (ws) ws.dispose();
        ws = null;
        wsCore = null;
    }

    function layoutFor(l) {
        const on = !!l.workspace;
        document.body.classList.toggle('workspace', on);
        ['ws-top', 'ws-bottom', 'project'].forEach(id => { $(id).hidden = !on; });
        $('preview').hidden = on;
        ['run-status', 'vars-box'].forEach(id => { $(id).hidden = on; });
    }

    function scheduleRun() {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(runLive, 250);
    }

    function currentStep() {
        return rec.done ? null : lesson.steps[rec.step];
    }

    function hintSlot() {
        const step = currentStep();
        if (!step || rec.results[rec.step] || rec.hints >= step.hints.length) return '';
        if (runtime.confirm) {
            const cost = rec.hints === step.hints.length - 1 ? `This shows you the answer. You won't earn this step's 3 stars${step.predict ? ', but a correct prediction still earns its bonus star' : ''}.` : 'This hint costs one star.';
            return `<div class="confirm"><p><b>Are you sure?</b> ${cost}</p><div class="actions"><button class="btn" data-act="hint-no">Keep trying</button><button class="btn warn" data-act="hint-yes">Show me</button></div></div>`;
        }
        const label = rec.hints === step.hints.length - 1 ? 'Show me the answer' : `Get hint ${rec.hints + 1} of ${step.hints.length - 1}`;
        const left = Math.ceil((runtime.hintReadyAt - Date.now()) / 1000);
        if (left > 0) {
            const total = HINT_DELAYS[Math.min(rec.hints, HINT_DELAYS.length - 1)];
            const pct = Math.max(0, Math.min(100, 100 * (1 - left / total)));
            const mmss = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
            return `<button class="btn hint-btn" disabled><span class="fill" style="width:${pct}%"></span><span class="label">${rec.hints === 0 ? 'Hint' : 'Next hint'} in ${mmss}</span></button>`;
        }
        return `<button class="btn hint-btn ready" data-act="hint">${label}</button>`;
    }

    function renderHintSlot() {
        const slot = $('hint-slot');
        if (!slot) return;
        const html = hintSlot();
        if (slot.dataset.last === html) return;
        slot.dataset.last = html;
        slot.innerHTML = html;
    }

    function stepHtml(step, i) {
        const res = rec.results[i];
        const current = !rec.done && i === rec.step;
        const cls = res ? 'done' : current ? 'current' : 'locked';
        const stars = res ? `<span class="step-stars">${starRow(res.stars + res.bonus, worth(step))}</span>` : current ? `<span class="step-stars worth" title="Stars still available for this step">${starRow(starsNow(step) + (step.predict ? 1 : 0), worth(step))}</span>` : '';
        let html = `<li class="step ${cls}${current ? ' open' : ''}"><div class="step-head"><span class="step-mark">${res ? '✓' : i + 1}</span><span class="step-title">${step.title}</span>${stars}</div>`;
        if (current) html += `<div class="step-body">${currentBody(step, res)}</div>`;
        return html + '</li>';
    }

    function currentBody(step, res) {
        const kicker = `<p class="kicker type">${TYPES[typeOf(step)].label}</p>`;
        const skip = QUICK && !res ? '<button class="btn ghost" data-act="skip" title="Only shown with ?quick in the address">Skip with full marks</button>' : '';
        if (step.predict && rec.prediction === null) {
            const opts = step.predict.options.map((o, k) => `<button class="opt${runtime.choice === k ? ' sel' : ''}" data-act="choose" data-k="${k}">${o}</button>`).join('');
            return `<div class="predict"><p class="kicker">Predict first</p><p class="q">${step.predict.question}</p>${opts}<div class="actions"><button class="btn primary" data-act="lock"${runtime.choice === undefined ? ' disabled' : ''}>Lock in my prediction</button>${skip}</div><p class="small">A correct prediction earns a bonus star. The code unlocks after you choose.</p></div>`;
        }
        let html = `${kicker}<p class="goal">${step.goal}</p><div class="explain">${step.explain || ''}</div>`;
        if (lesson.workspace && typeOf(step) === 'quiz') html += `<div class="inline-work">${quizWork(step, res)}</div>`;
        if (!isCode(step) && !res) html += '<p class="small">Each wrong answer costs one star.</p>';
        if (step.predict && !res) html += `<p class="your-pred">Your prediction: <b>${step.predict.options[rec.prediction]}</b></p>`;
        const opened = step.hints.slice(0, rec.hints).map((h, k) => `<div class="hint"><b>${k === step.hints.length - 1 ? 'Answer' : 'Hint ' + (k + 1)}</b>${h}</div>`).join('');
        if (opened) html += `<div class="hint-list">${opened}</div>`;
        if (runtime.feedback) html += `<div class="feedback ${runtime.feedback.kind}${runtime.feedback.shake ? ' shake' : ''}" role="status">${runtime.feedback.html}</div>`;
        if (res) {
            if (step.predict) {
                const right = res.prediction === step.predict.answer;
                html += `<div class="reveal ${right ? 'right' : 'wrong'}"><b>${right ? 'Your prediction was right, so you earn a bonus star.' : 'You predicted: ' + step.predict.options[res.prediction] + '.'}</b> ${step.predict.explain}</div>`;
            }
            const last = rec.step === lesson.steps.length - 1;
            html += `<div class="earned"><span class="big">${starRow(res.stars + res.bonus, worth(step))}</span><span>${res.stars + res.bonus === 0 ? 'Step done. This step earned no stars. You can replay the lesson later to earn them.' : 'Step done.'}</span></div>`;
            html += `<div class="actions"><button class="btn primary" data-act="next">${last ? 'Finish the lesson' : 'Next step'}</button></div>`;
            return html;
        }
        const keys = isCode(step) ? 'Ctrl + Enter' : typeOf(step) === 'trace' ? 'Enter' : '';
        html += `<div class="actions"><button class="btn primary" data-act="check">Check my answer</button>${keys ? `<span class="kbd">${keys}</span>` : ''}${skip}</div>`;
        html += `<div id="hint-slot" class="hint-slot">${hintSlot()}</div>`;
        return html;
    }

    function finishHtml() {
        const next = LESSONS[lessonIndex + 1];
        const total = LESSONS.reduce((n, l) => n + earned(l), 0);
        const max = LESSONS.reduce((n, l) => n + maxStars(l), 0);
        const nextButton = next ? `<button class="btn primary" data-act="next-lesson">Start lesson ${lessonIndex + 2}: ${next.title}</button>` : '';
        const courseEnd = next ? '' : `<p class="course-end">This was the last lesson, so you have finished the course. You earned ${total} of ${max} stars across all ${LESSONS.length} lessons. To earn the stars you missed, replay any lesson.</p>`;
        return `<section class="finish">
            <p class="kicker ok">Lesson complete</p>
            <div class="finish-stars">${starCount(earned(lesson), maxStars(lesson))}</div>
            <h2>What you learned</h2>
            <ul class="learned">${lesson.learned.map(l => `<li>${l}</li>`).join('')}</ul>
            <h2>In the real WebSpheres</h2>
            <p class="file"><code>${lesson.real.file}</code>, ${lesson.real.where}</p>
            <pre class="real">${lesson.real.code.split('\n').map(l => WSA.highlight(l, [])).join('\n')}</pre>
            <div class="explain">${lesson.real.note}</div>
            ${courseEnd}<div class="actions">${nextButton}<button class="btn" data-act="replay">Replay this lesson</button></div>
        </section>`;
    }

    function numbered(lines, start, names) {
        return lines.map((l, i) => `<span class="ln"><span class="n">${start + i}</span><span class="src">${WSA.highlight(l, names || []) || ' '}</span></span>`).join('');
    }

    function dedent(lines) {
        const pad = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
        return lines.map(l => l.slice(pad));
    }

    function traceWork(step, res) {
        let html = `<pre class="snippet numbered">${numbered(step.code.split('\n'), 1, [step.box])}</pre>`;
        html += `<div class="q">${step.question}</div>`;
        html += `<div class="answer-row"><label for="trace-input">${step.boxLabel || `<code>${step.box}</code> holds`}</label><input id="trace-input" type="text" autocomplete="off" spellcheck="false" value="${WSA.esc(runtime.answer || '')}"${res ? ' disabled' : ''} placeholder="Type the value"></div>`;
        if (res && step.walk) html += `<h3 class="work-sub">Line by line</h3><ol class="walk">${step.walk.map(w => `<li>${w}</li>`).join('')}</ol>`;
        return html;
    }

    function quizWork(step, res) {
        const picked = runtime.picked || [];
        let html = `<div class="q">${step.question}</div>`;
        if (step.multi) html += '<p class="small">Choose every answer that works. There may be more than one.</p>';
        html += step.options.map((o, k) => {
            const cls = ['opt', 'quiz-opt', picked.includes(k) ? 'sel' : '', res ? (o.correct ? 'right' : 'not') : ''].join(' ');
            const mark = step.multi ? `<span class="box">${picked.includes(k) ? '✓' : ''}</span>` : '';
            return `<button class="${cls}" data-act="pick" data-k="${k}"${res ? ' disabled' : ''}>${mark}<span class="opt-text">${o.text}</span>${res && o.why ? `<span class="why">${o.why}</span>` : ''}</button>`;
        }).join('');
        return html;
    }

    function orderWork(step, res) {
        const order = runtime.order || step.start;
        const pre = step.prelude ? step.prelude.split('\n') : [];
        let html = '<p class="small">Drag the lines, or use the arrow buttons, to change their order.</p>';
        if (pre.length) html += `<p class="small">The first ${pre.length === 1 ? 'line stays' : pre.length + ' lines stay'} where ${pre.length === 1 ? 'it is' : 'they are'}.</p><pre class="snippet numbered prelude">${numbered(pre, 1, step.names)}</pre>`;
        html += '<ol class="order-list">';
        html += order.map((idx, pos) => `<li class="order-row" draggable="${res ? 'false' : 'true'}" data-pos="${pos}"><span class="grip" aria-hidden="true">≡</span><span class="n">${pre.length + pos + 1}</span><span class="src">${WSA.highlight(step.lines[idx], step.names)}</span><span class="moves"><button class="mini" data-act="up" data-pos="${pos}" aria-label="Move line up"${res || pos === 0 ? ' disabled' : ''}>↑</button><button class="mini" data-act="down" data-pos="${pos}" aria-label="Move line down"${res || pos === order.length - 1 ? ' disabled' : ''}>↓</button></span></li>`).join('');
        return html + '</ol>';
    }

    function findWork(step, res) {
        const lines = dedent(step.code.split('\n'));
        let html = `<div class="q">${step.question}</div><p class="file"><code>${step.file}</code></p><div class="find-code">`;
        html += lines.map((l, i) => {
            const cls = ['find-line', runtime.line === i ? 'sel' : '', res && step.answer.includes(i) ? 'right' : ''].join(' ');
            return `<button class="${cls}" data-act="pick-line" data-k="${i}"${res ? ' disabled' : ''}><span class="n">${step.startLine + i}</span><span class="src">${WSA.highlight(l, []) || ' '}</span></button>`;
        }).join('');
        html += '</div>';
        if (res && step.after) html += `<div class="explain after">${step.after}</div>`;
        return html;
    }

    function renderWork() {
        const step = currentStep();
        const t = step ? typeOf(step) : 'code';
        const code = !step || isCode(step) || !!lesson.workspace;
        $('work-title').textContent = lesson.workspace ? 'Spheres Practice' : TYPES[t].work;
        $('code-area').hidden = !code;
        $('reset-code').hidden = !code || !!rec.done || !!lesson.workspace;
        $('workbench').hidden = code;
        if (code) return;
        const res = rec.results[rec.step];
        const html = { trace: traceWork, quiz: quizWork, order: orderWork, find: findWork }[t](step, res);
        $('workbench').innerHTML = `<div class="work-${t}">${html}</div>`;
    }

    function renderTask() {
        const n = lessonIndex + 1;
        let html = `<p class="kicker">Lesson ${n}</p><h1>${lesson.title}</h1><p class="sub">${lesson.subtitle}</p>`;
        html += `<details class="idea"${ideaClosed ? '' : ' open'}><summary>The idea</summary>${lesson.intro}</details>`;
        html += `<ol class="steps">${lesson.steps.map(stepHtml).join('')}</ol>`;
        if (rec.done) html += finishHtml();
        $('task').innerHTML = html;
        if (runtime.feedback) runtime.feedback.shake = false;
        const step = currentStep();
        editor.lock(!!(step && step.predict && rec.prediction === null));
    }

    function renderAll() {
        renderNav();
        renderTask();
        renderWork();
    }

    function renderNav() {
        $('lesson-nav').innerHTML = ROADMAP.map((name, i) => {
            const l = LESSONS[i];
            const open = l && unlocked(i);
            const done = l && progress.lessons[l.id] && progress.lessons[l.id].done;
            const cls = ['pill', i === lessonIndex ? 'current' : '', done ? 'done' : ''].join(' ');
            const title = !l ? `${name}: coming soon` : open ? name : `${name}: finish lesson ${i} first`;
            const label = i === lessonIndex ? `${i + 1}. ${name}` : String(i + 1);
            return `<button class="${cls}" data-lesson="${i}" title="${title}"${open ? '' : ' disabled'}>${label}</button>`;
        }).join('');
        const total = LESSONS.reduce((n, l) => n + earned(l), 0);
        const max = LESSONS.reduce((n, l) => n + maxStars(l), 0);
        $('star-total').innerHTML = `<span class="on">★</span> ${total} <span class="dim">/ ${max}</span>`;
        $('star-total').title = `${total} of ${max} stars so far`;
    }

    function startStepClock() {
        runtime.hintReadyAt = Date.now() + HINT_DELAYS[Math.min(rec.hints, HINT_DELAYS.length - 1)] * 1000;
    }

    function openLesson(i) {
        lessonIndex = i;
        lesson = LESSONS[i];
        rec = recordFor(lesson);
        progress.current = lesson.id;
        save();
        runtime = {};
        ideaClosed = false;
        startStepClock();
        layoutFor(lesson);
        if (lesson.workspace) mountWorkspace();
        else {
            unmountWorkspace();
            editor.set(rec.code, spec().names);
        }
        $('console-box').hidden = !lesson.console;
        document.querySelector('.view').classList.toggle('panel-only', lesson.view === 'panel');
        $('view-note').hidden = lesson.view === 'panel';
        $('view-title').textContent = lesson.workspace ? 'Spheres Practice' : lesson.view === 'panel' ? 'Results' : 'Live preview';
        if (lesson.workspace) $('view-note').hidden = true;
        renderAll();
        runLive();
        $('task').scrollTop = 0;
    }

    function feedback(kind, html) {
        runtime.feedback = { kind, html, shake: kind !== 'ok' };
        renderTask();
    }

    function squash(s) {
        return s.replace(/\s+/g, '');
    }

    function checkCode(step) {
        const code = editor.value;
        const r = runLive();
        if (!r.ok) return { pass: false, free: true, message: 'Your code has an error, so it can\'t be checked yet. Fix the problem shown under your code first.' };
        const problem = typeProblem(r, code);
        if (problem) return { pass: false, free: true, message: problem };
        if (squash(code) === squash(rec.stepStart)) return { pass: false, free: true, message: typeOf(step) === 'bug' ? 'You haven\'t changed anything yet. The message under the code says which line to look at.' : 'You haven\'t changed anything yet. Edit the code, watch the preview, then check again.' };
        if (step.tests) {
            const rows = testRows(r, code) || [];
            const failed = rows.filter(x => !x.pass).length;
            if (failed) return { pass: false, message: `${rows.length - failed} of ${rows.length} tests pass. The table under your code shows which tests give the wrong result.` };
        }
        return step.check ? step.check(r.values, makeCtx(r, code)) : { pass: true, message: step.success };
    }

    function check() {
        const step = currentStep();
        if (!step || rec.results[rec.step]) return;
        if (step.predict && rec.prediction === null) return;
        const t = typeOf(step);
        const m = WSA.marking;
        const result = t === 'task' ? step.check(wsCtx())
            : isCode(step) ? checkCode(step)
            : t === 'trace' ? m.trace(step, runtime.answer)
            : t === 'quiz' ? m.quiz(step, runtime.picked)
            : t === 'order' ? m.order(step, runtime.order)
            : m.find(step, runtime.line);
        if (!result.pass) {
            let html = result.message;
            if (!isCode(step) && !result.free) {
                if (starsNow(step) > 0) html += ' <span class="cost">−1 star</span>';
                rec.misses = (rec.misses || 0) + 1;
                save();
            }
            return feedback(result.near ? 'near' : 'bad', html);
        }
        const stars = starsNow(step);
        const bonus = step.predict && rec.prediction === step.predict.answer ? 1 : 0;
        rec.results[rec.step] = { stars, bonus, prediction: rec.prediction };
        save();
        runtime.feedback = { kind: 'ok', html: result.message };
        renderAll();
        post({ wsa: 'celebrate', text: stars + bonus > 0 ? `${stars + bonus} ${stars + bonus === 1 ? 'star' : 'stars'}` : 'Done' });
    }

    function skipStep(step) {
        if (!step || rec.results[rec.step]) return;
        if (step.predict) rec.prediction = step.predict.answer;
        const fillCode = isCode(step) && !lesson.workspace && typeof step.answer === 'string';
        if (fillCode) {
            editor.set(step.answer, spec().names);
            rec.code = step.answer;
        }
        rec.results[rec.step] = { stars: 3, bonus: step.predict ? 1 : 0, prediction: rec.prediction };
        save();
        runtime.feedback = { kind: 'ok', html: `Skipped with full marks.${fillCode ? ' The model answer is now in the editor, so the next step starts from working code.' : ''}` };
        renderAll();
        if (fillCode) runLive();
    }

    function nextStep() {
        if (rec.step >= lesson.steps.length - 1) {
            rec.done = true;
            rec.finished = true;
        } else {
            rec.step += 1;
            const step = lesson.steps[rec.step];
            if (lesson.workspace) {
                wsCore.stepStarted();
            } else {
                if (step.setCode) editor.set(step.setCode, spec().names);
                rec.code = editor.value;
                rec.stepStart = editor.value;
            }
        }
        rec.hints = 0;
        rec.misses = 0;
        rec.prediction = null;
        runtime = {};
        startStepClock();
        save();
        renderAll();
        runLive();
        if (rec.done) $('task').querySelector('.finish').scrollIntoView({ behavior: 'smooth', block: 'start' });
        else $('task').querySelector('.step.current').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function moveLine(from, to) {
        const step = currentStep();
        const order = (runtime.order || step.start).slice();
        if (to < 0 || to >= order.length || from === to) return;
        const [item] = order.splice(from, 1);
        order.splice(to, 0, item);
        runtime.order = order;
        renderWork();
    }

    function onTaskClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        const act = btn.dataset.act;
        const step = currentStep();
        if (act === 'choose') {
            runtime.choice = Number(btn.dataset.k);
            renderTask();
        } else if (act === 'lock') {
            rec.prediction = runtime.choice;
            save();
            startStepClock();
            renderTask();
            editor.focus();
        } else if (act === 'check') {
            check();
        } else if (act === 'skip' && QUICK) {
            skipStep(step);
        } else if (act === 'pick' && lesson.workspace && !rec.results[rec.step]) {
            const k = Number(btn.dataset.k);
            const picked = runtime.picked || [];
            runtime.picked = step.multi ? (picked.includes(k) ? picked.filter(x => x !== k) : picked.concat(k)) : [k];
            renderTask();
        } else if (act === 'hint') {
            runtime.confirm = true;
            renderHintSlot();
        } else if (act === 'hint-no') {
            runtime.confirm = false;
            renderHintSlot();
        } else if (act === 'hint-yes') {
            runtime.confirm = false;
            rec.hints = Math.min(rec.hints + 1, step.hints.length);
            save();
            startStepClock();
            renderTask();
        } else if (act === 'next') {
            nextStep();
        } else if (act === 'next-lesson') {
            openLesson(lessonIndex + 1);
        } else if (act === 'replay') {
            if (!confirm('Replay this lesson? Your code and stars for it will be reset. The lessons after it stay open.')) return;
            const old = progress.lessons[lesson.id];
            progress.lessons[lesson.id] = Object.assign(freshRecord(lesson), { finished: !!(old && (old.done || old.finished)) });
            save();
            openLesson(lessonIndex);
        }
    }

    function onWorkClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        const step = currentStep();
        if (!step || rec.results[rec.step]) return;
        const act = btn.dataset.act;
        const k = Number(btn.dataset.k);
        if (act === 'pick') {
            const picked = runtime.picked || [];
            runtime.picked = step.multi ? (picked.includes(k) ? picked.filter(x => x !== k) : picked.concat(k)) : [k];
            renderWork();
        } else if (act === 'pick-line') {
            runtime.line = k;
            renderWork();
        } else if (act === 'up' || act === 'down') {
            const pos = Number(btn.dataset.pos);
            moveLine(pos, act === 'up' ? pos - 1 : pos + 1);
        }
    }

    const editor = WSA.createEditor({
        textarea: $('code'),
        highlight: $('hl'),
        gutter: $('gutter'),
        lockEl: $('editor-lock'),
        onChange: value => {
            if (lesson && lesson.workspace) {
                if (ws) ws.edit(value);
            } else {
                scheduleRun();
            }
        },
        onCursor: line => { if (ws) ws.cursor(line); },
        onSubmit: check
    });

    const work = $('workbench');
    work.addEventListener('click', onWorkClick);
    work.addEventListener('input', e => {
        if (e.target.id === 'trace-input') runtime.answer = e.target.value;
    });
    work.addEventListener('keydown', e => {
        if (e.target.id === 'trace-input' && e.key === 'Enter') {
            e.preventDefault();
            check();
        }
    });
    work.addEventListener('dragstart', e => {
        const row = e.target.closest('.order-row');
        if (!row) return;
        runtime.dragFrom = Number(row.dataset.pos);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.pos);
    });
    work.addEventListener('dragover', e => {
        const row = e.target.closest('.order-row');
        if (!row || runtime.dragFrom === undefined) return;
        e.preventDefault();
        work.querySelectorAll('.order-row.over').forEach(r => r.classList.remove('over'));
        row.classList.add('over');
    });
    work.addEventListener('drop', e => {
        const row = e.target.closest('.order-row');
        if (!row || runtime.dragFrom === undefined) return;
        e.preventDefault();
        const from = runtime.dragFrom;
        runtime.dragFrom = undefined;
        moveLine(from, Number(row.dataset.pos));
    });
    work.addEventListener('dragend', () => {
        runtime.dragFrom = undefined;
        renderWork();
    });

    $('task').addEventListener('click', onTaskClick);
    $('task').addEventListener('toggle', e => {
        if (e.target.classList.contains('idea')) ideaClosed = !e.target.open;
    }, true);
    $('lesson-nav').addEventListener('click', e => {
        const btn = e.target.closest('[data-lesson]');
        if (btn && !btn.disabled && LESSONS[Number(btn.dataset.lesson)]) openLesson(Number(btn.dataset.lesson));
    });
    $('reset-all').addEventListener('click', () => {
        if (!confirm('Reset all progress? Your code, stars and practice projects in every lesson will be deleted, and you will start again from lesson 1. This cannot be undone.')) return;
        progress = { lessons: {} };
        save();
        openLesson(0);
    });
    $('reset-code').addEventListener('click', () => {
        if (editor.value === rec.stepStart) return;
        editor.set(rec.stepStart);
        runLive();
        editor.focus();
    });
    window.addEventListener('message', e => {
        if (e.source !== $('preview').contentWindow || !e.data) return;
        const m = e.data;
        if (m.wsa === 'ready') {
            preview.ready = true;
            if (preview.pending) post({ wsa: 'scene', state: preview.pending });
        } else if (m.wsa === 'click' && liveGame && lastRun && lastRun.ok) {
            liveGame.click(m.index, m.hand);
        } else if (m.wsa === 'key' && liveGame && lastRun && lastRun.ok) {
            liveGame.key(m.code, m.key);
        }
    });
    document.addEventListener('keydown', e => {
        if (!liveGame || !lastRun || !lastRun.ok || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest('textarea, input, select, button, [contenteditable]')) return;
        if (e.code === 'Space') e.preventDefault();
        liveGame.key(e.code, e.key);
    });
    $('view-panel').addEventListener('click', e => {
        const btn = e.target.closest('[data-act="rerun"]');
        if (btn && lastRun && lastRun.ok) renderPanel(lastRun, lastRun.read());
    });
    setInterval(() => {
        if (!runtime.confirm && $('hint-slot') && runtime.hintReadyAt) renderHintSlot();
    }, 1000);

    const start = LESSONS.findIndex(l => l.id === progress.current);
    openLesson(start >= 0 && unlocked(start) ? start : 0);
})();

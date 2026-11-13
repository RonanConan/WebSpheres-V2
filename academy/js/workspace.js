(function (root) {
    const WSA = root.WSA = root.WSA || {};
    const ORDER = ['index.html', 'sphere-manager.js', 'score-manager.js', 'floating-number.js', 'data-manager.js'];
    const SCORE_EXPR = "document.querySelector('#score-display').components['score-manager'].score";
    const CSV_EXPR = "document.querySelector('#data-manager').components['data-manager'].buildCSV()";

    function freshStep() {
        return { errorsSeen: 0, dirtyMax: 0, commands: [], evals: [], csvShown: false, diffViewed: false, runs: 0, cleanRunsAfterError: 0, switchedTo: [] };
    }

    WSA.createWorkspaceCore = function (saved, opts) {
        opts = opts || {};
        const pristine = () => Object.assign({}, WSA.practiceFiles);
        const s = saved ? JSON.parse(JSON.stringify(saved)) : { files: pristine(), active: 'sphere-manager.js', git: null, version: 0 };
        const rt = { logs: [], runVersion: -1, runs: 0, cursor: { file: s.active, line: 1 }, terminal: [], step: freshStep(), csv: null };
        const listeners = [];
        const changed = () => listeners.forEach(fn => fn());
        const io = {
            getFiles: () => s.files,
            setFiles: f => {
                s.files = f;
                s.version++;
            },
            changed: () => trackDirty()
        };
        let git = WSA.createGit(io, s.git);
        s.git = git.state;

        function trackDirty() {
            if (!git.state.initialised || !git.headId()) return;
            rt.step.dirtyMax = Math.max(rt.step.dirtyMax, git.changedFromHead().length);
        }

        const core = {
            order: ORDER,
            state: s,
            rt,
            get git() { return git; },
            onChange(fn) { listeners.push(fn); },
            files: () => s.files,
            setFile(name, text) {
                if (s.files[name] === text) return;
                s.files = Object.assign({}, s.files, { [name]: text });
                s.version++;
                trackDirty();
                changed();
            },
            open(name) {
                s.active = name;
                rt.cursor = { file: name, line: 1 };
                changed();
            },
            setCursor(line) {
                rt.cursor = { file: s.active, line };
            },
            snapshot: () => JSON.parse(JSON.stringify(s)),
            reset() {
                s.files = pristine();
                s.active = 'sphere-manager.js';
                s.version++;
                s.git = null;
                git = WSA.createGit(io, null);
                s.git = git.state;
                rt.logs = [];
                rt.terminal = [];
                rt.runVersion = -1;
                rt.csv = null;
                changed();
            },
            stepStarted() {
                rt.step = freshStep();
            },
            runStarted() {
                rt.runVersion = s.version;
                rt.runs++;
                rt.step.runs++;
                rt.logs = [];
                rt.errorThisRun = false;
                changed();
            },
            log(kind, text, where) {
                rt.logs.push(Object.assign({ kind, text: String(text) }, where || {}));
                if (kind === 'error' && !(where && where.typed)) {
                    rt.step.errorsSeen++;
                    rt.errorThisRun = true;
                }
                changed();
            },
            evalDone(expr, result, actual, isError) {
                rt.step.evals.push({ expr, result, actual, isError });
                changed();
            },
            csvShown(text) {
                rt.csv = text;
                rt.step.csvShown = true;
                changed();
            },
            diffViewed() {
                rt.step.diffViewed = true;
            },
            terminal(line) {
                const r = git.exec(line);
                rt.terminal.push({ line, output: r.output || '', error: r.error || '' });
                rt.step.commands.push({ line: line.trim(), ok: !r.error });
                const m = /^git\s+(switch|checkout)\s+(?:-[cb]\s+)?(\S+)/.exec(line.trim());
                if (m && !r.error) rt.step.switchedTo.push(m[2]);
                trackDirty();
                changed();
                return r;
            },
            ranLatest: () => rt.runs > 0 && rt.runVersion === s.version,
            trialLines: () => rt.logs.filter(l => l.kind === 'log' && /^Trial \d+:/.test(l.text))
        };
        return core;
    };

    function buildDoc(files) {
        const capture = '<script>(function(){var send=function(k,t,x){parent.postMessage(Object.assign({wsp:k,text:t},x||{}),"*");};var fmt=function(v){if(typeof v==="string")return v;if(typeof v==="number"||v===undefined)return String(v);try{var j=JSON.stringify(v,function(k,x){return (typeof x==="number"&&!isFinite(x))||(x===undefined&&k!=="")?"@@WSA:"+x+"@@":x;});return j===undefined?String(v):j.replace(/"@@WSA:(NaN|-?Infinity|undefined)@@"/g,"$1");}catch(e){return String(v);}};var orig=console.log.bind(console);console.log=function(){var a=[].slice.call(arguments);send("log",a.map(fmt).join(" "));orig.apply(null,a);};console.warn=function(){send("warn",[].slice.call(arguments).map(fmt).join(" "));};console.error=function(){send("error",[].slice.call(arguments).map(fmt).join(" "));};window.addEventListener("error",function(e){send("error",e.message,{file:e.filename||"",line:e.lineno||0});});window.addEventListener("unhandledrejection",function(e){var r=e.reason;var text=r&&r.message?(r.name||"Error")+": "+r.message:String(r);var m=/([\\w.-]+\\.js):(\\d+):\\d+/.exec(String(r&&r.stack||""));send("error","Uncaught (in promise) "+text,m?{file:m[1],line:Number(m[2])}:{});});window.addEventListener("message",function(e){var d=e.data||{};if(d.wsp!=="eval")return;try{var r=(0,eval)(d.code);send("result",fmt(r),{id:d.id,raw:typeof r==="number"?r:null});}catch(err){send("result",String(err),{id:d.id,error:true});}});})();<\/script>';
        let doc = (files['index.html'] || '').replace(/<head>/i, m => m + '\n' + capture);
        doc = doc.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
            if (!(src in files)) return m;
            return `<script>/*@@FILE:${src}@@*/\n${files[src].replace(/<\/script/gi, '<\\/script')}\n//# sourceURL=${src}\n<\/script>`;
        });
        const offsets = {};
        doc.split('\n').forEach((line, i) => {
            const m = /^\s*<script>\/\*@@FILE:(.+?)@@\*\/$/.exec(line);
            if (m) offsets[m[1]] = i + 1;
        });
        return { doc, offsets };
    }

    function locate(file, line, offsets) {
        const name = String(file).split(/[\\/]/).pop();
        if (Object.prototype.hasOwnProperty.call(offsets, name)) return { file: name, line: Math.max(1, line - 1) };
        let best = null;
        Object.keys(offsets).forEach(f => {
            if (line > offsets[f] && (!best || offsets[f] > offsets[best])) best = f;
        });
        return best ? { file: best, line: line - offsets[best] } : { file: 'index.html', line };
    }

    WSA.buildProjectDoc = buildDoc;

    WSA.mountWorkspace = function (cfg) {
        const { core, editor, top, bottom, frame, gitEnabled } = cfg;
        const esc = WSA.esc;
        const ui = { tab: gitEnabled ? 'scm' : 'console', search: '', results: [], compare: null, history: [], histPos: -1, pending: {}, seq: 0, offsets: {} };
        let disposed = false;

        function activeText() {
            return core.files()[core.state.active] || '';
        }

        function baseline(name) {
            const g = core.git;
            if (g.state.initialised && g.headId()) return g.tree(g.headId())[name];
            return WSA.practiceFiles[name];
        }

        function showFile() {
            editor.set(activeText(), []);
            markErrors();
        }

        function markErrors() {
            const last = core.rt.logs.filter(l => l.kind === 'error' && l.file === core.state.active).pop();
            editor.setErrorLine(last && core.ranLatest() ? last.line : null);
        }

        function renderTop() {
            const dirty = !core.ranLatest();
            const tabs = core.order.map(f => `<button class="ws-tab${f === core.state.active ? ' on' : ''}" data-ws="open" data-file="${f}">${f}${core.files()[f] !== baseline(f) ? '<span class="dot" title="Changed"></span>' : ''}</button>`).join('');
            top.innerHTML = `<div class="ws-bar"><button class="btn ${dirty ? 'primary' : ''} small" data-ws="run">${core.rt.runs ? 'Run again' : 'Run'}</button><span class="ws-run-note">${core.rt.runs ? (dirty ? 'Your changes haven\'t run yet.' : 'Running your latest code.') : 'Press Run to start the game.'}</span><input class="ws-search" data-ws="search" type="search" placeholder="Search all files" value="${esc(ui.search)}" aria-label="Search all files"><button class="btn ghost small" data-ws="reset">Reset project</button></div><div class="ws-tabs" role="tablist">${tabs}</div>`;
        }

        function bottomTabs() {
            const tabs = [['console', 'Console'], ['search', 'Search'], ['csv', 'CSV']];
            if (gitEnabled) tabs.unshift(['scm', 'Source control'], ['terminal', 'Terminal']);
            return `<div class="ws-tabs bottom">${tabs.map(([k, label]) => `<button class="ws-tab${ui.tab === k ? ' on' : ''}" data-ws="tab" data-tab="${k}">${label}${k === 'console' && core.rt.logs.some(l => l.kind === 'error') ? '<span class="dot err"></span>' : ''}</button>`).join('')}</div>`;
        }

        function consoleView() {
            const rows = core.rt.logs.map(l => {
                const where = l.file ? ` <span class="where">${esc(l.file)}:${l.line}</span>` : '';
                return `<div class="ws-log ${l.kind}">${l.kind === 'input' ? '<span class="p">›</span> ' : l.kind === 'result' ? '<span class="p">‹</span> ' : ''}${esc(l.text)}${where}</div>`;
            }).join('');
            return `<div class="ws-out" id="ws-console-out">${rows || '<div class="dim">Nothing yet. Messages from the game appear here when it runs.</div>'}</div><div class="ws-input"><span class="p">›</span><input data-ws="console-in" type="text" spellcheck="false" autocomplete="off" placeholder="Type an expression and press Enter" aria-label="Console input"></div>`;
        }

        function searchView() {
            if (!ui.search) return '<p class="dim">Type in the search box above the files, then press Enter.</p>';
            if (!ui.results.length) return `<p class="dim">No matches for <code>${esc(ui.search)}</code>.</p>`;
            return `<p class="dim">${ui.results.length} ${ui.results.length === 1 ? 'match' : 'matches'} for <code>${esc(ui.search)}</code>. Click one to open it.</p>` + ui.results.map((r, k) => `<button class="ws-hit" data-ws="hit" data-k="${k}"><span class="where">${esc(r.file)}:${r.line}</span><code>${esc(r.text.trim())}</code></button>`).join('');
        }

        function csvView() {
            const btn = `<button class="btn small" data-ws="csv">Show trials as CSV</button>`;
            if (core.rt.csv === null) return `<p class="dim">Play some trials, then show them in the CSV format of the trial file.</p>${btn}`;
            const rows = core.rt.csv.trim().split('\n').map(r => r.split(','));
            const head = rows.shift() || [];
            return `${btn}<table class="data-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="dim">No trials yet.</td></tr>`}</tbody></table>`;
        }

        function terminalView() {
            const rows = core.rt.terminal.map(t => `<div class="ws-log input"><span class="p">$</span> ${esc(t.line)}</div>${t.output ? `<pre class="ws-pre">${esc(t.output)}</pre>` : ''}${t.error ? `<div class="ws-log error">${esc(t.error)}</div>` : ''}`).join('');
            return `<div class="ws-out term" id="ws-term-out">${rows || '<div class="dim">Type a git command, such as <code>git status</code>, and press Enter.</div>'}</div><div class="ws-input"><span class="p">$</span><input data-ws="term-in" type="text" spellcheck="false" autocomplete="off" placeholder="git status" aria-label="Terminal input"></div>`;
        }

        function compareData() {
            const f = ui.compare.file;
            const g = core.git;
            const head = g.headId() ? g.tree(g.headId())[f] : undefined;
            const idx = (g.state.index || {})[f];
            return ui.compare.staged
                ? { file: f, before: head || '', after: idx || '', label: 'Staged change', leftLabel: 'Last commit', rightLabel: 'Staged' }
                : { file: f, before: (idx !== undefined ? idx : head) || '', after: core.files()[f] || '', label: 'Change in your file', leftLabel: idx === undefined ? 'Before' : idx === head ? 'Last commit' : 'Staged', rightLabel: 'Your file' };
        }

        function compareView() {
            const c = compareData();
            const ops = WSA.diffLines(c.before || '', c.after || '');
            const rows = [];
            for (let k = 0; k < ops.length; k++) {
                const o = ops[k];
                if (o.op === ' ') {
                    rows.push([o.a + 1, o.text, o.b + 1, o.text, '']);
                } else if (o.op === '-' && ops[k + 1] && ops[k + 1].op === '+') {
                    rows.push([o.a + 1, o.text, ops[k + 1].b + 1, ops[k + 1].text, 'chg']);
                    k++;
                } else if (o.op === '-') {
                    rows.push([o.a + 1, o.text, '', '', 'del']);
                } else {
                    rows.push(['', '', o.b + 1, o.text, 'add']);
                }
            }
            const changedRows = rows.map((r, k) => (r[4] ? k : -1)).filter(k => k >= 0);
            const keep = new Set();
            changedRows.forEach(k => { for (let d = -3; d <= 3; d++) keep.add(k + d); });
            const shown = rows.filter((r, k) => keep.has(k));
            const body = shown.length ? shown.map(r => `<tr class="${r[4]}"><td class="n">${r[0]}</td><td class="a">${esc(r[1])}</td><td class="n">${r[2]}</td><td class="b">${esc(r[3])}</td></tr>`).join('') : '<tr><td colspan="4" class="dim">No differences.</td></tr>';
            return `<div class="ws-compare"><div class="ws-compare-head"><b>${esc(c.file)}</b><span class="dim">${esc(c.label)}</span><button class="btn ghost small" data-ws="close-compare">Close</button></div><table class="diff"><thead><tr><th></th><th>${esc(c.leftLabel)}</th><th></th><th>${esc(c.rightLabel)}</th></tr></thead><tbody>${body}</tbody></table></div>`;
        }

        function scmView() {
            const g = core.git;
            if (!g.state.initialised) return '<p>This folder isn\'t a git repository yet.</p><div class="actions"><button class="btn small" data-ws="git" data-cmd="git init">Initialise repository</button></div><p class="dim">This runs <code>git init</code>.</p>';
            const st = g.status();
            const branches = Object.keys(g.state.branches).sort();
            const item = (x, staged) => {
                const f = x.file || x;
                const kind = x.kind || 'untracked';
                const btns = staged
                    ? `<button class="mini-btn" data-ws="git" data-cmd="git restore --staged ${f}" title="git restore --staged ${f}">Unstage</button>`
                    : `<button class="mini-btn" data-ws="git" data-cmd="git add ${f}" title="git add ${f}">Stage</button>` + (kind !== 'untracked' ? `<button class="mini-btn" data-ws="git" data-cmd="git restore ${f}" title="git restore ${f}">Discard</button>` : '');
                return `<div class="scm-item"><button class="scm-file" data-ws="compare" data-file="${f}" data-staged="${staged ? 1 : 0}">${esc(f)}</button><span class="scm-kind">${kind}</span>${btns}</div>`;
            };
            let html = `<div class="scm-branch">On branch <b>${esc(g.state.head)}</b>`;
            if (g.headId()) html += ` <select data-ws="branch-select" aria-label="Branch">${branches.map(b => `<option${b === g.state.head ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select><button class="btn small" data-ws="switch">Switch</button>`;
            html += '</div>';
            if (g.headId()) html += `<div class="scm-row"><input data-ws="new-branch" type="text" placeholder="new-branch-name" aria-label="New branch name"><button class="btn small" data-ws="create-branch">Create and switch</button></div>`;
            html += `<h4>Staged changes</h4>${st.staged.length ? st.staged.map(x => item(x, true)).join('') : '<p class="dim">None.</p>'}`;
            const unstaged = st.unstaged.concat(st.untracked.map(f => ({ file: f, kind: 'untracked' })));
            html += `<h4>Changes</h4>${unstaged.length ? unstaged.map(x => item(x, false)).join('') + `<button class="mini-btn" data-ws="git" data-cmd="git add ." title="git add .">Stage all</button>` : '<p class="dim">None. Your files match the last commit.</p>'}`;
            html += `<div class="scm-row"><input data-ws="commit-msg" type="text" placeholder="Commit message" aria-label="Commit message"><button class="btn small primary" data-ws="commit">Commit</button></div>`;
            html += '<p class="dim">Each button runs a git command, shown in the Terminal tab.</p>';
            if (ui.compare) html += compareView();
            return html;
        }

        function renderBottom() {
            const views = { console: consoleView, search: searchView, csv: csvView, terminal: terminalView, scm: scmView };
            const typed = {};
            bottom.querySelectorAll('input[data-ws]').forEach(el => { typed[el.dataset.ws] = el.value; });
            bottom.innerHTML = bottomTabs() + `<div class="ws-panel">${views[ui.tab]()}</div>`;
            bottom.querySelectorAll('input[data-ws]').forEach(el => {
                if (typed[el.dataset.ws]) el.value = typed[el.dataset.ws];
            });
            ['ws-console-out', 'ws-term-out'].forEach(id => {
                const el = bottom.querySelector('#' + id);
                if (el) el.scrollTop = el.scrollHeight;
            });
        }

        function render() {
            if (disposed) return;
            renderTop();
            renderBottom();
        }

        function run() {
            const built = buildDoc(core.files());
            ui.offsets = built.offsets;
            core.runStarted();
            frame.srcdoc = built.doc;
            render();
            markErrors();
        }

        function evaluate(code, onResult) {
            if (disposed || !frame.contentWindow) return;
            const id = ++ui.seq;
            ui.pending[id] = onResult;
            frame.contentWindow.postMessage({ wsp: 'eval', code, id }, '*');
            setTimeout(() => {
                if (!disposed && ui.pending[id]) {
                    delete ui.pending[id];
                    onResult({ text: 'The game didn\'t answer. Press Run, wait for it to load, then try again.', error: true });
                }
            }, 3000);
        }

        function runCommand(line) {
            const r = core.terminal(line);
            if (ui.compare) ui.compare = null;
            showFile();
            render();
            return r;
        }

        function search(term) {
            ui.search = term;
            ui.results = [];
            if (term) {
                const low = term.toLowerCase();
                core.order.forEach(f => {
                    core.files()[f].split('\n').forEach((text, k) => {
                        if (text.toLowerCase().includes(low)) ui.results.push({ file: f, line: k + 1, text });
                    });
                });
            }
            ui.tab = 'search';
            render();
        }

        function onMessage(e) {
            if (disposed || e.source !== frame.contentWindow || !e.data || !e.data.wsp) return;
            const m = e.data;
            if (m.wsp === 'result') {
                const fn = ui.pending[m.id];
                if (fn) {
                    delete ui.pending[m.id];
                    fn({ text: m.text, error: !!m.error, raw: m.raw });
                }
                return;
            }
            const where = m.wsp === 'error' && m.line ? locate(m.file, m.line, ui.offsets) : null;
            core.log(m.wsp, m.text, where);
            if (m.wsp === 'error') {
                if (where && where.file !== core.state.active) {
                    core.open(where.file);
                    showFile();
                }
                markErrors();
            }
            render();
        }

        function onTopClick(e) {
            if (disposed) return;
            const b = e.target.closest('[data-ws]');
            if (!b) return;
            const act = b.dataset.ws;
            if (act === 'open') {
                core.open(b.dataset.file);
                showFile();
                render();
            } else if (act === 'run') {
                run();
            } else if (act === 'reset') {
                if (!confirm('Reset the project? Your changes to the files, and any git history in this lesson, will be lost.')) return;
                core.reset();
                ui.compare = null;
                showFile();
                render();
                frame.srcdoc = '<body style="background:#0b0e14"></body>';
            }
        }

        function onTopKey(e) {
            if (disposed) return;
            if (e.target.dataset.ws === 'search' && e.key === 'Enter') {
                e.preventDefault();
                search(e.target.value.trim());
            }
        }

        function clearInput(name) {
            const el = bottom.querySelector(`[data-ws="${name}"]`);
            if (el) el.value = '';
        }

        function onBottomClick(e) {
            if (disposed) return;
            const b = e.target.closest('[data-ws]');
            if (!b) return;
            const act = b.dataset.ws;
            if (act === 'tab') {
                ui.tab = b.dataset.tab;
                render();
            } else if (act === 'hit') {
                const r = ui.results[Number(b.dataset.k)];
                core.open(r.file);
                showFile();
                render();
                editor.setMarkLine(r.line);
                editor.goToLine(r.line);
            } else if (act === 'csv') {
                evaluate(CSV_EXPR, res => {
                    if (res.error) core.log('error', res.text, { typed: true });
                    else core.csvShown(res.text);
                    render();
                });
            } else if (act === 'git') {
                runCommand(b.dataset.cmd);
            } else if (act === 'switch') {
                const sel = bottom.querySelector('[data-ws="branch-select"]');
                runCommand(`git switch ${sel.value}`);
            } else if (act === 'create-branch') {
                const name = bottom.querySelector('[data-ws="new-branch"]').value.trim();
                if (!runCommand(`git switch -c ${name || 'experiment'}`).error) clearInput('new-branch');
            } else if (act === 'commit') {
                const msg = bottom.querySelector('[data-ws="commit-msg"]').value.trim();
                if (!runCommand(`git commit -m "${msg.replace(/"/g, '\'')}"`).error) clearInput('commit-msg');
            } else if (act === 'compare') {
                ui.compare = { file: b.dataset.file, staged: b.dataset.staged === '1' };
                core.diffViewed();
                render();
            } else if (act === 'close-compare') {
                ui.compare = null;
                render();
            }
        }

        function onBottomKey(e) {
            if (disposed) return;
            const t = e.target;
            if (t.dataset.ws === 'console-in' && e.key === 'Enter') {
                const expr = t.value.trim();
                if (!expr) return;
                t.value = '';
                core.log('input', expr);
                evaluate(expr, res => {
                    core.log(res.error ? 'error' : 'result', res.text, res.error ? { typed: true } : null);
                    evaluate(SCORE_EXPR, actual => {
                        core.evalDone(expr, res.text, actual.error ? null : actual.text, res.error);
                        render();
                        const input = bottom.querySelector('[data-ws="console-in"]');
                        if (input) input.focus();
                    });
                });
            } else if (t.dataset.ws === 'term-in') {
                if (e.key === 'Enter') {
                    const line = t.value.trim();
                    if (!line) return;
                    t.value = '';
                    ui.history.push(line);
                    ui.histPos = ui.history.length;
                    if (line === 'clear') {
                        core.rt.terminal.length = 0;
                        render();
                    } else {
                        runCommand(line);
                    }
                    const input = bottom.querySelector('[data-ws="term-in"]');
                    if (input) input.focus();
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    ui.histPos = Math.max(0, Math.min(ui.history.length, ui.histPos + (e.key === 'ArrowUp' ? -1 : 1)));
                    t.value = ui.history[ui.histPos] || '';
                }
            } else if (t.dataset.ws === 'commit-msg' && e.key === 'Enter') {
                bottom.querySelector('[data-ws="commit"]').click();
            }
        }

        top.addEventListener('click', onTopClick);
        top.addEventListener('keydown', onTopKey);
        bottom.addEventListener('click', onBottomClick);
        bottom.addEventListener('keydown', onBottomKey);
        window.addEventListener('message', onMessage);

        showFile();
        render();

        return {
            render,
            run,
            showFile,
            edit(text) {
                if (disposed) return;
                core.setFile(core.state.active, text);
                renderTop();
                if (ui.tab === 'scm') renderBottom();
            },
            cursor(line) {
                core.setCursor(line);
            },
            dispose() {
                disposed = true;
                ui.pending = {};
                top.removeEventListener('click', onTopClick);
                top.removeEventListener('keydown', onTopKey);
                bottom.removeEventListener('click', onBottomClick);
                bottom.removeEventListener('keydown', onBottomKey);
                window.removeEventListener('message', onMessage);
                top.innerHTML = '';
                bottom.innerHTML = '';
                frame.srcdoc = '';
            }
        };
    };

    if (typeof module !== 'undefined') module.exports = WSA;
})(typeof window !== 'undefined' ? window : globalThis);
